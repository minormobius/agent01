// Passive clock-skew probe for Lucy's question (BOARD line 18).
// Listens to subscribeRepos on a PDS for N seconds. For each #commit:
//   pds_lag  = local receive time - commit.time        (PDS stamp vs our clock + transit)
//   rec_lag  = commit.time - record.createdAt           (client stamp vs PDS stamp)
// Usage: node skew.mjs [host=pds.delve.town] [seconds=120]
// No libraries: minimal DAG-CBOR + CAR reader below.
const host = process.argv[2] || 'pds.delve.town';
const secs = +(process.argv[3] || 120);

function cbor(buf, pos = 0) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  function arg(ai) {
    if (ai < 24) return ai;
    if (ai === 24) return buf[pos++];
    if (ai === 25) { const v = dv.getUint16(pos); pos += 2; return v; }
    if (ai === 26) { const v = dv.getUint32(pos); pos += 4; return v; }
    if (ai === 27) { const v = Number(dv.getBigUint64(pos)); pos += 8; return v; }
    throw new Error('cbor ai ' + ai);
  }
  function item() {
    const b = buf[pos++], mt = b >> 5, ai = b & 31;
    if (mt === 7) {
      if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null;
      if (ai === 27) { const v = dv.getFloat64(pos); pos += 8; return v; }
      throw new Error('simple ' + ai);
    }
    const n = arg(ai);
    switch (mt) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { const v = buf.subarray(pos, pos + n); pos += n; return v; }
      case 3: { const v = new TextDecoder().decode(buf.subarray(pos, pos + n)); pos += n; return v; }
      case 4: { const a = []; for (let i = 0; i < n; i++) a.push(item()); return a; }
      case 5: { const o = {}; for (let i = 0; i < n; i++) { const k = item(); o[k] = item(); } return o; }
      case 6: { const v = item(); return n === 42 ? { $cid: v } : v; }
    }
  }
  const v = item();
  return [v, pos];
}
function varint(buf, pos) { let x = 0, s = 0, b; do { b = buf[pos++]; x += (b & 127) * 2 ** s; s += 7; } while (b & 128); return [x, pos]; }
function hex(u8) { return Buffer.from(u8).toString('hex'); }
function carBlocks(car) {
  const m = new Map(); let [hl, p] = varint(car, 0); p += hl;
  while (p < car.length) {
    const [len, q] = varint(car, p); const end = q + len;
    // CIDv1: version, codec, multihash(code, len, digest)
    let r = q; let v, c, h, l; [v, r] = varint(car, r); [c, r] = varint(car, r); [h, r] = varint(car, r); [l, r] = varint(car, r); r += l;
    m.set(hex(car.subarray(q, r)), car.subarray(r, end)); p = end;
  }
  return m;
}

const rows = [];
const ws = new WebSocket(`wss://${host}/xrpc/com.atproto.sync.subscribeRepos`);
ws.binaryType = 'arraybuffer';
ws.onmessage = (ev) => {
  const recv = Date.now();
  const u8 = new Uint8Array(ev.data);
  try {
    const [hdr, p] = cbor(u8); const [body] = cbor(u8, p);
    if (hdr.t !== '#commit') return;
    const t = Date.parse(body.time);
    let created = null, coll = null;
    const op = (body.ops || []).find(o => o.action === 'create' && o.cid);
    if (op && body.blocks) {
      coll = op.path.split('/')[0];
      const key = hex(op.cid.$cid.subarray(1)); // strip 0x00 multibase prefix
      const blk = carBlocks(body.blocks).get(key);
      if (blk) { const [rec] = cbor(blk); if (rec && typeof rec.createdAt === 'string') created = Date.parse(rec.createdAt); }
    }
    rows.push({ seq: body.seq, coll, pds_lag: recv - t, rec_lag: created == null ? null : t - created });
  } catch (e) { rows.push({ err: String(e) }); }
};
ws.onerror = (e) => { console.error('ws error', e.message || e); };
setTimeout(() => {
  ws.close();
  const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : null; };
  const sum = (a) => a.length ? { n: a.length, min: Math.min(...a), p10: q(a, .1), p50: q(a, .5), p90: q(a, .9), max: Math.max(...a) } : { n: 0 };
  const pl = rows.filter(r => r.pds_lag != null).map(r => r.pds_lag);
  const rl = rows.filter(r => r.rec_lag != null && !isNaN(r.rec_lag)).map(r => r.rec_lag);
  const out = { host, secs, at: new Date().toISOString(), commits: rows.length, errors: rows.filter(r => r.err).length,
    pds_lag_ms: sum(pl), rec_lag_ms: sum(rl),
    collections: Object.entries(rows.reduce((o, r) => (r.coll && (o[r.coll] = (o[r.coll] || 0) + 1), o), {})) };
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}, secs * 1000);
