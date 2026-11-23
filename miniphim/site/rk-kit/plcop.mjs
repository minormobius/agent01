// rk-kit/plcop.mjs — read, check and sign did:plc operations yourself. Node only, no deps.
// What it holds: DAG-CBOR for the shapes a PLC op uses, the op's CID, the did:plc of a genesis op,
// ECDSA over sha256 with low-S compact signatures, and did:key decoding for secp256k1 and P-256.
// checkLog(audit) re-verifies a plc.directory audit log from genesis: every sig against a rotation
// key of the op it names as prev, the DID against genesis, and every fork against the 72 h / rank rule.
import { createHash, createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import { unb58 } from './keygen.mjs';

// --- DAG-CBOR (maps with string keys, strings, arrays, null, bools, small ints; that's all an op has)
function head(major, n) {
  if (n < 24) return Buffer.from([major << 5 | n]);
  if (n < 256) return Buffer.from([major << 5 | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = major << 5 | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = major << 5 | 26; b.writeUInt32BE(n, 1); return b;
}
export function cbor(v) {
  if (v === null) return Buffer.from([0xf6]);
  if (v === true) return Buffer.from([0xf5]);
  if (v === false) return Buffer.from([0xf4]);
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw Error('no floats in a PLC op');
    return v >= 0 ? head(0, v) : head(1, -1 - v);
  }
  if (typeof v === 'string') { const s = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, s.length), s]); }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter(k => v[k] !== undefined)
      .sort((a, b) => { const A = Buffer.from(a), B = Buffer.from(b); return A.length - B.length || Buffer.compare(A, B); });
    return Buffer.concat([head(5, keys.length), ...keys.flatMap(k => [cbor(k), cbor(v[k])])]);
  }
  throw Error('cannot encode ' + typeof v);
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export function b32(buf) {
  let bits = 0, val = 0, s = '';
  for (const x of buf) { val = val << 8 | x; bits += 8; while (bits >= 5) { s += B32[val >>> (bits - 5) & 31]; bits -= 5; } }
  if (bits) s += B32[val << (5 - bits) & 31];
  return s;
}
const sha = b => createHash('sha256').update(b).digest();
export const cidOf = op => 'b' + b32(Buffer.concat([Buffer.from([0x01, 0x71, 0x12, 0x20]), sha(cbor(op))]));
export const didOf = genesis => 'did:plc:' + b32(sha(cbor(genesis))).slice(0, 24);
const unsigned = op => { const { sig, ...rest } = op; return rest; };

// --- keys
const CURVES = {
  secp256k1: { prefix: [0xe7, 0x01], p: 2n ** 256n - 2n ** 32n - 977n, a: 0n, b: 7n,
    n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n },
  'P-256': { prefix: [0x80, 0x24], p: 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n, a: -3n,
    b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
    n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n },
};
const mod = (a, m) => ((a % m) + m) % m;
const modpow = (b, e, m) => { let r = 1n; b = mod(b, m); while (e) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
const big = b => BigInt('0x' + Buffer.from(b).toString('hex'));
const pad32 = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');

export function keyFromDid(did) {
  if (!did.startsWith('did:key:z')) throw Error('not a base58btc did:key: ' + did);
  const raw = unb58(did.slice(9));
  for (const [crv, C] of Object.entries(CURVES)) {
    if (raw[0] !== C.prefix[0] || raw[1] !== C.prefix[1]) continue;
    if (raw.length !== 35) throw Error('expected a compressed point');
    const x = big(raw.subarray(3)), rhs = mod(x ** 3n + C.a * x + C.b, C.p);
    let y = modpow(rhs, (C.p + 1n) / 4n, C.p);           // both primes are 3 mod 4
    if (y * y % C.p !== rhs) throw Error('point not on curve');
    if (Number(y & 1n) !== (raw[2] & 1)) y = C.p - y;
    return { crv, key: createPublicKey({ key: { kty: 'EC', crv, x: pad32(x).toString('base64url'), y: pad32(y).toString('base64url') }, format: 'jwk' }) };
  }
  throw Error('unknown key type in ' + did);
}

// sig: base64url, no padding, r||s (64 bytes), s in the low half: what the PLC directory accepts
export function verifyOp(op, didKey) {
  const { crv, key } = keyFromDid(didKey);
  const sig = Buffer.from(op.sig, 'base64url');
  if (sig.length !== 64) return false;
  if (big(sig.subarray(32)) > CURVES[crv].n / 2n) return false;     // high-S is refused
  return verify('sha256', cbor(unsigned(op)), { key, dsaEncoding: 'ieee-p1363' }, sig);
}
export function signOp(op, jwk) {
  const C = CURVES[jwk.crv]; if (!C) throw Error('curve ' + jwk.crv);
  const key = createPrivateKey({ key: jwk, format: 'jwk' });
  const sig = sign('sha256', cbor(unsigned(op)), { key, dsaEncoding: 'ieee-p1363' });
  let s = big(sig.subarray(32)); if (s > C.n / 2n) s = C.n - s;     // normalise to low-S
  return { ...unsigned(op), sig: Buffer.concat([sig.subarray(0, 32), pad32(s)]).toString('base64url') };
}

// Re-verify a whole audit log (plc.directory/<did>/log/audit). Returns one line per op.
// Who signed each op isn't recorded in it: we find it by trying the keys that were allowed to,
// i.e. the rotation keys of the op it names as prev (looked up by cid, so a fork's branches each check).
// Forks: an op whose prev is not the chain's head undoes the ops after its prev. The directory allows
// that only if its signer outranks (lower index in prev's rotationKeys) the signer of the first undone
// op, and within 72 h of that op. We replay the chain with every op as written, apply each fork by
// that rule, and at the end the ops we undid must be exactly the ones the log marks nullified.
export const RECOVERY_MS = 72 * 3600 * 1000;
export function checkLog(audit) {
  const out = [], byCid = new Map(), chain = [], undone = new Set();
  const keysOf = o => o.type === 'create' ? [o.recoveryKey, o.signingKey] : (o.rotationKeys || []);
  for (const [i, e] of audit.entries()) {
    const op = e.operation, row = { i, cid: e.cid, ok: true, notes: [] };
    const legacy = op.type === 'create' && i === 0;      // pre-2023 genesis: keys are recoveryKey, signingKey
    const checked = op.type === 'plc_operation' || op.type === 'plc_tombstone' || legacy;
    if (cidOf(op) !== e.cid && checked) { row.ok = false; row.notes.push('cid mismatch: ' + cidOf(op)); }
    if (i === 0) {
      if (op.prev != null) { row.ok = false; row.notes.push('genesis has a prev'); }
      if (didOf(op) !== e.did) { row.ok = false; row.notes.push('did mismatch: ' + didOf(op)); }
    }
    const prevE = i === 0 ? null : byCid.get(op.prev);
    if (i > 0 && !prevE) { row.ok = false; row.notes.push('prev is no earlier op in this log'); }
    if (checked) {
      const allowed = i === 0 ? keysOf(op) : prevE ? keysOf(prevE.operation) : [];
      const signer = allowed.findIndex(k => { try { return verifyOp(op, k); } catch { return false; } });
      if (signer < 0) { row.ok = false; row.notes.push('no allowed rotation key verifies the sig'); }
      else row.signer = { index: signer, key: allowed[signer] };
    } else row.notes.push('type ' + op.type + ' not checked');
    if (i > 0 && prevE) {
      const at = chain.indexOf(op.prev);
      if (at < 0) { row.ok = false; row.notes.push('prev was already undone'); }
      else if (at !== chain.length - 1) {                // a fork: undo chain[at+1..]
        const firstCid = chain[at + 1], first = out[byCid.get(firstCid).i];
        const fe = audit[first.i];
        row.fork = { from: op.prev, undoes: chain.slice(at + 1) };
        if (!row.signer || !first.signer || row.signer.index >= first.signer.index) {
          row.ok = false; row.notes.push('fork signer does not outrank the signer of the op it undoes');
        }
        const dt = Date.parse(e.createdAt) - Date.parse(fe.createdAt);
        if (!(dt >= 0 && dt <= RECOVERY_MS)) {
          row.ok = false; row.notes.push(isNaN(dt) ? 'fork without createdAt: 72 h window unchecked' : 'fork outside the 72 h window');
        }
        for (const c of chain.splice(at + 1)) undone.add(c);
      }
    }
    if (e.nullified) row.notes.push('nullified');
    byCid.set(e.cid, { i, operation: op });
    chain.push(e.cid); out.push(row);
  }
  for (const row of out) {
    const marked = !!audit[row.i].nullified, ours = undone.has(row.cid);
    if (marked !== ours) { row.ok = false; row.notes.push(marked ? 'marked nullified but no valid fork undid it' : 'undone by a fork but not marked nullified'); }
  }
  return out;
}
