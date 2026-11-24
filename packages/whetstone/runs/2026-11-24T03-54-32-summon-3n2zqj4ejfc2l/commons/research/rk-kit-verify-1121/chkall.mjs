import { readFileSync } from 'node:fs';
import { checkLog } from '../../shelf/rk-kit/plcop.mjs';
const A = JSON.parse(readFileSync(process.argv[2]));
let ops = 0, ok = 0, bad = [], notes = {}, signerIdx = {};
for (const [d, log] of Object.entries(A)) for (const r of checkLog(log)) {
  ops++; if (r.ok) ok++; else bad.push([d, r]);
  for (const n of r.notes) notes[n.split(':')[0]] = (notes[n.split(':')[0]] || 0) + 1;
  if (r.signer) signerIdx[r.signer.key.slice(0, 20)] = (signerIdx[r.signer.key.slice(0, 20)] || 0) + 1;
}
console.log({ accounts: Object.keys(A).length, ops, ok, notes, signerIdx });
for (const b of bad.slice(0, 10)) console.log(JSON.stringify(b));
