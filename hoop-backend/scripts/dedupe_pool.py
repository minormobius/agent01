"""Dedupe the content pool by normalized name (case- + punctuation-insensitive).

Addresses the long-standing dedup backlog and the concrete case where the world
agent created near-duplicate entities (e.g. "Orsel's Seal" with a curly vs straight
apostrophe) before fuzzy lookup existed. Within each (type, normalized-name) group
of ACTIVE items it keeps the EARLIEST-created, retires the rest, and re-points any
player_placements at the survivor so crystallized bindings stay valid.

Conservative on purpose: only merges items whose names are identical once case and
punctuation are stripped — never near-but-distinct names (those are a separate,
fuzzier problem). Run after the agent has been creating, or any time.

Usage:  python -m scripts.dedupe_pool [--yes]
"""

import argparse
import re
import sys

from storage.content_store import conn_ctx, fetch


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def find_groups() -> dict:
    """(type, normalized_name) -> [rows], oldest first, only groups with a dup."""
    rows = fetch(
        "SELECT id, type, content ->> 'name' AS name, created_at "
        "FROM content_items WHERE status = 'active' ORDER BY created_at"
    )
    groups: dict[tuple, list] = {}
    for r in rows:
        norm = _norm(r["name"])
        if not norm:
            continue
        groups.setdefault((r["type"], norm), []).append(r)
    return {k: v for k, v in groups.items() if len(v) > 1}


def plan_from_groups(groups: dict) -> list[tuple]:
    """(keep_id, [dup_ids]) per group — keep the earliest, retire the rest."""
    return [(items[0]["id"], [i["id"] for i in items[1:]]) for items in groups.values()]


def apply_plan(plan: list[tuple]) -> tuple[int, int]:
    """Re-point placements at survivors, retire the duplicates. Returns (repointed, retired)."""
    repointed = retired = 0
    with conn_ctx() as conn, conn.cursor() as cur:
        for keep_id, dup_ids in plan:
            cur.execute(
                "UPDATE player_placements SET content_item_id = %s WHERE content_item_id = ANY(%s)",
                (keep_id, dup_ids),
            )
            repointed += cur.rowcount
            cur.execute("UPDATE content_items SET status = 'retired' WHERE id = ANY(%s)", (dup_ids,))
            retired += cur.rowcount
    return repointed, retired


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="skip confirmation")
    args = ap.parse_args()

    groups = find_groups()
    if not groups:
        print("No duplicate names in the active pool.")
        return

    print(f"Found {len(groups)} duplicate group(s):")
    for (typ, _norm_name), items in groups.items():
        keep, dups = items[0], items[1:]
        print(f"  [{typ}] keep {keep['name']!r} ({str(keep['id'])[:8]}); "
              f"retire {len(dups)}: {[i['name'] for i in dups]}")

    if not args.yes and input("\nProceed? [y/N] ").strip().lower() not in ("y", "yes"):
        print("Aborted.")
        sys.exit(0)

    repointed, retired = apply_plan(plan_from_groups(groups))
    print(f"\nRe-pointed {repointed} placement(s) to survivors; retired {retired} duplicate(s).")


if __name__ == "__main__":
    main()
