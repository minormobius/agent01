// A stand-in for the lab's SD card and the box's flash. cutAt = n makes the n-th changing
// call (0-based) fail as power does: a write/append leaves the first half of its text, a
// rename/remove does nothing, and the call throws.
export class PowerCut extends Error {}

export function makeSD(files = {}, dirs = []) {
  const f = new Map(Object.entries(files));
  const d = new Set(dirs);
  for (const p of f.keys()) addParents(p);
  function addParents(p) { const parts = p.split('/'); for (let i = 2; i < parts.length; i++) d.add(parts.slice(0, i).join('/')); }
  const sd = {
    files: f, dirs: d, steps: 0, cutAt: -1, writes: [],
    step(kind, path, half) {
      const n = sd.steps++;
      sd.writes.push([kind, path]);
      if (n === sd.cutAt) { if (half) half(); throw new PowerCut(`cut at step ${n} (${kind} ${path})`); }
    },
    list(dir) {
      const pre = dir.replace(/\/$/, '') + '/'; const out = new Set();
      for (const p of [...f.keys(), ...d]) if (p.startsWith(pre)) { const rest = p.slice(pre.length); if (rest) out.add(rest.split('/')[0]); }
      return [...out].reverse(); // "no particular order"
    },
    isDir(p) { return d.has(p); },
    read(p) { return f.has(p) ? f.get(p) : null; },
    write(p, text) { sd.step('write', p, () => { f.set(p, text.slice(0, text.length >> 1)); addParents(p); }); f.set(p, text); addParents(p); },
    append(p, text) { const old = f.get(p) ?? ''; sd.step('append', p, () => { f.set(p, old + text.slice(0, text.length >> 1)); addParents(p); }); f.set(p, old + text); addParents(p); },
    rename(a, b) { sd.step('rename', a); if (f.has(a)) { f.set(b, f.get(a)); f.delete(a); } },
    remove(p) { sd.step('remove', p); f.delete(p); },
    snapshot() { return JSON.stringify([...f.entries()].sort()); },
  };
  return sd;
}

export function makeFlash(init = null) {
  let v = init === null ? null : JSON.parse(JSON.stringify(init));
  return { get: () => (v === null ? null : JSON.parse(JSON.stringify(v))), set: (x) => { v = JSON.parse(JSON.stringify(x)); }, peek: () => v };
}

// A household SD card: books are folders of tracks.
export function library(books, extra = {}) {
  const files = { ...extra };
  for (const [name, n] of Object.entries(books)) for (let i = 1; i <= n; i++) files[`/tape/audio/${name}/${String(i).padStart(2, '0')}.m4a`] = 'audio';
  return files;
}
