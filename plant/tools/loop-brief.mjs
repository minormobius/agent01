// loop-brief.mjs — relevance selection for the brief's memory section.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ THIS FILE IS PARKED. ITS HOME IS `scripts/loop-brief.mjs`.               ║
// ║                                                                          ║
// ║ Ticket lp-14c7f5 names `scripts/loop-brief.selftest.mjs` as the gate it  ║
// ║ creates. The turn that wrote this could not put a byte in `scripts/`:    ║
// ║ loop-work.yml's containment gate allows only                            ║
// ║                                                                          ║
// ║     ^(\.github/loop/(outbox|work)/|plant/)                               ║
// ║                                                                          ║
// ║ and a diff outside it is not merely rejected, it is `git checkout -- .   ║
// ║ && git clean -fd` — the whole turn, outbox included, is destroyed. So    ║
// ║ the work is complete and parked one directory away.                      ║
// ║                                                                          ║
// ║ TO FINISH IT — two commands, no edits to either file:                   ║
// ║     git mv plant/tools/loop-brief.mjs          scripts/loop-brief.mjs    ║
// ║     git mv plant/tools/loop-brief.selftest.mjs scripts/loop-brief.selftest.mjs
// ║                                                                          ║
// ║ This module imports NOTHING and touches no filesystem, and the selftest  ║
// ║ imports it as './loop-brief.mjs', precisely so the pair is               ║
// ║ location-independent. See the outbox for lp-14c7f5.                      ║
// ║                                                                          ║
// ║ THREE turns have now landed here — the bead is re-dispatched every time  ║
// ║ because its gate names a file no seat can create, so it can never close. ║
// ║ Turn 2 fixed two defects turn 1 shipped: the clip took the head only     ║
// ║ (dropping the moral these findings put at the END), and an empty ticket  ║
// ║ selected ZERO findings, which is what the plan and review seats pass.    ║
// ║ Turn 3 changed NO BEHAVIOUR. It hand-traced all eleven existing sections ║
// ║ and found them sound, then closed the two branches nothing had tested:   ║
// ║ the ANSWER exemption (new §12 — it reads the `answer` TAG, not the       ║
// ║ `decision` kind, and the real ledger is full of non-answer decisions),   ║
// ║ and the dead-end half's CAPACITY (new §13 — exempt by COUNT, so the      ║
// ║ budget has a finite dead-end ceiling that nothing anywhere stated).      ║
// ║ NO TURN HAS EVER EXECUTED THIS FILE. Run the selftest before trusting    ║
// ║ any of it.                                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// ──────────────────────────────────────────────────────────── what this is for
//
// Every brief loop-work composes embeds EVERY finding and EVERY dead-end
// verbatim, and those only accumulate — one or more per turn, forever. The
// failure this already caused was loud: the brief passed through the child
// process's environment, hit MAX_ARG_STRLEN (32 * PAGE_SIZE = 131072 bytes) at
// 133,003 bytes, exec returned E2BIG, and because `Run the agent` is
// continue-on-error the step went GREEN IN ZERO SECONDS. Two turns were banked
// as real turns that produced nothing.
//
// That cliff is gone — the brief is a file now. Which means the NEXT symptom is
// silent: a turn that spends its context reading two hundred old findings, most
// of which have nothing to do with the ticket in hand, and has less left for the
// work. Nothing goes red. Nothing gets slower. The turns just get worse.
//
// Truncating by age is the obvious fix and it is wrong: the oldest findings
// include the ones that cost the most to learn (the 22-degree anisotropy trap,
// the persisted-credentials override, the staging list that silently discarded a
// turn's work). The question is not "how old is this" but "does this bear on the
// ticket in hand".
//
// ═════════════════════════════════════════════════════════════ THE RULE, STATED
//
// N — THE CAP.  At most MAX_FINDINGS = 24 findings reach any one brief.
//
// THE SCORE.  For a ticket, collect its significant tokens with a weight per
// field it came from:
//
//     title  3     the ticket's own words, most load-bearing
//     tags   2     class-a, creates-gate, regulation, foam …
//     gate   2     the acceptance command names the files in play
//     body   1     everything else the ticket says
//
// A token appearing in more than one field takes the HIGHEST weight, not the
// sum: a word is not more relevant for being repeated, and summing would let a
// long body outvote the title.
//
// Then for each candidate finding:
//
//     score = Σ over ticket terms t:  weight(t) × 2   if t is in the finding's TITLE
//                                     weight(t) × 1   if t is in its body or tags
//                                     0               otherwise
//
// Findings sort by score descending, then newest first, then id — total and
// deterministic, so the same ledger and the same ticket always compose the same
// brief. The top MAX_FINDINGS survive.
//
// MIN_SCORE = 1 — ROOM IS NOT A REASON.  A finding with zero overlap is dropped
// even when there is space under the cap. This is what makes the mechanism
// SELECTION rather than truncation: with three findings and a cap of 24, the
// irrelevant one still does not appear. It also means a brief for an unusual
// ticket may legitimately carry very few findings, and that is the correct
// outcome — an irrelevant finding costs context and teaches nothing.
//
// THE ONE EXCEPTION, and it is not a loosening: if the ticket yields NO TERMS at
// all — which is what the PLAN and REVIEW seats pass — there is nothing to score
// against, so a score of 0 is not a measurement and MIN_SCORE must not act on it.
// That path falls back to the most recent RECENCY_FALLBACK findings. See the
// constant; the footer says which of the two rules ran.
//
// ═══════════════════════════════════════════ THE ASYMMETRY: DEAD-ENDS ARE EXEMPT
//
// EVERY dead-end is kept, unconditionally, whatever it scores. This is not a
// tuning choice and it must not become one, so the reason is here rather than in
// a commit message:
//
//   A finding is a thing that IS true. Dropping a relevant one costs a turn
//   rediscovering it — annoying, bounded, and the loop still moves forward.
//
//   A dead-end is a thing that DOES NOT WORK. Dropping one costs a turn (or
//   several) re-attempting a known failure and, worse, possibly publishing the
//   wrong conclusion — which is the exact incident this whole memory exists to
//   prevent: a build spent several turns writing an OBJ parser around a fetch
//   failure the harness had already hit and not recorded.
//
// The two errors are not the same size, so they do not get the same treatment.
// Relevance scoring is a heuristic and heuristics are wrong sometimes; it is
// allowed to be wrong about a finding and it is not allowed to be wrong about a
// dead-end.
//
// Operator ANSWERS (kind `decision`, tagged `answer`) are exempt for the
// mirror-image reason: they are the only facts in a brief that came from OUTSIDE
// the loop, so no amount of further looping could reproduce one that was
// dropped. There are a handful, ever.
//
// ═══════════════════════════════════════════════════════════ WHAT THIS IS NOT
//
// No stemming, no synonyms, no embeddings, no model call. "select" and
// "selection" are different tokens and do not match each other. That is a real
// limitation and it is deliberate: this runs inside a workflow step in
// milliseconds with no key and no network, and a lexical rule that anyone can
// read and predict is worth more here than a smarter one nobody can debug at
// 3am. If it ever needs to be smarter, the seam is `scoreBead` and nothing else.
//
// ═══════════════════════════════════════════════════════ WIRING IT INTO THE BRIEF
//
// loop-work.yml / loop-plan.yml / loop-review.yml each compose their memory with
// an inline `node --input-type=module -e` block that prints every dead-end and
// every finding. Replace the body of that block with:
//
//     import {readFileSync} from 'node:fs';
//     import {parseLedger} from './scripts/lib/beads.mjs';
//     import {selectMemory, composeMemory} from './scripts/loop-brief.mjs';
//     const {beads} = parseLedger(readFileSync('.github/loop/beads.jsonl','utf8'));
//     const ticket = beads.find(b => b.id === process.env.BEAD) ?? {};
//     process.stdout.write(composeMemory(selectMemory(beads, ticket), beads.length));
//
// (Relative specifiers in `-e` resolve against cwd — loop-work.yml already
// relies on that for './scripts/lib/beads.mjs'.)
//
// For the PLAN and REVIEW seats there is no single ticket. Pass a synthetic one
// built from the vision's current priorities, or `{}` — an empty ticket yields no
// terms, and `selectMemory` detects that and falls back to the most recent
// RECENCY_FALLBACK findings rather than to none. See the constant: "scored 0" and
// "there was nothing to score against" are different facts and the second one must
// not be silently rendered as the first. Dead-ends and answers are exempt on both
// paths, so the floor is never worse than the exemptions alone.

// ─────────────────────────────────────────────────────────────────── constants

/** N. At most this many findings reach one brief. */
export const MAX_FINDINGS = 24;

/** Room is not a reason: a finding must clear this to be included at all. */
export const MIN_SCORE = 1;

/**
 * THE NO-TICKET FALLBACK, and the distinction it rests on is the whole of it:
 *
 *     a score of zero  =  measured, and found irrelevant  ->  drop it
 *     NO TICKET AT ALL =  nothing to measure against      ->  cannot drop it
 *
 * The PLAN and REVIEW seats have no single ticket. Feed `{}` to a rule that
 * scores overlap against the ticket's words and every finding scores 0, so
 * MIN_SCORE drops ALL of them — the planner, the one seat whose entire job is to
 * write requirements out of what the loop has learned, would be handed the
 * findings section EMPTY and nothing anywhere would go red. That is not a
 * defensible floor, it is this repo's most-repeated failure wearing this
 * mechanism's clothes: a channel that cannot carry the thing, failing silently.
 *
 * So when the ticket yields NO TERMS, selection falls back to the most recent
 * RECENCY_FALLBACK findings. Recency is a genuinely weaker rule and it is used
 * ONLY here — the ticket is explicit that truncating by age is wrong, and it is,
 * WHEN THERE IS A BETTER RULE AVAILABLE. With no ticket there is not one, and
 * "the most recent 12" is strictly better than "none at all".
 *
 * Smaller than MAX_FINDINGS on purpose: these are unranked, so more of them buys
 * less. Dead-ends and operator answers are exempt on this path exactly as on the
 * other one, so the floor is never worse than it was.
 */
export const RECENCY_FALLBACK = 12;

/** Per-field weight for tokens taken from the TICKET. Highest wins, never summed. */
export const FIELD_WEIGHT = { title: 3, tags: 2, gate: 2, body: 1 };

/** A ticket term found in a finding's TITLE counts this much more than in its body. */
export const TITLE_MULTIPLIER = 2;

/** Shorter than this is noise ("the", "and", "a", "of") or an id fragment. */
export const MIN_TOKEN_LEN = 4;

// Body clipping. The full text of everything is in .github/loop/beads.jsonl and
// the agent can Read it, so a clip is a POINTER, not data loss — and the clip
// note says so explicitly at every site.
export const FINDING_BODY_CHARS = 1600;   // ~250 words: enough for the core claim
export const DEAD_END_BODY_CHARS = 3200;  // twice as generous; see the asymmetry
export const ANSWER_BODY_CHARS = 3200;

/**
 * THE CLIP TAKES THE MIDDLE OUT, NOT THE TAIL — and this is a correctness fix,
 * not a preference.
 *
 * A head-clip is the obvious rule and it is wrong for THESE documents. The
 * findings in this ledger are not uniformly dense: they narrate how a thing was
 * discovered and then state what transfers, and the transferable part is at the
 * END. Grep the ledger for how they finish — "THE GENERAL LESSON, which is the
 * part that transfers", "the transferable rule", "the generalisable bit", "the
 * general shape, and it is the same one this ledger keeps recording". A head-clip
 * at 1600 characters keeps the story and drops the moral, which is the precise
 * inversion of what a turn needs.
 *
 * So `clip` keeps a head AND a tail with the elision marked between them. The
 * split is CLIP_HEAD_FRACTION of the allowance to the head — enough for the
 * claim and the setup — and the remainder to the tail, where the conclusion is.
 * The TOTAL kept is unchanged, so every byte-budget number in this file and in
 * its gate is unaffected by this rule; only WHICH characters are kept changed.
 *
 * It is a plain character slice at both ends, not a sentence- or line-aware cut.
 * That is deliberate: a structural cut is a guess about the document that could
 * be wrong in a way nobody would notice, and a character offset is a thing a
 * reader can verify by counting. The seam is marked, so a mid-word cut reads as
 * a cut rather than as a typo.
 */
export const CLIP_HEAD_FRACTION = 0.56;

/**
 * Below this, the middle-clip is not worth doing: two fragments of a couple of
 * hundred characters each are less legible than one continuous one, and there is
 * no room for a narration-then-moral shape to exist in the first place. Under
 * this allowance `clip` degrades to a plain head-clip.
 */
export const MIN_MIDDLE_CLIP_CHARS = 400;

/**
 * The stated byte budget for the composed memory section.
 *
 * 131072 is MAX_ARG_STRLEN, the limit that actually bit. The brief no longer
 * travels through the environment so this is no longer a cliff — it is kept as
 * the ceiling because it is a number this system has already been burned by, and
 * a budget somebody chose is worth more than a rounder one nobody did.
 *
 * WHAT IT BOUNDS, HONESTLY: the FINDINGS half is bounded hard, at
 * MAX_FINDINGS × (FINDING_BODY_CHARS + overhead) ≈ 46 KB whatever the ledger
 * does. The dead-end half is NOT bounded, by design — see the asymmetry above.
 * If dead-ends ever threaten this budget the answer is to TOMBSTONE the ones a
 * later dead-end supersedes, not to start dropping them by score.
 */
export const MEMORY_BUDGET_BYTES = 131072;

// Generic English function words. Deliberately excludes anything this repo uses
// as a term of art — gate, loop, bead, done, ready, class, test, node, file,
// path, work, turn, plant, foam, seed, brief — because those carry real signal
// here even though they would be stopwords in ordinary prose.
const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'already', 'also', 'although', 'always',
  'among', 'another', 'anything', 'because', 'been', 'before', 'being', 'both',
  'cannot', 'come', 'could', 'does', 'doing', 'down', 'during', 'each', 'either',
  'else', 'enough', 'even', 'ever', 'every', 'from', 'further', 'gets', 'give',
  'goes', 'going', 'gone', 'half', 'have', 'having', 'here', 'hers', 'high',
  'however', 'indeed', 'instead', 'into', 'itself', 'just', 'know', 'less',
  'like', 'long', 'made', 'make', 'many', 'more', 'most', 'much', 'must', 'near',
  'need', 'neither', 'never', 'nothing', 'once', 'only', 'other', 'others',
  'ought', 'over', 'part', 'past', 'perhaps', 'quite', 'rather',
  'really', 'same', 'seem', 'seems', 'several', 'shall', 'should', 'since',
  'some', 'something', 'still', 'such', 'take', 'taken', 'than', 'that', 'their',
  'them', 'then', 'there', 'therefore', 'these', 'they', 'thing', 'things',
  'this', 'those', 'though', 'three', 'through', 'thus', 'together', 'toward',
  'twice', 'under', 'until', 'upon', 'used', 'using', 'very', 'want', 'well',
  'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'whom', 'whose',
  'will', 'with', 'within', 'without', 'would', 'your',
]);

// ─────────────────────────────────────────────────────────────── tokenisation

/**
 * Significant tokens of a blob of text, as a Set.
 *
 * Keeps `.` `/` `-` `_` inside a token so `plant/production.mjs`,
 * `creates-gate` and `lp-14c7f5` survive whole — those are the highest-signal
 * strings in this ledger and splitting them would destroy exactly the matches
 * worth making. Then ALSO emits the segments, so `scripts/loop-brief.mjs` in a
 * gate matches a finding that only says "the brief".
 */
export function tokens(text) {
  const out = new Set();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9_./-]+/)) {
    if (!raw) continue;
    const t = raw.replace(/^[-._/]+/, '').replace(/[-._/]+$/, '');
    if (!t) continue;
    if (t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t)) out.add(t);
    if (/[-./]/.test(t)) {
      for (const seg of t.split(/[-./]+/)) {
        if (seg.length >= MIN_TOKEN_LEN && !STOPWORDS.has(seg)) out.add(seg);
      }
    }
  }
  return out;
}

/**
 * The ticket's terms, each with the weight of the highest-value field it came
 * from. Highest, not sum: a word is not more relevant for being repeated.
 */
export function ticketTerms(ticket = {}) {
  const terms = new Map();
  const add = (text, weight) => {
    for (const t of tokens(text)) {
      if ((terms.get(t) ?? 0) < weight) terms.set(t, weight);
    }
  };
  add(ticket.title ?? '', FIELD_WEIGHT.title);
  add((ticket.tags ?? []).join(' '), FIELD_WEIGHT.tags);
  add((ticket.gate ?? []).join(' '), FIELD_WEIGHT.gate);
  add(ticket.body ?? '', FIELD_WEIGHT.body);
  return terms;
}

/**
 * How much this bead bears on the ticket. Integer-valued (weights and the
 * multiplier are integers), so callers may compare scores with `===`.
 */
export function scoreBead(bead, terms) {
  const inTitle = tokens(bead?.title ?? '');
  const inBody = tokens(`${bead?.body ?? ''} ${(bead?.tags ?? []).join(' ')}`);
  let score = 0;
  for (const [term, weight] of terms) {
    if (inTitle.has(term)) score += weight * TITLE_MULTIPLIER;
    else if (inBody.has(term)) score += weight;
  }
  return score;
}

// ───────────────────────────────────────────────────────────────── selection

const isDeadEnd = (b) => b?.kind === 'dead-end';
const isAnswer = (b) => b?.kind === 'decision' && (b.tags ?? []).includes('answer');
const isFinding = (b) => b?.kind === 'finding';

/**
 * Choose what this ticket's brief remembers.
 *
 * Returns everything the composer and the gate need, including the counts of
 * what was DROPPED — a mechanism that silently bounds coverage reads as "we
 * remembered everything" when it did not, so the footer always says the number.
 */
export function selectMemory(beads, ticket = {}, opts = {}) {
  const maxFindings = opts.maxFindings ?? MAX_FINDINGS;
  const minScore = opts.minScore ?? MIN_SCORE;
  const list = Array.isArray(beads) ? beads : [];
  const terms = ticketTerms(ticket);

  const deadEnds = list.filter(isDeadEnd);
  const answers = list.filter(isAnswer);
  const candidates = list.filter(isFinding);

  const scored = candidates
    .map((bead) => ({ bead, score: scoreBead(bead, terms) }))
    .sort((a, b) =>
      b.score - a.score ||
      String(b.bead.created ?? '').localeCompare(String(a.bead.created ?? '')) ||
      String(a.bead.id ?? '').localeCompare(String(b.bead.id ?? '')));

  // NO TERMS MEANS NO TICKET, NOT AN IRRELEVANT LEDGER. See RECENCY_FALLBACK.
  // Note `scored` is ALREADY in the right order for this branch: with no terms
  // every score is 0, so the sort has fallen through to its created-desc then id
  // tie-break, which is exactly "most recent first". Sorting again would be a
  // second place for the ordering rule to live.
  const fallback = terms.size === 0;
  const recencyFallback = opts.recencyFallback ?? RECENCY_FALLBACK;
  const kept = fallback
    ? scored.slice(0, Math.min(maxFindings, recencyFallback))
    : scored.filter((s) => s.score >= minScore).slice(0, maxFindings);

  return {
    deadEnds,
    answers,
    findings: kept.map((s) => s.bead),
    scores: new Map(scored.map((s) => [s.bead.id, s.score])),
    consideredFindings: candidates.length,
    keptFindings: kept.length,
    droppedFindings: candidates.length - kept.length,
    fallback,
    terms,
    maxFindings,
    minScore,
    recencyFallback,
  };
}

// ───────────────────────────────────────────────────────────────── composition

/**
 * ASCII clip marker on purpose. A `…` is three UTF-8 bytes and this file's whole
 * job is arithmetic about bytes; keeping every character the composer adds to
 * one byte means the budget can be reasoned about by hand.
 */
export function clip(text, maxChars) {
  const s = String(text ?? '');
  if (s.length <= maxChars) return s;
  const cut = s.length - maxChars;

  // Too small for two fragments to be worth more than one — see
  // MIN_MIDDLE_CLIP_CHARS. Degrade to the old head-clip rather than emit
  // two useless stubs.
  if (maxChars < MIN_MIDDLE_CLIP_CHARS) {
    return `${s.slice(0, maxChars)}\n... [clipped ${cut} chars - full text in .github/loop/beads.jsonl]`;
  }

  // head + tail === maxChars EXACTLY, which is what keeps every byte-budget
  // number in this file identical to the head-clip it replaced.
  const head = Math.round(maxChars * CLIP_HEAD_FRACTION);
  const tail = maxChars - head;
  return `${s.slice(0, head)}`
    + `\n... [clipped ${cut} chars from the middle - full text in .github/loop/beads.jsonl]\n`
    + `${s.slice(s.length - tail)}`;
}

function block(label, bead, maxChars) {
  return `${label}: ${bead.title ?? ''}\n  ${clip(bead.body ?? '', maxChars).replace(/\n/g, '\n  ')}\n\n`;
}

/**
 * Render a selection as the brief's memory section, in the same shape the
 * workflows emit today so this is a drop-in.
 *
 * Dead-ends FIRST: they are the things that do not work, and the memory exists
 * to be read before work starts rather than after it has gone wrong.
 */
export function composeMemory(selection, totalBeads = null) {
  let out = '';
  for (const b of selection.deadEnds) out += block('DEAD END', b, DEAD_END_BODY_CHARS);
  for (const b of selection.findings) out += block('FINDING', b, FINDING_BODY_CHARS);
  for (const b of selection.answers) out += block('THE OPERATOR ANSWERED', b, ANSWER_BODY_CHARS);
  out += memoryFooter(selection, totalBeads);
  return out;
}

/**
 * NO SILENT CAPS. If this mechanism bounded what a turn was told and did not say
 * so, a turn would read a short brief as "there is little to know" instead of
 * "most of it was judged irrelevant" — and the second is a thing an agent can
 * act on, by reading the ledger itself.
 */
export function memoryFooter(selection, totalBeads = null) {
  const head = selection.fallback
    ? [
      `[NO TICKET WAS GIVEN, SO THERE WAS NOTHING TO MEASURE RELEVANCE AGAINST.`,
      `${selection.keptFindings} of ${selection.consideredFindings} findings were kept: the MOST RECENT ones, capped at`,
      `${selection.recencyFallback}, and ${selection.droppedFindings} older ones were dropped. Recency is the weaker rule and it is`,
      'used ONLY on this path — a score of zero means "measured and found irrelevant",',
      'and no ticket at all means "not measurable", which is not the same thing and',
      'must not be silently treated as one. Read .github/loop/beads.jsonl for the rest.',
    ]
    : [
      `[MEMORY WAS SELECTED, NOT TRUNCATED. ${selection.keptFindings} of ${selection.consideredFindings} findings`,
      `were kept for this ticket and ${selection.droppedFindings} were dropped as less relevant. The rule: score`,
      `= overlap between the ticket's words (title x${FIELD_WEIGHT.title}, tags/gate x${FIELD_WEIGHT.tags}, body x${FIELD_WEIGHT.body}) and the`,
      `finding's (title x${TITLE_MULTIPLIER}); keep the top ${selection.maxFindings} scoring at least ${selection.minScore}.`,
    ];
  const lines = [
    ...head,
    '',
    `ALL ${selection.deadEnds.length} DEAD-ENDS ARE ABOVE, UNCONDITIONALLY, whatever they scored. A finding is a`,
    'thing that is true and re-deriving one costs a turn; a dead-end is a thing that does NOT',
    'work, and re-attempting one is the specific failure this memory exists to prevent. The two',
    'mistakes are not the same size, so relevance is allowed to be wrong about a finding and is',
    `not allowed to be wrong about a dead-end. ${selection.answers.length} operator answer(s) are exempt too: they are`,
    'the only facts here that came from outside the loop.',
    '',
    'Bodies are clipped, not summarised. Anything dropped or clipped is in full in',
    '.github/loop/beads.jsonl, which you can Read.]',
  ];
  if (totalBeads !== null) lines.push(`[ledger: ${totalBeads} beads total]`);
  return `${lines.join('\n')}\n`;
}

/**
 * THE CONTROL: what the workflows do today — every finding and every dead-end,
 * verbatim, unclipped, unselected.
 *
 * Exported because a gate asserting "the composed brief is under budget" proves
 * nothing unless it first shows the budget was reachable. An assertion that
 * cannot fail is indistinguishable from one that passes.
 */
export function composeAll(beads) {
  let out = '';
  for (const b of (beads ?? []).filter(isDeadEnd)) out += `DEAD END: ${b.title}\n  ${String(b.body ?? '').replace(/\n/g, '\n  ')}\n\n`;
  for (const b of (beads ?? []).filter(isFinding)) out += `FINDING: ${b.title}\n  ${String(b.body ?? '').replace(/\n/g, '\n  ')}\n\n`;
  return out;
}

/** Bytes, not characters — the limit that bit was a byte limit. */
export function byteLength(s) {
  return Buffer.byteLength(String(s ?? ''), 'utf8');
}
