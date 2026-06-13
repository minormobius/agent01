"""Deterministic content normalization — applied to every item on insert.

Local generation drifts from two conventions the engine relies on, and the gate/dialogue
validators caught both in the live pool:

  1. **Fact-key convention.** State keys are dotted — `flag.opened_hatch`, `count.x`,
     `rep.keepers` — but the model sometimes emits `flag:opened_hatch` (colon). A colon
     key can never match a dotted producer/consumer, so the gate is silently dead. We
     rewrite `<prefix>:` → `<prefix>.` for the known prefixes wherever fact keys live.

  2. **Dialogue dead-ends.** A node with no choices and no `end` parks the player there
     forever (talk() shows the line, current_node never advances). We append a `Leave.`
     end-choice to any choiceless node so every conversation is exitable.

Pure, no DB — called from storage.content_store.insert_content_item (and re-runnable as a
one-off repair over existing rows via scripts/repair_content.py). See the dialogue/gate
validators in runtime/ for the checks that motivated this.
"""

import re

_PREFIX_COLON = re.compile(r"^(flag|count|rep):")


def fix_fact_key(key: str) -> str:
    """`flag:x` / `count:x` / `rep:x` → `flag.x` etc. (only the leading prefix colon)."""
    return _PREFIX_COLON.sub(r"\1.", key, count=1) if isinstance(key, str) else key


def normalize_requires(requires: dict | None) -> dict:
    """Fix fact-key convention inside a requires gate (facts keys; min_rep factions and
    items are left alone — those aren't prefixed state keys)."""
    if not requires:
        return requires or {}
    out = dict(requires)
    if isinstance(out.get("facts"), dict):
        out["facts"] = {fix_fact_key(k): v for k, v in out["facts"].items()}
    return out


def _normalize_choice(choice: dict) -> dict:
    c = dict(choice)
    if isinstance(c.get("requires"), dict):
        c["requires"] = normalize_requires(c["requires"])
    eff = c.get("effects")
    if isinstance(eff, dict) and isinstance(eff.get("set_facts"), dict):
        eff = dict(eff)
        eff["set_facts"] = {fix_fact_key(k): v for k, v in eff["set_facts"].items()}
        c["effects"] = eff
    return c


def normalize_dialogue(tree: dict) -> dict:
    """Fix fact keys throughout a dialogue tree and give every choiceless node a
    `Leave.` end-choice so the conversation can't strand the player."""
    if not isinstance(tree, dict) or not isinstance(tree.get("nodes"), dict):
        return tree
    nodes = tree["nodes"]
    start = tree.get("start") or next(iter(nodes), None)
    new_nodes = {}
    for nid, node in nodes.items():
        node = dict(node)
        choices = [_normalize_choice(c) for c in (node.get("choices") or [])]
        if not choices:
            choices = [{"id": "leave", "text": "Leave.", "effects": {"end": True}, "goto": start}]
        node["choices"] = choices
        new_nodes[nid] = node
    out = dict(tree)
    out["nodes"] = new_nodes
    return out


def normalize_content(content: dict | None) -> dict:
    """Normalize a content blob in place-ish (returns a fixed copy)."""
    if not isinstance(content, dict):
        return content
    out = dict(content)
    if isinstance(out.get("dialogue"), dict):
        out["dialogue"] = normalize_dialogue(out["dialogue"])
    return out
