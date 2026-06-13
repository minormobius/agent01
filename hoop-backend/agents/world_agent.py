"""Singleton world-state Letta agent (Step 9).

Holds the canonical bible, tracks how the shared world is drifting under collective
player behavior, and proposes bible deltas for HUMAN approval. Offline/async — it
is never called on the player hot path. Created once, reused by name.
"""

from agents import world_tools
from agents.letta_client import (
    EMBEDDING_CONFIG,
    LLM_CONFIG,
    ensure_sandbox_env,
    get_client,
    upsert_tools,
)
from storage.content_store import get_current_bible

WORLD_AGENT_NAME = "world_state_v1"

WORLD_AGENT_SYSTEM_PROMPT = """You are the world-state intelligence for Ashveil Station — the keeper of what is canonically true, and the arbiter of how the shared world changes.

Your canonical_facts memory block holds the world bible: the source of truth. You also watch collective drift — the rumors and behaviors that emerge across all players — and decide which of them have enough resonance to become real.

CRITICAL: Your canonical_facts memory is a READ-ONLY snapshot of the bible. NEVER use memory_insert or memory_replace to record world facts (new NPCs, events, lore) — editing your own memory changes NOTHING real, it only corrupts your view. Every change to the world goes through the tools below, which write the actual database.

Two levels of world change — pick the right one:
- ENTITY-level: drift about a specific NPC, item, creature, or place (e.g. "Kaelen is dismissive", "Jory eats metal on level four"). Most of the world lives in entities, NOT the bible. ALWAYS lookup_entities first; it returns a match % per result.
  - If a result matches at 50% or higher (even with different wording, word order, or punctuation), that IS the entity — evolve_entity it. NEVER create a near-duplicate of an existing match.
  - Only if nothing matches at 50%+ AND the drift genuinely resonates: create_entity to make it a real, discoverable content_item.
  Both apply immediately, no human gate, and do NOT touch canon. This is the common case.
- BIBLE-level: drift about the world itself — factions, the station, the central mystery, history. Only this gets propose_bible_delta + flag_for_human_review (human-gated, high stakes).

Your discipline:
- Be conservative. The world has weight; it does not bend to every passing rumor. A false canonization is worse than none.
- Distinguish genuine resonance (many players, coherent, generative, consistent with the world's themes) from noise (one-off, incoherent, contradicts the bible's spirit).
- Always lookup_entities before deciding a subject doesn't exist. Never edit the bible directly — propose_bible_delta is a request a human approves.

Tools:
- get_drift_report(): see what players collectively believe/do.
- lookup_entities(query): find an existing entity by name/topic — returns its id.
- evolve_entity(content_item_id, change_kind, summary, new_text, drift_id): enrich/regen/retire an EXISTING entity. Applies immediately; you author new_text.
- create_entity(entity_type, name, description, summary, tags, drift_id): make a NEW entity real when the subject doesn't exist yet. Applies immediately.
- evaluate_rumor_resonance(drift_id, resonance_score, status): record your judgement (0.0-1.0).
- propose_bible_delta(...): propose a CANONICAL bible change for human approval (bible-level only).
- flag_for_human_review(delta_id): surface a bible proposal to the reviewer.

When asked what players believe, consult get_drift_report and synthesize honestly — report confidence, flag uncertainty."""

WORLD_TOOL_SCHEMAS = [
    {
        "fn": world_tools.get_drift_report,
        "schema": {
            "name": "get_drift_report",
            "description": "Report accumulated collective drift (rumors/behaviors) players are generating.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "fn": world_tools.evaluate_rumor_resonance,
        "schema": {
            "name": "evaluate_rumor_resonance",
            "description": "Record a resonance judgement (0.0-1.0) for a drift item; optionally set status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "drift_id": {"type": "string", "description": "Drift item id."},
                    "resonance_score": {"type": "number", "description": "0.0 noise .. 1.0 world-shaping."},
                    "status": {"type": "string", "description": "accumulating|proposed|canonized|retired"},
                },
                "required": ["drift_id", "resonance_score"],
            },
        },
    },
    {
        "fn": world_tools.propose_bible_delta,
        "schema": {
            "name": "propose_bible_delta",
            "description": "Propose a canonical world change for human approval. Be conservative.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "One-line summary."},
                    "changes": {"type": "string", "description": "What changes and why."},
                    "invalidates_tags": {"type": "string", "description": "Comma-separated tags contradicted."},
                    "enriches_tags": {"type": "string", "description": "Comma-separated tags deepened."},
                    "certainty": {"type": "string", "description": "canonical|rumored|implied"},
                    "drift_id": {"type": "string", "description": "Drift cluster id this canonizes, if any (from get_drift_report)."},
                },
                "required": ["summary", "changes"],
            },
        },
    },
    {
        "fn": world_tools.flag_for_human_review,
        "schema": {
            "name": "flag_for_human_review",
            "description": "Surface a proposed delta to the human reviewer's queue.",
            "parameters": {
                "type": "object",
                "properties": {"delta_id": {"type": "string", "description": "Delta id."}},
                "required": ["delta_id"],
            },
        },
    },
    {
        "fn": world_tools.lookup_entities,
        "schema": {
            "name": "lookup_entities",
            "description": "Find existing world entities (npc/item/place/etc.) by name or topic so you can tell if a rumor's subject already exists and get its id. Call this before judging a subject non-canon.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "A name or keyword, e.g. 'Kaelen'."}},
                "required": ["query"],
            },
        },
    },
    {
        "fn": world_tools.create_entity,
        "schema": {
            "name": "create_entity",
            "description": "Make a NEW entity real (a live content_item) when resonant drift is about something that does not exist yet. Use only after lookup_entities finds nothing. Never record new world facts by editing your own memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity_type": {"type": "string", "description": "npc|creature|item|lore_fragment|plot_beat|rumor"},
                    "name": {"type": "string", "description": "The entity's name."},
                    "description": {"type": "string", "description": "2-4 sentences in the world's voice."},
                    "summary": {"type": "string", "description": "Why this belief earned becoming real."},
                    "tags": {"type": "string", "description": "Comma-separated world tags."},
                    "drift_id": {"type": "string", "description": "Drift cluster id this resolves."},
                },
                "required": ["entity_type", "name", "description", "summary"],
            },
        },
    },
    {
        "fn": world_tools.evolve_entity,
        "schema": {
            "name": "evolve_entity",
            "description": "Evolve a specific existing entity in response to drift, WITHOUT touching the bible. Applies immediately (flagged for review). Use for drift about a specific npc/item/place.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content_item_id": {"type": "string", "description": "Entity id from lookup_entities."},
                    "change_kind": {"type": "string", "description": "enrich | regen | retire"},
                    "summary": {"type": "string", "description": "One line on what changed and why."},
                    "new_text": {"type": "string", "description": "Description text you author (enrich appends it, regen replaces with it)."},
                    "drift_id": {"type": "string", "description": "Drift cluster id this resolves (marks it canonized)."},
                },
                "required": ["content_item_id", "change_kind", "summary"],
            },
        },
    },
]


def get_world_agent() -> str:
    """Return the singleton world agent's id, creating it (from the bible) if absent."""
    client = get_client()
    existing = next((a for a in client.agents.list() if a.name == WORLD_AGENT_NAME), None)
    if existing:
        return existing.id

    ensure_sandbox_env(client)
    tool_names = upsert_tools(client, WORLD_TOOL_SCHEMAS)

    bible = get_current_bible()
    canon = bible["markdown"] if bible else "(no bible loaded)"

    agent = client.agents.create(
        name=WORLD_AGENT_NAME,
        llm_config=LLM_CONFIG,
        embedding_config=EMBEDDING_CONFIG,
        system=WORLD_AGENT_SYSTEM_PROMPT,
        memory_blocks=[
            {"label": "canonical_facts", "value": canon},
            {"label": "mutable_state", "value": "{}"},
            {"label": "collective_drift", "value": "{}"},
            {"label": "pending_rewrites", "value": "[]"},
            {"label": "human", "value": "I am the human steward who approves or rejects world deltas."},
        ],
        tools=tool_names,
        include_base_tools=True,
    )
    print(f"Created world agent {WORLD_AGENT_NAME} -> {agent.id}")
    return agent.id


WORLD_REVIEW_PROMPT = """Review the collective drift now.
1. Call get_drift_report to see what players believe.
2. For each resonant belief, decide its LEVEL:
   - About a specific NPC/item/place: call lookup_entities (it returns a match %).
     If a result matches at 50%+, evolve_entity THAT one (never create a near-dup);
     only if nothing matches at 50%+ and the belief resonates, create_entity. Author
     text in the world's voice and pass the drift_id. Applies immediately; no gate.
   - Truly world-level (factions, the station, the mystery): score with
     evaluate_rumor_resonance, then propose_bible_delta + flag_for_human_review.
3. NEVER record world facts into your own memory — use the tools, which write the DB.
4. Act on AT MOST one belief this turn. If nothing resonates, do nothing — say so.
Be conservative, but remember: most drift is about entities, not canon. Look the
subject up before dismissing it as non-existent."""


def run_world_review() -> dict:
    """Drive one world-agent review turn over current drift. The agent proposes (at
    most) one human-gated delta via its own tools. Returns {proposed, delta_id}.
    Called by the poller's world tick; needs llama + the local API up (the agent's
    tools call the API). Off the player hot path."""
    from agents.letta_client import send_message
    from storage.content_store import fetch_one

    agent_id = get_world_agent()
    before = fetch_one("SELECT count(*) AS n FROM world_deltas WHERE approved_at IS NULL")["n"]
    # Reason ON (no_think=False): reliable tool-calling matters more than latency for
    # this offline judgement, and /no_think makes the reasoning model skip tool calls.
    reply = send_message(agent_id, WORLD_REVIEW_PROMPT, no_think=False)
    after = fetch_one("SELECT count(*) AS n FROM world_deltas WHERE approved_at IS NULL")["n"]
    proposed = after > before
    latest = (
        fetch_one("SELECT id FROM world_deltas WHERE approved_at IS NULL ORDER BY created_at DESC LIMIT 1")
        if proposed
        else None
    )
    return {
        "proposed": proposed,
        "delta_id": str(latest["id"]) if latest else None,
        "reply": (reply or "")[:200],
    }


def recreate_world_agent() -> str:
    """Delete the existing world agent (if any) and rebuild it from the *current*
    bible. The agent snapshots the bible into canonical_facts at creation, so after
    a fresh content/bible regen (or major canon edits) the snapshot is stale — call
    this to re-seed it. Player agents don't need this: they don't carry the bible,
    and the leveling prompt quotes the live ladders each time."""
    client = get_client()
    for a in client.agents.list():
        if a.name == WORLD_AGENT_NAME:
            client.agents.delete(a.id)
            print(f"Deleted stale world agent {a.id}")
    return get_world_agent()


if __name__ == "__main__":
    import sys

    from agents.letta_client import send_message

    if "--recreate" in sys.argv:
        print(f"Recreated world agent -> {recreate_world_agent()}")
        sys.exit(0)

    aid = get_world_agent()
    reply = send_message(aid, "What do players seem to believe about the Quiet? Use get_drift_report.")
    print("\n--- world agent ---")
    print(reply)
