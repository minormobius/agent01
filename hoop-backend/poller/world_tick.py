"""World tick — the poller's periodic nudge to the world agent.

Drift accumulates in collective_drift as players spread rumors, but nothing reviews
it on its own. This closes that loop: every so often, IF a drift cluster has spread
to enough players, the poller invokes the world agent to review it and (maybe)
propose a bible delta. Proposals stay human-gated — they land in the reviewer
notification queue for approval, they do NOT change canon directly.

Gating (so we don't hammer llama or re-propose the same belief every tick):
  - time: at most once per WORLD_TICK_INTERVAL seconds.
  - threshold: only clusters with player_count >= WORLD_TICK_THRESHOLD and still
    'accumulating' qualify.
  - novelty: a cluster is only re-reviewed if its player_count GREW since we last
    reviewed it (tracked in-process; resets on poller restart).
  - llama: skipped if the generation model is down.

Tunable via env (handy for solo testing — set WORLD_TICK_THRESHOLD=1):
  WORLD_TICK_INTERVAL  (seconds, default 180)
  WORLD_TICK_THRESHOLD (player_count, default 2)
"""

import os
import time

from lib.log import get_logger
from storage import content_store

log = get_logger("worldtick")

WORLD_TICK_INTERVAL = int(os.environ.get("WORLD_TICK_INTERVAL", "180"))
WORLD_TICK_THRESHOLD = int(os.environ.get("WORLD_TICK_THRESHOLD", "2"))

_last_tick = 0.0
_reviewed: dict[str, int] = {}  # drift_id -> player_count at last review


def maybe_world_tick() -> dict | None:
    """Run a world-agent review if the gates allow. Returns the review result, or
    None if nothing fired (interval not elapsed / no hot drift / llama down)."""
    global _last_tick
    now = time.time()
    if now - _last_tick < WORLD_TICK_INTERVAL:
        return None

    hot = content_store.fetch(
        "SELECT id, player_count FROM collective_drift "
        "WHERE status = 'accumulating' AND player_count >= %s",
        (WORLD_TICK_THRESHOLD,),
    )
    # Only clusters we haven't already reviewed at this player_count (re-review when
    # a belief keeps spreading, not while it sits still).
    fresh = [r for r in hot if _reviewed.get(str(r["id"])) != r["player_count"]]
    if not fresh:
        return None

    from lib.llm import health

    if health().get("llm") != "up":
        log.warning("world tick: %d hot cluster(s) >= %d but llama is down; skipping",
                    len(fresh), WORLD_TICK_THRESHOLD)
        _last_tick = now  # don't re-check health every idle tick
        return None

    _last_tick = now
    for r in fresh:
        _reviewed[str(r["id"])] = r["player_count"]
    log.info("world tick: %d drift cluster(s) >= %d -> world agent review",
             len(fresh), WORLD_TICK_THRESHOLD)

    from agents.world_agent import run_world_review

    result = run_world_review()
    if result.get("proposed"):
        log.info("world tick: world agent PROPOSED delta %s (awaiting human approval)",
                 result.get("delta_id"))
    else:
        log.info("world tick: world agent proposed nothing — drift didn't resonate")
    return result
