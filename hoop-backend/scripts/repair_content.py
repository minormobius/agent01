"""One-off repair: apply the insert-time normalization to EXISTING pool rows.

Normalization (storage.content_normalize) now runs on every insert, but content already
in the pool predates it. This walks active content_items and rewrites any that change —
fixing `flag:`→`flag.` in gates/effects and adding a `Leave.` exit to choiceless dialogue
nodes. Idempotent (re-running is a no-op once clean), read-mostly, no LLM.

    .venv/bin/python -m scripts.repair_content            # dry run — show what would change
    .venv/bin/python -m scripts.repair_content --apply    # write the fixes
"""

import argparse
import json
import sys

from storage.content_normalize import normalize_content, normalize_requires
from storage.content_store import execute, fetch


def main() -> int:
    ap = argparse.ArgumentParser(description="Normalize existing pool content in place.")
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = ap.parse_args()

    rows = fetch("SELECT id, content ->> 'name' AS name, content, requires "
                 "FROM content_items WHERE status = 'active'")
    changed = 0
    for r in rows:
        new_content = normalize_content(r["content"])
        new_requires = normalize_requires(r["requires"])
        if new_content == r["content"] and new_requires == (r["requires"] or {}):
            continue
        changed += 1
        print(f"  fix {r['name'] or r['id']} [{str(r['id'])[:8]}]")
        if args.apply:
            execute("UPDATE content_items SET content = %s, requires = %s WHERE id = %s",
                    (json.dumps(new_content), json.dumps(new_requires), r["id"]))

    verb = "fixed" if args.apply else "would fix"
    print(f"\n{verb} {changed} of {len(rows)} item(s)" + ("" if args.apply else " — re-run with --apply"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
