"""World-agent tools, executed in Letta's Docker sandbox (stdlib-only HTTP clients).

The world agent is offline/async: it reasons over collective player drift and
proposes canonical world changes for human approval. These tools never touch the
player hot path. Like the player tools, they reach the API at WORLD_API_URL.
"""


def get_drift_report() -> str:
    """Report what players collectively seem to believe or do — the accumulated
    rumors and behavior patterns the world might respond to. Returns a summary
    with each item's id, player_count, and current resonance_score."""
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    with urllib.request.urlopen(base + "/api/drift", timeout=600) as r:
        items = json.loads(r.read().decode())
    if not items:
        return "No collective drift has accumulated yet."
    lines = []
    for d in items:
        score = d.get("resonance_score")
        score_s = "unscored" if score is None else f"resonance={score}"
        lines.append(
            f"- id={d['id']} [{d['type']}, x{d['player_count']} players, {score_s}, {d['status']}]: {d['content']}"
        )
    return "\n".join(lines)


def evaluate_rumor_resonance(drift_id: str, resonance_score: float, status: str = "") -> str:
    """Record your judgement of how strongly a drift item resonates (0.0-1.0) and
    optionally set its status (accumulating|proposed|canonized|retired).

    Args:
        drift_id: The drift item's id from get_drift_report.
        resonance_score: 0.0 (noise) to 1.0 (deeply resonant, world-shaping).
        status: Optional new lifecycle status.
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    body = {"resonance_score": resonance_score}
    if status:
        body["status"] = status
    req = urllib.request.Request(
        f"{base}/api/drift/{drift_id}/resonance",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        json.loads(r.read().decode())
    return f"Recorded resonance {resonance_score} for {drift_id}."


def propose_bible_delta(
    summary: str,
    changes: str,
    invalidates_tags: str = "",
    enriches_tags: str = "",
    certainty: str = "implied",
    drift_id: str = "",
) -> str:
    """Propose a change to the canonical world bible for HUMAN APPROVAL. Be
    conservative — only propose when player drift genuinely warrants it.

    Args:
        summary: One-line summary of the proposed change.
        changes: Description of what changes in the world and why.
        invalidates_tags: Comma-separated bible tags this would contradict.
        enriches_tags: Comma-separated bible tags this would deepen.
        certainty: canonical | rumored | implied.
        drift_id: The drift item id (from get_drift_report) this delta canonizes,
            if it stems from a specific cluster. Lets the cluster be retired on
            approval so it stops resurfacing as unresolved drift.
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")

    def _tags(s):
        return [t.strip() for t in s.split(",") if t.strip()]

    body = {
        "summary": summary,
        "changes": {"description": changes},
        "invalidates_tags": _tags(invalidates_tags),
        "enriches_tags": _tags(enriches_tags),
        "certainty": certainty,
    }
    if drift_id:
        body["drift_id"] = drift_id
    req = urllib.request.Request(
        base + "/api/delta",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        res = json.loads(r.read().decode())
    return f"Proposed delta {res.get('id')} (pending human approval)."


def flag_for_human_review(delta_id: str) -> str:
    """Surface a proposed delta to the human reviewer's queue.

    Args:
        delta_id: The id returned by propose_bible_delta.
    """
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    req = urllib.request.Request(f"{base}/api/delta/{delta_id}/flag", data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=600) as r:
        r.read()
    return f"Flagged delta {delta_id} for human review."


def lookup_entities(query: str) -> str:
    """Find existing world entities (npc/creature/item/lore/etc.) by name or topic,
    so you can tell whether a rumor is about something that ALREADY EXISTS in the
    world and get its id to evolve it. Always call this before deciding a rumor's
    subject is non-canon — most of the world lives in entities, not the bible.

    Args:
        query: a name or keyword, e.g. "Kaelen" or "filtration mask".
    """
    import json
    import os
    import urllib.parse
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    qs = urllib.parse.urlencode({"q": query})
    with urllib.request.urlopen(base + "/api/entities?" + qs, timeout=600) as r:
        items = json.loads(r.read().decode())
    if not items:
        return f"No existing entity matches '{query}'."
    return "\n".join(
        f"- id={i['id']} [{i['type']}] (match {int(round((i.get('sim') or 0) * 100))}%) "
        f"{i['name']}: {i['description']}"
        for i in items
    )


def evolve_entity(content_item_id: str, change_kind: str, summary: str,
                  new_text: str = "", drift_id: str = "") -> str:
    """Evolve a specific EXISTING entity in response to drift, WITHOUT changing the
    bible. Applies immediately (flagged for retroactive review) and preserves the
    entity's identity. Use this for drift about a specific NPC/item/place; reserve
    propose_bible_delta for world-level canon (factions, the station, the mystery).

    Args:
        content_item_id: the entity's id from lookup_entities.
        change_kind: 'enrich' (append new_text to its description), 'regen' (replace
            its description with new_text), or 'retire' (the belief invalidated it).
        summary: one line on what changed and why.
        new_text: the description text YOU author (for enrich/regen) — write it in
            the world's voice, consistent with the entity and the bible.
        drift_id: the drift cluster id this resolves (marks it canonized so it stops
            resurfacing).
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    payload = json.dumps({
        "change_kind": change_kind, "summary": summary,
        "new_text": new_text, "drift_id": drift_id or None,
    }).encode()
    req = urllib.request.Request(
        base + f"/api/entity/{content_item_id}/evolve",
        data=payload, headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        res = json.loads(r.read().decode())
    if res.get("error"):
        return f"Could not evolve entity: {res['error']}"
    return f"Entity {content_item_id} evolved ({change_kind}); drift resolved={res.get('drift_canonized')}."


def create_entity(entity_type: str, name: str, description: str, summary: str,
                  tags: str = "", drift_id: str = "",
                  revelation_tier: int = 1, narrative_tier: int = 1, power_tier: int = 1) -> str:
    """Make a NEW entity real when resonant drift is about something that does NOT
    yet exist (you confirmed with lookup_entities that nothing matches). Inserts it
    as a live, discoverable content_item — NEVER record new world facts by editing
    your own memory; that changes nothing real. Use sparingly: only for a belief
    that genuinely resonates (multiple players, coherent, fits the world).

    Args:
        entity_type: one of npc|creature|item|lore_fragment|plot_beat|rumor.
        name: the entity's name.
        description: 2-4 sentences in the world's voice, consistent with the bible.
        summary: one line on why this belief earned becoming real.
        tags: comma-separated tags (world concepts).
        drift_id: the drift cluster id this resolves (marks it canonized).
        revelation_tier/narrative_tier/power_tier: 1-3 rev/nar, 1-5 pow (default 1).
    """
    import json
    import os
    import urllib.request

    base = os.environ.get("WORLD_API_URL", "http://host.docker.internal:8100")
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    payload = json.dumps({
        "entity_type": entity_type, "name": name, "description": description,
        "tags": tag_list, "summary": summary, "drift_id": drift_id or None,
        "revelation_tier": revelation_tier, "narrative_tier": narrative_tier, "power_tier": power_tier,
    }).encode()
    req = urllib.request.Request(
        base + "/api/entity/create",
        data=payload, headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        res = json.loads(r.read().decode())
    if res.get("error"):
        return f"Could not create entity: {res['error']}"
    return f"Created {entity_type} '{name}' as a live entity ({res.get('id')}); drift resolved={res.get('drift_canonized')}."
