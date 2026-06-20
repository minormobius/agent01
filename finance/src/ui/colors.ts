// Stable-ish palette for regime ids, assigned by first-appearance order.
const PALETTE = [
  "#58a6ff",
  "#f85149",
  "#d29922",
  "#3fb950",
  "#d2a8ff",
  "#ff7b72",
  "#79c0ff",
  "#56d364",
];

export function regimeColorMap(names: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  names.forEach((n, i) => {
    m[n] = PALETTE[i % PALETTE.length];
  });
  return m;
}
