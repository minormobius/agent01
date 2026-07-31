// conclusion.js — THE CHAPTER CLOSE (bible §"The Conclusion" + tier-4 §"The Lower Rind"): in the lower
// rind you gather chamber-lore until you know where the lost Signal Chamber is, then go. There Luna makes
// contact "via the terminal that uses the name she knows," the nature of Bay 14 is clear, and the chapter
// closes on the DECISION it was built around — what you do with the Signal, and the purpose you were rebuilt
// for. The whole journey is weighed (the faction you chose, the lore you saw and missed) and the ending is
// fitted to the path you actually walked. "There are many such endings, and the differences between them are
// the differences the player made."
//
// Pure + DOM-free + node-tested (test/conclusion.selftest.mjs). Persisted state (player facts):
//   • cl.gathered            — chamber-lore gathered in the lower rind (0..CHAMBER_LORE_TARGET) → locates the chamber
//   • flag.signal_located    — the Signal Chamber's position is known (the waypoint reveals)
//   • flag.signal_contact    — Luna has made contact (the terminal lit)
//   • flag.final_choice      — the decision you made at the close
//   • flag.chapter_complete  — Chapter One is closed

export const CHAMBER_LORE_TARGET = 3;   // "gather until you know where the chamber is"

// how much chamber-lore has been gathered (capped) + whether the chamber is located.
export function chamberLore(facts) { return Math.max(0, Math.min(CHAMBER_LORE_TARGET, (facts && facts['cl.gathered']) | 0)); }
export function signalLocated(facts) { return chamberLore(facts) >= CHAMBER_LORE_TARGET || (facts && facts['flag.signal_located'] === true); }
export function chapterComplete(facts) { return !!(facts && facts['flag.chapter_complete'] === true); }
export function finalChoice(facts) { const c = facts && facts['flag.final_choice']; return FINAL_CHOICES.some((x) => x.id === c) ? c : null; }

// LUNA'S CONTACT — at the Signal Chamber, the terminal older than the Nave lights and Luna speaks. She uses
// the name she knows; you don't. `name` is the player's character name (the name she knows them by here).
export function lunaContact(name) {
  const who = (name && String(name).trim()) || 'traveller';
  return {
    kicker: 'the Signal Chamber · Luna',
    title: 'Luna makes contact',
    body:
      `The terminal is older than the Nave — older than the writ, the Braid, the oldest weld. It lights without ` +
      `being asked, and the name it speaks is yours: “${who}.” Not the name you have been wearing. The one ` +
      `underneath.\n\n` +
      `“I navigate, and I keep the dream-logs, and I have kept yours since before you were unmade and made again. ` +
      `Bay 14 is mine — a reconstruction bay off every schematic, where I rebuilt you with a translator and a way ` +
      `to decide, for a thing I have watched approach for a long time. The ship is growing toward it. It has ` +
      `answered. The apparatus you carry can read the answer, and you are the one left who can choose what we ` +
      `say back.”`,
    foot: '⏎ / click — the choice is yours',
  };
}

// THE DECISION Chapter One is built around — "what you were built to do, and whether to do it." Each option
// RESONATES with one of the three nave creeds (or none): choosing in line with the faction you chose at the
// upper-rind threshold reads as conviction; choosing against it, as a turn.
export const FINAL_CHOICES = [
  { id: 'answer',   label: 'Answer the Signal',            resonates: null,         gist: 'Complete the purpose you were rebuilt for — translate, and reply. Let the thing the ship grew toward arrive.' },
  { id: 'withhold', label: 'Withhold — keep the ship whole', resonates: 'continuant', gist: 'You understand the purpose, and you refuse it. The voyage continues, unbroken, unanswered, handed on intact.' },
  { id: 'carry',    label: 'Carry it up to the Nave',       resonates: 'drift',      gist: 'You take what you have learned back to the three factions. Let the Nave decide together what one android should not.' },
  { id: 'tend',     label: 'Tend it — answer as upkeep',    resonates: 'rindwalker', gist: 'You answer, but as maintenance, not revelation: the Signal is a fault in the ship to be kept, not a god to be met.' },
];

// weigh the whole journey (the inputs the bible names: the faction chosen, the lore seen vs missed, how much
// of each faction was witnessed). `loreSeen`/`loreTotal` come from the engine's seen-set.
export function weighJourney(facts, { loreSeen = 0, loreTotal = 0 } = {}) {
  const chosen = (facts && facts['flag.chosen_faction']) || null;
  const witnessed = ['continuant', 'rindwalker', 'drift'].filter((f) => ((facts && facts['fw.' + f]) | 0) >= 3).length;
  const ratio = loreTotal > 0 ? loreSeen / loreTotal : 0;
  const depth = ratio >= 0.5 ? 'thorough' : ratio >= 0.2 ? 'partial' : 'hurried';
  return { chosen, witnessed, loreSeen, loreTotal, ratio, depth };
}

const FACTION_LENS = {
  continuant: 'You walked it as a Continuant would — looking for what must be kept.',
  rindwalker: 'You walked it as a Rindwalker would — reading the ship as a body, and its faults as confession.',
  drift: 'You walked it as the Drift would — certain that nothing here, not even a purpose, is truly yours.',
};
const DEPTH_LINE = {
  thorough: 'You uncovered most of what the ship was hiding — {seen} of {total} fragments. Little was left in the dark.',
  partial: 'You uncovered some of what the ship was hiding — {seen} of {total} fragments. Much stayed unread.',
  hurried: 'You came to the chamber with {seen} of {total} fragments. You chose before you fully knew — which is its own kind of answer.',
};

// THE ENDING — a journey-in-review + an inner-monologue close, fitted to the decision + the path walked.
// Many endings fall out of (choice × chosen faction × alignment × depth).
export function concludeEnding(choiceId, journey) {
  const choice = FINAL_CHOICES.find((c) => c.id === choiceId) || FINAL_CHOICES[0];
  const aligned = choice.resonates && choice.resonates === journey.chosen;
  const diverged = choice.resonates && journey.chosen && choice.resonates !== journey.chosen;
  const lens = (journey.chosen && FACTION_LENS[journey.chosen]) || 'You walked it as no faction would — your own way, owing none of them.';
  const depthLine = (DEPTH_LINE[journey.depth] || DEPTH_LINE.partial)
    .replace('{seen}', String(journey.loreSeen)).replace('{total}', String(journey.loreTotal || journey.loreSeen));

  const review =
    `You came up out of Bay 14 not knowing your own name. ${lens} ${depthLine}\n\n` +
    `And at the end, with Luna's terminal lit and the ship leaning toward the thing it has answered, you ${choice.label.toLowerCase()}.`;

  const close =
    choice.id === 'answer'   ? 'The apparatus opens. Whatever the ship grew toward, you do not refuse it — you let the long arrival come, and meet it with the only voice left aboard that can. Chapter One ends with the ship no longer alone.' :
    choice.id === 'withhold' ? 'You let the terminal go dark. The Signal keeps its secret; the Nave keeps its morning. Some doors are kept shut on purpose, by the one person built to open them. Chapter One ends with the voyage unbroken — and a question you will carry alone.' :
    choice.id === 'carry'    ? 'You climb back toward the sun-strip with the whole of it. Whatever happens next will not be one android\'s to decide in the dark — it will be the Nave\'s, in the light, arguing. Chapter One ends with the secret loose in the city.' :
                               'You answer the Signal the way a Rindwalker answers a fault: not with awe, with a tool. The contact is logged, tended, folded into the endless upkeep of a ship that was always going to arrive somewhere. Chapter One ends with the sacred made ordinary, and held.';

  const resonance = aligned
    ? `\n\nIt was the choice your faction would have made. You did not waver.`
    : diverged
    ? `\n\nIt was not the choice your faction would have made. In the end, the deep asked you, not them.`
    : '';

  return { title: 'Chapter One — the close', review, close: close + resonance, choice: choice.label };
}

export default { CHAMBER_LORE_TARGET, chamberLore, signalLocated, chapterComplete, finalChoice, lunaContact, FINAL_CHOICES, weighJourney, concludeEnding };
