"""Database access layer. psycopg3 against local pgvector Postgres (or Neon later).

The connection string is the only thing that changes between local and cloud.
Rows come back as dicts (psycopg.rows.dict_row) so callers can use item["field"].
"""

import json
import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]


def get_conn():
    """Open a new connection with dict rows. Caller is responsible for closing."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=False)


@contextmanager
def conn_ctx():
    """Context manager that commits on success, rolls back on error, always closes."""
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch(query: str, params: tuple = ()) -> list[dict]:
    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def fetch_one(query: str, params: tuple = ()) -> dict | None:
    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()


def execute(query: str, params: tuple = ()) -> None:
    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute(query, params)


# ─── Higher-level helpers ───────────────────────────────────────────────────


def insert_world_bible(bible: dict, season: int = 1) -> str:
    """Insert a parsed bible, return its id. Auto-increments version per season."""
    row = fetch_one(
        "SELECT COALESCE(MAX(version), 0) + 1 AS v FROM world_bible WHERE season = %s",
        (season,),
    )
    version = row["v"]
    out = fetch_one(
        """
        INSERT INTO world_bible (version, season, markdown, content)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (version, season, bible["raw_markdown"], json.dumps(bible)),
    )
    return str(out["id"])


def get_current_bible(season: int = 1) -> dict | None:
    return fetch_one(
        "SELECT * FROM world_bible WHERE season = %s ORDER BY version DESC LIMIT 1",
        (season,),
    )


def insert_content_item(item: dict, season: int = 1) -> str:
    """Insert a content_item. `item` carries type/content fields; tiers optional."""
    from storage.content_normalize import normalize_content, normalize_requires

    content = item.get("content")
    if content is None:
        # Build content blob from flat fields produced by the generator — including
        # the gameplay fields the gate/engine read: item `mechanics`, npc `dialogue`.
        content = {
            k: item[k]
            for k in ("name", "description", "response", "revelation_hint", "mechanics", "dialogue")
            if k in item
        }
    # Deterministically fix convention drift (flag: -> flag.) and give choiceless
    # dialogue nodes an exit, so generated content can't ship dead gates / dead-ends.
    content = normalize_content(content)
    requires = normalize_requires(item.get("requires"))
    out = fetch_one(
        """
        INSERT INTO content_items
            (type, content, revelation_tier, narrative_tier, power_tier,
             tags, world_refs, requires, approved, needs_review, season)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            item["type"],
            json.dumps(content),
            item.get("revelation_tier", 1),
            item.get("narrative_tier", 1),
            item.get("power_tier", 1),
            item.get("tags", []),
            item.get("world_refs", []),
            json.dumps(requires),   # the generic gate (convention-normalized)
            item.get("approved", False),
            item.get("needs_review", False),
            season,
        ),
    )
    return str(out["id"])


if __name__ == "__main__":
    # Smoke check for Step 1 acceptance.
    with get_conn() as c, c.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")
        print("connection OK, public tables:", cur.fetchone()["n"])
