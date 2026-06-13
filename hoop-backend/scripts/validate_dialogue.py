"""Validate every NPC dialogue tree in the content pool.

Runs runtime.dialogue_validate over each active npc's `content.dialogue`, so a bad
tree (broken goto, dead branch, unreachable node, stuck node) is caught in QA instead
of at a player's turn. No LLM, read-only. Exit code is nonzero if any tree has an
ERROR-level issue, so it fits in CI / a pre-approval gate.

    .venv/bin/python -m scripts.validate_dialogue            # active npcs
    .venv/bin/python -m scripts.validate_dialogue --all      # include unapproved too
    .venv/bin/python -m scripts.validate_dialogue --warnings # treat warnings as failures
"""

import argparse
import sys

from runtime.dialogue_validate import errors, validate_tree, warnings
from storage.content_store import fetch


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate NPC dialogue trees in the pool.")
    ap.add_argument("--all", action="store_true", help="include unapproved items")
    ap.add_argument("--warnings", action="store_true", help="exit nonzero on warnings too")
    args = ap.parse_args()

    rows = fetch(
        """
        SELECT id, content ->> 'name' AS name, content -> 'dialogue' AS dialogue
        FROM content_items
        WHERE type = 'npc' AND status = 'active'
          AND content -> 'dialogue' IS NOT NULL
          AND (%s OR approved = true)
        ORDER BY content ->> 'name'
        """,
        (args.all,),
    )
    if not rows:
        print("no npc dialogue trees found.")
        return 0

    total_err = total_warn = bad_trees = 0
    for r in rows:
        issues = validate_tree(r["dialogue"])
        errs, warns = errors(issues), warnings(issues)
        total_err += len(errs)
        total_warn += len(warns)
        if errs or warns:
            bad_trees += 1
            head = f"{r['name'] or '(unnamed)'}  [{str(r['id'])[:8]}]"
            print(f"\n▶ {head} — {len(errs)} error(s), {len(warns)} warning(s)")
            for i in errs + warns:
                print(f"    {i}")

    print(f"\n{len(rows)} tree(s) checked · {total_err} error(s), {total_warn} warning(s) "
          f"across {bad_trees} tree(s)")
    fail = total_err > 0 or (args.warnings and total_warn > 0)
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
