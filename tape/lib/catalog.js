// tape/lib/catalog.js — the manifest: what the box knows.
//
// One JSON file at /tape/manifest.json on the SD card is the box's entire
// state. It has two halves and the split is the whole design:
//
//   titles  — the audio. What was recorded, by whom, in what order.
//   cards   — the mapping from a card id (tag.js) to a playlist of titles.
//
// Because a card points at a *playlist* rather than a file, "many books on one
// card" is not a feature to build later — it is the default shape of the data.
// A card holding six bedtime stories and a card holding one differ only in the
// length of an array. Re-pointing a card is an edit to this file; the card
// itself is never rewritten and never wears out (NTAG213 is rated ~100k writes
// but a child's card gets read a thousand times for every write we avoid).
//
// The box is expected to build a binary index from this on first boot and
// re-use it until the mtime changes; an ESP32 should not be re-parsing JSON on
// every card tap.

export const SCHEMA = 1;
export const MANIFEST_PATH = '/tape/manifest.json';
export const AUDIO_ROOT = '/tape/audio';

export const MODES = ['sequence', 'shuffle'];

/** Default encode target. Speech, mono, small — see design/ for the sums. */
export const DEFAULT_BITRATE_KBPS = 24;

export function emptyManifest() {
  return { schema: SCHEMA, titles: {}, cards: {} };
}

export function titleDir(titleId) { return `${AUDIO_ROOT}/${titleId}`; }
export function trackPath(titleId, index) {
  return `${titleDir(titleId)}/${String(index).padStart(3, '0')}.opus`;
}

/** Bytes a recording of `seconds` takes at `kbps`. Container overhead ~2%. */
export function encodedBytes(seconds, kbps = DEFAULT_BITRATE_KBPS) {
  return Math.round(seconds * (kbps * 1000 / 8) * 1.02);
}

/** Hours of speech that fit on a card of `gib` binary gigabytes. */
export function hoursPerCard(gib, kbps = DEFAULT_BITRATE_KBPS) {
  return (gib * 1024 ** 3) / encodedBytes(3600, kbps);
}

export function addTitle(manifest, { id, title, reader = '', tracks = [] }) {
  if (!id) throw new Error('addTitle: a title needs an id');
  if (manifest.titles[id]) throw new Error(`addTitle: ${id} already exists`);
  manifest.titles[id] = {
    title: title || id,
    reader,
    tracks: tracks.map((t, i) => ({
      file: trackPath(id, i),
      name: t.name || `Part ${i + 1}`,
      seconds: Math.round(t.seconds || 0),
    })),
  };
  return manifest;
}

export function bindCard(manifest, cardId, playlist, { label = '', mode = 'sequence', resume = true } = {}) {
  if (!MODES.includes(mode)) throw new Error(`bindCard: unknown mode ${mode}`);
  const missing = playlist.filter((t) => !manifest.titles[t]);
  if (missing.length) throw new Error(`bindCard: no such title(s): ${missing.join(', ')}`);
  manifest.cards[cardId] = { label, playlist: [...playlist], mode, resume };
  return manifest;
}

/** Every track a card plays, in order, flattened across its titles. */
export function playlistTracks(manifest, cardId) {
  const card = manifest.cards[cardId];
  if (!card) return null;
  return card.playlist.flatMap((titleId) => {
    const t = manifest.titles[titleId];
    return t ? t.tracks.map((tr) => ({ ...tr, titleId, title: t.title })) : [];
  });
}

export function titleSeconds(title) {
  return title.tracks.reduce((n, t) => n + (t.seconds || 0), 0);
}

export function stats(manifest, kbps = DEFAULT_BITRATE_KBPS) {
  const titles = Object.values(manifest.titles);
  const seconds = titles.reduce((n, t) => n + titleSeconds(t), 0);
  return {
    titles: titles.length,
    cards: Object.keys(manifest.cards).length,
    tracks: titles.reduce((n, t) => n + t.tracks.length, 0),
    seconds,
    bytes: encodedBytes(seconds, kbps),
  };
}

/**
 * Everything that would make the box behave surprisingly, as a list of strings.
 * The studio refuses to write a manifest that returns anything here; the box
 * logs them and carries on, because a child holding a card is not the moment
 * to be strict.
 */
export function validateManifest(m) {
  const bad = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  if (m.schema !== SCHEMA) bad.push(`schema is ${m.schema}, this build writes ${SCHEMA}`);
  if (!m.titles || typeof m.titles !== 'object') bad.push('titles is missing');
  if (!m.cards || typeof m.cards !== 'object') bad.push('cards is missing');
  if (bad.length) return bad;

  for (const [id, t] of Object.entries(m.titles)) {
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) bad.push(`title id ${JSON.stringify(id)} is not a safe directory name`);
    if (!t.title) bad.push(`title ${id} has no display title`);
    if (!Array.isArray(t.tracks) || t.tracks.length === 0) bad.push(`title ${id} has no tracks`);
    else t.tracks.forEach((tr, i) => {
      if (tr.file !== trackPath(id, i)) bad.push(`title ${id} track ${i} is at ${tr.file}, expected ${trackPath(id, i)}`);
      if (!(tr.seconds > 0)) bad.push(`title ${id} track ${i} has no duration`);
    });
  }
  for (const [cid, c] of Object.entries(m.cards)) {
    if (!Array.isArray(c.playlist) || c.playlist.length === 0) bad.push(`card ${cid} plays nothing`);
    else c.playlist.filter((t) => !m.titles[t]).forEach((t) => bad.push(`card ${cid} points at missing title ${t}`));
    if (!MODES.includes(c.mode)) bad.push(`card ${cid} has unknown mode ${c.mode}`);
  }
  return bad;
}

/** Titles no card can reach — dead weight on the SD card. */
export function orphanTitles(m) {
  const reachable = new Set(Object.values(m.cards).flatMap((c) => c.playlist));
  return Object.keys(m.titles).filter((t) => !reachable.has(t));
}
