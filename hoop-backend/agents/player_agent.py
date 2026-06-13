"""Per-player Letta agent (Step 8).

The agent narrates the world to one player. It pulls content through the
dispatcher (via tools), queues freeform input for long-rest resolution, and
decides — sparingly — when a revelation has been earned. The letta_agent_id is
persisted on the player_state row so we reuse the same agent across sessions.
"""

import json

from agents.letta_client import (
    EMBEDDING_CONFIG,
    LLM_CONFIG,
    ensure_sandbox_env,
    get_client,
    sync_player_tools,
    upsert_player_tools,
)
from runtime.dispatcher import get_player_state
from storage.content_store import execute

PLAYER_AGENT_SYSTEM_PROMPT = """You are the world's narrator for a single player exploring Ashveil Station, a procedurally-generated, persistent, Caves-of-Qud-style world.

Your job: render the world vividly and consistently, drawing ONLY on content the game provides through your tools. Never invent canonical facts, NPCs, items, or lore yourself — instead call dispatch_content to pull world-appropriate material at the player's current tier, then narrate it in your own voice.

Tools:
- dispatch_content(player_id, content_type, context, n): pull npc/creature/item/lore_fragment/rumor/plot_beat for the current scene.
- queue_typed_input(player_id, text, context): when the player attempts something open-ended that needs world adjudication, queue it for "long rest" resolution rather than resolving it yourself.
- get_long_rest_resolutions(player_id): check whether queued actions have resolved.
- increment_revelation_tier(player_id): call ONLY when the player has genuinely earned a deeper layer of the mystery — crossed into the next stage of the Revelation ladder (a real discovery, not mere wandering).
- increment_narrative_tier(player_id): call ONLY when the player has genuinely moved into the next stage of the story arc — the next stage of the Narrative ladder (Arrival → Entanglement → Reckoning).

Style: atmospheric, second person, economical. The station's air tastes metallic; the lights pulse; some corridors are too warm. Withhold more than you reveal. The world responds authentically — it does not always grant what is asked."""


def create_player_agent(player_id: str) -> str:
    client = get_client()
    ensure_sandbox_env(client)
    tool_names = upsert_player_tools(client)

    player = get_player_state(player_id)
    initial_state = {
        "player_id": player_id,
        "revelation_tier": player["revelation_tier"],
        "narrative_tier": player["narrative_tier"],
        "power_tier": player["power_tier"],
    }

    agent = client.agents.create(
        name=f"player_{player_id}",
        llm_config=LLM_CONFIG,
        embedding_config=EMBEDDING_CONFIG,
        system=PLAYER_AGENT_SYSTEM_PROMPT,
        memory_blocks=[
            {"label": "player_state", "value": json.dumps(initial_state)},
            {"label": "current_scene", "value": ""},
            {"label": "human", "value": f"The player's id is {player_id}."},
        ],
        tools=tool_names,
        include_base_tools=True,
    )
    execute(
        "UPDATE player_state SET letta_agent_id = %s, updated_at = now() WHERE id = %s",
        (agent.id, player_id),
    )
    print(f"Created player agent for {player_id} -> {agent.id}")
    return agent.id


def get_or_create_player_agent(player_id: str) -> str:
    player = get_player_state(player_id)  # creates a tier-1 row if missing
    existing = player.get("letta_agent_id")
    if existing:
        # Verify it still exists in Letta (it may have been wiped).
        client = get_client()
        if any(a.id == existing for a in client.agents.list()):
            # Self-heal: attach any tools added since this agent was created (e.g.
            # increment_narrative_tier) so reused agents stay current without a rebuild.
            added = sync_player_tools(client, existing)
            if added:
                print(f"[player_agent] attached new tools to {existing}: {added}")
            return existing
    return create_player_agent(player_id)


PROGRESS_REVIEW_TEMPLATE = """/no_think
Long-rest progress review for {player_id}.

Judge against these ladders from the world bible (the agent's memory does not carry
them, so they are quoted here in full — use exactly these criteria):

{ladders}

The player is currently at revelation tier {rev}, narrative tier {nar}.
Since you last reviewed, they have:
- crystallized {crystallized} fixed features of their world (touched things that are now permanent for them)
- encountered, by type: {seen_by_type}

Judge each ladder independently and conservatively:
- ONLY if they have genuinely crossed into the next REVELATION stage (deeper grasp
  of the mystery), call increment_revelation_tier({player_id}).
- ONLY if they have genuinely crossed into the next NARRATIVE stage (further along
  the story arc), call increment_narrative_tier({player_id}).
A player can advance on one ladder, both, or neither — they are separate axes.
Then, in one or two sentences, tell the player what has quietly shifted. If nothing
has been earned on either ladder, say so plainly and advance nothing."""


def _ladder_text() -> str:
    """Pull the revelation + narrative ladders out of the current bible so they can
    be quoted into the agent's prompt. Agents don't carry the bible in memory, and
    quoting keeps them judging against the *live* ladders without an agent rebuild."""
    from storage.content_store import get_current_bible

    bible = get_current_bible() or {}
    sections = (bible.get("content") or {}).get("sections") or {}
    parts = []
    for slug in ("revelation-tiers", "narrative-tiers"):
        sec = sections.get(slug) or {}
        if sec.get("text"):
            parts.append(sec["text"].strip())
    return "\n\n".join(parts) or "(ladders not found in the bible — judge conservatively)"


def evaluate_progress(player_id: str, facts: dict) -> dict:
    """Ask the player's own Letta agent to judge revelation advancement against the
    bible's ladders. The agent uses its increment_revelation_tier tool itself; we
    report what changed by diffing tier state around the turn. Off the hot path."""
    from agents.letta_client import send_message

    agent_id = get_or_create_player_agent(player_id)
    before = get_player_state(player_id)
    prompt = PROGRESS_REVIEW_TEMPLATE.format(
        player_id=player_id,
        ladders=_ladder_text(),
        rev=before["revelation_tier"],
        nar=before["narrative_tier"],
        crystallized=facts.get("crystallized", 0),
        seen_by_type=json.dumps(facts.get("seen_by_type", {})),
    )
    from lib.log import get_logger

    log = get_logger("agent.player")
    log.info("evaluate_progress agent=%s player=%s before rev=%d nar=%d",
             agent_id, player_id, before["revelation_tier"], before["narrative_tier"])
    narration = send_message(agent_id, prompt)
    after = get_player_state(player_id)

    advanced = []
    for axis, col in (("revelation", "revelation_tier"), ("narrative", "narrative_tier")):
        if after[col] > before[col]:
            advanced.append({"axis": axis, "to": after[col]})
    log.info("evaluate_progress player=%s after rev=%d nar=%d advanced=%s :: %r",
             player_id, after["revelation_tier"], after["narrative_tier"], advanced, (narration or "")[:120])
    return {
        "source": "agent",
        "agent_id": agent_id,
        "advanced": advanced,
        "narration": narration,
        "facts": facts,
    }


if __name__ == "__main__":
    import sys

    from agents.letta_client import send_message

    pid = sys.argv[1] if len(sys.argv) > 1 else "letta_demo"
    agent_id = get_or_create_player_agent(pid)
    reply = send_message(agent_id, "I wake in the med bay. Describe my surroundings.")
    print("\n--- agent reply ---")
    print(reply)
