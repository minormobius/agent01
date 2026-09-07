/**
 * Contrast gate for lib/theme.js. Run: node bsky/lib/theme.selftest.mjs
 * A palette that cannot be read is not a palette.
 */
import { PALETTES } from './theme.js';

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

let fail = 0;
const check = (name, label, got, min) => {
  const ok = got >= min;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(8)} ${label.padEnd(18)} ${got.toFixed(2)}:1 (min ${min})`);
};

for (const [name, p] of Object.entries(PALETTES)) {
  check(name, 'text on bg', ratio(p.text, p.bg), 4.5);
  check(name, 'text on panel', ratio(p.text, p.panel), 4.5);
  check(name, 'muted on bg', ratio(p.muted, p.bg), 3);
  check(name, 'accent on bg', ratio(p.accent, p.bg), 3);
  check(name, 'dead on bg', ratio(p.dead, p.bg), 3);
}
console.log(fail ? `\n${fail} contrast failure(s)` : `\nall ${Object.keys(PALETTES).length} palettes pass`);
process.exit(fail ? 1 : 0);
