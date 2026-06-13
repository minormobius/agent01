"""Reset the world to pristine "just the pool" state.

Everything downstream of player action is transient and reproducible; the original
human-approved content pool + the world bible are the only durable canon. This wipes
the former and preserves the latter, so you can replay the loop from a clean slate.

What gets cleared (always):
  - generated content_items (needs_review = true): replenishment refills + resolved
    long-rest dialogue. The original pregen pool (needs_review = false) is preserved,
    and surviving items have usage_count zeroed and any 'retired' status restored.
  - collective_drift, world_deltas        (rumors + the canon changes they drove)
  - notifications, player_inputs, jobs, telemetry
  - player_placements, pool_depth          (per-player crystallizations + watermarks)

Player rows are kept by default but reset to a fresh slate (tier 1, 0 xp, nothing
seen) so their letta_agent_id survives. Pass --players to delete them outright, and
--agents to also delete the per-player Letta agents (the `player_*` agents in Letta,
including any orphaned by a prior wipe). --agents needs Letta reachable; the DB reset
does not.

NOT touched: world_bible / bible_chunks (canon, incl. the tier ladders), and the
singleton world agent. The pool itself is preserved, so there is nothing to
regenerate after a reset.

Usage:
  python -m scripts.reset_world                    # pristine pool, players reset in place
  python -m scripts.reset_world --players          # ...and delete all player rows too
  python -m scripts.reset_world --players --agents  # ...and delete the player Letta agents
  python -m scripts.reset_world --yes              # skip the confirmation prompt
"""

import argparse
import sys

from storage.content_store import conn_ctx, fetch

# Tables that hold only player-action fallout — safe to truncate wholesale.
DOWNSTREAM = [
    "telemetry",
    "notifications",
    "player_inputs",
    "jobs",
    "player_placements",
    "pool_depth",
    "world_deltas",
    "collective_drift",
]


def _summary() -> dict:
    counts = {}
    for t in ["content_items", "player_state", *DOWNSTREAM]:
        counts[t] = fetch(f"SELECT count(*) n FROM {t}")[0]["n"]
    counts["content_items (generated)"] = fetch(
        "SELECT count(*) n FROM content_items WHERE needs_review = true"
    )[0]["n"]
    return counts


def reset(drop_players: bool) -> None:
    with conn_ctx() as conn, conn.cursor() as cur:
        # Clear placements first so the FK doesn't block content_items deletion.
        cur.execute("DELETE FROM player_placements")
        cur.execute("DELETE FROM pool_depth")

        # Generated content goes; the original approved pool stays and is freshened.
        cur.execute("DELETE FROM content_items WHERE needs_review = true")
        generated = cur.rowcount
        cur.execute(
            "UPDATE content_items SET usage_count = 0, status = 'active' "
            "WHERE status <> 'active' OR usage_count <> 0"
        )

        already_cleared = {"player_placements", "pool_depth"}
        for t in DOWNSTREAM:
            if t not in already_cleared:
                cur.execute(f"DELETE FROM {t}")

        if drop_players:
            cur.execute("DELETE FROM player_state")
            players = "deleted all"
        else:
            cur.execute(
                "UPDATE player_state SET revelation_tier = 1, narrative_tier = 1, "
                "power_tier = 1, xp = 0, seen_ids = '{}', updated_at = now()"
            )
            players = f"reset {cur.rowcount} in place"

    print(f"  · removed {generated} generated content_items (original pool preserved)")
    print(f"  · cleared {', '.join(DOWNSTREAM)}")
    print(f"  · players: {players}")


def clear_player_agents() -> None:
    """Delete every `player_*` Letta agent (the per-player narrators), including any
    orphaned by an earlier player wipe. Leaves the singleton world agent alone.
    Needs Letta reachable; warns and skips if it isn't."""
    try:
        from agents.letta_client import get_client

        client = get_client()
        targets = [a for a in client.agents.list() if a.name.startswith("player_")]
        for a in targets:
            client.agents.delete(a.id)
        print(f"  · deleted {len(targets)} player Letta agent(s)")
    except Exception as e:
        print(f"  · WARNING: could not clear player agents ({type(e).__name__}: {e}) — is Letta up?")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--players", action="store_true", help="also delete all player rows")
    ap.add_argument("--agents", action="store_true", help="also delete the per-player Letta agents (needs Letta up)")
    ap.add_argument("--yes", action="store_true", help="skip confirmation")
    args = ap.parse_args()

    print("Before:")
    for t, n in _summary().items():
        print(f"  {t:30} {n}")

    if not args.yes:
        extra = " and DELETE all players" if args.players else ""
        extra += " and their Letta agents" if args.agents else ""
        ans = input(f"\nReset to pristine pool{extra}? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            print("Aborted.")
            sys.exit(0)

    print("\nResetting…")
    reset(args.players)
    if args.agents:
        clear_player_agents()

    print("\nAfter:")
    for t, n in _summary().items():
        print(f"  {t:30} {n}")
    print("\nPristine. The original pool is intact — no regeneration needed.")


if __name__ == "__main__":
    main()
