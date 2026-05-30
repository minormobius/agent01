// engine.js — browser glue for the splice WASM engine (splice/engine, Rust).
//
// ABI: each op takes one `|`-delimited UTF-8 string (written into linear
// memory via walloc) and returns a packed u64 = (ptr<<32)|len pointing at a
// UTF-8 result that we read and then wfree. Inputs are freed after the call.
//
// Reusable by the workbench *and* the future game layers.

let ex = null;
const enc = new TextEncoder();
const dec = new TextDecoder();

export async function loadEngine(url = './splice_engine.wasm') {
  // The module is ~60 KB; skip streaming to avoid MIME-type fragility.
  const buf = await (await fetch(url)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(buf, {});
  ex = instance.exports;
  return true;
}

function mem() { return new Uint8Array(ex.memory.buffer); }

function call(fn, str) {
  const bytes = enc.encode(str);
  const p = ex.walloc(bytes.length || 1);
  mem().set(bytes, p);
  const packed = BigInt.asUintN(64, ex[fn](p, bytes.length));
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  const result = dec.decode(mem().slice(outPtr, outPtr + outLen));
  ex.wfree(outPtr, outLen);
  ex.wfree(p, bytes.length || 1);
  return result;
}

// Timed call: returns { value, ms }.
function timed(fn, str, parse) {
  const t0 = performance.now();
  const raw = call(fn, str);
  const ms = performance.now() - t0;
  return { value: parse ? JSON.parse(raw) : raw, ms };
}

const c = (b) => (b ? '1' : '0');

export const Engine = {
  ready: () => ex !== null,
  revcomp:     (seq)                 => timed('revcomp_w', seq, false),
  translate:   (seq, frame = 1)      => timed('translate_w', `${frame}|${seq}`, false),
  orfs:        (seq, minAa = 30)     => timed('orfs_w', `${minAa}|${seq}`, true),
  restriction: (seq, circ)           => timed('restriction_w', `${c(circ)}|${seq}`, true),
  digest:      (seq, enzymes, circ)  => timed('digest_w', `${c(circ)}|${enzymes.join(',')}|${seq}`, true),
  pcr:         (seq, fwd, rev, circ) => timed('pcr_w', `${c(circ)}|${fwd}|${rev}|${seq}`, true),
  clone:       (vector, insert, enzymes, vCirc, iCirc) =>
                 timed('clone_w', `${c(vCirc)}|${c(iCirc)}|${enzymes.join(',')}|${vector}|${insert}`, true),
  // melting temperature (°C), SantaLucia NN. dnaNm=strand conc, naMm=monovalent salt.
  tm:          (seq, dnaNm = 50, naMm = 50) => timed('tm_w', `${dnaNm}|${naMm}|${seq}`, true),
  // design fwd/rev primers to amplify template[start..end] near targetTm.
  design:      (template, start, end, targetTm = 60, { naMm = 50, dnaNm = 50, minLen = 18, maxLen = 28 } = {}) =>
                 timed('design_w', `${start}|${end}|${targetTm}|${naMm}|${dnaNm}|${minLen}|${maxLen}|${template}`, true),
  // score a single candidate primer (same metrics the designer uses).
  score:       (seq, targetTm = 60, naMm = 50, dnaNm = 50) => timed('score_w', `${targetTm}|${naMm}|${dnaNm}|${seq}`, true),
  // directed evolution: fitness of a genome against a goals spec, and one
  // generation of synonymous-mutant offspring (protein preserved).
  fitness:     (seq, goals) => timed('fitness_w', `${goals}|${seq}`, true),
  breed:       (seq, goals, offspring = 24, mutRate = 2, seed = 1) =>
                 timed('breed_w', `${goals}|${offspring}|${mutRate}|${seed}|${seq}`, true),
  // gel electrophoresis: migrate a CSV of fragment tokens (bp, or bp:sc/bp:nick)
  // under the given run conditions -> per-band migration fraction + dye front.
  gel:         (fragsCsv, voltage = 100, agarose = 1.0, minutes = 45, gelLen = 8) =>
                 timed('gel_w', `${voltage}|${agarose}|${minutes}|${gelLen}|${fragsCsv}`, true),

  // raw single call without timing wrapper, for tight benchmark loops
  _raw: call,
};
