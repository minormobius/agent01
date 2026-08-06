// palm/matrix.js — the reading proper.
//
// A composite alone is a thin thing to hand someone. Two people who both land on
// 43 have nothing in common except a number: one of them is metronomic but deep
// in conversation, the other never sleeps and never repeats a word, and calling
// both of them "Ordinary Primate" throws away everything interesting the six
// lines just measured.
//
// So the reading is a PAIR, the way a chart is: which line runs most toward the
// machine, and which runs most toward the animal. Six axes give 6 x 5 = 30
// ordered pairs, and with seven bands that is 210 distinct readings rather than
// seven. Nobody gets told they are the same as everyone else.
//
// The dominant line is the highest percentile, the recessive the lowest — so the
// pair is always about YOUR OWN shape, not about the absolute numbers. A person
// at 12 and a person at 88 can both be Switchboards; what they share is a
// silhouette, which is the thing worth naming.

/**
 * 30 archetypes, keyed `dominant>recessive`. Editorial, not empirical — rename
 * freely, nothing downstream depends on the words. What IS load-bearing is that
 * every ordered pair has an entry: a missing cell means a real account gets no
 * reading at all, which is why the selftest walks all thirty.
 */
export const MATRIX = {
  // ── CADENCE dominant — you keep time ──────────────────────────────────────
  'cadence>vigil':   { name: 'The Tide',              read: 'You arrive on schedule, and the schedule has a night in it.' },
  'cadence>lexicon': { name: 'The Ticking Library',   read: 'Punctual as a bell, and never quite the same word twice.' },
  'cadence>polish':  { name: 'The Reliable Mess',     read: 'Never late, never proofread.' },
  'cadence>drift':   { name: 'The Migrating Clock',   read: 'The same hours every year, and a different bird each season.' },
  'cadence>chorus':  { name: 'The Switchboard',       read: 'You keep perfect time because someone is always calling.' },

  // ── VIGIL dominant — you do not sleep ─────────────────────────────────────
  'vigil>cadence':   { name: 'The Night Shift',       read: 'Awake at every hour, and arriving like weather.' },
  'vigil>lexicon':   { name: 'The All-Night Library', read: 'The lights never go off, and nothing is ever shelved twice.' },
  'vigil>polish':    { name: 'The Three A.M. Draft',  read: 'Always up. Never spellchecked.' },
  'vigil>drift':     { name: 'The Long Vigil',        read: 'You have watched from the same window while becoming someone else.' },
  'vigil>chorus':    { name: 'The All-Night Diner',   read: 'Always open, and always someone in the booth.' },

  // ── LEXICON dominant — a narrow vocabulary ────────────────────────────────
  'lexicon>cadence': { name: 'The Refrain',           read: 'A small vocabulary, thrown in handfuls.' },
  'lexicon>vigil':   { name: 'The Watchword',         read: 'Few words, and you sleep on them.' },
  'lexicon>polish':  { name: 'The Plain Song',        read: 'Short vocabulary, no polish on it, and it carries anyway.' },
  'lexicon>drift':   { name: 'The Turned Coat',       read: 'The same handful of words, aimed somewhere new.' },
  'lexicon>chorus':  { name: 'The Regular',           read: 'You say the same things to more people than anyone else does.' },

  // ── POLISH dominant — immaculate ──────────────────────────────────────────
  'polish>cadence':  { name: 'The Lightning Editor',  read: 'Immaculate, and out of nowhere.' },
  'polish>vigil':    { name: 'The Rested Hand',       read: 'Every sentence closed, every night slept.' },
  'polish>lexicon':  { name: 'The Wide Clean Page',   read: 'A perfect surface over an enormous vocabulary.' },
  'polish>drift':    { name: 'The Restored Manuscript', read: 'Impeccable, and about something else entirely now.' },
  'polish>chorus':   { name: 'The Correspondent',     read: 'You write beautifully, and always to someone.' },

  // ── DRIFT dominant — unchanging ───────────────────────────────────────────
  'drift>cadence':   { name: 'The Standing Stone',    read: 'You have not changed, and you arrive like weather.' },
  'drift>vigil':     { name: 'The Keeper',            read: 'The same self, year on year — and it sleeps.' },
  'drift>lexicon':   { name: 'The Deepening Well',    read: 'One subject forever, and the words keep coming.' },
  'drift>polish':    { name: 'The Weathered Sign',    read: 'Unchanged for years, and never once repainted.' },
  'drift>chorus':    { name: 'The Old Friend',        read: 'Exactly who you were, to everyone who asks.' },

  // ── CHORUS dominant — you broadcast ───────────────────────────────────────
  'chorus>cadence':  { name: 'The Beacon',            read: 'You speak outward, in bursts, to no one in particular.' },
  'chorus>vigil':    { name: 'The Signal Fire',       read: 'Broadcasting — but it goes out at night.' },
  'chorus>lexicon':  { name: 'The Crier',             read: 'One voice, an enormous vocabulary, no reply expected.' },
  'chorus>polish':   { name: 'The Loudhailer',        read: 'You announce, and you do not tidy up afterwards.' },
  'chorus>drift':    { name: 'The Weathervane',       read: 'Always broadcasting, never the same forecast twice.' },
};

/**
 * Pick the pair. Soft axes are excluded: an axis that could not be measured
 * comparably is not allowed to become someone's headline.
 *
 * Ties are broken by the AXES order rather than by whatever the sort happened to
 * do, so the same account always reads the same way — a chart that changes its
 * mind between refreshes is not a chart.
 */
export function archetype(scoredAxes) {
  const usable = scoredAxes.filter((a) => a.pct !== null && !a.soft);
  if (usable.length < 2) return null;

  let dom = usable[0], rec = usable[0];
  for (const a of usable) {
    if (a.pct > dom.pct) dom = a;
    if (a.pct < rec.pct) rec = a;
  }
  if (dom.key === rec.key) return null;                 // every axis identical

  const cell = MATRIX[`${dom.key}>${rec.key}`];
  if (!cell) return null;
  return {
    ...cell,
    dominant: dom.key, dominantLabel: dom.label, dominantPct: dom.pct,
    recessive: rec.key, recessiveLabel: rec.label, recessivePct: rec.pct,
    // The legible version of the pair, for anywhere the name alone is too coy.
    spread: `${dom.label} ${Math.round(dom.pct)} over ${rec.label} ${Math.round(rec.pct)}`,
  };
}
