"""Embed bible sections into pgvector via the nomic-embed-text llama.cpp server."""

import sys

from lib.llm import embed_text
from storage.content_store import conn_ctx, get_current_bible, insert_world_bible
from ingestion.world_parser import parse


def embed_bible(bible: dict, bible_id: str, season: int = 1) -> int:
    """Embed each section of `bible` into bible_chunks. Returns count embedded.

    Idempotent per bible_id: clears existing chunks for that bible first.
    """
    count = 0
    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM bible_chunks WHERE bible_id = %s", (bible_id,))
        for section_path, sec in bible["sections"].items():
            text = sec["text"]
            if not text.strip():
                continue
            embedding = embed_text(text)
            cur.execute(
                """
                INSERT INTO bible_chunks (bible_id, section_path, content, tags, embedding, season)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (bible_id, section_path, text, sec["tags"], str(embedding), season),
            )
            count += 1
    return count


if __name__ == "__main__":
    # Parse + insert + embed in one shot for manual runs.
    path = sys.argv[1] if len(sys.argv) > 1 else "prototype/tiny_world.md"
    bible = parse(path)
    bible_id = insert_world_bible(bible)
    print(f"bible_id={bible_id}")
    n = embed_bible(bible, bible_id)
    print(f"embedded {n} chunks")
