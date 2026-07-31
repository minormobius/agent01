// hoop/story/validate.js — exhaustive dialogue-tree validator. Pure, no DB, no LLM.
// Port of hoop-backend/runtime/dialogue_validate.py. A tree is an FSM over
// (current_node, standing, npc_flags); this BFSes the reachable state space (standing
// clamped so it stays finite) and reports authoring defects the engine would otherwise
// hit silently: missing start, broken goto, dead/unreachable nodes, stuck nodes, and
// choice gates that can never open. The model-checking half of the playtester; the
// linter the seed pool is held to in the selftest.

export const ERROR = 'error', WARN = 'warn';
const issue = (level, code, message, node = null, choice = null) => ({ level, code, message, node, choice });

function standingCap(nodes) {
  const thresholds = [0];
  for (const node of Object.values(nodes)) for (const c of (node.choices || [])) {
    const req = c.requires || {}; if (req.min_standing != null) thresholds.push(+req.min_standing);
  }
  return Math.max(...thresholds) + 1;
}
function internalGateOk(choice, standing, flags) {
  const req = choice.requires || {};
  if (req.min_standing != null && standing < +req.min_standing) return false;
  for (const [k, v] of Object.entries(req.npc_flags || {})) {
    if (v && !flags.has(k)) return false;          // we only model flags set to true (set_npc_flags)
    if (!v && flags.has(k)) return false;
  }
  return true;
}
const flagKey = (s) => [...s].sort().join('');

// BFS the (node, standing, npc_flags) space. Returns { reachableNodes:Set, availableChoices:Set("node\0choice") }.
export function walk(tree) {
  const nodes = tree.nodes, start = tree.start || Object.keys(nodes)[0], cap = standingCap(nodes);
  const startState = `${start}|0|`, seen = new Set([startState]), queue = [[start, 0, new Set()]];
  const reachableNodes = new Set([start]), availableChoices = new Set();
  while (queue.length) {
    const [nodeId, standing, flags] = queue.pop();
    for (const c of (nodes[nodeId].choices || [])) {
      if (!internalGateOk(c, standing, flags)) continue;
      availableChoices.add(nodeId + '\0' + c.id);
      const eff = c.effects || {};
      if (eff.end) continue;                          // terminal: doesn't advance
      const goto = c.goto;
      if (goto == null || !(goto in nodes)) continue; // broken goto reported below
      const ns = Math.max(-cap, Math.min(cap, standing + (+(eff.adjust_standing || 0))));
      const nf = new Set(flags); for (const [k, v] of Object.entries(eff.set_npc_flags || {})) if (v) nf.add(k);
      reachableNodes.add(goto);
      const sk = `${goto}|${ns}|${flagKey(nf)}`;
      if (!seen.has(sk)) { seen.add(sk); queue.push([goto, ns, nf]); }
    }
  }
  return { reachableNodes, availableChoices };
}

export function validateTree(tree) {
  const issues = [];
  if (!tree || typeof tree !== 'object' || !tree.nodes) return [issue(ERROR, 'empty', 'tree has no nodes')];
  const nodes = tree.nodes, start = tree.start || Object.keys(nodes)[0];
  if (!(start in nodes)) return [issue(ERROR, 'missing_start', `start node ${JSON.stringify(start)} is not in nodes`, start)];

  for (const [nodeId, node] of Object.entries(nodes)) {        // static checks
    const seenIds = new Set();
    for (const c of (node.choices || [])) {
      if (seenIds.has(c.id)) issues.push(issue(ERROR, 'duplicate_choice_id', `choice id ${JSON.stringify(c.id)} appears more than once`, nodeId, c.id));
      seenIds.add(c.id);
      if (c.goto != null && !(c.goto in nodes)) issues.push(issue(ERROR, 'missing_goto', `choice goto ${JSON.stringify(c.goto)} names a node that doesn't exist`, nodeId, c.id));
    }
  }
  const { reachableNodes, availableChoices } = walk(tree);
  for (const nodeId of Object.keys(nodes)) if (!reachableNodes.has(nodeId)) issues.push(issue(WARN, 'unreachable_node', 'no path can ever enter this node', nodeId));
  for (const nodeId of reachableNodes) {
    const choices = nodes[nodeId].choices || [];
    const anyAvail = choices.some((c) => availableChoices.has(nodeId + '\0' + c.id));
    const anyEnd = choices.some((c) => (c.effects || {}).end);
    if (choices.length && !anyAvail && !anyEnd) issues.push(issue(WARN, 'stuck_node', 'node is reachable but no choice is ever available and none ends the conversation — the player gets stuck', nodeId));
    else if (!choices.length) issues.push(issue(WARN, 'stuck_node', 'node has no choices and no way to end or advance', nodeId));
  }
  for (const [nodeId, node] of Object.entries(nodes)) for (const c of (node.choices || [])) {
    if (reachableNodes.has(nodeId) && !availableChoices.has(nodeId + '\0' + c.id)) {
      const req = c.requires || {};
      if (req.min_standing != null || req.npc_flags) issues.push(issue(WARN, 'unreachable_choice', "choice's standing/flag gate can never open on any path", nodeId, c.id));
    }
  }
  return issues;
}
export const errors = (issues) => issues.filter((i) => i.level === ERROR);
export const warnings = (issues) => issues.filter((i) => i.level === WARN);
