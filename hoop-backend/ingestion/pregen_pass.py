"""Offline batch content generation via the local Qwen server.

Generates a pool of content items per type, inserts them as approved=false so a
human spot-checks them in the review UI before they go live (per plan: the
initial pregen pass requires explicit human approval).
"""

import json

from ingestion.auto_qa import auto_qa
from lib.llm import call_llm_json, GENERATOR_PERSONA,  GENERATOR_SYSTEM
from lib.log import get_logger
from storage.content_store import insert_content_item

log = get_logger("pregen")

# A truncated / malformed LLM response yields unparseable JSON; just ask again.
MAX_RETRIES = 3

TARGETS = {
    "npc": 15,
    "creature": 10,
    "item": 15,
    "lore_fragment": 20,
    "rumor": 10,
    "plot_beat": 5,
}

# Generate in small batches rather than one big array per type. ~150-200 output
# tokens/item means a 15-20 item array brushes call_llm's max_tokens=9600 and gets
# truncated (silently dropping the tail). Small batches stay well under the cap,
# limit the blast radius of any one bad call, and — with the avoid-list — keep the
# model from repeating itself across a long array.
BATCH_SIZE = 5


# Short definition of each type (what it IS), keyed by type.
TYPE_DEFS = {
    "npc": "someone you can TALK to — a named being (humanoid or AI) with a personality who can hold a conversation",
    "creature": "a living thing you CANNOT talk to — it lives on the station, usually mobile, and reacts to you rather than converses (harmless to dangerous)",
    "item": "a physical object placed in the world that you examine or carry (not a person, not an event); its description teaches you about the world",
    "lore_fragment": "a readable record presented as FACT — a log entry, manifest, inscription, journal page, or report that the player reads. The main carrier of the mystery.",
    "rumor": "unproven hearsay people pass around — uncertain, deniable, \"they say…\", carrying no proof",
    "plot_beat": "a narrative EVENT or moment that happens / that the player witnesses or sets in motion — an unfolding scene, not a static object",
}

# Litmus test with explicit exclusions — what makes EVERY entry of this type valid,
# and which neighbouring types to throw back. This is the anchor that stops the model
# from sampling across the type menu (e.g. emitting a "Private Log" under npc).
TYPE_TEST = {
    "npc": "Every entry must be a being that can speak and be spoken to. A door, a log, a recording, a sign, or a mute creature is NOT an npc — exclude it.",
    "creature": "Every entry must be a living thing that cannot hold a conversation. A person you could talk to is an npc; an object is an item — exclude those.",
    "item": "Every entry must be an inanimate object. A person is an npc, a document you read is a lore_fragment, an event is a plot_beat — exclude those.",
    "lore_fragment": "Every entry must be a readable record of fact (document, inscription, log). Unproven hearsay is a rumor, a physical object is an item, a person is an npc — exclude those.",
    "rumor": "Every entry must be unproven hearsay that people repeat. A verifiable document or recording is a lore_fragment, not a rumor — exclude it.",
    "plot_beat": "Every entry must be an event or moment that unfolds in time, not a static object or a person — exclude those.",
}


# Optional gameplay fields the generator can author so the gate/engine aren't inert.
# Plain strings (single braces) inserted via {_extra_fields(...)} — NOT re-parsed by
# build_prompt's f-string, so braces stay literal.
_GATE_FIELD = (
    '- "requires" (OPTIONAL): omit unless this should stay HIDDEN until the player '
    'has acted; then an object like {"facts": {"flag.<slug>": true}} or '
    '{"items": ["<item name>"]} or {"min_rep": {"keepers": 2}}. Use it sparingly to '
    'make a few items reactive to what the player has done. Fact keys use a literal '
    'DOT, never a colon: "flag.<slug>" (NOT "flag:<slug>").'
)
_TYPE_EXTRA = {
    "item": (
        '- "mechanics" (OPTIONAL): if wearable/wieldable, '
        '{"slot": "hand"|"body"|"head"|"trinket", "stats": {"atk": int, "def": int, "hp": int}}; '
        'omit for inert items.'
    ),
    "npc": (
        '- "dialogue" (ENCOURAGED): a small conversation tree '
        '{"start": "greet", "nodes": {"greet": {"says": str, "choices": '
        '[{"id": str, "text": str, "effects": {"adjust_standing": 1, "set_facts": {"flag.<slug>": true}}, '
        '"goto": "greet"}]}}} of 2-3 nodes in the NPC\'s voice; gate a deeper, more revealing '
        'choice behind "requires": {"min_standing": 1} so the NPC opens up as the player earns trust. '
        'EVERY node must have at least one choice, and any terminal node must offer a choice with '
        '"effects": {"end": true} (e.g. "Leave.") so the player is never stranded. Fact keys use a '
        'literal DOT: "flag.<slug>", never "flag:<slug>".'
    ),
}


def _extra_fields(content_type: str) -> str:
    lines = [_GATE_FIELD]
    if content_type in _TYPE_EXTRA:
        lines.append(_TYPE_EXTRA[content_type])
    return "\n".join(lines)


def build_prompt(content_type: str, bible: dict, count: int, avoid: list[str] | None = None) -> str:
    avoid = avoid or []
    avoid_clause = (
        f"\nThese names already exist — do NOT repeat them or their specific themes:\n{json.dumps(avoid)}\n"
        if avoid
        else ""
    )
    others = "\n".join(
        f"- {t}: {TYPE_DEFS[t]}" for t in TYPE_DEFS if t != content_type
    )
    return f"""You are generating content for a game world.

Output ONLY valid JSON, no preamble, no markdown fences.

World context (note the Revelation Tiers and Narrative Tiers sections — the multi-stage ladders):
{bible["raw_markdown"]}

Your voice: {GENERATOR_PERSONA}

Generate exactly {count} items, and EVERY one must be of type "{content_type}".
A {content_type} is {TYPE_DEFS[content_type]}.

{TYPE_TEST[content_type]}

These are the OTHER content types — do NOT generate any of them here; if an idea is
really one of these, drop it and think of a real {content_type} instead:
{others}
{avoid_clause}
Spread the {count} items deliberately across all three revelation stages — some
belong to Stage 1 (The Surface: ordinary Ashveil), some to Stage 2 (The Crack:
something is wrong), and some to Stage 3 (The Depth: the truth below / the Quiet).
Later-stage items should genuinely reflect deeper knowledge, not just darker mood.

Each item must be a JSON object with these fields:
- "name": str (the {content_type} itself — not a document or object about it, unless that IS the type)
- "description": str (2-4 sentences, consistent with the world)
- "tags": [str] (3-6 tags drawn from world concepts)
- "world_refs": [str] (which world sections this references)
- "revelation_hint": str (what would a player need to have done/seen to encounter this naturally? name the revelation stage it fits)
{_extra_fields(content_type)}

Before output, re-read each entry and drop any that is not genuinely a {content_type}.
Output format: a JSON array of {count} objects. An ARRAY. Nothing else. Omit whitespace outside of strings."""


def parse_items(raw, content_type: str) -> list[dict]:
    """Normalize the model output into a list of item dicts."""
    if isinstance(raw, dict):
        # Model sometimes wraps the array in {"items": [...]}.
        for v in raw.values():
            if isinstance(v, list):
                raw = v
                break
        else:
            raw = [raw]
    return [item for item in raw if isinstance(item, dict) and item.get("name")]


def insert_pending(items: list[dict], content_type: str, season: int) -> int:
    for item in items:
        content = {
            "name": item.get("name"),
            "description": item.get("description"),
            "revelation_hint": item.get("revelation_hint"),
        }
        if isinstance(item.get("mechanics"), dict):
            content["mechanics"] = item["mechanics"]   # item stats (slot/atk/def/hp)
        if isinstance(item.get("dialogue"), dict):
            content["dialogue"] = item["dialogue"]      # npc conversation tree
        insert_content_item(
            {
                "type": content_type,
                "content": content,
                "tags": item.get("tags", []),
                "world_refs": item.get("world_refs", []),
                "requires": item.get("requires") if isinstance(item.get("requires"), dict) else {},
                "approved": False,
            },
            season=season,
        )
    return len(items)


def generate_batch(content_type: str, bible: dict, n: int, avoid: list[str], think: bool = True) -> list[dict]:
    """One generation call, retried on a parse failure (truncated/garbled JSON).
    Returns parsed items, or [] if every attempt failed — a bad batch never kills
    the whole pregen run."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            raw = call_llm_json(build_prompt(content_type, bible, n, avoid=avoid), system=GENERATOR_SYSTEM, think=think)
            return parse_items(raw, content_type)
        except Exception as e:
            log.warning("%s batch unparseable (attempt %d/%d): %s",
                        content_type, attempt, MAX_RETRIES, str(e).splitlines()[0][:120])
    log.error("%s batch failed after %d attempts — skipping it", content_type, MAX_RETRIES)
    return []


def run_pregen(bible: dict, season: int = 1, override_targets: dict | None = None, think: bool = True):
    targets = override_targets or TARGETS
    for content_type, count in targets.items():
        print(f"  generating {count}x {content_type} in batches of {BATCH_SIZE}...")
        produced: list[dict] = []
        names: list[str] = []
        # Count by items actually KEPT so QA/dedup drops get backfilled toward the
        # target — but cap total batches so a duplicate-happy model can't loop forever.
        max_batches = (count // BATCH_SIZE + 1) * 3 + 2
        batches = 0
        while len(produced) < count and batches < max_batches:
            batches += 1
            n = min(BATCH_SIZE, count - len(produced))
            batch = generate_batch(content_type, bible, n, avoid=names, think=think)
            # QA + dedup in the loop: drop thin/empty items, bible copies, and any
            # name already produced this run (within-batch and across earlier batches).
            kept = auto_qa(batch, bible, seen_names={nm.lower() for nm in names})
            dropped = len(batch) - len(kept)
            produced.extend(kept)
            names.extend(it["name"] for it in kept if it.get("name"))
            print(f"    batch +{len(kept)} (have {len(produced)}/{count}"
                  f"{f', {dropped} dropped by QA/dedup' if dropped else ''}) "
                  f"— {[it.get('name') for it in kept]}")
        if len(produced) < count:
            log.warning("%s: produced %d/%d after %d batches (model kept duplicating?)",
                        content_type, len(produced), count, batches)
        inserted = insert_pending(produced, content_type, season)
        print(f"    inserted {inserted} {content_type} (pending review)")


if __name__ == "__main__":
    from ingestion.world_parser import parse

    bible = parse("prototype/tiny_world.md")
    run_pregen(bible, override_targets={"npc": 3, "lore_fragment": 5})
