"""Assign revelation/narrative/power tiers to pending content items.

Runs after pregen, before human review. Uses think=True — tier placement is a
judgment call where a little deliberation pays off. The axes are scaled to match
how the bible and the player agent reason about progress:

  revelation_tier 1-3  — the 3-stage Revelation ladder in the bible (Surface →
                         Crack → Depth); judged async by the player's agent.
  narrative_tier  1-3  — the 3-stage Narrative ladder (Arrival → Entanglement →
                         Reckoning).
  power_tier      1-5  — mechanical capability gate, advanced by XP in play.

Each axis is clamped to its own range so a stray model value can never violate the
dispatcher's hard gate. The bible markdown (which carries the ladder definitions)
is fed into the prompt, so the model labels against the same rubric the agent uses.
"""

import json

from lib.llm import call_llm_json
from storage.content_store import conn_ctx, get_current_bible

# axis -> (min, max)
TIER_RANGES = {"revelation_tier": (1, 3), "narrative_tier": (1, 3), "power_tier": (1, 5)}
TIER_KEYS = tuple(TIER_RANGES)


def build_prompt(item: dict, bible: dict) -> str:
    content = item["content"]
    hint = content.get("revelation_hint", "(none given)")
    return f"""World context (note the Revelation Tiers and Narrative Tiers sections — those are the ladders to label against):
{bible["markdown"]}

Content item:
{json.dumps(content)}

The revelation hint for this item was: "{hint}"

Assign three tiers using the bible's ladders:

revelation_tier (1-3): which stage of the Revelation ladder does encountering this
  put the player in? 1 = The Surface (ordinary Ashveil), 2 = The Crack (something
  is wrong, suspected not proven), 3 = The Depth (the truth below / what the Quiet are).
narrative_tier (1-3): where on the Narrative ladder does this belong? 1 = Arrival
  (setup, orientation), 2 = Entanglement (the player is a participant, stakes form),
  3 = Reckoning (the threads converge, the world answers in kind).
power_tier (1-5): how powerful/advanced is this relative to player progression?
  (1 = starter, 5 = endgame). Mechanical, independent of the story.

Output ONLY a JSON object: {{"revelation_tier": int, "narrative_tier": int, "power_tier": int}}"""


def _clamp(key: str, v) -> int:
    lo, hi = TIER_RANGES[key]
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return lo


def label_item(item: dict, bible: dict) -> dict:
    raw = call_llm_json(build_prompt(item, bible), think=True, temperature=0.2)
    return {k: _clamp(k, raw.get(k, 1)) for k in TIER_KEYS}


def label_all_pending(season: int = 1) -> int:
    """Label every unapproved item that still has default tiers. Returns count."""
    bible_row = get_current_bible(season)
    if bible_row is None:
        raise RuntimeError("No world_bible row — run the embedder/seed first.")
    bible = {"markdown": bible_row["markdown"]}

    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, type, content FROM content_items "
            "WHERE approved = false AND status = 'active' ORDER BY created_at"
        )
        items = cur.fetchall()
        for item in items:
            tiers = label_item(item, bible)
            cur.execute(
                "UPDATE content_items SET revelation_tier=%s, narrative_tier=%s, power_tier=%s "
                "WHERE id=%s",
                (tiers["revelation_tier"], tiers["narrative_tier"], tiers["power_tier"], item["id"]),
            )
            name = (item["content"] or {}).get("name", "?")
            print(f"  {item['type']:14s} {name:24s} -> {tiers}")
    return len(items)


if __name__ == "__main__":
    n = label_all_pending()
    print(f"labeled {n} items")
