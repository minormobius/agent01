"""Prove every gated content_item in the pool is reachable by some player path.

Runs runtime.gate_reachability over the live pool: builds the producer→consumer graph
(dialogue effects / take / give_items produce facts/items/rep; `requires` blobs consume
them), computes the reachability closure, and reports gates that can never open —
orphans (nothing produces the required state; a typo'd flag or missing item) as errors,
and gated-behind-unreachable as warnings. Tier gates (revelation/narrative) are assumed
satisfiable since the Letta agent, not static rules, advances them. No LLM, read-only.

    .venv/bin/python -m scripts.validate_gates             # active + approved
    .venv/bin/python -m scripts.validate_gates --all       # include unapproved
    .venv/bin/python -m scripts.validate_gates --warnings  # exit nonzero on warnings too
"""

import argparse
import sys

from runtime.gate_reachability import ERROR, analyze_pool


def main() -> int:
    ap = argparse.ArgumentParser(description="Pool-wide gate reachability check.")
    ap.add_argument("--all", action="store_true", help="include unapproved items")
    ap.add_argument("--warnings", action="store_true", help="exit nonzero on warnings too")
    args = ap.parse_args()

    issues = analyze_pool(include_unapproved=args.all)
    errs = [i for i in issues if i.level == ERROR]
    warns = [i for i in issues if i.level != ERROR]

    if not issues:
        print("✓ every gate in the pool is reachable.")
        return 0

    for i in errs + warns:
        print(f"  [{i.level}] {i.code}: {i.message}\n      ↳ on {i.source}")
    print(f"\n{len(errs)} orphan error(s), {len(warns)} warning(s)")
    return 1 if (errs or (args.warnings and warns)) else 0


if __name__ == "__main__":
    sys.exit(main())
