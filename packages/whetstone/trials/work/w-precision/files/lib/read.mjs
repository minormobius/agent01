// read.mjs — one session file into cycles.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export function readSession(path) {
  const [head, ...rows] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  const cycles = rows.filter(Boolean).map((r) => {
    const v = Object.fromEntries(r.split(',').map((x, i) => [cols[i], x]));
    return { t: Number(v.t), kind: v.kind, a: Number(v.a), b: Number(v.b) };
  });
  return { session: basename(path).replace(/\.csv$/, ''), cycles };
}
