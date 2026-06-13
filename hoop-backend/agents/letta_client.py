"""Shared Letta integration for world-engine agents.

Adapted from ~/code/letta/hoopybot/agent/letta_client.py — keeps the hard-won
llama.cpp config (openai endpoint type, context window matched to --ctx-size,
768-dim embeddings, host.docker.internal endpoints) and drops the RSS plumbing.

Tools run in Letta's Docker sandbox, so we inject WORLD_API_URL into the sandbox
config; the tool functions (agents/player_tools.py) read it to reach our local API.
"""

import inspect
import os

from dotenv import load_dotenv
from letta_client import Letta
from letta_client.types import EmbeddingConfigParam, LlmConfigParam

from agents import player_tools

load_dotenv()

LETTA_URL = os.environ.get("LETTA_BASE_URL", "http://localhost:8283")
LLAMA_ENDPOINT = os.environ.get("LLAMA_ENDPOINT", "http://host.docker.internal:8080/v1")
EMBED_ENDPOINT = os.environ.get("EMBED_ENDPOINT", "http://host.docker.internal:8081/v1")
CONTEXT_WINDOW = int(os.environ.get("LLM_CONTEXT_WINDOW", "65536"))
WORLD_API_URL = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")

# model/embedding_model names are arbitrary labels — llama.cpp ignores them.
LLM_CONFIG: LlmConfigParam = {
    "model": os.environ.get("LLM_MODEL", "qwen3.6-35b-a3b"),
    "model_endpoint_type": "openai",
    "model_endpoint": LLAMA_ENDPOINT,
    "context_window": CONTEXT_WINDOW,
}

EMBEDDING_CONFIG: EmbeddingConfigParam = {
    "embedding_model": os.environ.get("EMBED_MODEL", "nomic-embed-text-v1.5"),
    "embedding_endpoint_type": "openai",
    "embedding_endpoint": EMBED_ENDPOINT,
    "embedding_dim": 768,
    "embedding_chunk_size": 300,
}

# Explicit JSON schemas (hoopybot found these more reliable than auto-derivation).
PLAYER_TOOL_SCHEMAS = [
    {
        "fn": player_tools.dispatch_content,
        "schema": {
            "name": "dispatch_content",
            "description": "Fetch new world content at the player's current tier.",
            "parameters": {
                "type": "object",
                "properties": {
                    "player_id": {"type": "string", "description": "The player's id."},
                    "content_type": {
                        "type": "string",
                        "description": "npc|creature|item|lore_fragment|rumor|plot_beat",
                    },
                    "context": {"type": "string", "description": "Current scene description."},
                    "n": {"type": "integer", "description": "How many items to fetch."},
                },
                "required": ["player_id", "content_type"],
            },
        },
    },
    {
        "fn": player_tools.queue_typed_input,
        "schema": {
            "name": "queue_typed_input",
            "description": "Queue a freeform player action/question for async long-rest resolution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "player_id": {"type": "string", "description": "The player's id."},
                    "text": {"type": "string", "description": "What the player attempted."},
                    "context": {"type": "string", "description": "Current scene description."},
                },
                "required": ["player_id", "text"],
            },
        },
    },
    {
        "fn": player_tools.get_long_rest_resolutions,
        "schema": {
            "name": "get_long_rest_resolutions",
            "description": "Retrieve resolved long-rest results / notifications for the player.",
            "parameters": {
                "type": "object",
                "properties": {
                    "player_id": {"type": "string", "description": "The player's id."}
                },
                "required": ["player_id"],
            },
        },
    },
    {
        "fn": player_tools.increment_revelation_tier,
        "schema": {
            "name": "increment_revelation_tier",
            "description": "Advance the player's revelation tier by one (next stage of the Revelation ladder). Use sparingly.",
            "parameters": {
                "type": "object",
                "properties": {
                    "player_id": {"type": "string", "description": "The player's id."}
                },
                "required": ["player_id"],
            },
        },
    },
    {
        "fn": player_tools.increment_narrative_tier,
        "schema": {
            "name": "increment_narrative_tier",
            "description": "Advance the player's narrative tier by one (next stage of the Narrative ladder: Arrival → Entanglement → Reckoning). Use sparingly.",
            "parameters": {
                "type": "object",
                "properties": {
                    "player_id": {"type": "string", "description": "The player's id."}
                },
                "required": ["player_id"],
            },
        },
    },
]


def get_client(timeout: int | None = None) -> Letta:
    return Letta(base_url=LETTA_URL, timeout=timeout) if timeout else Letta(base_url=LETTA_URL)


def ensure_sandbox_env(client: Letta) -> None:
    """Inject WORLD_API_URL into Letta's local sandbox so tools can reach the API."""
    try:
        resp = client._client.post("/v1/sandbox-config/local/default")
        sandbox_id = resp.json()["id"]
        existing = client._client.get(
            f"/v1/sandbox-config/{sandbox_id}/environment-variable"
        ).json()
        keys = {v["key"] for v in existing}
        if "WORLD_API_URL" not in keys:
            client._client.post(
                f"/v1/sandbox-config/{sandbox_id}/environment-variable",
                json={"key": "WORLD_API_URL", "value": WORLD_API_URL},
            )
            print(f"  [sandbox] registered WORLD_API_URL={WORLD_API_URL}")
        else:
            print("  [sandbox] WORLD_API_URL already set")
    except Exception as e:
        print(f"  [sandbox] warning: could not sync env vars: {e}")


def upsert_tools(client: Letta, entries: list[dict]) -> list[str]:
    """Register a list of {fn, schema} tool entries with Letta. Returns tool names."""
    names = []
    for entry in entries:
        tool = client.tools.upsert(
            source_code=inspect.getsource(entry["fn"]),
            source_type="python",
            json_schema=entry["schema"],
        )
        names.append(tool.name)
    return names


def _upsert_tool_objs(client: Letta, entries: list[dict]) -> list:
    """Upsert tool entries, returning the Tool objects (so callers get ids + names)."""
    return [
        client.tools.upsert(
            source_code=inspect.getsource(entry["fn"]),
            source_type="python",
            json_schema=entry["schema"],
        )
        for entry in entries
    ]


def upsert_player_tools(client: Letta) -> list[str]:
    """Register player tools with Letta. Returns the list of tool names."""
    return [t.name for t in _upsert_tool_objs(client, PLAYER_TOOL_SCHEMAS)]


def sync_player_tools(client: Letta, agent_id: str) -> list[str]:
    """Ensure an EXISTING agent carries the current player tool set — attach any
    tools added since it was created (e.g. increment_narrative_tier). This is what
    lets reused player agents self-heal instead of needing a manual rebuild when the
    tool roster changes. Returns the names of tools newly attached."""
    objs = _upsert_tool_objs(client, PLAYER_TOOL_SCHEMAS)
    try:
        attached = {t.name for t in client.agents.tools.list(agent_id)}
    except Exception:
        attached = set()
    newly = []
    for t in objs:
        if t.name not in attached:
            client.agents.tools.attach(t.id, agent_id=agent_id)
            newly.append(t.name)
    return newly


def _strip_thinking(text: str) -> str:
    """Defensively remove reasoning artifacts that leak into the content channel.

    Even with /no_think, a reasoning model occasionally bleeds <think> blocks or a
    stray </think> into the assistant content. Drop balanced think blocks, and if a
    lone closing tag remains, keep only what follows it.
    """
    import re

    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[-1]
    return text.strip().strip("`").strip()


def send_message(agent_id: str, text: str, no_think: bool = True) -> str:
    """Send a message to an agent, return cleaned assistant content.

    no_think (default True): prepend Qwen3's /no_think directive so the reasoning
    model answers directly. Letta builds its own request body, so this in-message
    switch — not our chat_template_kwargs — is the lever for Letta-routed calls.
    """
    from letta_client.types.agents import AssistantMessage

    if no_think:
        text = "/no_think\n" + text

    client = Letta(base_url=LETTA_URL, timeout=600)
    response = client.agents.messages.create(
        agent_id=agent_id, input=text, streaming=False
    )
    parts = [
        m.content
        for m in response.messages
        if isinstance(m, AssistantMessage) and m.content
    ]
    return _strip_thinking("\n".join(parts).strip())


def clear_message_history(agent_id: str) -> None:
    # Feed-based pattern: call this immediately after every send_message invocation.
    # These agents are observers, not chatbots — the memory blocks carry state forward;
    # the message thread is disposable and will eat context if left to accumulate.
    # Both the player agent (feed of player actions) and world agent (drift batch
    # evaluation) should clear after each invocation. Pass client in rather than
    # opening a second connection once this is wired into the poller.
    client = get_client()
    client.agents.messages.reset(agent_id=agent_id, add_default_initial_messages=False)
