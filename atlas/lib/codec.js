// codec.js — the wire format for atlas geometry. Shared by the ETL (node) and
// the browser renderer, so encode and decode can never drift apart.
//
// WHY NOT PLAIN TOPOJSON: the payload is a few hundred thousand small integer
// deltas. As JSON text that is ~9 bytes each, most of it punctuation. Zigzag
// varints put the same numbers in ~1.2 bytes, base64 gives back a third of that
// and the result still compresses, so the county layer lands in a fraction of
// the JSON size and parses without building a million throwaway arrays.
//
// FORMAT (self-describing, `encoding: "zzvb64"`):
//   arcs      base64 of a byte stream: for each arc, varint(pointCount), then
//             pointCount x (zigzag-varint dx, zigzag-varint dy), the first pair
//             absolute and the rest deltas.
//   refs etc. base64 of: varint(count), then count x zigzag-varint. TopoJSON's
//             ~i convention for a reversed arc survives the zigzag unchanged.
// Coordinates are integers on a `quantization`-step grid; `transform`
// {scale, translate} maps them back to lon/lat exactly as TopoJSON does.

/* global globalThis */
(function (root) {
  'use strict';

  // ------------------------------------------------------------- varints ---

  // Zigzag and varint in ARITHMETIC, not bit operations. JavaScript's bitwise
  // operators coerce to signed 32-bit, so the usual `(v << 1) ^ (v >> 31)`
  // silently returns garbage at the ends of the int32 range — the arc indices
  // and quantized coordinates here never get near it, but a codec that is only
  // correct on the inputs it happens to see is a trap for whoever reuses it.
  function writeVarint(out, v) {
    while (v > 0x7f) { out.push((v % 128) | 0x80); v = Math.floor(v / 128); }
    out.push(v);
  }
  const zig = (v) => (v < 0 ? -(v + 1) * 2 + 1 : v * 2);   // signed -> unsigned
  const zag = (u) => (u % 2 ? -((u - 1) / 2) - 1 : u / 2);

  function bytesToB64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const reader = (bytes) => {
    let p = 0;
    return () => {
      let v = 0, mul = 1, c;
      do { c = bytes[p++]; v += (c & 0x7f) * mul; mul *= 128; } while (c & 0x80);
      return v;
    };
  };

  // -------------------------------------------------------------- encode ---

  /** @param {Array<Array<[number,number]>>} arcs absolute quantized points */
  function encodeArcs(arcs) {
    const out = [];
    for (const a of arcs) {
      writeVarint(out, a.length);
      let px = 0, py = 0;
      for (let i = 0; i < a.length; i++) {
        writeVarint(out, zig(a[i][0] - px));
        writeVarint(out, zig(a[i][1] - py));
        px = a[i][0]; py = a[i][1];
      }
    }
    return bytesToB64(Uint8Array.from(out));
  }

  function encodeInts(list) {
    const out = [];
    writeVarint(out, list.length);
    for (const v of list) writeVarint(out, zig(v | 0));
    return bytesToB64(Uint8Array.from(out));
  }

  // -------------------------------------------------------------- decode ---

  /**
   * Decode arcs into flat Int32Arrays - one per arc, [x0,y0,x1,y1,...] absolute.
   * Flat typed arrays rather than arrays-of-pairs: the renderer walks them once
   * per frame, and that is the difference between a smooth pan and a stutter.
   */
  function decodeArcs(b64, count) {
    const readV = reader(b64ToBytes(b64));
    const arcs = new Array(count);
    for (let i = 0; i < count; i++) {
      const n = readV();
      const pts = new Int32Array(n * 2);
      let x = 0, y = 0;
      for (let j = 0; j < n; j++) {
        x += zag(readV()); y += zag(readV());
        pts[j * 2] = x; pts[j * 2 + 1] = y;
      }
      arcs[i] = pts;
    }
    return arcs;
  }

  function decodeInts(b64) {
    const readV = reader(b64ToBytes(b64));
    const n = readV();
    const out = new Int32Array(n);
    for (let i = 0; i < n; i++) out[i] = zag(readV());
    return out;
  }

  // ------------------------------------------- topology -> atlas container --

  /**
   * Pack a TopoJSON-shaped topology (absolute arcs) into the wire format.
   * Geometries become parallel columns rather than an object graph: the browser
   * never needs the graph, only the columns, and columns of ints are what the
   * varint coder is good at.
   */
  function pack(topo, layerName) {
    const layer = topo.objects[layerName];
    const ids = [], props = [], ringStart = [], polyStart = [], refs = [];
    let ringN = 0;
    for (const g of layer.geometries) {
      polyStart.push(ringN);
      ids.push(g.id);
      props.push(g.properties || {});
      const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
      for (const poly of polys) {
        for (const ring of poly) {
          ringStart.push(refs.length);
          for (const r of ring) refs.push(r);
          ringN++;
        }
      }
    }
    polyStart.push(ringN);
    ringStart.push(refs.length);
    return {
      format: 'atlas-topology/1',
      encoding: 'zzvb64',
      layer: layerName,
      bbox: topo.bbox,
      transform: topo.transform,
      count: ids.length,
      arcCount: topo.arcs.length,
      ids,
      props,
      arcs: encodeArcs(topo.arcs),
      refs: encodeInts(refs),
      ringStart: encodeInts(ringStart),
      polyStart: encodeInts(polyStart),
    };
  }

  /** Inverse of pack: typed columns ready for the renderer. */
  function unpack(doc) {
    const index = Object.create(null);
    doc.ids.forEach((id, i) => { index[id] = i; });
    return {
      layer: doc.layer,
      bbox: doc.bbox,
      transform: doc.transform,
      ids: doc.ids,
      props: doc.props,
      index,
      arcs: decodeArcs(doc.arcs, doc.arcCount),
      refs: decodeInts(doc.refs),
      ringStart: decodeInts(doc.ringStart),
      polyStart: decodeInts(doc.polyStart),
    };
  }

  const API = { encodeArcs, decodeArcs, encodeInts, decodeInts, pack, unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_CODEC = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
