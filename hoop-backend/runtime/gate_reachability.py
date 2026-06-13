"""Pool-wide gate reachability — the orphaned-state detector.

The dialogue validator proves reachability *within one conversation*. This proves it
across the *whole pool*: is every gated content_item reachable by some player path? A
`requires` gate ({facts, items, min_rep}) is a consumer of player state; the things
that WRITE that state are producers:

  - facts   ← dialogue `effects.set_facts`; the `taken.<feature>` flag the take verb sets
  - items   ← item content (crystallized + taken) and dialogue `effects.give_items`
  - rep     ← dialogue `effects.adjust_rep` (positive)

We compute a fixpoint closure: start from nothing, fire any producer whose own gate is
already satisfiable, accumulate what it yields, repeat until stable (relaxed planning-
graph reachability). A gate that requires state outside the closure is unreachable —
and we split that into two cases:

  - **orphan (ERROR):** *nothing in the pool* produces that fact/item/faction. The
    classic dangling-gate bug — a typo'd flag, an item that doesn't exist, a faction
    never rewarded. The gate can never open, ever.
  - **gated (WARN):** something *does* produce it, but only behind a gate that is
    itself unreachable. Rarer, and a softer signal.

THE BOUNDARY: this models the *deterministic* state only — facts/items/rep (and the
deterministic power_tier). `revelation_tier`/`narrative_tier` are advanced by the
player's Letta agent (an LLM oracle, not a statically enumerable function), so their
tier gates are treated as **assumed-satisfiable** — the same move the dialogue
validator makes for external gates. You cannot model-check past a model; this proves
what it can and is honest about the one axis it can't.

Pure core (`compute_closure`, `analyze`) is DB-free and unit-tested; `analyze_pool`
gathers producers/consumers from the live pool. No LLM, read-only.
"""

import json
from dataclasses import dataclass, field

from runtime.dialogue_validate import walk

ERROR = "error"
WARN = "warn"


def _hv(v):
    """Make a fact value hashable + comparable (JSON values can be lists/dicts)."""
    try:
        hash(v)
        return v
    except TypeError:
        return json.dumps(v, sort_keys=True)


@dataclass(frozen=True)
class Producer:
    label: str
    requires: dict = field(default_factory=dict)        # external precondition
    facts: tuple = ()                                   # ((key, hashable_value), ...)
    items: tuple = ()                                   # (token, ...) lowercased
    reps: tuple = ()                                    # (faction, ...) given positive rep


@dataclass
class Closure:
    facts: set                  # {(key, value)}
    items: set                  # {token}
    reps: set                   # {faction}
    universe_facts: set         # all producible facts ignoring preconditions
    universe_items: set
    universe_reps: set


@dataclass(frozen=True)
class GateIssue:
    level: str
    code: str
    message: str
    source: str                 # what carried the gate (human label)
    clause: str = ""            # which requires clause: facts | items | min_rep
    key: str = ""               # the offending fact-key / item-token / faction — lets the UI drop it


def _req_satisfied(requires: dict, facts: set, items: set, reps: set) -> bool:
    """Does the (relaxed) closure satisfy this gate? min_rep magnitude is relaxed —
    any positive producer of the faction counts, since looping dialogue can accrue it."""
    for k, v in (requires.get("facts") or {}).items():
        if (k, _hv(v)) not in facts:
            return False
    for tok in (requires.get("items") or []):
        if str(tok).lower() not in items:
            return False
    for faction, minv in (requires.get("min_rep") or {}).items():
        # rep starts at 0, so a threshold <= 0 is met by default — no producer needed.
        if int(minv) > 0 and faction not in reps:
            return False
    return True


def compute_closure(producers: list[Producer]) -> Closure:
    facts: set = set()
    items: set = set()
    reps: set = set()
    uf = set(); ui = set(); ur = set()
    for p in producers:
        uf |= set(p.facts); ui |= set(p.items); ur |= set(p.reps)

    changed = True
    while changed:
        changed = False
        for p in producers:
            if not _req_satisfied(p.requires, facts, items, reps):
                continue
            for f in p.facts:
                if f not in facts:
                    facts.add(f); changed = True
            for it in p.items:
                if it not in items:
                    items.add(it); changed = True
            for r in p.reps:
                if r not in reps:
                    reps.add(r); changed = True
    return Closure(facts, items, reps, uf, ui, ur)


def _diagnose(cl: Closure, source: str, requires: dict) -> list[GateIssue]:
    """Reachability issues for one consumer's gate against a precomputed closure."""
    universe_fact_keys = {k for k, _ in cl.universe_facts}
    issues: list[GateIssue] = []
    for k, v in (requires.get("facts") or {}).items():
        if (k, _hv(v)) in cl.facts:
            continue
        if k not in universe_fact_keys:
            issues.append(GateIssue(ERROR, "orphan_fact",
                f"requires fact {k!r} but nothing in the pool ever sets it", source, "facts", k))
        else:
            issues.append(GateIssue(WARN, "gated_fact",
                f"fact {k!r} is set somewhere but never to {v!r} on a reachable path", source, "facts", k))
    for tok in (requires.get("items") or []):
        t = str(tok).lower()
        if t in cl.items:
            continue
        if t not in cl.universe_items:
            issues.append(GateIssue(ERROR, "orphan_item",
                f"requires item {tok!r} but no item in the pool carries that name/tag", source, "items", str(tok)))
        else:
            issues.append(GateIssue(WARN, "gated_item",
                f"item {tok!r} exists but is only obtainable behind an unreachable gate", source, "items", str(tok)))
    for faction, minv in (requires.get("min_rep") or {}).items():
        if int(minv) <= 0:        # rep defaults to 0, so a <=0 threshold is always met
            continue
        if faction in cl.reps:
            continue
        if faction not in cl.universe_reps:
            issues.append(GateIssue(ERROR, "orphan_rep",
                f"requires rep with {faction!r} but nothing ever grants that faction rep", source, "min_rep", faction))
        else:
            issues.append(GateIssue(WARN, "gated_rep",
                f"{faction!r} rep is grantable but only behind an unreachable gate", source, "min_rep", faction))
    return issues


def analyze(producers: list[Producer], consumers: list[tuple[str, dict]]) -> list[GateIssue]:
    """consumers = [(source_label, requires_blob), ...]. Returns reachability issues."""
    cl = compute_closure(producers)
    out: list[GateIssue] = []
    for source, requires in consumers:
        out += _diagnose(cl, source, requires)
    return out


# ── pool gathering (DB) ────────────────────────────────────────────────────────

def _tokens(name: str | None, tags) -> set[str]:
    toks = {t.lower() for t in (tags or [])}
    if name:
        toks.add(name.lower())
    return toks


def _external_requires(requires: dict | None) -> dict:
    """Strip the tree-internal keys (min_standing/npc_flags) — those are proven by the
    per-tree dialogue validator, not the global state closure."""
    r = requires or {}
    return {k: v for k, v in r.items() if k in ("facts", "items", "min_rep")}


def gather(include_unapproved: bool = False) -> tuple[list[Producer], list[tuple[str, str, dict]]]:
    """Build producers + consumers from the live pool. Each consumer is
    (content_id, source_label, requires) so a single item's gates can be isolated."""
    from runtime.world_map import FEATURES
    from storage.content_store import fetch

    rows = fetch(
        """
        SELECT id, type, content ->> 'name' AS name, tags, requires,
               content -> 'dialogue' AS dialogue, content -> 'mechanics' AS mechanics
        FROM content_items
        WHERE status = 'active' AND (%s OR approved = true)
        """,
        (include_unapproved,),
    )

    producers: list[Producer] = []
    consumers: list[tuple[str, str, dict]] = []
    # id -> item tokens, so dialogue give_items can resolve a content id to its tokens.
    item_tokens: dict[str, set[str]] = {}

    # the take verb sets taken.<feature_key> on every item-type map feature
    for f in FEATURES:
        if f.get("type") == "item":
            producers.append(Producer(
                label=f"take verb @ {f['key']}",
                facts=((f"taken.{f['key']}", True),),
            ))

    for r in rows:
        rid, name, tags = str(r["id"]), r["name"], r["tags"]
        requires = r["requires"] or {}
        # consumer: anything carrying a gate must itself be reachable
        if _external_requires(requires):
            consumers.append((rid, f"{r['type']} {name!r}", _external_requires(requires)))

        if r["type"] == "item":
            toks = _tokens(name, tags)
            item_tokens[rid] = toks
            producers.append(Producer(
                label=f"item {name!r}",
                requires=_external_requires(requires),     # gated items only yield once their gate opens
                items=tuple(sorted(toks)),
            ))

    # second pass: dialogue producers + consumers (give_items needs item_tokens)
    for r in rows:
        if r["type"] != "npc" or not r["dialogue"]:
            continue
        tree = r["dialogue"]
        if not isinstance(tree, dict) or not tree.get("nodes"):
            continue
        npc, nid = r["name"], str(r["id"])
        _, available = walk(tree)
        for node_id, node in tree["nodes"].items():
            for c in node.get("choices", []):
                cid = c.get("id")
                creq = _external_requires(c.get("requires"))
                if creq:
                    consumers.append((nid, f"npc {npc!r} choice {cid!r}", creq))
                if (node_id, cid) not in available:
                    continue   # choice's own in-tree gate never opens; not a live producer
                eff = c.get("effects") or {}
                facts = tuple((k, _hv(v)) for k, v in (eff.get("set_facts") or {}).items())
                reps = tuple(f for f, n in (eff.get("adjust_rep") or {}).items() if n and n > 0)
                gives: set[str] = set()
                for item_id in (eff.get("give_items") or []):
                    gives |= item_tokens.get(str(item_id), set())
                if facts or reps or gives:
                    producers.append(Producer(
                        label=f"npc {npc!r} choice {cid!r}",
                        requires=creq,
                        facts=facts, items=tuple(sorted(gives)), reps=reps,
                    ))
    return producers, consumers


def analyze_pool_tagged(include_unapproved: bool = False) -> list[tuple[str, GateIssue]]:
    """Every reachability issue paired with the consuming item's id — the data behind
    the review UI's pool-wide orphans dashboard."""
    producers, consumers = gather(include_unapproved)
    cl = compute_closure(producers)
    out: list[tuple[str, GateIssue]] = []
    for cid, source, req in consumers:
        for gi in _diagnose(cl, source, req):
            out.append((cid, gi))
    return out


def analyze_pool(include_unapproved: bool = False) -> list[GateIssue]:
    return [gi for _cid, gi in analyze_pool_tagged(include_unapproved)]


def analyze_item(item_id: str) -> list[GateIssue]:
    """Reachability issues for ONE item's gates, judged against the whole pool's
    producers (so the review UI can flag an orphaned gate as you look at it)."""
    return [gi for cid, gi in analyze_pool_tagged(include_unapproved=True) if cid == str(item_id)]


def item_produces(row: dict) -> dict:
    """What state THIS content yields — for the review UI's produces/consumes view.
    `row` = {type, content, tags}. Items yield their take tokens; NPCs yield whatever
    their reachable dialogue choices set (facts/rep/npc_flags/items-given)."""
    out = {"facts": [], "items": [], "reps": [], "npc_flags": []}
    content = row.get("content") or {}
    if row.get("type") == "item":
        out["items"] = sorted(_tokens(content.get("name"), row.get("tags")))
        return out
    tree = content.get("dialogue")
    if not (row.get("type") == "npc" and isinstance(tree, dict) and tree.get("nodes")):
        return out
    _, available = walk(tree)
    facts, reps, flags = set(), set(), set()
    gives = False
    for node_id, node in tree["nodes"].items():
        for c in node.get("choices", []):
            if (node_id, c.get("id")) not in available:
                continue
            eff = c.get("effects") or {}
            facts |= set((eff.get("set_facts") or {}).keys())
            reps |= {f for f, n in (eff.get("adjust_rep") or {}).items() if n and n > 0}
            flags |= {k for k, v in (eff.get("set_npc_flags") or {}).items() if v}
            gives = gives or bool(eff.get("give_items"))
    out.update(facts=sorted(facts), reps=sorted(reps), npc_flags=sorted(flags))
    if gives:
        out["items"] = ["(gives item)"]
    return out
