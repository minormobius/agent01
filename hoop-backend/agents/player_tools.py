"""Player-agent tools, registered into Letta and executed in its Docker sandbox.

Each function MUST be fully self-contained (all imports inside the body) because
Letta serializes the source and runs it in an isolated sandbox. The sandbox can
neither read host env vars (except those injected via Letta's sandbox config) nor
reach `localhost`, so tools talk to the game API over HTTP at WORLD_API_URL
(host.docker.internal). Keep these thin — all real logic lives behind the API.
"""


def dispatch_content(player_id: str, content_type: str, context: str = "", n: int = 1) -> str:
    """Fetch new world content (npc, creature, item, lore_fragment, rumor, plot_beat)
    appropriate to the player's current tier and scene. Returns a readable summary.

    Args:
        player_id: The player's id.
        content_type: One of npc|creature|item|lore_fragment|rumor|plot_beat.
        context: Short description of the current scene for relevance.
        n: How many items to fetch (default 1).
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    payload = json.dumps(
        {"player_id": player_id, "content_type": content_type, "context": context, "n": n}
    ).encode()
    req = urllib.request.Request(
        base + "/api/dispatch",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        items = json.loads(r.read().decode())
    if not items:
        return f"No new {content_type} available at the player's current tier."
    lines = []
    for i in items:
        c = i.get("content", {})
        lines.append(f"- [{i['type']}] {c.get('name', '?')}: {c.get('description', '')}")
    return "\n".join(lines)


def queue_typed_input(player_id: str, text: str, context: str = "") -> str:
    """Queue a player's freeform action or question for asynchronous 'long rest'
    resolution. The result arrives later via get_long_rest_resolutions.

    Args:
        player_id: The player's id.
        text: What the player typed/attempted.
        context: Short scene description.
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    payload = json.dumps({"player_id": player_id, "text": text, "context": context}).encode()
    req = urllib.request.Request(
        base + "/api/input",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        res = json.loads(r.read().decode())
    return f"Queued for long-rest resolution (job {res.get('job_id')}). Check back after a rest."


def get_long_rest_resolutions(player_id: str) -> str:
    """Retrieve any resolved long-rest results / notifications for the player.

    Args:
        player_id: The player's id.
    """
    import json
    import os
    import urllib.parse
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    qs = urllib.parse.urlencode({"player_id": player_id})
    with urllib.request.urlopen(base + "/api/notifications?" + qs, timeout=600) as r:
        notes = json.loads(r.read().decode())
    if not notes:
        return "Nothing new has resolved yet."
    lines = []
    for n in notes:
        p = n.get("payload") or {}
        res = p.get("resolution") or p
        lines.append(f"- [{n.get('type')}] {json.dumps(res)[:300]}")
    return "\n".join(lines)


def increment_revelation_tier(player_id: str) -> str:
    """Advance the player's revelation tier by one, unlocking deeper world content.
    Use sparingly — only when the player has genuinely earned a deeper revelation
    (crossed into the next stage of the Revelation ladder).

    Args:
        player_id: The player's id.
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    payload = json.dumps({"player_id": player_id, "tier_type": "revelation_tier"}).encode()
    req = urllib.request.Request(
        base + "/api/tier",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        json.loads(r.read().decode())
    return "Revelation tier incremented."


def increment_narrative_tier(player_id: str) -> str:
    """Advance the player's narrative tier by one, moving them into the next stage of
    the story arc. Use sparingly — only when the player has genuinely crossed into
    the next stage of the Narrative ladder (Arrival → Entanglement → Reckoning).

    Args:
        player_id: The player's id.
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    payload = json.dumps({"player_id": player_id, "tier_type": "narrative_tier"}).encode()
    req = urllib.request.Request(
        base + "/api/tier",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        json.loads(r.read().decode())
    return "Narrative tier incremented."
