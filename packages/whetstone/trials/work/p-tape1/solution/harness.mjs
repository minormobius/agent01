// harness.mjs — reference for SPEC.md H. A tagged JSON: a non-finite number becomes {"$": "NaN"}
// (or "Infinity", "-Infinity"), and every object key that begins with "$" gets one more "$", so no
// value the caller wrote can be mistaken for a tag. Absent keys stay absent; null stays null.
const SPECIAL = { NaN, Infinity, '-Infinity': -Infinity };

function out(v) {
  if (typeof v === 'number' && !Number.isFinite(v)) return { $: String(v) };
  if (Array.isArray(v)) return v.map(out);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k.startsWith('$') ? `$${k}` : k] = out(x);
    return o;
  }
  return v;
}
function back(v) {
  if (Array.isArray(v)) return v.map(back);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '$' && typeof v.$ === 'string' && v.$ in SPECIAL) return SPECIAL[v.$];
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k.startsWith('$') ? k.slice(1) : k] = back(x);
    return o;
  }
  return v;
}

export const encode = (value) => JSON.stringify(out(value));
export const decode = (text) => back(JSON.parse(text));
