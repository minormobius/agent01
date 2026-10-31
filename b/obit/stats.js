// stats.js — everything the obit says about a chapter, computed from the
// frozen file. Pure: the page, the selftest and anyone scripting against
// chapter-N.json get the same numbers.
//
// The vocabulary, because "post" means three different things here:
//   entry  — a post in the thread that quotes a work. The archive itself.
//   work   — the quoted post: someone's art project, with its own likes.
//   voice  — a post in the thread that is not the curator's: comments,
//            questions, contributions people dropped in themselves.

export const KINDS = ['image', 'video', 'link', 'quote', 'text'];
const DAY = 86400e3;

const iso = t => new Date(t).toISOString().slice(0, 10);

// Monday of the UTC week a timestamp falls in, as YYYY-MM-DD.
export function weekOf(t) {
  const d = new Date(t);
  const back = (d.getUTCDay() + 6) % 7;
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}

/** Split the chapter at its closing post: the canon, and what came after. */
export function split(ch) {
  const canon = ch.posts.filter(p => p.t <= ch.closeAt);
  const after = ch.posts.filter(p => p.t > ch.closeAt);
  return { canon, after };
}

/**
 * Entries: posts that quote a living work. The curator quoting a reply from
 * inside the thread is conversation, not archive, so a quoted post that is
 * itself in this thread does not count.
 */
export function entries(ch, posts = split(ch).canon) {
  const inThread = new Set(ch.posts.map(uriOf));
  return posts.filter(p => p.w && !p.w.gone && !inThread.has(p.w.uri));
}
export const uriOf = p => `at://${p.by}/app.bsky.feed.post/${p.u}`;

export function summary(ch) {
  const { canon, after } = split(ch);
  const es = entries(ch, canon);
  const artists = new Set(es.map(e => e.w.by));
  const voices = canon.filter(p => p.by !== ch.curator);
  const first = canon[0].t;
  const days = Math.round((Date.parse(ch.closeAt) - Date.parse(first)) / DAY);
  const uniq = new Set(es.map(e => e.w.uri));
  return {
    posts: canon.length,
    entries: es.length,
    works: uniq.size,
    repeats: es.length - uniq.size,
    artists: artists.size,
    curated: canon.filter(p => p.by === ch.curator).length,
    voices: voices.length,
    speakers: new Set(voices.map(p => p.by)).size,
    gone: canon.filter(p => p.w?.gone).length,
    after: after.length,
    first,
    last: ch.closeAt,
    days,
    perDay: +(es.length / days).toFixed(1),
    // Summed over distinct works: a work filed twice was liked once.
    likes: [...new Map(es.map(e => [e.w.uri, e.w.likes])).values()].reduce((a, b) => a + b, 0),
  };
}

/** Entries per UTC week, every week present, including the empty ones. */
export function weekly(ch) {
  const es = entries(ch);
  const counts = new Map();
  for (const e of es) counts.set(weekOf(e.t), (counts.get(weekOf(e.t)) ?? 0) + 1);
  const out = [];
  const start = Date.parse(weekOf(split(ch).canon[0].t));
  const end = Date.parse(weekOf(ch.closeAt));
  for (let t = start; t <= end; t += 7 * DAY) out.push({ week: iso(t), n: counts.get(iso(t)) ?? 0 });
  return out;
}

/** Entries per UTC day, for the calendar. */
export function daily(ch) {
  const counts = new Map();
  for (const e of entries(ch)) counts.set(iso(e.t), (counts.get(iso(e.t)) ?? 0) + 1);
  return counts;
}

/**
 * The cumulative count of distinct artists, one point per entry. The shape is
 * the story: a cluster that had already said everything would flatten out.
 */
export function canonGrowth(ch) {
  const seen = new Set();
  return entries(ch).map(e => {
    seen.add(e.w.by);
    return { t: e.t, artists: seen.size };
  });
}

/** Artists by entries, with their total likes and first appearance. */
export function artists(ch) {
  const m = new Map();
  for (const e of entries(ch)) {
    const a = m.get(e.w.by) ?? { did: e.w.by, entries: 0, likes: 0, first: e.t, kinds: {} };
    a.entries++;
    a.likes += e.w.likes;
    a.kinds[e.w.kind] = (a.kinds[e.w.kind] ?? 0) + 1;
    m.set(e.w.by, a);
  }
  return [...m.values()].sort((a, b) => b.entries - a.entries || b.likes - a.likes);
}

export function media(ch) {
  const n = Object.fromEntries(KINDS.map(k => [k, 0]));
  for (const e of entries(ch)) n[e.w.kind]++;
  return n;
}

/** When the curator files things: entries per UTC hour. */
export function clock(ch) {
  const h = Array(24).fill(0);
  for (const e of entries(ch)) h[new Date(e.t).getUTCHours()]++;
  return h;
}

/** The longest stretches with nothing filed, longest first. */
export function silences(ch, k = 3) {
  const es = entries(ch);
  const gaps = [];
  for (let i = 1; i < es.length; i++) {
    gaps.push({ from: es[i - 1].t, to: es[i].t, days: +((Date.parse(es[i].t) - Date.parse(es[i - 1].t)) / DAY).toFixed(1) });
  }
  return gaps.sort((a, b) => b.days - a.days).slice(0, k);
}

/** The busiest single days. */
export function binges(ch, k = 3) {
  return [...daily(ch)].map(([day, n]) => ({ day, n })).sort((a, b) => b.n - a.n || (a.day < b.day ? -1 : 1)).slice(0, k);
}

/** The most-liked works. A work filed twice is counted once. */
export function loved(ch, k = 24) {
  const seen = new Set();
  const out = [];
  for (const e of [...entries(ch)].sort((a, b) => b.w.likes - a.w.likes)) {
    if (seen.has(e.w.uri)) continue;
    seen.add(e.w.uri);
    out.push(e);
    if (out.length === k) break;
  }
  return out;
}

/** Works filed more than once. */
export function repeats(ch) {
  const m = new Map();
  for (const e of entries(ch)) m.set(e.w.uri, [...(m.get(e.w.uri) ?? []), e]);
  return [...m.values()].filter(v => v.length > 1);
}

/**
 * How far back the curator reaches: days between a work being posted and it
 * being filed. The thread opened as "an archive pre-assembled", so its first
 * weeks are mostly the past; later it runs close to live.
 */
export function lag(ch) {
  return entries(ch).map(e => ({ t: e.t, days: (Date.parse(e.t) - Date.parse(e.w.t)) / DAY }));
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Link domains among link works, most common first. */
export function domains(ch) {
  const m = new Map();
  for (const e of entries(ch)) if (e.w.domain) m.set(e.w.domain, (m.get(e.w.domain) ?? 0) + 1);
  return [...m].map(([domain, n]) => ({ domain, n })).sort((a, b) => b.n - a.n);
}

/** Everyone who spoke in the thread besides the curator, most posts first. */
export function speakers(ch) {
  const m = new Map();
  for (const p of split(ch).canon) {
    if (p.by === ch.curator) continue;
    const s = m.get(p.by) ?? { did: p.by, posts: 0, first: p.t };
    s.posts++;
    m.set(p.by, s);
  }
  return [...m.values()].sort((a, b) => b.posts - a.posts || (a.first < b.first ? -1 : 1));
}

/**
 * Months as the chapter's chronology: entries, new artists that month, and
 * the month's most-liked work.
 */
export function months(ch) {
  const seen = new Set();
  const m = new Map();
  for (const e of entries(ch)) {
    const k = e.t.slice(0, 7);
    const row = m.get(k) ?? { month: k, entries: 0, newArtists: 0, top: null };
    row.entries++;
    if (!seen.has(e.w.by)) { seen.add(e.w.by); row.newArtists++; }
    if (!row.top || e.w.likes > row.top.w.likes) row.top = e;
    m.set(k, row);
  }
  return [...m.values()];
}
