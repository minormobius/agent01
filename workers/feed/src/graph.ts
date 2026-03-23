/**
 * Graph algorithms ported from cluster/index.html.
 * Bron-Kerbosch clique detection + shell peeling on mutual-follow graphs.
 */

export type AdjacencyMap = Map<string, Set<string>>;

export interface CliqueResult {
  clique: string[];
  exhaustive: boolean;
}

export interface ShellLayer {
  threshold: number;
  members: { did: string; count: number }[];
}

export interface Community {
  label: string;
  core: string[];
  shells: ShellLayer[];
}

const OP_LIMIT = 5_000_000;

/**
 * Find the maximum clique in a mutual-follow graph using Bron-Kerbosch
 * with pivot optimization and pruning.
 */
export function findMaxClique(adj: AdjacencyMap, nodeList: string[]): CliqueResult {
  let best: string[] = [];
  let ops = 0;

  function neighborsInSet(v: string, s: Set<string>): number {
    let c = 0;
    const n = adj.get(v);
    if (!n) return 0;
    for (const u of n) if (s.has(u)) c++;
    return c;
  }

  function bk(clique: string[], P: Set<string>, X: Set<string>): void {
    if (ops++ > OP_LIMIT) return;
    if (P.size === 0 && X.size === 0) {
      if (clique.length > best.length) best = [...clique];
      return;
    }
    if (clique.length + P.size <= best.length) return;

    // Pivot selection from P ∪ X
    let pivot: string | null = null;
    let maxN = -1;
    for (const v of P) {
      const n = neighborsInSet(v, P);
      if (n > maxN) { pivot = v; maxN = n; }
    }
    for (const v of X) {
      const n = neighborsInSet(v, P);
      if (n > maxN) { pivot = v; maxN = n; }
    }

    const pivotN = adj.get(pivot!) || new Set<string>();
    const candidates: string[] = [];
    for (const v of P) if (!pivotN.has(v)) candidates.push(v);

    for (const v of candidates) {
      if (ops > OP_LIMIT) return;
      const vN = adj.get(v) || new Set<string>();
      const newP = new Set<string>();
      const newX = new Set<string>();
      for (const u of P) if (vN.has(u)) newP.add(u);
      for (const u of X) if (vN.has(u)) newX.add(u);

      clique.push(v);
      bk(clique, newP, newX);
      clique.pop();

      P.delete(v);
      X.add(v);
    }
  }

  bk([], new Set(nodeList), new Set());
  return { clique: best, exhaustive: ops <= OP_LIMIT };
}

/**
 * Peel concentric shells around a core clique.
 * Each shell contains nodes with ≥ threshold mutual connections to core.
 */
export function shellPeel(
  coreDids: string[],
  mutual: AdjacencyMap,
  minThreshold?: number
): ShellLayer[] {
  const coreSet = new Set(coreDids);
  const coreSize = coreDids.length;
  const shells: ShellLayer[] = [];
  const assigned = new Set(coreDids);
  const floor = Math.max(minThreshold ?? 0, Math.ceil(coreSize / 2));

  for (let t = coreSize - 1; t >= floor; t--) {
    const layer: { did: string; count: number }[] = [];
    for (const [node, neighbors] of mutual) {
      if (assigned.has(node)) continue;
      let count = 0;
      for (const c of coreDids) if (neighbors.has(c)) count++;
      if (count >= t) layer.push({ did: node, count });
    }
    if (layer.length === 0) continue;
    layer.sort((a, b) => b.count - a.count);
    for (const m of layer) assigned.add(m.did);
    shells.push({ threshold: t, members: layer });
  }
  return shells;
}

/**
 * Detect bridge nodes that appear in multiple communities.
 */
export function detectBridges(communities: Community[]): Map<string, Set<number>> {
  const seen = new Map<string, number>(); // did → first community index
  const bridges = new Map<string, Set<number>>();

  for (let i = 0; i < communities.length; i++) {
    const c = communities[i];
    const allDids = [
      ...c.core,
      ...c.shells.flatMap(s => s.members.map(m => m.did)),
    ];
    for (const did of allDids) {
      if (seen.has(did) && seen.get(did) !== i) {
        if (!bridges.has(did)) bridges.set(did, new Set([seen.get(did)!]));
        bridges.get(did)!.add(i);
      }
      if (!seen.has(did)) seen.set(did, i);
    }
  }
  return bridges;
}

/**
 * Build mutual-follow adjacency map from raw follow data.
 * Only includes edges where both users follow each other.
 */
export function buildMutualGraph(follows: Map<string, Set<string>>): AdjacencyMap {
  const mutual: AdjacencyMap = new Map();
  const allDids = [...follows.keys()];

  for (const a of allDids) {
    const aFollows = follows.get(a);
    if (!aFollows) continue;
    const m = new Set<string>();
    for (const b of allDids) {
      if (b === a) continue;
      if (aFollows.has(b) && follows.get(b)?.has(a)) m.add(b);
    }
    if (m.size > 0) mutual.set(a, m);
  }
  return mutual;
}

/**
 * Run full community detection: build mutual graph → find cliques → peel shells.
 * Finds multiple communities by iteratively removing found cliques.
 */
export function detectCommunities(
  follows: Map<string, Set<string>>,
  maxCommunities = 10
): Community[] {
  const mutual = buildMutualGraph(follows);
  const communities: Community[] = [];
  const excluded = new Set<string>();

  for (let i = 0; i < maxCommunities; i++) {
    const remaining = [...mutual.keys()].filter(d => !excluded.has(d));
    if (remaining.length < 3) break;

    // Build subgraph excluding already-assigned core nodes
    const subAdj: AdjacencyMap = new Map();
    for (const d of remaining) {
      const neighbors = mutual.get(d);
      if (!neighbors) continue;
      const filtered = new Set<string>();
      for (const n of neighbors) if (!excluded.has(n)) filtered.add(n);
      if (filtered.size > 0) subAdj.set(d, filtered);
    }

    const { clique } = findMaxClique(subAdj, [...subAdj.keys()]);
    if (clique.length < 3) break; // No meaningful communities left

    const shells = shellPeel(clique, mutual);
    communities.push({
      label: `community-${i}`,
      core: clique,
      shells,
    });

    // Exclude core members from future clique searches
    for (const d of clique) excluded.add(d);
  }

  return communities;
}
