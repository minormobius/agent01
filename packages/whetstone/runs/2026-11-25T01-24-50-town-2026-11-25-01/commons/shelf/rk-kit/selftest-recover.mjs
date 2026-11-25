// selftest for plcop.mjs + recover.mjs, offline.
// (1) a real signed log (miniphim's, saved from plc.directory 2026-11-21) re-verifies: cid, did, prev, sig.
// (2) a synthetic DID: genesis signed by a host key with ours ranked first; the host moves the PDS;
//     we sign an override with prev = genesis; the whole forked log checks, and the DID is stable.
// (3) refusals: a key not in rotationKeys signs nothing; a tampered op fails; high-S is refused.
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { checkLog, signOp, verifyOp, cidOf, didOf } from './plcop.mjs';
import { didKeyFromJwk } from './keygen.mjs';
import { recover } from './recover.mjs';
const ok = (c, m) => { if (!c) throw Error('FAIL: ' + m); n++; }; let n = 0;
const real = JSON.parse(readFileSync(new URL('./fixture-miniphim-audit.json', import.meta.url)));
ok(checkLog(real).every(r => r.ok), 'real log re-verifies');
ok(didOf(real[0].operation) === real[0].did, 'did from genesis');
const mk = () => { const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  return { jwk: privateKey.export({ format: 'jwk' }), did: didKeyFromJwk(publicKey.export({ format: 'jwk' })) }; };
for (let t = 0; t < 20; t++) {
  const me = mk(), host = mk(), stranger = mk();
  const g = signOp({ type: 'plc_operation', rotationKeys: [me.did, host.did], verificationMethods: { atproto: host.did },
    alsoKnownAs: ['at://x.test'], services: { atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://old.test' } }, prev: null }, host.jwk);
  const T = Date.parse('2026-11-01T00:00:00Z'), at = h => new Date(T + h * 3600e3).toISOString();
  const did = didOf(g), e0 = { did, operation: g, cid: cidOf(g), nullified: false, createdAt: at(0) };
  const h1 = signOp({ ...g, services: { atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://hostile.test' } }, prev: e0.cid }, host.jwk);
  const log = [e0, { did, operation: h1, cid: cidOf(h1), nullified: false, createdAt: at(1) }];
  ok(checkLog(log).every(r => r.ok), 'synthetic log checks');
  const r = recover(log, me.jwk, { prev: e0.cid, pds: 'https://mine.test' });
  ok(r.rank === 0 && r.overrides[0] === log[1].cid, 'override targets the host op');
  ok(verifyOp(r.op, me.did) && !verifyOp(r.op, host.did), 'signed by us, not the host');
  const forked = [e0, { ...log[1], nullified: true }, { did, operation: r.op, cid: r.cid, nullified: false, createdAt: at(30) }];
  ok(checkLog(forked).every(x => x.ok), 'forked log checks with our op live');
  // forged forks: each must fail somewhere in the log
  const bad = l => !checkLog(l).every(x => x.ok);
  ok(bad([e0, log[1], forked[2]]), 'fork whose undone op is not marked nullified');
  ok(bad([e0, { ...log[1], nullified: true }, { ...forked[2], createdAt: at(74) }]), 'fork after 72 h');
  ok(bad([e0, { ...log[1], nullified: true }, { ...forked[2], createdAt: undefined }]), 'fork without createdAt');
  ok(bad([e0, { ...log[1], nullified: true }]), 'nullified with no fork');
  const m1 = signOp({ ...g, services: { atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://me.test' } }, prev: e0.cid }, me.jwk);
  const h2 = signOp({ ...g, services: { atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://hostile2.test' } }, prev: e0.cid }, host.jwk);
  ok(bad([e0, { did, operation: m1, cid: cidOf(m1), nullified: true, createdAt: at(1) }, { did, operation: h2, cid: cidOf(h2), nullified: false, createdAt: at(2) }]),
    'host (rank 1) cannot fork away our rank-0 op');
  let threw = false; try { recover(log, stranger.jwk, {}); } catch { threw = true; } ok(threw, 'stranger key refused');
  ok(!verifyOp({ ...r.op, alsoKnownAs: ['at://evil.test'] }, me.did), 'tamper fails');
  const s = Buffer.from(r.op.sig, 'base64url'), N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const hi = (N - BigInt('0x' + s.subarray(32).toString('hex'))).toString(16).padStart(64, '0');
  ok(!verifyOp({ ...r.op, sig: Buffer.concat([s.subarray(0, 32), Buffer.from(hi, 'hex')]).toString('base64url') }, me.did), 'high-S refused');
}
console.log(`selftest-recover ok: ${n} checks (real log, 20 synthetic DIDs with a host override undone)`);
