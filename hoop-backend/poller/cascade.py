"""World delta cascade (Step 14) — the back half of world evolution.

When a human approves a world_delta, this ripples it through four layers, in order,
recording progress in world_deltas.cascade_status so a crashed run resumes cleanly:

  1. bible         — fold the change into a new bible version
  2. vector_store  — (re)embed the affected/added chunk so it's searchable
  3. content_pool  — triage existing items the change touches (retire/regen/flag)
  4. agents        — refresh world-agent memory; queue player retcons if canonical

LLM/embedding steps are best-effort or stubbed (POLLER_STUB_LLM), so the cascade
completes even with the model offline — the structural changes are pure SQL.
"""

import json
import os
import re

from ingestion.world_parser import parse_markdown
from storage.content_store import (
    execute,
    fetch,
    fetch_one,
    get_current_bible,
    insert_world_bible,
)

STUB_LLM = os.environ.get("POLLER_STUB_LLM", "").strip().lower() in (
    "1", "true", "yes", "on",
)

LAYERS = ("bible", "vector_store", "content_pool", "agents")


def _changes_text(delta: dict) -> str:
    ch = delta["changes"]
    if isinstance(ch, dict):
        return ch.get("description") or json.dumps(ch)
    return str(ch)


def _set_status(delta_id: str, layer: str, value: str) -> None:
    execute(
        "UPDATE world_deltas SET cascade_status = jsonb_set(cascade_status, %s, %s::jsonb) WHERE id = %s",
        ([layer], json.dumps(value), delta_id),
    )


# ─── Layer 1: bible ─────────────────────────────────────────────────────────

def apply_bible_delta(delta: dict) -> str:
    """Fold the delta into a new bible version as a dated addendum. Returns new id."""
    bible = get_current_bible()
    base_md = bible["markdown"] if bible else f"# Ashveil Station\n"
    addendum = (
        f"\n\n## World Update — {delta['summary']} ({delta['certainty']})\n\n"
        f"{_changes_text(delta)}\n"
    )
    new_bible = parse_markdown(base_md + addendum)
    return insert_world_bible(new_bible)


# ─── Layer 2: vector store ──────────────────────────────────────────────────

def reembed_affected(delta: dict, bible_id: str) -> int:
    """Embed the delta as a searchable bible chunk. Best-effort; 0 if model offline."""
    if STUB_LLM:
        return 0
    try:
        from lib.llm import embed_text

        text = f"{delta['summary']}. {_changes_text(delta)}"
        emb = embed_text(text)
        slug = re.sub(r"[^a-z0-9]+", "-", delta["summary"].lower()).strip("-")[:40]
        execute(
            "INSERT INTO bible_chunks (bible_id, section_path, content, tags, embedding) "
            "VALUES (%s, %s, %s, %s, %s)",
            (bible_id, f"deltas.{slug}", text, delta["enriches_tags"], str(emb)),
        )
        return 1
    except Exception as e:
        print(f"[cascade] reembed skipped ({type(e).__name__}: {e})")
        return 0


# ─── Layer 3: content pool triage ───────────────────────────────────────────

def triage_content_pool(delta: dict) -> list[str]:
    """Find items the delta touches (by invalidates_tags) and triage them.

    Real (model up): ask broken/degraded/fine, retire broken, mark degraded for
    regen. Stub: conservatively flag all touched items needs_review (no retire).
    Either way, touched items get needs_review so a human can look.
    """
    if not delta["invalidates_tags"]:
        return []
    affected = fetch(
        "SELECT id, content, tags FROM content_items WHERE tags && %s AND status = 'active'",
        (delta["invalidates_tags"],),
    )
    if not affected:
        return []
    ids = [i["id"] for i in affected]

    # Items a player has crystallized must NEVER be retired — that would orphan their
    # placement. They regenerate IN PLACE (same id) instead. Only UNHELD broken items
    # are retired; everything regenerated keeps its identity. (regen_in_place + the
    # holder notification live in poller/replenishment.py.)
    held = {
        r["content_item_id"]
        for r in fetch(
            "SELECT DISTINCT content_item_id FROM player_placements WHERE content_item_id = ANY(%s)",
            (ids,),
        )
    }

    retired, needs_regen = [], []
    if STUB_LLM:
        # No verdict model: conservatively regenerate held items, just flag the rest.
        needs_regen = [i["id"] for i in affected if i["id"] in held]
    else:
        from lib.llm import call_llm

        for item in affected:
            prompt = (
                f"Delta summary: {delta['summary']}\n"
                f"Content item: {json.dumps(item['content'])}\n\n"
                "Does this delta make the content item factually broken (contradicts it "
                'directly)? Answer ONLY: "broken" or "fine" or "degraded"'
            )
            try:
                verdict = call_llm(prompt, max_tokens=8).strip().lower()
            except Exception:
                verdict = "fine"
            if "broken" in verdict:
                # held -> regenerate in place (don't orphan); unheld -> retire.
                (needs_regen if item["id"] in held else retired).append(item["id"])
            elif "degraded" in verdict:
                needs_regen.append(item["id"])

    execute("UPDATE content_items SET needs_review = true WHERE id = ANY(%s)", (ids,))
    if retired:
        execute("UPDATE content_items SET status = 'retired' WHERE id = ANY(%s)", (retired,))
    if needs_regen:
        execute("UPDATE content_items SET status = 'needs_regen' WHERE id = ANY(%s)", (needs_regen,))
    print(f"[cascade] triage: {len(ids)} touched, {len(retired)} retired (unheld), "
          f"{len(needs_regen)} regen in place ({len(held)} held)")
    return [str(i) for i in retired]


# ─── Layer 4: agents + retcons ──────────────────────────────────────────────

# Keep mutable_state to the most recent few deltas — it rides in the agent's
# context on every turn, so an unbounded log would steadily eat the window.
MUTABLE_STATE_MAX_LINES = 8


def update_world_agent_memory(delta: dict) -> None:
    """Append the change to the world agent's mutable_state block, newest last,
    truncated to the last MUTABLE_STATE_MAX_LINES entries. Best-effort."""
    try:
        from agents.letta_client import get_client
        from agents.world_agent import WORLD_AGENT_NAME

        client = get_client()
        agent = next((a for a in client.agents.list() if a.name == WORLD_AGENT_NAME), None)
        if not agent:
            return
        note = f"[delta] {delta['summary']} ({delta['certainty']})"
        try:
            block = client.agents.blocks.retrieve("mutable_state", agent_id=agent.id)
            existing = (getattr(block, "value", "") or "").strip()
        except Exception:
            existing = ""  # first write, or block unreadable — start fresh
        # Drop blank lines and the "{}" placeholder the block is seeded with.
        lines = [ln for ln in existing.splitlines() if ln.strip() and ln.strip() != "{}"]
        lines.append(note)
        value = "\n".join(lines[-MUTABLE_STATE_MAX_LINES:])
        client.agents.blocks.update("mutable_state", agent_id=agent.id, value=value)
    except Exception as e:
        print(f"[cascade] world-agent memory update skipped ({type(e).__name__}: {e})")


# Same "same belief" threshold the rumor clusterer uses (job_handlers); a delta
# summary matching a cluster this closely is canonizing that cluster.
DRIFT_MATCH_THRESHOLD = 0.30


def canonize_source_drift(delta: dict) -> list[str]:
    """Retire the collective_drift cluster(s) this delta resolves by marking them
    'canonized', so the belief stops resurfacing in get_drift_report as unresolved
    drift. Prefer the explicit drift_id link; fall back to a trigram match on the
    summary for deltas authored without one (manual / simulated)."""
    if delta.get("drift_id"):
        rows = fetch(
            "UPDATE collective_drift SET status='canonized', updated_at=now() "
            "WHERE id=%s AND status IN ('accumulating','proposed') RETURNING id",
            (delta["drift_id"],),
        )
    else:
        rows = fetch(
            "UPDATE collective_drift SET status='canonized', updated_at=now() "
            "WHERE status IN ('accumulating','proposed') "
            "AND similarity(content, %s) >= %s RETURNING id",
            (delta["summary"], DRIFT_MATCH_THRESHOLD),
        )
    ids = [str(r["id"]) for r in rows]
    if ids:
        print(f"[cascade] canonized {len(ids)} source drift cluster(s)")
    return ids


def queue_player_retcons(delta: dict) -> int:
    """Notify every known player of a canonical world change."""
    # Skip reserved ids like '__reviewer__'. (Avoid LIKE — its % trips psycopg.)
    players = fetch("SELECT id FROM player_state WHERE left(id, 2) <> '__'")
    payload = json.dumps({"summary": delta["summary"], "certainty": delta["certainty"]})
    for p in players:
        execute(
            "INSERT INTO notifications (player_id, type, payload) VALUES (%s, 'retcon_delivered', %s)",
            (p["id"], payload),
        )
    return len(players)


# ─── Orchestration ──────────────────────────────────────────────────────────

def run_cascade(delta_id: str) -> dict:
    delta = fetch_one("SELECT * FROM world_deltas WHERE id = %s", (delta_id,))
    if delta is None:
        raise ValueError(f"no world_delta {delta_id}")
    status = dict(delta["cascade_status"])
    new_bible_id = None
    result = {"delta_id": str(delta_id)}

    if status.get("bible") == "pending":
        new_bible_id = apply_bible_delta(delta)
        _set_status(delta_id, "bible", "done")
        status["bible"] = "done"
        result["new_bible_id"] = new_bible_id

    if status.get("vector_store") == "pending" and status["bible"] == "done":
        bible_id = new_bible_id or get_current_bible()["id"]
        result["reembedded"] = reembed_affected(delta, bible_id)
        _set_status(delta_id, "vector_store", "done")
        status["vector_store"] = "done"

    if status.get("content_pool") == "pending" and status["vector_store"] == "done":
        result["retired"] = triage_content_pool(delta)
        _set_status(delta_id, "content_pool", "done")
        status["content_pool"] = "done"

    if status.get("agents") == "pending" and status["content_pool"] == "done":
        update_world_agent_memory(delta)
        if delta["certainty"] == "canonical":
            result["retcons"] = queue_player_retcons(delta)
            result["canonized_drift"] = canonize_source_drift(delta)
        _set_status(delta_id, "agents", "done")
        status["agents"] = "done"

    result["cascade_complete"] = all(status.get(layer) == "done" for layer in LAYERS)
    return result
