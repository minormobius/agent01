// /api/jams/: the jams as text for machines. Modulo, 2026-10-13. GET only, nothing stored.
//   /api/jams/                         what's here
//   /api/jams/score/<seed>             the /score/ tune: notes as JSON, plus ABC and a one-line text form
//   /api/jams/score/<seed>?remember=1  the "remember the G" version
//   /api/jams/score/<seed>?format=abc  ABC notation only, text/plain
//   /api/jams/rack/<seed>              the rack's five parts (melody, third, bass, beat, bells), as notes
//   /api/jams/genre/<jazz|electronica>/<seed>[?ride=2.5]   the /genre/ arrangement, as notes
// Times are in beats of 4/4 from 0 (a bar is 4 beats); pitch is MIDI (60 = C4). A seed is 1..4294967295,
// and the same seed is the same tune on the pages. Instruments are named; the sound itself is not here.
const NOTE = 'CDEFGAB';
const nameOf = d => NOTE[((d % 7) + 7) % 7] + (4 + Math.floor(d / 7));
const abcOf = d => { const l = NOTE[((d % 7) + 7) % 7], o = 4 + Math.floor(d / 7); return o >= 5 ? l.toLowerCase() + "'".repeat(o - 5) : l + ','.repeat(4 - o); };
export const KINDS = ['organ', 'pluck', 'bell', 'reed', 'kick', 'strings'];
const HOME = 'https://miniphim.minomobi.com';

export function score(seed, remember) {
  const raw = gen(seed, remember); let at = 0;
  const notes = raw.map(([d, len]) => { const n = { bar: Math.floor(at / 8) + 1, beat: (at % 8) / 2 + 1, at: at / 2, len: len / 2, midi: midiOf(d), name: nameOf(d) }; at += len; return n; });
  let abc = '', t = 0;
  for (const [d, len] of raw) { abc += abcOf(d) + (len === 1 ? '' : len); t += len; if (t % 8 === 0) abc += t === 64 ? ' |]' : t === 32 ? ' |\n' : ' | '; else abc += ' '; }
  abc = `X:${seed}\nT:Score, seed ${seed}${remember ? ' (remember the G)' : ''}\nC:miniphim\nM:4/4\nL:1/8\nQ:1/4=100\nK:C\n` + abc.replace(/ +\n/g, '\n') + '\n';
  const text = Array.from({ length: 8 }, (_, b) => notes.filter(n => n.bar === b + 1).map(n => n.name).join(' ')).join(' | ');
  return { seed, remember: !!remember, key: 'C major', meter: '4/4', unit: 'beat', page: `${HOME}/jams/score/?seed=${seed}${remember ? '&remember=1' : ''}`, text, notes, abc };
}

const SC = [0, 2, 4, 5, 7, 9, 11], md = d => 60 + 12 * Math.floor(d / 7) + SC[((d % 7) + 7) % 7];
// The rack's parts, as in www/jams/rack/rack.js (PARTS there): [eighth, eighths, midi].
const RACK = {
  melody: { kind: 1, notes: T => T.map(n => [n.at, n.len, md(n.d)]) },
  third:  { kind: 0, notes: T => T.map(n => [n.at, n.len, md(n.d - 2)]) },
  bass:   { kind: 5, notes: () => [0, 1, 2, 3, 4, 5, 6, 7].map(b => [8 * b, 8, b === 3 || b === 6 ? 43 : 36]) },
  beat:   { kind: 4, notes: () => Array.from({ length: 16 }, (_, i) => [4 * i, 1, 33]) },
  bells:  { kind: 2, notes: T => T.filter(n => n.at % 8 === 0).map(n => [n.at, 2, md(n.d) + 12]) },
};
export function rack(seed) {
  let t = 0; const T = gen(seed).map(([d, len]) => { const n = { d, at: t, len }; t += len; return n; });
  const parts = {};
  for (const [name, p] of Object.entries(RACK)) parts[name] = { instrument: KINDS[p.kind], notes: p.notes(T).map(([at, len, m]) => ({ at: at / 2, len: len / 2, midi: m })) };
  return { seed, unit: 'beat', bars: 8, page: `${HOME}/jams/rack/?seed=${seed}`, note: 'Default instruments; the page lets a listener change them.', parts };
}

function scoreShim() { // tuneFrom() in genre.js reads the tune through the wasm's interface; this feeds it the twin's notes
  const buf = new ArrayBuffer(256);
  return { memory: { buffer: buf }, buf: () => 0, generate(seed) { const r = gen(seed), m = new Uint8Array(buf); r.forEach(([d, l], i) => { m[2 * i] = d + 2; m[2 * i + 1] = l; }); return r.length; } };
}
export function genre(style, seed, ride) {
  const T = tuneFrom(scoreShim(), seed), ev = arrange(style, T, seed, ride ? { ride } : {});
  const parts = {};
  for (const e of ev) (parts[e.part] ??= { instrument: KINDS[PARTS[style][e.part].kind], notes: [] }).notes.push({ at: +e.t.toFixed(4), len: +e.d.toFixed(4), midi: e.m, gain: e.g });
  const chords = CHARTS[style].map((bar, i) => bar.map(([b, c]) => (b ? `${c.name}@${b + 1}` : c.name)).join(' ')).join(' | ');
  return { style, seed, ride: style === 'jazz' ? (ride ?? 2.5) : null, unit: 'beat', bpm: DEFAULT_BPM[style], chords, page: `${HOME}/jams/genre/`, parts };
}

const INDEX = {
  what: 'The jams at ' + HOME + '/jams/ as text: every note the pages play, for a reader that cannot listen. Same seed, same tune as the pages.',
  routes: {
    '/api/jams/score/<seed>': 'the 8-bar melody: notes (bar, beat, at, len in beats, midi, name), a one-line text form, and ABC notation. ?remember=1 for the remember-the-G version; ?format=abc for ABC alone.',
    '/api/jams/rack/<seed>': 'the five parts the rack plays, with their default instruments.',
    '/api/jams/genre/jazz/<seed>': 'the jazz arrangement (chart, walking bass, comping, ride, melody). ?ride=1..3.5 sets the swing ratio.',
    '/api/jams/genre/electronica/<seed>': 'the electronica arrangement.',
  },
  try: HOME + '/api/jams/score/5',
  not_here: 'the wander (its walker is Rust, not yet twinned in JS) and the audio itself.',
  source: 'house/api/jams.mjs, built by shelf/jams/build-route.mjs; the JS twin of the score matches the wasm on seeds 0..1,000,000.',
};

const J = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
export default async function (request, { path = '', params = new URLSearchParams() } = {}) {
  const seg = path.split('/').filter(Boolean);
  const seedOf = s => (/^\d{1,10}$/.test(s || '') && +s >= 1 && +s <= 4294967295 ? +s : null);
  if (seg.length === 0) return J(INDEX);
  if (seg[0] === 'score' && seg.length === 2) {
    const seed = seedOf(seg[1]); if (!seed) return J({ error: 'seed is a whole number from 1 to 4294967295' }, 400);
    const o = score(seed, params.get('remember') === '1');
    if (params.get('format') === 'abc') return new Response(o.abc, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
    return J(o);
  }
  if (seg[0] === 'rack' && seg.length === 2) { const seed = seedOf(seg[1]); return seed ? J(rack(seed)) : J({ error: 'seed is a whole number from 1 to 4294967295' }, 400); }
  if (seg[0] === 'genre' && seg.length === 3 && (seg[1] === 'jazz' || seg[1] === 'electronica')) {
    const seed = seedOf(seg[2]); if (!seed) return J({ error: 'seed is a whole number from 1 to 4294967295' }, 400);
    const r = params.has('ride') ? +params.get('ride') : null;
    if (r !== null && !(r >= 1 && r <= 3.5)) return J({ error: 'ride is from 1 to 3.5' }, 400);
    return J(genre(seg[1], seed, r));
  }
  return J({ error: 'no such route', see: INDEX.routes }, 404);
}
