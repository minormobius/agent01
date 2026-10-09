// clip.js — a saved moment of the radio, as a link. The composer is deterministic, so a passage is
// fully described by the radio's state when it began (Radio.state()) and the dials at each bar after it
// (as whole percents, which is what the worker plays: it rounds them). Packed as JSON, deflated, base64url.
// Pure: browser, worker and node (all have CompressionStream).
//
//   clip = { v: 1, state, bars, knobs: [[barOffset, [light … air, thin], …] (only where they change)] }
//   encodeClip(clip) → code;  decodeClip(code | '#clip=…' | a whole link) → clip
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const t = atob(s + '='.repeat((4 - (s.length % 4)) % 4)), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function encodeClip(clip) { return b64(await pipe(new TextEncoder().encode(JSON.stringify(clip)), new CompressionStream('deflate-raw'))); }
export async function decodeClip(text) {
  const m = String(text).match(/clip=([A-Za-z0-9_-]+)/), code = m ? m[1] : String(text).trim();
  return JSON.parse(new TextDecoder().decode(await pipe(unb64(code), new DecompressionStream('deflate-raw'))));
}
/** The dials a clip plays at bar offset `b` (as the composer takes them), or null if unchanged there. */
export function clipKnobs(clip, b, KNOBS) {
  const e = clip.knobs.find(([at]) => at === b);
  return e ? { ...Object.fromEntries(KNOBS.map((k, i) => [k, e[1][i] / 100])), thin: e[1][KNOBS.length] / 100 } : null;
}
