"""Content dispatch — the hot path. Pure SQL, no LLM.

Selects approved content for a player, enforcing the hard tier gate in SQL (a
player at revelation_tier=2 can NEVER see tier-3+ content) and preferring items
whose tags overlap the current scene. Marks items seen and logs telemetry.

Semantic scene matching (embed context -> nearest bible tags) is optional and
off by default for the prototype; pass a `context` string with use_semantic=True
to enable it once the embed server is reliably up.
"""

import json

from lib.log import get_logger
from runtime.state_gate import load_gate_state, meets_state
from storage.content_store import conn_ctx, fetch_one

log = get_logger("dispatch")


def get_player_state(player_id: str) -> dict:
    """Fetch player state, creating a tier-1 row on first contact."""
    row = fetch_one("SELECT * FROM player_state WHERE id = %s", (player_id,))
    if row:
        return row
    return fetch_one(
        "INSERT INTO player_state (id) VALUES (%s) RETURNING *", (player_id,)
    )


def _relevant_tags(context: str, top_k: int = 10) -> list[str]:
    """Semantic scene -> bible tags via pgvector. Best-effort; [] on failure."""
    from lib.llm import embed_text

    try:
        emb = embed_text(context)
    except Exception:
        return []
    rows = fetch_one(
        """
        SELECT array_agg(DISTINCT t) AS tags FROM (
            SELECT unnest(tags) AS t
            FROM bible_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        ) s
        """,
        (str(emb), top_k),
    )
    return (rows or {}).get("tags") or []


def select_with_variety(candidates: list[dict], n: int) -> list[dict]:
    """Greedy pick maximizing new tags per selection, for diversity."""
    candidates = list(candidates)
    selected: list[dict] = []
    seen_tags: set[str] = set()
    while candidates and len(selected) < n:
        best = max(candidates, key=lambda c: len(set(c["tags"]) - seen_tags))
        selected.append(best)
        seen_tags.update(best["tags"])
        candidates.remove(best)
    return selected


def dispatch(
    player_id: str,
    context: str,
    content_type: str,
    n: int = 1,
    use_semantic: bool = False,
) -> list[dict]:
    player = get_player_state(player_id)
    relevant_tags = _relevant_tags(context) if use_semantic else []

    with conn_ctx() as conn, conn.cursor() as cur:
        # Hard tier gate + unseen, overfetch for variety selection.
        cur.execute(
            """
            SELECT * FROM content_items
            WHERE type = %s
              AND approved = true
              AND status = 'active'
              AND revelation_tier <= %s
              AND narrative_tier  <= %s
              AND power_tier      <= %s
              AND id != ALL(%s)
            ORDER BY
              cardinality(ARRAY(
                SELECT unnest(tags) INTERSECT SELECT unnest(%s::text[])
              )) DESC,
              random()
            LIMIT %s
            """,
            (
                content_type,
                player["revelation_tier"],
                player["narrative_tier"],
                player["power_tier"],
                player["seen_ids"],
                relevant_tags,
                n * 3,
            ),
        )
        candidates = cur.fetchall()
        # Generic requirement gate: drop candidates whose `requires` the player's
        # state (facts/items/reputation) doesn't satisfy. The tier gate above is the
        # fast SQL prefilter; this is the reactive layer ("how the world reacts to
        # YOU"). State is loaded once and applied per candidate. No-op until content
        # carries a non-empty `requires`.
        gstate = load_gate_state(player_id)
        candidates = [c for c in candidates if meets_state(gstate, c.get("requires") or {})]
        selected = select_with_variety(candidates, n)

        log.info(
            "dispatch player=%s type=%s gate=r%d/n%d/p%d want=%d candidates=%d selected=%s",
            player_id, content_type,
            player["revelation_tier"], player["narrative_tier"], player["power_tier"],
            n, len(candidates),
            [((c.get("content") or {}).get("name") or "?") for c in selected] or "NONE",
        )
        if not selected:
            log.warning(
                "dispatch EMPTY player=%s type=%s — pool dry at this tier (seen=%d)",
                player_id, content_type, len(player["seen_ids"] or []),
            )

        for item in selected:
            cur.execute(
                "UPDATE player_state SET seen_ids = array_append(seen_ids, %s), "
                "updated_at = now() WHERE id = %s",
                (item["id"], player_id),
            )
            cur.execute(
                "UPDATE content_items SET usage_count = usage_count + 1 WHERE id = %s",
                (item["id"],),
            )
        if selected:
            cur.execute(
                "INSERT INTO telemetry (player_id, event_type, payload) VALUES (%s, %s, %s)",
                (player_id, "content_seen", json.dumps({"item_ids": [str(i["id"]) for i in selected]})),
            )

    return selected


if __name__ == "__main__":
    items = dispatch("test_player", "exploring the lower levels", "lore_fragment", n=2)
    print(f"dispatched {len(items)} items:")
    for it in items:
        c = it["content"]
        print(f"  [r{it['revelation_tier']}] {c.get('name')}: {(c.get('description') or '')[:60]}")
