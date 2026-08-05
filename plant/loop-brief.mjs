// loop-brief.mjs — WHICH MEMORY GOES INTO A BRIEF, AND WHICH DOES NOT.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE THIS FILE IS SUPPOSED TO LIVE, AND WHY IT IS NOT THERE
//
// Ticket lp-14c7f5 names its gate as `node scripts/loop-brief.selftest.mjs`, so
// this module belongs at `scripts/loop-brief.mjs`. It is not there, and that is
// structural rather than a preference. Two independent barriers stop the fleet
// writing scripts/:
//
//   1. loop-work.yml's containment gate allows only
//          ^(\.github/loop/(outbox|work)/|plant/)
//      and on a violation it runs `git checkout -- . && git clean -fd` — the
//      ENTIRE turn is reverted, outbox included, before any other step runs.
//   2. the commit step stages `config.writes` = loop/**, .github/loop/**,
//      plant/**. Even past the gate, a scripts/ file would never be committed.
//
// So the work lands here, where it survives, and relocating it is mechanical:
//
//     git mv plant/loop-brief.mjs               scripts/loop-brief.mjs
//     git mv plant/test/loop-brief.selftest.mjs scripts/loop-brief.selftest.mjs
//     # then in the selftest: '../loop-brief.mjs' -> './loop-brief.mjs'
//     # and in main() below:  '../scripts/lib/beads.mjs' -> './lib/beads.mjs'
//
// Nothing here knows where it sits. The module is pure — the only top-level
// import is node:url, for the CLI guard — so the move cannot change behaviour.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PROBLEM
//
// Every brief embeds every finding and every dead-end verbatim, forever. The
// count only goes up, one or more per turn. The hard cliff that made this fail
// loudly is gone (the brief is a file now, not an env var), so the next symptom
// is silent: a turn spends its context reading two hundred old findings, most
// of which have nothing to do with the ticket in hand.
//
// Truncating by age is the obvious fix and it is wrong. The oldest findings
// include the ones that cost the most to learn. The question is not "how old is
// this" but "does it bear on THIS ticket".
//
// ─────────────────────────────────────────────────────────────────────────────
// THE RULE, STATED IN FULL
//
// Two classes of memory, treated asymmetrically on purpose.
//
// ALWAYS KEPT, at any score, with no byte budget:
//   · every `dead-end`. A dead-end is a thing that DOES NOT WORK. Re-attempting
//     one is the specific failure the memory exists to prevent, and the cost of
//     dropping the right one is a whole turn rediscovering it. Scoring cannot
//     help here, because relevance is exactly what the turn does not yet know:
//     an agent about to walk into a wall does not have the wall in its ticket
//     text. That asymmetry is the whole design and it is not a rounding error —
//     it is the difference between a cache and a safety rail.
//   · every operator `decision` tagged `answer`. These are the only facts in
//     the brief that came from outside the loop, so no amount of further
//     looping could reproduce one. The vision file says they outrank everything
//     derived; dropping one to save bytes would be the worst trade available.
//
// SELECTED BY RELEVANCE, capped twice:
//   · `finding` beads, scored by IDF-weighted token overlap with the ticket,
//     best first, kept until either TOP_N items or FINDING_BUDGET_BYTES.
//   · a finding with ZERO overlap is dropped outright rather than used as
//     filler. If nothing overlaps, the memory is the always-kept set and that
//     is the honest answer.
//
// WHY IDF AND NOT RAW OVERLAP. Every finding in this ledger says "loop", "gate"
// and "brief". Raw overlap therefore scores all of them alike and the ranking
// is noise. Inverse document frequency — log(N / df) over the memory corpus
// itself — gives a term that appears in EVERY item a weight of exactly zero and
// a term that appears in one item a weight of log(N). So the score is driven by
// the rare, specific words the ticket and the finding happen to share, which is
// what "relevant" means. No model call, no embedding, no network: it is two
// passes over the corpus and it runs in milliseconds.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not stem, does not know synonyms,
// and cannot tell that "anisotropy" and "aniso" are the same idea. A finding
// that shares a concept but not a word scores zero. That is a real miss and the
// reason the always-kept set is generous: the class of memory whose loss is
// expensive is exempt from scoring entirely, so a scoring miss costs context,
// never correctness.

import { pathToFileURL } from 'node:url';

/** How many findings may be selected, at most. Chosen so the memory section
 *  reads in well under a minute and leaves the ticket the larger share of the
 *  brief. It is a cap on COUNT; the byte budget below is the cap on SIZE, and
 *  whichever binds first wins. */
export const TOP_N = 24;

/** The byte budget for the SELECTED half. Roughly ten thousand tokens — enough
 *  for two dozen substantial findings, small enough that memory cannot crowd
 *  out the vision file and the ticket. The always-kept half is EXEMPT: see the
 *  asymmetry above. Anything that wants a bound on the whole brief must bound
 *  this plus the always-kept set, and the always-kept set is bounded by the
 *  operator, not by this file. */
export const FINDING_BUDGET_BYTES = 40000;

/** Tokens shorter than this are dropped before scoring. "of", "in", "a" carry
 *  no signal and IDF would give them near-zero weight anyway; dropping them
 *  early just makes the corpus pass cheaper. */
export const MIN_TOKEN_LENGTH = 3;

/** Lowercase, split on anything that is not a letter or digit, drop the short
 *  ones. Splitting on punctuation means "loop-work.yml" becomes loop, work, yml
 *  and "scripts/lib/beads.mjs" becomes scripts, lib, beads, mjs — so a ticket
 *  that names a path matches a finding that names the same path, which is one
 *  of the strongest relevance signals available here. */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

/** The ticket's own vocabulary: title, body, tags and gate commands. The gate
 *  is included on purpose — it names the files the work will touch. */
export function ticketTokens(ticket) {
  const parts = [
    ticket?.title ?? '',
    ticket?.body ?? '',
    ...(ticket?.tags ?? []),
    ...(ticket?.gate ?? []),
  ];
  return new Set(tokenize(parts.join(' ')));
}

function itemText(b) {
  return `${b?.title ?? ''} ${b?.body ?? ''}`;
}

/** Is this a bead the brief keeps unconditionally? See the asymmetry above. */
export function isAlwaysKept(b) {
  if (b?.kind === 'dead-end') return true;
  if (b?.kind === 'decision' && (b?.tags ?? []).includes('answer')) return true;
  return false;
}

/** Everything the brief's memory section may contain, in ledger order. */
export function memoryBeads(beads) {
  return (beads ?? []).filter(
    (b) => b?.kind === 'dead-end' || b?.kind === 'finding' || isAlwaysKept(b),
  );
}

/**
 * Score every memory item against a ticket. Returns `[{id, score}]` in input
 * order.
 *
 *   score(item) = sum over the DISTINCT tokens the item shares with the ticket
 *                 of log(N / df(token))
 *
 * N is the number of memory items and df is how many of them contain the token.
 * A token in every item scores exactly 0, so a finding whose only overlap is
 * boilerplate scores exactly 0 and is dropped. There is no length
 * normalisation: a long finding that touches many of the ticket's rare terms
 * genuinely is more relevant than a short one that touches one, and the byte
 * budget already prices length.
 */
export function scoreMemory(items, ticket) {
  const wanted = ticketTokens(ticket);
  const sets = items.map((b) => new Set(tokenize(itemText(b))));
  const N = items.length;

  const df = new Map();
  for (const s of sets) {
    for (const t of s) if (wanted.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log(N / d));

  return items.map((b, i) => {
    let score = 0;
    for (const t of sets[i]) if (wanted.has(t)) score += idf.get(t) ?? 0;
    return { id: b?.id ?? null, score };
  });
}

/** One item, in exactly the shape loop-work.yml already emits: a labelled
 *  title line, the body indented by two, and a blank line after. Keeping the
 *  format byte-identical means wiring this in changes WHICH memory appears and
 *  nothing else about how a brief reads. */
export function renderItem(b) {
  const label = b?.kind === 'dead-end'
    ? 'DEAD END'
    : b?.kind === 'decision'
      ? 'THE OPERATOR ANSWERED'
      : 'FINDING';
  const body = String(b?.body ?? '').replace(/\n/g, '\n  ');
  return `${label}: ${b?.title ?? ''}\n  ${body}\n\n`;
}

/**
 * The memory section of a brief, selected for one ticket.
 *
 * Returns the rendered `text` plus the working: which items were kept in each
 * class, which findings were dropped, the score map, and both byte counts.
 * Callers that only want the text can ignore the rest; the gate reads all of it.
 *
 * Selection walks the ranked candidates and SKIPS an item that would overspend
 * rather than stopping at it. One outsized finding at rank 1 must not starve
 * the twenty that would have fitted behind it. The walk is still strictly
 * rank-ordered, so the result is deterministic: same beads, same ticket, same
 * bytes, every time.
 */
export function composeMemory(beads, ticket, opts = {}) {
  const topN = opts.topN ?? TOP_N;
  const budget = opts.findingBudgetBytes ?? FINDING_BUDGET_BYTES;

  const memory = memoryBeads(beads);
  const scoreOf = new Map(scoreMemory(memory, ticket).map((s) => [s.id, s.score]));

  const deadEnds = memory.filter((b) => b.kind === 'dead-end');
  const answers = memory.filter((b) => b.kind === 'decision');

  const candidates = memory
    .filter((b) => b.kind === 'finding' && (scoreOf.get(b.id) ?? 0) > 0)
    .sort((a, b) =>
      (scoreOf.get(b.id) ?? 0) - (scoreOf.get(a.id) ?? 0) ||
      String(b.created ?? '').localeCompare(String(a.created ?? '')) ||
      String(a.id ?? '').localeCompare(String(b.id ?? '')));

  const findings = [];
  const keptIds = new Set();
  let findingBytes = 0;
  for (const c of candidates) {
    if (findings.length >= topN) break;
    const size = Buffer.byteLength(renderItem(c));
    if (findingBytes + size > budget) continue;
    findings.push(c);
    keptIds.add(c.id);
    findingBytes += size;
  }

  const dropped = memory.filter((b) => b.kind === 'finding' && !keptIds.has(b.id));

  // Order matches the brief as it reads today: dead-ends first (they are the
  // ones that stop a turn wasting itself), then findings, then the operator.
  const text = [...deadEnds, ...findings, ...answers].map(renderItem).join('');

  return {
    text,
    deadEnds,
    findings,
    answers,
    dropped,
    scoreOf,
    findingBytes,
    alwaysKeptBytes: Buffer.byteLength([...deadEnds, ...answers].map(renderItem).join('')),
    totalBytes: Buffer.byteLength(text),
  };
}

/** Everything, unselected — what the brief does today. Exported so the gate can
 *  assert the naive path really would have been a problem, rather than
 *  asserting a budget that was never in danger. */
export function composeEverything(beads) {
  const memory = memoryBeads(beads);
  const deadEnds = memory.filter((b) => b.kind === 'dead-end');
  const findings = memory.filter((b) => b.kind === 'finding');
  const answers = memory.filter((b) => b.kind === 'decision');
  return [...deadEnds, ...findings, ...answers].map(renderItem).join('');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// The drop-in replacement for the inline node script in loop-work.yml's
// "Compose the brief" step. Writes the memory section to stdout and a one-line
// accounting to stderr, so a run log records what was dropped and why the
// number is what it is. Not exercised by the gate: it is fs plumbing around the
// pure functions above, and the pure functions are what can be wrong.
async function main(argv) {
  const beadId = argv[0];
  const { readFileSync } = await import('node:fs');
  const { parseLedger } = await import('../scripts/lib/beads.mjs');
  const { beads } = parseLedger(readFileSync('.github/loop/beads.jsonl', 'utf8'));
  const ticket = beads.find((b) => b.id === beadId);
  if (!ticket) {
    console.error(`loop-brief: no such bead: ${beadId}`);
    process.exitCode = 1;
    return;
  }
  const m = composeMemory(beads, ticket);
  process.stdout.write(m.text);
  const considered = m.findings.length + m.dropped.length;
  console.error(
    `loop-brief: ${m.deadEnds.length} dead-ends (always) + ` +
    `${m.findings.length}/${considered} findings + ${m.answers.length} answers = ` +
    `${m.totalBytes} bytes (findings ${m.findingBytes}/${FINDING_BUDGET_BYTES})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
