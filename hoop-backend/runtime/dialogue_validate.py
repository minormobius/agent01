"""Exhaustive validator for dialogue trees — pure, no DB, no LLM.

A `dialogue_tree` (the `content.dialogue` blob an NPC carries; see runtime/dialogue.py)
is a finite state machine: the state the *tree itself* controls is
`(current_node, standing, npc_flags)`. The choices that gate on `min_standing` and
`npc_flags` are tree-internal; choices that gate on facts/items/min_rep gate on
*external* player state the tree can't set, so for reachability we assume the player
*could* satisfy those (going elsewhere to earn rep / pick up an item is a valid path).

This walks the whole reachable state space (BFS, with `standing` clamped so the space
stays finite — gates only test `standing >= threshold`, so any value past the largest
threshold is equivalent) and reports authoring defects the engine would otherwise hit
silently at runtime:

  - missing `start` / empty tree
  - a choice whose `goto` names a node that doesn't exist
  - a node no reachable path can ever enter (dead content)
  - a node a path can enter but never leave (stuck — no available choice, no `end`)
  - a choice whose tree-internal gate can never open on any path (e.g. `min_standing`
    higher than the tree can ever raise standing to) — a permanently-dead branch
  - duplicate choice ids within a node (the engine picks the first; the rest are dead)

`validate_tree(tree)` returns a list of `Issue`s. `errors`/`warnings` partition them.
This is the model-checking half of the playtester story, and the linter the tree
review UI builds on.
"""

from dataclasses import dataclass

# Effects that *don't* advance the conversation are irrelevant to FSM structure
# (set_facts/adjust_rep/give_items touch external state); we only model the tree's own
# levers: goto, adjust_standing, set_npc_flags, end.

ERROR = "error"
WARN = "warn"


@dataclass(frozen=True)
class Issue:
    level: str            # ERROR | WARN
    code: str             # machine-readable, e.g. "missing_goto"
    message: str          # human-readable
    node: str | None = None
    choice: str | None = None

    def __str__(self) -> str:
        where = " ".join(p for p in (f"node={self.node}" if self.node else "",
                                     f"choice={self.choice}" if self.choice else "") if p)
        return f"[{self.level}] {self.code}: {self.message}" + (f"  ({where})" if where else "")


def _standing_cap(nodes: dict) -> int:
    """The largest standing value worth distinguishing: past the biggest min_standing
    threshold, all states behave identically, so clamp there to keep the BFS finite."""
    thresholds = [0]
    for node in nodes.values():
        for c in node.get("choices", []):
            req = c.get("requires") or {}
            if req.get("min_standing") is not None:
                thresholds.append(int(req["min_standing"]))
    return max(thresholds) + 1


def _internal_gate_ok(choice: dict, standing: int, flags: frozenset) -> bool:
    """Can this choice's TREE-INTERNAL gate pass in this state? External gates
    (facts/items/min_rep) are assumed satisfiable for reachability."""
    req = choice.get("requires") or {}
    if req.get("min_standing") is not None and standing < int(req["min_standing"]):
        return False
    for k, v in (req.get("npc_flags") or {}).items():
        if v and k not in flags:   # we only model flags set to True (set_npc_flags)
            return False
        if not v and k in flags:
            return False
    return True


def walk(tree: dict) -> tuple[set[str], set[tuple[str, str]]]:
    """BFS the (node, standing, npc_flags) space. Returns (reachable_nodes,
    available_choices) where availability honors tree-internal gates (min_standing,
    npc_flags) and assumes external gates (facts/items/min_rep) are satisfiable. Shared
    by validate_tree and the pool-wide gate reachability analysis."""
    nodes = tree["nodes"]
    start = tree.get("start") or next(iter(nodes))
    cap = _standing_cap(nodes)
    start_state = (start, 0, frozenset())
    seen_states = {start_state}
    queue = [start_state]
    reachable_nodes = {start}
    available_choices: set[tuple[str, str]] = set()   # (node_id, choice_id) seen available

    while queue:
        node_id, standing, flags = queue.pop()
        for c in nodes[node_id].get("choices", []):
            if not _internal_gate_ok(c, standing, flags):
                continue
            available_choices.add((node_id, c.get("id")))
            eff = c.get("effects") or {}
            if eff.get("end"):
                continue   # terminal: doesn't advance to a new explorable state
            goto = c.get("goto")
            if goto is None or goto not in nodes:
                continue   # broken/absent goto reported by validate_tree
            ns = max(-cap, min(cap, standing + int(eff.get("adjust_standing", 0))))
            nf = flags | {k for k, v in (eff.get("set_npc_flags") or {}).items() if v}
            st = (goto, ns, frozenset(nf))
            reachable_nodes.add(goto)
            if st not in seen_states:
                seen_states.add(st)
                queue.append(st)
    return reachable_nodes, available_choices


def validate_tree(tree: dict | None) -> list[Issue]:
    issues: list[Issue] = []
    if not tree or not isinstance(tree, dict) or not tree.get("nodes"):
        return [Issue(ERROR, "empty", "tree has no nodes")]
    nodes = tree["nodes"]
    start = tree.get("start") or next(iter(nodes))
    if start not in nodes:
        return [Issue(ERROR, "missing_start", f"start node {start!r} is not in nodes", node=start)]

    # ── static checks (don't need the walk) ──────────────────────────────────
    for node_id, node in nodes.items():
        seen_ids: set[str] = set()
        for c in node.get("choices", []):
            cid = c.get("id")
            if cid in seen_ids:
                issues.append(Issue(ERROR, "duplicate_choice_id",
                                    f"choice id {cid!r} appears more than once", node=node_id, choice=cid))
            seen_ids.add(cid)
            goto = c.get("goto")
            # a choice with `end` may legitimately omit/keep goto; only a non-end goto
            # pointing nowhere is broken.
            if goto is not None and goto not in nodes:
                issues.append(Issue(ERROR, "missing_goto",
                                    f"choice goto {goto!r} names a node that doesn't exist",
                                    node=node_id, choice=cid))

    # ── reachability walk over (node, standing, npc_flags) ───────────────────
    reachable_nodes, available_choices = walk(tree)

    # ── post-walk diagnostics ────────────────────────────────────────────────
    for node_id in nodes:
        if node_id not in reachable_nodes:
            issues.append(Issue(WARN, "unreachable_node",
                                "no path can ever enter this node", node=node_id))

    for node_id in reachable_nodes:
        node = nodes[node_id]
        choices = node.get("choices", [])
        # a node a path enters but can never leave: no choice ever available here and
        # no choice ends the conversation -> the player parks here forever.
        any_available = any((node_id, c.get("id")) in available_choices for c in choices)
        any_end = any((c.get("effects") or {}).get("end") for c in choices)
        if choices and not any_available and not any_end:
            issues.append(Issue(WARN, "stuck_node",
                                "node is reachable but no choice is ever available and none ends "
                                "the conversation — the player gets stuck", node=node_id))
        elif not choices:
            issues.append(Issue(WARN, "stuck_node",
                                "node has no choices and no way to end or advance", node=node_id))

    for node_id, node in nodes.items():
        for c in node.get("choices", []):
            cid = c.get("id")
            # a choice whose internal gate never opens on ANY reachable path is dead.
            if node_id in reachable_nodes and (node_id, cid) not in available_choices:
                req = c.get("requires") or {}
                if req.get("min_standing") is not None or req.get("npc_flags"):
                    issues.append(Issue(WARN, "unreachable_choice",
                                        "choice's standing/flag gate can never open on any path",
                                        node=node_id, choice=cid))
    return issues


def errors(issues: list[Issue]) -> list[Issue]:
    return [i for i in issues if i.level == ERROR]


def warnings(issues: list[Issue]) -> list[Issue]:
    return [i for i in issues if i.level == WARN]
