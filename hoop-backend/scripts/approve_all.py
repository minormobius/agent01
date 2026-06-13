"""Auto-approve every pending content_item. Prototype-seeding convenience.

The design intends human review of the initial pregen, but at seeding scale that
won't happen, so this flips all pending/active rows to approved in one shot.

Usage:  .venv/bin/python -m scripts.approve_all
"""

from storage.content_store import conn_ctx


def approve_all() -> int:
    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE content_items SET approved = true, approved_at = now() "
            "WHERE NOT approved AND status = 'active'"
        )
        return cur.rowcount


if __name__ == "__main__":
    n = approve_all()
    print(f"approved {n} pending item(s)")
