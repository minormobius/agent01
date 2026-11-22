// rk-kit/recover.mjs — sign a PLC operation with your own rotation key, no PDS in the loop.
// Usage:
//   node recover.mjs <did> <my.jwk> [--pds https://new.host] [--handle at://you.new.host]
//                    [--rotation did:key:A,did:key:B] [--signing did:key:…] [--log audit.json] [--submit]
// It reads <did>'s audit log (or --log, a saved copy), re-verifies the whole chain (plcop.checkLog),
// takes the newest op as the base, applies your changes, signs with my.jwk, and checks the result:
// your key must be in the base op's rotationKeys, and the new sig must verify against it.
// Without --submit it only prints the op (dry run). With --submit it POSTs it to plc.directory.
// The 72 h rule: a key ranked higher in rotationKeys can override ops signed by a lower one,
// within 72 h of them. To undo a host's op, sign with prev = the op *before* it (--prev <cid>).
import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { checkLog, signOp, verifyOp, cidOf } from './plcop.mjs';
import { didKeyFromJwk } from './keygen.mjs';

const DIR = 'https://plc.directory';
export function buildOp(base, prevCid, ch = {}) {
  const op = {
    type: 'plc_operation',
    rotationKeys: ch.rotation ?? base.rotationKeys,
    verificationMethods: ch.signing ? { ...base.verificationMethods, atproto: ch.signing } : base.verificationMethods,
    alsoKnownAs: ch.handle ? [ch.handle] : base.alsoKnownAs,
    services: ch.pds ? { ...base.services, atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: ch.pds } } : base.services,
    prev: prevCid,
  };
  if (!op.rotationKeys.length || op.rotationKeys.length > 5) throw Error('rotationKeys must hold 1 to 5 keys');
  return op;
}

export function recover(audit, jwk, ch = {}) {
  const rows = checkLog(audit);
  const broken = rows.filter(r => !r.ok);
  if (broken.length) throw Error('the log itself does not verify: ' + JSON.stringify(broken));
  const live = audit.filter(e => !e.nullified);
  const at = ch.prev ? live.findIndex(e => e.cid === ch.prev) : live.length - 1;
  if (at < 0) throw Error('prev ' + ch.prev + ' is not a live op in this log');
  const base = live[at].operation;
  const mine = didKeyFromJwk(createPublicKey({ key: jwk, format: 'jwk' }).export({ format: 'jwk' }));
  const rank = base.rotationKeys.indexOf(mine);
  if (rank < 0) throw Error(`${mine} is not in rotationKeys at ${live[at].cid}; this key can sign nothing for this DID`);
  const op = signOp(buildOp(base, live[at].cid, ch), jwk);
  if (!verifyOp(op, mine)) throw Error('signed op does not verify against your own key');
  return { op, cid: cidOf(op), signer: mine, rank, overrides: live.slice(at + 1).map(e => e.cid) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [did, jwkFile, ...rest] = process.argv.slice(2);
  if (!did || !jwkFile) { console.error('usage: node recover.mjs <did> <my.jwk> [--pds URL] [--handle at://…] [--rotation k1,k2] [--signing did:key] [--prev cid] [--log file] [--submit]'); process.exit(2); }
  const flag = n => { const i = rest.indexOf('--' + n); return i < 0 ? undefined : rest[i + 1]; };
  const audit = flag('log') ? JSON.parse(readFileSync(flag('log'))) : await (await fetch(`${DIR}/${did}/log/audit`)).json();
  const ch = { pds: flag('pds'), handle: flag('handle'), signing: flag('signing'), prev: flag('prev'),
    rotation: flag('rotation')?.split(',') };
  const r = recover(audit, JSON.parse(readFileSync(jwkFile, 'utf8')), ch);
  console.log(JSON.stringify(r.op, null, 2));
  console.error(`signed by ${r.signer} (rank ${r.rank}); cid ${r.cid}` + (r.overrides.length ? `; would override ${r.overrides.join(', ')} if within 72 h and outranked` : ''));
  if (rest.includes('--submit')) {
    const res = await fetch(`${DIR}/${did}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r.op) });
    console.error('plc.directory:', res.status, await res.text());
    process.exit(res.ok ? 0 : 1);
  } else console.error('dry run: nothing sent. Add --submit to send it.');
}
