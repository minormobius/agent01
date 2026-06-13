"""Backfill embeddings for bible_chunks that don't have one yet.

Chunks can land with a NULL embedding when they're inserted while the embed server
is down (e.g. add_tier_ladders run offline). This embeds every such chunk now,
without re-inserting the bible — so it's safe to run any time the embed server is
up, and it composes with reset_world.py (which leaves the bible alone).

Usage:
  python -m scripts.reembed_bible          # only NULL-embedding chunks
  python -m scripts.reembed_bible --all     # re-embed every chunk (force refresh)
"""

import argparse

from lib.llm import embed_text, health
from storage.content_store import conn_ctx, fetch


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="re-embed every chunk, not just NULL ones")
    args = ap.parse_args()

    h = health()
    if h.get("embed") != "up":
        raise SystemExit(f"Embed server not reachable (health: {h}). Bring it up first.")

    where = "" if args.all else "WHERE embedding IS NULL"
    rows = fetch(f"SELECT id, section_path, content FROM bible_chunks {where} ORDER BY section_path")
    if not rows:
        print("Nothing to embed — all chunks already have embeddings.")
        return

    print(f"Embedding {len(rows)} chunk(s)…")
    done = 0
    with conn_ctx() as conn, conn.cursor() as cur:
        for r in rows:
            vec = str(embed_text(r["content"]))
            cur.execute("UPDATE bible_chunks SET embedding = %s WHERE id = %s", (vec, r["id"]))
            done += 1
            print(f"  + {r['section_path']}")
    print(f"Embedded {done} chunk(s).")


if __name__ == "__main__":
    main()
