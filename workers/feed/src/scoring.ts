/**
 * Score candidate posts for feed ranking.
 *
 * Scoring factors:
 * 1. Community breadth — engagement from multiple communities = high signal
 * 2. Engagement density — likes + reposts from community members
 * 3. Recency — exponential decay
 * 4. Bridge bonus — engagement from bridge nodes (cross-community connectors)
 */

import type { EngagementSignal } from './constellation';

export interface ScoredPost {
  uri: string;
  score: number;
  communityHits: number;
  engagementCount: number;
}

interface MemberInfo {
  communityId: number;
  shell: number;
}

const RECENCY_HALF_LIFE_MS = 6 * 60 * 60 * 1000; // 6 hours
const BRIDGE_BONUS = 1.5;
const CROSS_COMMUNITY_MULTIPLIER = 2.0;
const CORE_WEIGHT = 1.0;
const SHELL_WEIGHT = 0.6;

/**
 * Score a set of candidate posts given engagement signals and community membership data.
 */
export function scoreCandiates(
  engagementMap: Map<string, EngagementSignal[]>,
  memberIndex: Map<string, MemberInfo[]>,
  bridgeDids: Set<string>,
  now: number = Date.now()
): ScoredPost[] {
  const scored: ScoredPost[] = [];

  for (const [uri, signals] of engagementMap) {
    const communitiesHit = new Set<number>();
    let weightedEngagement = 0;
    let hasBridge = false;
    let latestSignal = 0;

    for (const signal of signals) {
      const memberships = memberIndex.get(signal.engagerDid);
      if (!memberships) continue; // Not in any tracked community

      // Track which communities this post reached
      for (const m of memberships) {
        communitiesHit.add(m.communityId);
        const weight = m.shell === 0 ? CORE_WEIGHT : SHELL_WEIGHT;
        weightedEngagement += weight;
      }

      if (bridgeDids.has(signal.engagerDid)) hasBridge = true;

      const ts = signal.indexedAt ? new Date(signal.indexedAt).getTime() : now;
      if (ts > latestSignal) latestSignal = ts;
    }

    if (communitiesHit.size === 0) continue;

    // Cross-community bonus: posts that resonate across clusters
    const breadthMultiplier = communitiesHit.size >= 2
      ? CROSS_COMMUNITY_MULTIPLIER * communitiesHit.size
      : 1.0;

    // Bridge node bonus
    const bridgeMultiplier = hasBridge ? BRIDGE_BONUS : 1.0;

    // Recency decay
    const age = now - (latestSignal || now);
    const recency = Math.pow(0.5, age / RECENCY_HALF_LIFE_MS);

    const score = weightedEngagement * breadthMultiplier * bridgeMultiplier * recency;

    scored.push({
      uri,
      score,
      communityHits: communitiesHit.size,
      engagementCount: signals.length,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
