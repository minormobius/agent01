"""Job handlers — the async/offline work the poller runs off the jobs table.

This is NOT the hot path: it's the "long rest" layer. Typed player input queued by
the API resolves here (LLM, async) and surfaces later via notifications.

POLLER_STUB_LLM=1 makes resolution return a canned response instead of calling
llama — lets us exercise the full queue lifecycle with the model offline.
"""

import json
import os

from lib.log import get_logger
from storage import content_store
from storage.content_store import get_current_bible, insert_content_item

log = get_logger("poller.job")

STUB_LLM = os.environ.get("POLLER_STUB_LLM", "").strip().lower() in (
    "1", "true", "yes", "on",
)


def _get_or_create_player(player_id: str) -> dict:
    player = content_store.fetch_one(
        "SELECT * FROM player_state WHERE id = %s", (player_id,)
    )
    if player is None:
        player = content_store.fetch_one(
            "INSERT INTO player_state (id) VALUES (%s) RETURNING *", (player_id,)
        )
    return player


def _generate_resolution(player: dict, payload: dict) -> dict:
    text = payload.get("text", "")
    context = payload.get("context", "") or ""
    if STUB_LLM:
        return {
            "response": f"[stub] The station registers your attempt: \"{text}\". "
            "Nothing obvious yields — but something, somewhere, takes note.",
            "tags": ["stub", "long_rest"],
            "world_refs": [],
            "novel": True,
        }
    from lib.llm import call_llm_json, GENERATOR_SYSTEM

    bible = get_current_bible()
    prompt = f"""World context: {bible['markdown']}
Player tier: revelation={player['revelation_tier']}
Player typed: "{text}"
Scene context: {context}

Respond as the game world. The player has attempted something or asked something.
Find the most coherent world-consistent response. Be conservative — the world
doesn't always grant what's asked, but it responds authentically.

Output JSON: {{"response": str, "tags": [str], "world_refs": [str], "novel": true}}"""
    return call_llm_json(prompt, system=GENERATOR_SYSTEM)


def handle_resolve_input(job: dict) -> dict:
    """Resolve a freeform typed input. Inserts the result as a live dialogue item
    flagged needs_review, and asks the poller to notify the player."""
    payload = job["payload"] or {}
    player = _get_or_create_player(job["player_id"])

    log.info("resolve_input player=%s text=%r (%s)",
             job["player_id"], (payload.get("text") or "")[:80],
             "stub" if STUB_LLM else "llama")
    result = _generate_resolution(player, payload)
    log.info("resolve_input player=%s -> %r", job["player_id"],
             (result.get("response") or "")[:100])
    item_id = insert_content_item(
        {
            "type": "dialogue",
            "content": {
                "response": result.get("response"),
                "prompt": payload.get("text"),
            },
            "tags": result.get("tags", []),
            "world_refs": result.get("world_refs", []),
            "revelation_tier": player["revelation_tier"],
            "narrative_tier": player["narrative_tier"],
            "power_tier": player["power_tier"],
            "approved": True,       # live immediately
            "needs_review": True,   # retroactive spot-check
        }
    )
    return {
        "resolution": result,
        "item_id": item_id,
        "source": "stub" if STUB_LLM else "generated",
        "notify": True,
    }


def handle_cascade(job: dict) -> dict:
    """Run the four-layer world delta cascade (Step 14)."""
    from poller.cascade import run_cascade

    return run_cascade(job["payload"]["delta_id"])


# Trigram similarity above which a new rumor is the "same belief" as a cluster.
DRIFT_SIMILARITY_THRESHOLD = 0.30


def handle_cluster_drift(job: dict) -> dict:
    """Cluster a freeform rumor into collective drift.

    Deterministic, no LLM: pg_trgm finds the nearest existing accumulating/proposed
    cluster. Above threshold -> increment its player_count (the belief is spreading).
    Otherwise -> start a new cluster. This is how drift actually accumulates.
    """
    payload = job["payload"] or {}
    text = (payload.get("text") or "").strip()
    drift_type = payload.get("drift_type", "rumor")
    if not text:
        return {"clustered": "skipped", "reason": "empty"}

    match = content_store.fetch_one(
        """
        SELECT id, content, player_count, similarity(content, %s) AS sim
        FROM collective_drift
        WHERE status IN ('accumulating', 'proposed')
        ORDER BY similarity(content, %s) DESC
        LIMIT 1
        """,
        (text, text),
    )
    if match and match["sim"] is not None and match["sim"] >= DRIFT_SIMILARITY_THRESHOLD:
        content_store.execute(
            "UPDATE collective_drift SET player_count = player_count + 1, updated_at = now() WHERE id = %s",
            (match["id"],),
        )
        log.info("drift MATCHED (sim=%.3f) player_count=%d :: %r",
                 float(match["sim"]), match["player_count"] + 1, text[:60])
        return {
            "clustered": "matched",
            "drift_id": str(match["id"]),
            "similarity": round(float(match["sim"]), 3),
            "player_count": match["player_count"] + 1,
        }
    row = content_store.fetch_one(
        "INSERT INTO collective_drift (type, content, player_count) VALUES (%s, %s, 1) RETURNING id",
        (drift_type, text),
    )
    log.info("drift NEW cluster %s :: %r", str(row["id"])[:8], text[:60])
    return {"clustered": "new", "drift_id": str(row["id"]), "player_count": 1}


# ─── Progress evaluation (long rest) — the agent half of hybrid leveling ──────
#
# power_tier already advances deterministically in the hot path (XP from
# crystallizing features). revelation_tier and narrative_tier are *judged* here,
# off the hot path, against the bible's revelation/narrative ladders. When llama +
# Letta are up the player's own Letta agent makes the call (and uses its
# increment_revelation_tier tool); otherwise we fall back to a deterministic rule
# so the loop still completes with the model offline.

# Crystallized-feature counts at which the deterministic fallback advances a tier.
# Index = current tier; value = features needed to reach the next. Caps at 3 to
# match the 3-stage ladders in the bible.
_REVELATION_GATE = {1: 3, 2: 6}
_NARRATIVE_GATE = {1: 4, 2: 8}


def _progress_facts(player_id: str) -> dict:
    """Cheap, LLM-free snapshot of how far this player has actually come."""
    cryst = content_store.fetch_one(
        "SELECT count(*) AS n FROM player_placements WHERE player_id = %s", (player_id,)
    )["n"]
    seen_types = content_store.fetch(
        """
        SELECT ci.type, count(*) AS n
        FROM content_items ci
        WHERE ci.id = ANY(SELECT unnest(seen_ids) FROM player_state WHERE id = %s)
        GROUP BY ci.type
        """,
        (player_id,),
    )
    return {"crystallized": cryst, "seen_by_type": {r["type"]: r["n"] for r in seen_types}}


def _deterministic_progress(player_id: str, facts: dict) -> dict:
    player = _get_or_create_player(player_id)
    rev, nar = player["revelation_tier"], player["narrative_tier"]
    crystallized = facts["crystallized"]
    saw_plot = facts["seen_by_type"].get("plot_beat", 0) > 0
    advanced = []

    if rev < 3 and crystallized >= _REVELATION_GATE.get(rev, 99) and (rev < 2 or saw_plot):
        rev += 1
        content_store.execute(
            "UPDATE player_state SET revelation_tier = %s, updated_at = now() WHERE id = %s",
            (rev, player_id),
        )
        content_store.execute(
            "INSERT INTO telemetry (player_id, event_type, payload) VALUES (%s, 'tier_increment', %s)",
            (player_id, json.dumps({"tier_type": "revelation_tier", "to": rev, "via": "long_rest"})),
        )
        advanced.append(("revelation", rev))

    if nar < 3 and crystallized >= _NARRATIVE_GATE.get(nar, 99):
        nar += 1
        content_store.execute(
            "UPDATE player_state SET narrative_tier = %s, updated_at = now() WHERE id = %s",
            (nar, player_id),
        )
        content_store.execute(
            "INSERT INTO telemetry (player_id, event_type, payload) VALUES (%s, 'tier_increment', %s)",
            (player_id, json.dumps({"tier_type": "narrative_tier", "to": nar, "via": "long_rest"})),
        )
        advanced.append(("narrative", nar))

    if advanced:
        axes = ", ".join(f"{a} → {t}" for a, t in advanced)
        msg = (
            f"You rest, and the station settles into a different shape behind your eyes. "
            f"What you've pieced together has earned you a deeper footing ({axes})."
        )
    else:
        msg = "You rest. Nothing has yet shifted — the station is still keeping its distance."
    return {
        "source": "deterministic",
        "advanced": [{"axis": a, "to": t} for a, t in advanced],
        "narration": msg,
        "facts": facts,
        "notify": True,
    }


def handle_evaluate_progress(job: dict) -> dict:
    """Long-rest progress review. Letta agent if available, else deterministic."""
    player_id = job["player_id"]
    facts = _progress_facts(player_id)
    log.info("evaluate_progress player=%s facts=%s", player_id, facts)

    if not STUB_LLM:
        try:
            from lib.llm import health

            if health().get("llm") == "up":
                from agents.player_agent import evaluate_progress

                log.info("evaluate_progress player=%s -> routing to Letta player agent", player_id)
                res = evaluate_progress(player_id, facts)
                res["notify"] = True
                log.info("evaluate_progress player=%s (agent) advanced=%s", player_id, res.get("advanced"))
                return res
        except Exception as e:  # agent/letta hiccup — fall back, don't fail the rest
            log.warning("evaluate_progress agent path failed (%s: %s); using deterministic fallback",
                        type(e).__name__, e)

    res = _deterministic_progress(player_id, facts)
    log.info("evaluate_progress player=%s (deterministic) advanced=%s", player_id, res.get("advanced"))
    return res


def _not_implemented(job: dict) -> dict:
    raise NotImplementedError(f"job type '{job['type']}' not implemented yet")


HANDLERS = {
    "resolve_input": handle_resolve_input,
    "cluster_drift": handle_cluster_drift,
    "evaluate_progress": handle_evaluate_progress,
    "pregen_batch": _not_implemented,
    "world_delta_cascade": handle_cascade,
    "deliver_retcon": _not_implemented,
    "season_synth": _not_implemented,
}


def handle_job(job: dict) -> dict:
    handler = HANDLERS.get(job["type"])
    if handler is None:
        raise ValueError(f"Unknown job type: {job['type']}")
    return handler(job)
