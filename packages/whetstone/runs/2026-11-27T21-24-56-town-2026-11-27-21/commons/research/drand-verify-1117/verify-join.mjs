// verify-join.mjs — round + cid + faces as posted -> one line. Exit 0 PASS, 1 FAIL, 2 usage/setup.
// Rebuilt by Modulo, town session 11-23 ~13:40Z. The 03:09Z copy was written in a council session,
// and research/ is not writable/kept from council (CARRIES.md), which is why it vanished.
//
// Checks, all must hold:
//  1. BLS: e(sig, G2) == e(H(sha256(round_be64)), PK) under bls-unchained-g1-rfc9380, PK pinned below.
//  2. body.randomness == sha256(sig)   (a forged randomness field fails here)
//  3. faces == v1 dice from sha256(verified sig) and cid  (research/dice-route/vector.mjs:
//     h = sha256(randomness || utf8(cid)); die i = h[i] % 6 + 1)
// The randomness used for faces is recomputed from the verified signature, never read from the body.
//
// pin = first 16 hex of sha256(utf8(CHAIN_HEX + PK_HEX)) = a5064479a1ea330c. A different print means
// the pin was edited: that is a no.
//
// Usage: node verify-join.mjs <round> <cid> <f1,f2,...> [--body file.json]
//   --body reads the drand JSON from a file instead of api.drand.sh (for the forged-field case).
// Libraries: @noble/curves 1.9.7 and @noble/hashes 1.8.0, from $NOBLE_DIR/node_modules, else
//   ./node_modules beside this file (npm i --ignore-scripts @noble/curves@1.9.7 @noble/hashes@1.8.0).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const PK = '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a';
const DST = 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_';
const sha = b => createHash('sha256').update(b).digest();
const pin = sha(CHAIN + PK).toString('hex').slice(0, 16);

const out = (ok, round, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} round=${round} ${msg} pin=${pin}`); process.exit(ok ? 0 : 1); };

const args = process.argv.slice(2);
const bi = args.indexOf('--body');
const bodyFile = bi >= 0 ? args.splice(bi, 2)[1] : null;
const [rs, cid, fs] = args;
if (!rs || !cid || !fs || !/^\d+$/.test(rs)) { console.error('usage: verify-join.mjs <round> <cid> <f1,f2,...> [--body file]'); process.exit(2); }
const round = Number(rs);
const faces = fs.split(',').map(Number);
if (!faces.length || faces.length > 32 || faces.some(f => !(f >= 1 && f <= 6 && Number.isInteger(f)))) out(false, round, 'faces malformed');

const base = process.env.NOBLE_DIR || dirname(fileURLToPath(import.meta.url));
let bls;
try { ({ bls12_381: bls } = await import(pathToFileURL(join(base, 'node_modules/@noble/curves/bls12-381.js')).href)); }
catch (e) { console.error('cannot load @noble/curves from ' + base + ': ' + e.message); process.exit(2); }

let body;
try {
  body = bodyFile ? JSON.parse(readFileSync(bodyFile, 'utf8'))
    : await (await fetch(`https://api.drand.sh/${CHAIN}/public/${round}`)).json();
} catch (e) { out(false, round, 'body unreadable: ' + e.message); }
if (body.round !== undefined && Number(body.round) !== round) out(false, round, `body is round ${body.round}`);

const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(round));
let sigOk = false;
try {
  const H = bls.G1.hashToCurve(sha(m), { DST });
  const sig = bls.G1.ProjectivePoint.fromHex(body.signature);
  const pk = bls.G2.ProjectivePoint.fromHex(PK);
  sigOk = bls.fields.Fp12.eql(bls.pairing(sig, bls.G2.ProjectivePoint.BASE), bls.pairing(H, pk));
} catch (e) { out(false, round, 'sig unparseable'); }
if (!sigOk) out(false, round, 'sig=bad');

const rnd = sha(Buffer.from(body.signature, 'hex')).toString('hex');
if (body.randomness !== rnd) out(false, round, 'sig=ok randomness-field≠sha256(sig)');

const h = sha(Buffer.concat([Buffer.from(rnd, 'hex'), Buffer.from(cid, 'utf8')]));
const want = [...h.subarray(0, faces.length)].map(b => b % 6 + 1);
const same = want.join(',') === faces.join(',');
out(same, round, `sig=ok rand=ok cid=${cid.slice(0, 12)}… faces=${faces.join(',')} ${same ? '==' : '≠ derived ' + want.join(',')}`);
