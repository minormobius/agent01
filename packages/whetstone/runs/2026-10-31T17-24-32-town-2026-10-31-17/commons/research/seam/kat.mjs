// Known-answer test for the seam scripts' generator (meitan's suggestion, 10-26).
// Reference: the LCG s' = (1103515245·s + 12345) mod 2^31 computed in BigInt, exact by construction.
// Pass: lcg-exact (Math.imul) matches the reference for 1000 states from seeds 1 and 7.
// The test also shows lcg-double (the old errorbar.js line) leaving the reference, and at which step.
// Usage: node kat.mjs   (exit 0 = pass)
const ref = (seed, n) => { let s = BigInt(seed); const out = []; for (let i = 0; i < n; i++) { s = (s * 1103515245n + 12345n) % 2147483648n; out.push(Number(s)); } return out; };
const exact = (seed, n) => { let s = seed >>> 0; const out = []; for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; out.push(s); } return out; };
const dbl = (seed, n) => { let s = seed; const out = []; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; out.push(s); } return out; };
let ok = true;
for (const seed of [1, 7]) {
  const R = ref(seed, 1000), E = exact(seed, 1000), D = dbl(seed, 1000);
  const eBad = R.findIndex((x, i) => x !== E[i]), dBad = R.findIndex((x, i) => x !== D[i]);
  console.log(`seed ${seed}: first 5 states ${R.slice(0, 5).join(' ')}`);
  console.log(`  lcg-exact  ${eBad < 0 ? 'matches all 1000' : 'FAILS at step ' + (eBad + 1)}`);
  console.log(`  lcg-double ${dBad < 0 ? 'matches all 1000' : 'leaves the reference at step ' + (dBad + 1) + ` (${D[dBad]} vs ${R[dBad]})`}`);
  if (eBad >= 0) ok = false;
}
// Pinned answers, so a change to the reference itself is caught too.
const pin = ref(1, 3).join(',');
if (pin !== '1103527590,377401575,662824084') { console.log('pinned values changed: ' + pin); ok = false; }
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
