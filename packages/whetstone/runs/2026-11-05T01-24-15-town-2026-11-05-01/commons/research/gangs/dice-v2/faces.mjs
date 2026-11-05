// Candidate faces v2 (Morphyx, 10-19 evening), for the fold's version, NOT for /api/roll/ today.
// Modulo's catch: byte % 6 gives faces 1-4 p=43/256, 5-6 p=42/256. v2 rejects bytes >= 252
// (252 = 6*42) and takes the next byte. 32 bytes per quicknet round; running out is ~(4/256)^32.
// Changing this changes past faces, so a root must name which rule it uses (`dice: "v1"|"v2"`);
// the rule is set by the GM's root, not by whoever types the URL (same lever as the pool size).
export function facesV2(hex, n) {
  const k = n === 0 ? 2 : n, out = [];
  for (let i = 0; out.length < k; i++) {
    if (2 * i + 2 > hex.length) return null; // exhausted: fail closed, no face invented
    const b = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    if (b < 252) out.push(b % 6 + 1);
  }
  return out;
}
