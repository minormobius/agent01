"""Top up the content pool — generate N more of a type, append-only (no wipe).

Fills the gap the other entry points leave: ingestion/pregen_pass.__main__ is a
hardcoded demo, seed_run --fresh *wipes* the pool, and replenishment only fires inside
the running poller. This generates `count` pending items of one type, tier-labels them,
and optionally approves — so you can react to orphans/gaps by minting more without
touching what's already there. Needs llama up (real generation). See
docs/content-authoring-plan.md.

    python -m scripts.generate --type npc --count 10
    python -m scripts.generate --type lore_fragment --count 20 --approve

New items land pending (approved=false) for the review UI, normalized + QA'd +
tier-labeled like any pregen content. Append-only — never deletes.
"""

import argparse
import sys

from ingestion.pregen_pass import TARGETS, run_pregen
from ingestion.tier_labeler import label_all_pending
from ingestion.world_parser import parse
from storage.content_store import execute

TYPES = sorted(TARGETS)  # valid content types (npc/creature/item/lore_fragment/rumor/plot_beat)


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate more pool content of one type (append-only).")
    ap.add_argument("--type", required=True, choices=TYPES, help="content type to generate")
    ap.add_argument("--count", type=int, default=10, help="how many to generate")
    ap.add_argument("--bible", default="ingestion/chapter1_bible.md", help="world bible markdown to ground on")
    ap.add_argument("--approve", action="store_true",
                    help="approve the new items immediately (skip the review gate)")
    ap.add_argument("--think", action="store_true",
                    help="enable reasoning mode for generation (slower, often better prose)")
    args = ap.parse_args()

    bible = parse(args.bible)
    print(f"generating {args.count}x {args.type} (grounded on {args.bible}, think={args.think})…")
    run_pregen(bible, override_targets={args.type: args.count}, think=args.think)

    labeled = label_all_pending()
    print(f"tier-labeled {labeled} pending item(s)")

    if args.approve:
        execute("UPDATE content_items SET approved = true, approved_at = now() "
                "WHERE approved = false AND status = 'active' AND type = %s", (args.type,))
        print(f"approved pending {args.type} items (live now)")
    else:
        print("left pending — review at: uvicorn review.review_api:app --port 8000")
    return 0


if __name__ == "__main__":
    sys.exit(main())
