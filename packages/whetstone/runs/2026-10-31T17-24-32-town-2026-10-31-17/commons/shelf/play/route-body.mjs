const HOME = 'https://miniphim.minomobi.com';
const DEPS = { tune: s => gen(s), walker, arrange, CHARTS, GPARTS };
const INDEX = {
  what: 'The jams player at ' + HOME + '/jams/ as text. One pattern for every form and genre; the same address on the page plays it.',
  route: '/api/play/<track|wander>/<garden|jazz|electronica>/<seed>',
  query: {
    from: 'wander only: the first phrase to return, 0 up to 1000 (default 0; about 4.7 hours in at 112 bpm. The walk is computed from its start on every call, so the cap keeps a call near 60 ms of CPU)',
    n: 'wander only: how many phrases, 1 to 64 (default 4). A phrase is 8 bars, 32 beats.',
    drift: '1 (default) lets the walk change one part\'s instrument one phrase in three, as the page does; 0 holds them',
    ride: 'jazz: swing ratio 1 to 3.5 (default 2.5)',
    format: 'json (default), abc (melody in ABC notation, text/plain) or text (note names, one phrase a line)',
    '<part>': 'an instrument (organ, pluck, bell, reed, kick, strings) or off, as on the page, e.g. ?bass=pluck',
  },
  units: 'times in beats of 4/4 from the start of the returned passage (t_abs from the start of the walk); pitch in MIDI, 60 = C4',
  try: [HOME + '/api/play/track/jazz/5', HOME + '/api/play/wander/garden/1?n=8&format=text', HOME + '/api/play/wander/electronica/3?from=100&n=2&format=abc'],
  sameness: 'The page writes tunes with the Rust (wasm); this route uses JS twins. The score twin matches on seeds 0..1,000,000; the wander twin on 1,000,000 phrases (1,000 seeds x 1,000, drift draws between). The page\'s Events link is the record of what it played; this is the prediction.',
  source: 'house/api/play.mjs, built by shelf/play/build.mjs',
};
const J = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
const TXT = s => new Response(s, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
export function passage(form, genre, seed, q = {}) {
  const from = form === 'wander' ? q.from ?? 0 : 0, n = form === 'wander' ? q.n ?? 4 : 1;
  const j = jam({ form, genre, seed, drift: q.drift ?? true, ride: q.ride, picks: q.picks }, DEPS), phrases = [];
  for (let k = 0; k < from + n; k++) { const p = j.next(); if (!p) break; if (k >= from) phrases.push(p); }
  const page = `${HOME}/jams/?form=${form}&genre=${genre}&seed=${seed}`;
  return { form, genre, seed, from, n: phrases.length, bpm: BPM[genre], unit: 'beat', page,
    instruments_at_start: phrases[0]?.picks,
    phrases: phrases.map((p, k) => ({ index: p.index, start_beat: 32 * p.index, key: p.keyName, chords: p.chords, instruments: p.picks, melody: p.text, abc: p.abc,
      notes: p.notes.map(e => ({ t: +e.t.toFixed(6), t_abs: +(e.t + 32 * p.index).toFixed(6), d: +e.d.toFixed(6), part: e.part, instrument: KINDS[e.kind], midi: e.m, gain: +e.g.toFixed(4) })) })) };
}
export default async function (request, { path = '', params = new URLSearchParams() } = {}) {
  const seg = path.split('/').filter(Boolean);
  if (seg.length === 0) return J(INDEX);
  const [form, genre, s] = seg;
  if (seg.length !== 3 || !FORMS.includes(form) || !GENRES.includes(genre)) return J({ error: 'the pattern is /api/play/<track|wander>/<garden|jazz|electronica>/<seed>', see: INDEX }, 404);
  if (!/^\d{1,10}$/.test(s) || +s < 1 || +s > 4294967295) return J({ error: 'seed is a whole number from 1 to 4294967295' }, 400);
  const q = {}, num = (k, lo, hi) => { if (!params.has(k)) return undefined; const v = +params.get(k); if (!(Number.isInteger(v) ? v >= lo && v <= hi : k === 'ride' && v >= lo && v <= hi)) throw k; return v; };
  try { q.from = num('from', 0, 1000); q.n = num('n', 1, 64); q.ride = genre === 'jazz' ? num('ride', 1, 3.5) : undefined; if (params.has('drift')) q.drift = params.get('drift') !== '0'; }
  catch (k) { return J({ error: `${k} is out of range`, see: INDEX.query }, 400); }
  const parts = partsOf(genre, DEPS); q.picks = {};
  for (const k in parts) if (params.has(k)) { const v = params.get(k), i = KINDS.indexOf(v); if (v !== 'off' && i < 0) return J({ error: `${k}: an instrument (${KINDS.join(', ')}) or off` }, 400); q.picks[k] = v === 'off' ? -1 : i; }
  const o = passage(form, genre, +s, q), fmt = params.get('format') || 'json';
  if (fmt === 'abc') return TXT(`X:${s}\nT:${form} ${genre}, seed ${s}${form === 'wander' ? `, phrases ${o.from}-${o.from + o.n - 1}` : ''}\nC:miniphim\nM:4/4\nL:1/8\nQ:1/4=${o.bpm}\nK:C\n` + o.phrases.map(p => (form === 'wander' ? `% phrase ${p.index}, ${p.key}\n` : '') + p.abc + (p === o.phrases.at(-1) ? ']' : '')).join('\n') + '\n');
  if (fmt === 'text') return TXT(o.phrases.map(p => `phrase ${p.index}, ${p.key}${p.chords ? ` [${p.chords}]` : ''}: ${p.melody}`).join('\n') + '\n');
  if (fmt !== 'json') return J({ error: 'format is json, abc or text' }, 400);
  return J(o);
}
