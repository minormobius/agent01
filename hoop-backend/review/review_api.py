"""Human spot-check API for the content pool. Runs locally, no LLM.

Serves a minimal single-item review UI (separate html/css/js) and CRUD endpoints
to approve / reject / inspect pending content_items.

Run:  .venv/bin/uvicorn review.review_api:app --port 8000 --reload
Then open http://localhost:8000/
"""

import json
import os
from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from storage.content_store import execute, fetch, fetch_one

app = FastAPI(title="World Engine Review")
_HERE = os.path.dirname(__file__)


# ─── UI (static files served from this dir) ─────────────────────────────────

@app.get("/")
def index():
    return FileResponse(os.path.join(_HERE, "review_ui.html"))


@app.get("/review_ui.css")
def css():
    return FileResponse(os.path.join(_HERE, "review_ui.css"))


@app.get("/review_ui.js")
def js():
    return FileResponse(os.path.join(_HERE, "review_ui.js"))


# ─── API ────────────────────────────────────────────────────────────────────

class ApproveBody(BaseModel):
    edits: dict | None = None  # optional partial merge into content jsonb


class RejectBody(BaseModel):
    reason: str = ""


@app.get("/pending")
def get_pending(limit: int = 10):
    return fetch(
        """
        SELECT id, type, content, tags, world_refs, requires,
               revelation_tier, narrative_tier, power_tier, needs_review, created_at
        FROM content_items
        WHERE approved = false AND status = 'active'
        ORDER BY revelation_tier, created_at
        LIMIT %s
        """,
        (limit,),
    )


@app.post("/approve/{item_id}")
def approve(item_id: str, body: ApproveBody | None = None):
    row = fetch_one("SELECT content FROM content_items WHERE id = %s", (item_id,))
    if row is None:
        raise HTTPException(404, "item not found")
    if body and body.edits:
        merged = {**(row["content"] or {}), **body.edits}
        execute(
            "UPDATE content_items SET content = %s, approved = true, approved_at = now() WHERE id = %s",
            (json.dumps(merged), item_id),
        )
    else:
        execute(
            "UPDATE content_items SET approved = true, approved_at = now() WHERE id = %s",
            (item_id,),
        )
    # NOTE: pool_depth recalculation is deferred to the replenishment step (Step 11),
    # which owns per-player pool accounting. Global approval has no single player.
    return {"ok": True, "id": item_id}


class EditBody(BaseModel):
    content: dict | None = None       # full content blob to persist (replaces, doesn't merge)
    requires: dict | None = None      # the gate column — lets the reviewer loosen/fix a gate


@app.post("/edit/{item_id}")
def edit(item_id: str, body: EditBody):
    """Save edits to an item's content and/or `requires` gate WITHOUT approving it — so the
    reviewer can fix a tree, loosen an orphaned gate, see it re-validate, and keep curating.
    Replaces what's sent (full blob), unlike /approve which merges. Send only the field(s)
    you changed."""
    row = fetch_one("SELECT id FROM content_items WHERE id = %s", (item_id,))
    if row is None:
        raise HTTPException(404, "item not found")
    sets, params = [], []
    if body.content is not None:
        sets.append("content = %s"); params.append(json.dumps(body.content))
    if body.requires is not None:
        sets.append("requires = %s"); params.append(json.dumps(body.requires))
    if sets:
        execute(f"UPDATE content_items SET {', '.join(sets)} WHERE id = %s", (*params, item_id))
    return {"ok": True, "id": item_id}


@app.post("/reject/{item_id}")
def reject(item_id: str, body: RejectBody | None = None):
    execute(
        "UPDATE content_items SET status = 'retired' WHERE id = %s AND status = 'active'",
        (item_id,),
    )
    return {"ok": True, "id": item_id, "reason": body.reason if body else ""}


@app.get("/validate/{item_id}")
def validate(item_id: str):
    """Static checks for the reviewer's eye: the dialogue tree's FSM defects (broken
    gotos, unreachable/stuck nodes, dead choices) and whether this item's `requires`
    gates are reachable in the current pool (orphaned = nothing produces them). No LLM."""
    from runtime.dialogue_validate import validate_tree
    from runtime.gate_reachability import analyze_item, item_produces

    row = fetch_one("SELECT type, content, tags FROM content_items WHERE id = %s", (item_id,))
    if row is None:
        raise HTTPException(404, "item not found")
    content = row["content"] or {}
    tree = content.get("dialogue") if row["type"] == "npc" else None
    return {
        "tree_issues": [asdict(i) for i in (validate_tree(tree) if tree else [])],
        "gate_issues": [asdict(g) for g in analyze_item(item_id)],
        "produces": item_produces(row),
    }


@app.get("/reachability")
def reachability():
    """Pool-wide orphans dashboard: every gate reachability issue, grouped by the
    consuming item, so the admin has one triage worklist. Includes unapproved items."""
    from runtime.gate_reachability import analyze_pool_tagged

    by_item: dict[str, dict] = {}
    for cid, gi in analyze_pool_tagged(include_unapproved=True):
        bucket = by_item.setdefault(cid, {"id": cid, "source": gi.source, "issues": []})
        bucket["issues"].append(asdict(gi))
    # errors-first ordering so the worst offenders surface at the top
    items = sorted(by_item.values(),
                   key=lambda b: -sum(1 for i in b["issues"] if i["level"] == "error"))
    return {"items": items,
            "total_errors": sum(1 for b in items for i in b["issues"] if i["level"] == "error"),
            "total_warnings": sum(1 for b in items for i in b["issues"] if i["level"] != "error")}


@app.get("/stats")
def stats():
    by_type = fetch(
        """
        SELECT type,
               count(*) AS total,
               count(*) FILTER (WHERE approved) AS approved,
               count(*) FILTER (WHERE NOT approved AND status='active') AS pending,
               count(*) FILTER (WHERE status='retired') AS retired
        FROM content_items GROUP BY type ORDER BY type
        """
    )
    return {"by_type": by_type}
