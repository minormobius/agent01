"""Add explicit revelation + narrative tier ladders to the world bible.

These 3-stage ladders give the player's Letta agent concrete criteria for judging
revelation/narrative advancement at long rest, and give the tier labeler + content
generators a shared rubric for where new content sits. Power tier stays mechanical
(XP-driven) and so is described only briefly.

Idempotent: skips if the ladders are already present. Re-parses the *current* DB
bible markdown, appends the ladders, inserts a new version, and chunks every
section into bible_chunks — embedding each chunk if the embed server is up, else
storing the chunk with a NULL embedding so it's queryable now and embeddable later.
"""

from ingestion.world_parser import parse_markdown
from storage.content_store import conn_ctx, get_current_bible, insert_world_bible

LADDERS = """

## Revelation Tiers

How much the player has grasped of what Ashveil actually is. The hard content gate
runs on these numbers; the player's agent advances them at long rest when the
player has genuinely earned the next stage. Three stages:

1. **The Surface.** Ashveil as it presents itself — three factions, seven known
   levels, ordinary frictions. The metallic air, the pulsing lights, the warm
   corridors read as quirks of an old station. The player suspects nothing.
2. **The Crack.** The player has registered that something is wrong. The level
   below seven that the schematics deny; the Quiet's bottomless calm; warmth in
   the low corridors that behaves less like a fault and more like breath. They
   suspect, they cannot yet prove.
3. **The Depth.** The player has confronted what is below, and what the Quiet are.
   The Keepers' worship of continuity is revealed as containment — the station is
   not being maintained so much as kept shut.

## Narrative Tiers

Where the player stands in the story arc. Used to place plot beats and to judge
narrative advancement at long rest. Three stages:

1. **Arrival.** Waking amnesiac in Keeper grey. Orientation, first contacts,
   establishing the ordinary. The player is acted upon more than acting.
2. **Entanglement.** The player is now a participant. Factions want things of
   them; a course of action is forming; choices begin to carry weight.
3. **Reckoning.** The threads converge. The player acts on the central mystery and
   the world answers in kind — the point past which Ashveil cannot return to how
   it was.

## Power Tiers

Mechanical, not narrative: the player's raw capability, advanced deterministically
by experience (crystallizing the world, surviving it). Tiers 1-5, gating which
items and creatures the world will surface to a player of a given strength.
"""


def main() -> None:
    cur = get_current_bible()
    if cur is None:
        raise SystemExit("No bible in the DB — run ingestion/embedder.py first.")
    md = cur["markdown"]
    if "## Revelation Tiers" in md:
        print("Ladders already present; nothing to do.")
        return

    md = md.rstrip() + "\n" + LADDERS
    bible = parse_markdown(md)
    bible_id = insert_world_bible(bible)
    print(f"Inserted bible version with ladders -> {bible_id}")

    # Try embeddings; degrade to NULL-embedding chunks if the embed server is down.
    embed = None
    try:
        from lib.llm import embed_text, health

        if health().get("embed") == "up":
            embed = embed_text
    except Exception:
        embed = None

    embedded = chunked = 0
    with conn_ctx() as conn, conn.cursor() as cur2:
        cur2.execute("DELETE FROM bible_chunks WHERE bible_id = %s", (bible_id,))
        for section_path, sec in bible["sections"].items():
            text = sec["text"]
            if not text.strip():
                continue
            vec = None
            if embed is not None:
                try:
                    vec = str(embed(text))
                    embedded += 1
                except Exception:
                    vec = None
            cur2.execute(
                """
                INSERT INTO bible_chunks (bible_id, section_path, content, tags, embedding, season)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (bible_id, section_path, text, sec["tags"], vec, sec.get("season", 1)),
            )
            chunked += 1
    print(f"Chunked {chunked} sections ({embedded} embedded, {chunked - embedded} pending embedding).")
    for p in ("revelation-tiers", "narrative-tiers", "power-tiers"):
        print(f"  + {p}")


if __name__ == "__main__":
    main()
