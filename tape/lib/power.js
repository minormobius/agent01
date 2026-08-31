// tape/lib/power.js — the power budget, as arithmetic rather than opinion.
//
// The question "can the whole thing be portable?" has a number for an answer,
// and the number depends on which parts get chosen. So the budget lives next to
// the parts list, the hardware page renders it interactively, and the selftest
// pins the conclusions the prose quotes.
//
// Figures are per-component draw referred to a single-cell Li-ion (~3.7 V
// nominal), from the datasheets and Espressif's own module measurements. They
// are deliberately pessimistic where a range was given.

export const CELL_VOLTS = 3.7;
export const USABLE_FRACTION = 0.85;   // protection cutoff + the flat part of the curve
export const CONVERSION_LOSS = 0.05;   // regulator + power-path overhead
export const HOUSEKEEPING_MA = 1.0;    // LED, pull-ups, quiescent bits and pieces

// The four states the box is ever in. The design rule that WiFi is only awake
// when nothing is playing is what keeps `wifi` and `play` from ever adding up.
export const STATES = {
  play: 'a card is on the pad and a story is playing; WiFi is down',
  idle: 'no card; polling the reader 8 times a second; WiFi up and serving',
  wifi: 'receiving an upload',
  sleep: 'deep sleep after 30 minutes idle; wakes on a button',
};

export const LOADS = [
  {
    id: 'mcu', name: 'ESP32-S3-WROOM-1',
    ma: { play: 45, idle: 2, wifi: 120, sleep: 0.01 },
    note: 'Active is ~24 mA at low load; 45 mA allows for 240 MHz with a decoder running. '
        + 'Idle is light sleep (0.24–0.7 mA) plus an 8 Hz wake to poll. WiFi is the average '
        + 'of 180–240 mA transmit and 95–100 mA receive over a real upload.',
  },
  {
    id: 'nfc', name: 'PN532 reader',
    ma: { play: 7, idle: 7, wifi: 7, sleep: 0.01 },
    note: 'The RF field costs 50–80 mA while it is on. Continuous polling would dominate '
        + 'the entire budget, so the field is duty-cycled — 10 ms on every 125 ms, ~8%. '
        + 'This is the single most important firmware decision for battery life.',
  },
  {
    id: 'amp', name: 'MAX98357A + 4Ω speaker',
    ma: { play: 60, idle: 2.4, wifi: 2.4, sleep: 0 },
    note: 'Quiescent is 2.4 mA. 60 mA is speech at a bedroom volume (~0.2 W acoustic). '
        + 'A child holding the volume at maximum is closer to 250 mA — see the loud case.',
  },
  {
    id: 'sd', name: 'microSD',
    ma: { play: 10, idle: 0.2, wifi: 25, sleep: 0 },
    note: 'Bursty: reads a few hundred kB then idles. 10 mA is the average across playback.',
  },
];

export const LOUD_AMP_MA = 250;   // the same box with the volume at its end stop

export function drawMa(state, { loud = false } = {}) {
  if (!(state in STATES)) throw new Error(`no such state: ${state}`);
  const raw = LOADS.reduce((n, l) => {
    if (l.id === 'amp' && loud && state === 'play') return n + LOUD_AMP_MA;
    return n + l.ma[state];
  }, 0);
  return round1(raw * (1 + CONVERSION_LOSS) + (state === 'sleep' ? 0 : HOUSEKEEPING_MA));
}

/**
 * Hours in one state on a cell of `mAh`. Deep sleep comes out in years, which
 * is fiction — a Li-ion cell self-discharges a few percent a month — so it is
 * capped at the point where self-discharge takes over.
 */
export const SELF_DISCHARGE_MONTHS = 12;
export function hours(mAh, state, opts) {
  const h = (mAh * USABLE_FRACTION) / drawMa(state, opts);
  return round1(Math.min(h, SELF_DISCHARGE_MONTHS * 730));
}

/**
 * Days between charges for a household pattern: `playHours` of stories a day,
 * `idleHours` awake-but-quiet, the rest asleep.
 */
export function daysPerCharge(mAh, { playHours = 1, idleHours = 15, loud = false } = {}) {
  const sleepHours = Math.max(0, 24 - playHours - idleHours);
  const perDay = playHours * drawMa('play', { loud })
               + idleHours * drawMa('idle')
               + sleepHours * drawMa('sleep');
  return round1((mAh * USABLE_FRACTION) / perDay);
}

/** Candidate cells, so the page can offer a comparison rather than one answer. */
export const CELLS = [
  { id: '18650-3000', name: '18650 Li-ion, protected', mAh: 3000, note: 'replaceable, needs a screwed-shut compartment' },
  { id: '18650-2000', name: '18650 Li-ion, budget', mAh: 2000, note: 'the ones in cheap power banks' },
  { id: 'lipo-2500', name: 'LiPo pouch 2500 mAh', mAh: 2500, note: 'flat, packs better, puncture-sensitive' },
  { id: 'lipo-1200', name: 'LiPo pouch 1200 mAh', mAh: 1200, note: 'small enough to make the box pocket-sized' },
];

/** Everything the hardware page needs, in one call. */
export function budget(mAh, opts = {}) {
  return {
    mAh,
    usable: Math.round(mAh * USABLE_FRACTION),
    draw: Object.fromEntries(Object.keys(STATES).map((s) => [s, drawMa(s, opts)])),
    hours: Object.fromEntries(Object.keys(STATES).map((s) => [s, hours(mAh, s, opts)])),
    daysPerCharge: daysPerCharge(mAh, opts),
  };
}

// Small numbers matter here: deep-sleep draw rounded to one decimal is 0, and
// dividing a battery by 0 is not a useful runtime figure.
function round1(n) { return n < 1 ? Math.round(n * 1000) / 1000 : Math.round(n * 10) / 10; }
