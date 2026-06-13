"""End-to-end seed: build a world from scratch and prove the hot path.

Runs the full OFFLINE pipeline (the part that needs llama):
  parse bible -> insert -> embed -> pregen -> tier-label -> approve -> dispatch

Needs both llama servers up (:8080 gen, :8081 embed). Set LLM_SKIP_THINKING=1 for
speed. This is the "from zero to playable pool" path; live play + world evolution
then run through the API/poller (see README "Run the whole system").

Usage:  .venv/bin/python -m prototype.seed_run [--full] [--fresh]
  --full   use the real TARGETS (default uses tiny targets for a fast smoke test)
  --fresh  wipe the existing content pool + per-player crystallizations first, so
           the world is regenerated from scratch against the current bible (incl.
           the revelation/narrative ladders) rather than mixed with old content.
"""

import argparse

from ingestion.embedder import embed_bible
from ingestion.pregen_pass import run_pregen
from ingestion.tier_labeler import label_all_pending
from ingestion.world_parser import parse
from runtime.dispatcher import dispatch
from scripts.approve_all import approve_all
from storage.content_store import conn_ctx, insert_world_bible

BIBLE_PATH = "ingestion/chapter1_bible.md"


def wipe_pool():
    """Drop the whole content pool and everything that points into it, so a regen
    starts from a clean slate (used by --fresh). Bible/chunks are left in place."""
    with conn_ctx() as conn, conn.cursor() as cur:
        for t in ("telemetry", "player_placements", "player_inventory", "player_npc_state", "pool_depth"):
            cur.execute(f"DELETE FROM {t}")
        cur.execute(
            "UPDATE player_state SET revelation_tier=1, narrative_tier=1, power_tier=1, "
            "xp=0, seen_ids='{}', updated_at=now()"
        )
        cur.execute("DELETE FROM content_items")
    print("   wiped content_items + per-player crystallizations")


def main(full: bool = False, fresh: bool = False, approve: bool = True):
    if fresh:
        print("0. fresh regen — wiping old pool")
        wipe_pool()

    print("1. parse world bible")
    bible = parse(BIBLE_PATH)
    print(f"   {len(bible['sections'])} sections")

    print("2. insert bible")
    bible_id = insert_world_bible(bible)
    print(f"   bible_id={bible_id}")

    print("3. embed bible -> pgvector")
    print(f"   {embed_bible(bible, bible_id)} chunks embedded")

    print("4. pregen content pool")
    targets = None if full else {"npc": 3, "lore_fragment": 5}
    run_pregen(bible, override_targets=targets)

    print("5. tier-label pending items")
    print(f"   labeled {label_all_pending()}")

    if approve:
        print("6. approve all (prototype seeding)")
        print(f"   approved {approve_all()}")
        print("7. dispatch (tier-1 player, hot path, no LLM)")
        items = dispatch("seed_smoke", "dimly lit corridor near the market", "lore_fragment", n=2)
        for it in items:
            c = it["content"]
            print(f"   - [r{it['revelation_tier']}] {c.get('name')}: {(c.get('description') or '')[:50]}...")
        print("\n✓ seed complete — pool is live, dispatch works.")
    else:
        print("6. SKIP approve — items left pending for human review")
        print("   review them at:  uvicorn review.review_api:app --port 8000  -> http://localhost:8000/")
        print("\n✓ pregen complete — pool is pending review (nothing dispatchable yet).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="use real TARGETS, not a tiny smoke set")
    ap.add_argument("--fresh", action="store_true", help="wipe the old pool first")
    ap.add_argument("--no-approve", action="store_true",
                    help="leave items pending so you can review them in the UI (skips auto-approve)")
    args = ap.parse_args()
    main(full=args.full, fresh=args.fresh, approve=not args.no_approve)
