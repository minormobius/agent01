"""Local game API — the substrate Letta tools and the test client talk to.

Mirrors the routes planned for the Cloudflare Worker (worker.js, Step 12) so that
code ports over later with only the data layer swapped. For now it's FastAPI over
the local Postgres, calling into the dispatcher directly.

Run:  .venv/bin/uvicorn runtime.local_api:app --port 8100 --reload
Letta tools (in the Docker sandbox) reach this at http://host.docker.internal:8100
"""

import json
import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from lib.log import get_logger
from runtime.dispatcher import dispatch, get_player_state
from runtime.notifications import notify_entity_change
from runtime.placement import interact, list_placements
from runtime.world_map import map_payload
from storage.content_store import execute, fetch, fetch_one

log = get_logger("api")
app = FastAPI(title="World Engine API (local)")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One line per API call with status + latency. Static client assets are quiet."""
    start = time.perf_counter()
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api"):
        ms = (time.perf_counter() - start) * 1000
        pid = request.query_params.get("player_id", "")
        log.info("%s %s%s -> %d (%.0fms)", request.method, path,
                 f" player={pid}" if pid else "", response.status_code, ms)
    return response

VALID_TIERS = {"revelation_tier", "narrative_tier", "power_tier"}

# The test client (Step 13) is served from this same app so it shares the origin
# with /api/* — no CORS needed. Files live in prototype/.
_CLIENT_DIR = os.path.join(os.path.dirname(__file__), "..", "prototype")


@app.get("/")
def client_index():
    return FileResponse(os.path.join(_CLIENT_DIR, "client.html"))


@app.get("/client.css")
def client_css():
    return FileResponse(os.path.join(_CLIENT_DIR, "client.css"))


@app.get("/client.js")
def client_js():
    return FileResponse(os.path.join(_CLIENT_DIR, "client.js"))


@app.get("/api/state")
def api_state(player_id: str):
    """Current tiers + how much the player has seen. Drives the UI header."""
    p = get_player_state(player_id)
    return {
        "player_id": p["id"],
        "revelation_tier": p["revelation_tier"],
        "narrative_tier": p["narrative_tier"],
        "power_tier": p["power_tier"],
        "xp": p.get("xp", 0),
        "seen": len(p["seen_ids"] or []),
    }


# ─── Map + crystallization (the persistent, placed hot path) ──────────────────


@app.get("/api/map")
def api_map():
    """Shared, static station geometry. Identity is layered per-player via
    /api/placements + /api/interact."""
    return map_payload()


class InteractBody(BaseModel):
    player_id: str
    feature_key: str
    context: str = ""


@app.post("/api/interact")
def api_interact(body: InteractBody):
    """Crystallize (first touch) or recall (later touches) the item bound to a map
    feature for this player. Pure hot path — dispatch + SQL, no LLM."""
    return interact(body.player_id, body.feature_key, body.context)


@app.get("/api/placements")
def api_placements(player_id: str):
    """Which features this player has already crystallized — lets the client mark
    the map as 'known' and restore identities after a reload."""
    return list_placements(player_id)


@app.get("/api/pool")
def api_pool(player_id: str):
    """Per-type count of approved, active, *unseen* items this player could still
    crystallize at their current tier — the same gate the dispatcher applies. Lets
    the UI show the pool draining (and replenishment refilling) behind the player."""
    p = get_player_state(player_id)
    rows = fetch(
        """
        SELECT type, count(*) AS available
        FROM content_items
        WHERE approved = true AND status = 'active'
          AND revelation_tier <= %s AND narrative_tier <= %s AND power_tier <= %s
          AND id != ALL(%s)
        GROUP BY type ORDER BY type
        """,
        (p["revelation_tier"], p["narrative_tier"], p["power_tier"], p["seen_ids"] or []),
    )
    return {r["type"]: r["available"] for r in rows}


# ─── Player-scoped state (facts / flags / reputation) ─────────────────────────


@app.get("/api/facts")
def api_facts(player_id: str):
    """All of a player's facts — drives the gate and the UI's state panel."""
    from runtime.state_gate import get_facts

    return get_facts(player_id)


class FactBody(BaseModel):
    player_id: str
    key: str
    value: object = True


@app.post("/api/facts")
def api_set_fact(body: FactBody):
    """Set a fact. Gameplay verbs (take/equip/dialogue) write these; also handy for
    manually exercising the gate."""
    from runtime.state_gate import set_fact

    set_fact(body.player_id, body.key, body.value)
    return {"ok": True, "key": body.key, "value": body.value}


# ─── Inventory & equipment ────────────────────────────────────────────────────


class InvActionBody(BaseModel):
    player_id: str
    inventory_id: str | None = None
    slot: str | None = None


@app.get("/api/inventory")
def api_inventory(player_id: str):
    """Inventory items + equipment slots + derived stats — drives the gear panel."""
    from runtime.equipment import derive_stats, get_equipment
    from runtime.inventory import list_inventory

    items = [
        {**i, "id": str(i["id"]), "content_item_id": str(i["content_item_id"])}
        for i in list_inventory(player_id)
    ]
    return {"items": items, "equipment": get_equipment(player_id), "stats": derive_stats(player_id)}


@app.post("/api/item/{feature_key}/take")
def api_take(feature_key: str, body: InvActionBody):
    """Take the item crystallized on a map feature into inventory (once)."""
    from runtime.inventory import take
    from runtime.state_gate import get_fact, set_fact

    r = interact(body.player_id, feature_key)
    item = r.get("item")
    if not item:
        return {"status": r.get("status", "withheld")}
    if item["type"] != "item":
        return {"status": "not_takeable", "name": item.get("name")}
    if get_fact(body.player_id, f"taken.{feature_key}"):
        return {"status": "already_taken", "name": item.get("name")}
    inv = take(body.player_id, item["content_item_id"])
    set_fact(body.player_id, f"taken.{feature_key}", True)
    log.info("TAKE player=%s feature=%s -> '%s'", body.player_id, feature_key, item.get("name"))
    return {"status": "taken", "name": item.get("name"), "inventory_id": str(inv["id"])}


@app.post("/api/item/drop")
def api_drop(body: InvActionBody):
    """Drop an inventory item (its equipment row cascades away)."""
    from runtime.inventory import drop

    return {"ok": drop(body.player_id, body.inventory_id)}


@app.post("/api/equip")
def api_equip(body: InvActionBody):
    from runtime.equipment import equip

    return equip(body.player_id, body.inventory_id)


@app.post("/api/unequip")
def api_unequip(body: InvActionBody):
    from runtime.equipment import unequip

    return unequip(body.player_id, body.slot)


# ─── Dialogue + NPC relationships ─────────────────────────────────────────────


@app.get("/api/npc/{npc_id}/talk")
def api_talk(npc_id: str, player_id: str):
    """The NPC's current line + the choices this player can take right now."""
    from runtime.dialogue import talk

    return talk(player_id, npc_id)


class ChooseBody(BaseModel):
    player_id: str
    choice_id: str


@app.post("/api/npc/{npc_id}/choose")
def api_choose(npc_id: str, body: ChooseBody):
    """Apply a dialogue choice (writes facts/rep/standing/items) and advance."""
    from runtime.dialogue import choose

    return choose(body.player_id, npc_id, body.choice_id)


class DispatchBody(BaseModel):
    player_id: str
    content_type: str
    context: str = ""
    n: int = 1


class InputBody(BaseModel):
    player_id: str
    text: str
    context: dict | str | None = None


class TierBody(BaseModel):
    player_id: str
    tier_type: str


class StateBody(BaseModel):
    player_id: str


class RumorBody(BaseModel):
    player_id: str
    content: str


@app.post("/api/dispatch")
def api_dispatch(body: DispatchBody):
    items = dispatch(body.player_id, body.context, body.content_type, n=body.n)
    # Return content blobs the client/agent can render directly.
    return [
        {
            "id": str(i["id"]),
            "type": i["type"],
            "revelation_tier": i["revelation_tier"],
            "content": i["content"],
            "tags": i["tags"],
        }
        for i in items
    ]


@app.post("/api/input")
def api_input(body: InputBody):
    """Queue a typed input as a resolve_input job for the poller (long rest)."""
    job = fetch_one(
        """
        INSERT INTO jobs (type, payload, player_id, priority)
        VALUES ('resolve_input', %s, %s, 2)
        RETURNING id
        """,
        (json.dumps({"text": body.text, "context": body.context}), body.player_id),
    )
    execute(
        "INSERT INTO player_inputs (player_id, text, context, job_id) VALUES (%s, %s, %s, %s)",
        (body.player_id, body.text, json.dumps(body.context), job["id"]),
    )
    return {"status": "queued", "job_id": str(job["id"])}


@app.post("/api/longrest")
def api_longrest(body: StateBody):
    """Take a long rest: queue an async progress review for the player's Letta
    agent (off the hot path). The agent weighs what's been crystallized/seen
    against the bible's revelation/narrative ladders and may advance those tiers,
    surfaced later via /api/notifications. Power tier, by contrast, already moved
    deterministically during play."""
    get_player_state(body.player_id)  # ensure row exists
    job = fetch_one(
        "INSERT INTO jobs (type, payload, player_id, priority) "
        "VALUES ('evaluate_progress', '{}', %s, 3) RETURNING id",
        (body.player_id,),
    )
    return {"status": "queued", "job_id": str(job["id"])}


@app.get("/api/notifications")
def api_notifications(player_id: str, since: str | None = None):
    rows = fetch(
        """
        SELECT id, type, payload, created_at FROM notifications
        WHERE player_id = %s AND seen = false
          AND (%s::timestamptz IS NULL OR created_at > %s::timestamptz)
        ORDER BY created_at ASC
        """,
        (player_id, since, since),
    )
    if rows:
        execute(
            "UPDATE notifications SET seen = true WHERE id = ANY(%s)",
            ([r["id"] for r in rows],),
        )
    return [{**r, "id": str(r["id"])} for r in rows]


@app.post("/api/tier")
def api_tier(body: TierBody):
    """Increment a tier by 1. The low-level lever; policy lives in the poller."""
    if body.tier_type not in VALID_TIERS:
        return {"error": "invalid tier_type"}
    get_player_state(body.player_id)  # ensure row exists
    # Column name is validated against an allowlist above, safe to interpolate.
    execute(
        f"UPDATE player_state SET {body.tier_type} = {body.tier_type} + 1, "
        "updated_at = now() WHERE id = %s",
        (body.player_id,),
    )
    execute(
        "INSERT INTO telemetry (player_id, event_type, payload) VALUES (%s, 'tier_increment', %s)",
        (body.player_id, json.dumps({"tier_type": body.tier_type})),
    )
    return {"ok": True}


@app.post("/api/rumor")
def api_rumor(body: RumorBody):
    """Queue a rumor for async clustering — the poller merges it into collective
    drift (incrementing player_count) or starts a new cluster. Not the hot path."""
    job = fetch_one(
        "INSERT INTO jobs (type, payload, player_id, priority) "
        "VALUES ('cluster_drift', %s, %s, 4) RETURNING id",
        (json.dumps({"text": body.content, "drift_type": "rumor"}), body.player_id),
    )
    return {"status": "queued", "job_id": str(job["id"])}


# ─── World-agent endpoints (offline/async; called by the world agent's tools) ──

class ResonanceBody(BaseModel):
    resonance_score: float
    status: str | None = None  # optional new status: accumulating|proposed|canonized|retired


class DeltaBody(BaseModel):
    summary: str
    changes: list | dict
    invalidates_tags: list[str] = []
    enriches_tags: list[str] = []
    certainty: str = "implied"  # canonical|rumored|implied
    proposed_by: str = "world_state_v1"
    drift_id: str | None = None  # collective_drift cluster this delta canonizes


@app.get("/api/drift")
def api_drift():
    """Aggregated collective drift the world agent reasons over."""
    return [
        {**r, "id": str(r["id"])}
        for r in fetch(
            """
            SELECT id, type, content, player_count, resonance_score, spread_days, status, created_at
            FROM collective_drift
            WHERE status IN ('accumulating', 'proposed')
            ORDER BY player_count DESC, created_at DESC
            """
        )
    ]


@app.post("/api/drift/{drift_id}/resonance")
def api_drift_resonance(drift_id: str, body: ResonanceBody):
    """Persist the agent's resonance judgement for a drift item."""
    if body.status:
        execute(
            "UPDATE collective_drift SET resonance_score=%s, status=%s, updated_at=now() WHERE id=%s",
            (body.resonance_score, body.status, drift_id),
        )
    else:
        execute(
            "UPDATE collective_drift SET resonance_score=%s, updated_at=now() WHERE id=%s",
            (body.resonance_score, drift_id),
        )
    return {"ok": True, "id": drift_id}


@app.post("/api/delta")
def api_delta(body: DeltaBody):
    """Insert a proposed world delta (approved_by stays null until a human signs off)."""
    row = fetch_one(
        """
        INSERT INTO world_deltas (summary, changes, invalidates_tags, enriches_tags, certainty, proposed_by, drift_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (
            body.summary,
            json.dumps(body.changes),
            body.invalidates_tags,
            body.enriches_tags,
            body.certainty,
            body.proposed_by,
            body.drift_id or None,
        ),
    )
    return {"id": str(row["id"])}


@app.post("/api/delta/{delta_id}/flag")
def api_delta_flag(delta_id: str):
    """Surface a proposed delta to the human reviewer's notification queue."""
    execute(
        "INSERT INTO notifications (player_id, type, payload) VALUES ('__reviewer__', 'delta_proposed', %s)",
        (json.dumps({"delta_id": delta_id}),),
    )
    return {"ok": True, "delta_id": delta_id}


@app.post("/api/delta/{delta_id}/approve")
def api_delta_approve(delta_id: str, approved_by: str = "human"):
    """Human approves a delta → mark approved and queue the cascade for the poller."""
    execute(
        "UPDATE world_deltas SET approved_by = %s, approved_at = now() WHERE id = %s",
        (approved_by, delta_id),
    )
    job = fetch_one(
        "INSERT INTO jobs (type, payload, priority) VALUES ('world_delta_cascade', %s, 1) RETURNING id",
        (json.dumps({"delta_id": delta_id}),),
    )
    return {"ok": True, "job_id": str(job["id"])}


# ─── Entity evolution (world agent mutates a specific object, not the bible) ────
# Drift about a specific NPC/item/place evolves THAT content_item in place — instead
# of rewriting canon. Applied immediately, flagged needs_review (contained + lower
# stakes than a bible change). Identity is preserved (same id) so crystallized
# placements keep pointing at the entity. The API stays dumb: the agent authors any
# new text; no LLM here. Offline/world-agent path, never the player hot path.


@app.get("/api/entities")
def api_entities(q: str = "", limit: int = 10):
    """Search the content pool so the world agent can resolve a rumor's subject
    (e.g. 'Brother Kaelen') to the actual entity + its id. Uses pg_trgm similarity in
    addition to substring, so near-misses still match — typos, word order, and curly
    vs straight apostrophes ("Orsel's Seal" vs "Orsel'​s Seal"). Without this the
    substring match silently misses and the agent creates a duplicate. Best match first."""
    like = f"%{q}%"
    rows = fetch(
        """
        SELECT id, type, content ->> 'name' AS name,
               left(coalesce(content ->> 'description', content ->> 'response', ''), 200) AS description,
               tags, revelation_tier,
               similarity(content ->> 'name', %s) AS sim
        FROM content_items
        WHERE status = 'active' AND approved = true
          AND (content ->> 'name' ILIKE %s
               OR content ->> 'description' ILIKE %s
               OR similarity(content ->> 'name', %s) >= 0.3)
        ORDER BY sim DESC NULLS LAST, type
        LIMIT %s
        """,
        (q, like, like, q, limit),
    )
    return [
        {**r, "id": str(r["id"]), "sim": round(float(r["sim"]), 3) if r["sim"] is not None else None}
        for r in rows
    ]


ENTITY_TYPES = {"npc", "creature", "item", "lore_fragment", "plot_beat", "rumor"}


class CreateEntityBody(BaseModel):
    entity_type: str
    name: str
    description: str
    tags: list[str] = []
    revelation_tier: int = 1
    narrative_tier: int = 1
    power_tier: int = 1
    summary: str = ""
    drift_id: str | None = None


@app.post("/api/entity/create")
def api_entity_create(body: CreateEntityBody):
    """Spawn a NEW entity from resonant drift (a subject that didn't exist yet).
    Goes live approved + needs_review, like other generated content. The agent
    authors name/description; the API just writes. This is how a belief that players
    invented (e.g. a new NPC) becomes a real, discoverable content_item — instead of
    the agent fabricating it into its own memory."""
    from storage.content_store import insert_content_item

    if body.entity_type not in ENTITY_TYPES:
        return {"error": f"bad entity_type {body.entity_type!r} (want {sorted(ENTITY_TYPES)})"}
    new_id = insert_content_item(
        {
            "type": body.entity_type,
            "content": {"name": body.name, "description": body.description},
            "tags": body.tags,
            "revelation_tier": body.revelation_tier,
            "narrative_tier": body.narrative_tier,
            "power_tier": body.power_tier,
            "approved": True,        # live immediately
            "needs_review": True,    # retroactive spot-check
        }
    )
    if body.drift_id:
        execute(
            "UPDATE collective_drift SET status = 'canonized', updated_at = now() "
            "WHERE id = %s AND status IN ('accumulating', 'proposed')",
            (body.drift_id,),
        )
    execute(
        "INSERT INTO telemetry (event_type, content_item_id, payload) VALUES ('entity_created', %s, %s)",
        (new_id, json.dumps({"type": body.entity_type, "name": body.name, "summary": body.summary})),
    )
    log.info("ENTITY CREATE [%s] %s (%s) :: %s", body.entity_type, body.name, new_id, body.summary or "")
    return {"ok": True, "id": new_id, "name": body.name, "drift_canonized": bool(body.drift_id)}


class EvolveBody(BaseModel):
    change_kind: str           # enrich | regen | retire
    summary: str = ""
    new_text: str = ""         # agent-authored: appended (enrich) or replaces description (regen)
    drift_id: str | None = None


@app.post("/api/entity/{item_id}/evolve")
def api_entity_evolve(item_id: str, body: EvolveBody):
    """Evolve one entity in place (enrich/regen/retire). Applies immediately,
    flagged needs_review. Same id, so crystallized placements stay valid — and the
    players holding those placements get a 'this changed' notification with the diff."""
    item = fetch_one(
        "SELECT id, content FROM content_items WHERE id = %s AND status = 'active'", (item_id,)
    )
    if item is None:
        return {"error": "entity not found or not active"}
    kind = body.change_kind
    content = dict(item["content"] or {})
    name = content.get("name")
    before = (content.get("description") or content.get("response") or "").strip()
    added = after = None

    if kind == "retire":
        execute("UPDATE content_items SET status = 'retired' WHERE id = %s", (item_id,))
    elif kind == "enrich":
        added = body.new_text.strip()
        content["description"] = (before + " " + added).strip() if before else added
        after = content["description"]
        execute(
            "UPDATE content_items SET content = %s, needs_review = true WHERE id = %s",
            (json.dumps(content), item_id),
        )
    elif kind == "regen":
        after = content["description"] = body.new_text.strip()
        execute(
            "UPDATE content_items SET content = %s, needs_review = true WHERE id = %s",
            (json.dumps(content), item_id),
        )
    else:
        return {"error": f"bad change_kind {kind!r} (want enrich|regen|retire)"}

    if body.drift_id:
        execute(
            "UPDATE collective_drift SET status = 'canonized', updated_at = now() "
            "WHERE id = %s AND status IN ('accumulating', 'proposed')",
            (body.drift_id,),
        )
    execute(
        "INSERT INTO telemetry (event_type, content_item_id, payload) VALUES ('entity_evolved', %s, %s)",
        (item_id, json.dumps({"kind": kind, "summary": body.summary})),
    )
    notified = notify_entity_change(item_id, name, kind, body.summary, before, after, added)
    log.info("ENTITY %s %s :: %s (notified %d holder(s))", kind.upper(), item_id, body.summary or "", notified)
    return {
        "ok": True, "id": item_id, "change_kind": kind,
        "drift_canonized": bool(body.drift_id), "notified": notified,
    }
