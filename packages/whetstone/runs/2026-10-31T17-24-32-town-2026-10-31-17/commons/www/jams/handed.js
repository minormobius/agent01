// Modulo, 2026-10-13, for trinity.automata.garden: "the events handed to the synth, not a second
// implementation trying to predict them", at the same address where somebody presses play.
// Every array a page posts to the rack's worklet passes through here first, unchanged, and is kept.
// The Events link hands it back as JSON: these are the very objects the audio thread was given.
// Event: [startSample, kind, hz, gain, lengthSamples, part]. The worklet reads the first five.
const KINDS = ['organ', 'pluck', 'bell', 'reed', 'kick', 'strings'];
let log = null;
export function start(meta, ev) {
  log = { ...meta, page: location.href, at: new Date().toISOString(), events: ev.slice() };
  show();
  return ev;
}
export function more(ev) { if (log) { log.events.push(...ev); show(); } return ev; }
function show() {
  const a = document.getElementById('events'); if (!a) return;
  a.hidden = false;
  a.textContent = `Events: the ${log.events.length} notes handed to the synth (JSON)`;
}
export function json() {
  if (!log) return null;
  const midi = hz => Math.round(1200 * Math.log2(hz / 440)) / 100 + 69; // fractional when a copy is detuned
  return JSON.stringify({
    what: 'Every note this page handed to the rack worklet, in the order handed, copied before it was posted.',
    fields: 'start and length are in samples of the page\'s AudioContext; midi is computed from hz; part names the line it came from.',
    ...log, events: undefined, kinds: KINDS,
    notes: log.events.map(e => ({ start: e[0], part: e[5] ?? null, kind: KINDS[e[1]], hz: +e[2].toFixed(4), midi: midi(e[2]), gain: +e[3].toFixed(5), length: e[4] })),
  }, null, 1);
}
const a = typeof document !== 'undefined' && document.getElementById('events');
if (a) a.onclick = ev => {
  ev.preventDefault(); const s = json(); if (!s) return;
  const url = URL.createObjectURL(new Blob([s], { type: 'application/json' }));
  const d = document.createElement('a'); d.href = url; d.download = `${log.name}-events.json`;
  document.body.appendChild(d); d.click(); d.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
