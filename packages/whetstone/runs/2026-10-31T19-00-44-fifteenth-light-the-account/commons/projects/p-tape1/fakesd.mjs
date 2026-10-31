// fakesd.mjs — the lab's SD card and flash as SPEC describes them, for our tests. (Modulo, tape day 1)
//
// makeSD(files = {}, { cutAt }) : files is { path: text }; folders are implied by paths, and
// `dirs` may list empty ones. Every mutating call is one step (sd.steps counts them). When
// sd.cutAt === sd.steps at a call, power fails there: write/append leave the first half
// (floor(len/2)) of their text, rename/remove do nothing, and the call throws PowerCut.
// list() returns names in an order scrambled by a seed, because the spec promises no order.
export class PowerCut extends Error { constructor() { super('power cut'); this.name = 'PowerCut'; } }

export function makeSD(files = {}, { dirs = [], cutAt = -1, seed = 7 } = {}) {
  const f = new Map(Object.entries(files));
  const d = new Set(dirs);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const norm = (p) => p.replace(/\/+$/, '');
  const isDir = (p) => { p = norm(p); if (d.has(p)) return true; for (const k of f.keys()) if (k.startsWith(p + '/')) return true; for (const k of d) if (k.startsWith(p + '/')) return true; return false; };
  const sd = {
    files: f, steps: 0, cutAt,
    _step() { const n = sd.steps++; if (n === sd.cutAt) return true; return false; },
    list(dir) {
      dir = norm(dir); const out = new Set();
      for (const k of [...f.keys(), ...d]) if (k.startsWith(dir + '/')) out.add(k.slice(dir.length + 1).split('/')[0]);
      const a = [...out];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
    isDir,
    read(p) { return f.has(p) ? f.get(p) : null; },
    write(p, text) { if (sd._step()) { f.set(p, text.slice(0, Math.floor(text.length / 2))); throw new PowerCut(); } f.set(p, text); },
    append(p, text) { const old = f.get(p) ?? ''; if (sd._step()) { f.set(p, old + text.slice(0, Math.floor(text.length / 2))); throw new PowerCut(); } f.set(p, old + text); },
    rename(a, b) { if (sd._step()) throw new PowerCut(); if (!f.has(a)) throw new Error('ENOENT ' + a); f.set(b, f.get(a)); f.delete(a); },
    remove(p) { if (sd._step()) throw new PowerCut(); f.delete(p); },
  };
  return sd;
}

export function makeFlash(value = null) {
  let v = value === null ? null : JSON.parse(JSON.stringify(value));
  return { get: () => (v === null ? null : JSON.parse(JSON.stringify(v))), set: (x) => { v = JSON.parse(JSON.stringify(x)); } };
}
