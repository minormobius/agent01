// calendar.mjs — the days of a period, as YYYY-MM-DD strings (UTC, no time zones involved).
export function days(start, n) {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86400000).toISOString().slice(0, 10));
}

export const isWeekend = (day) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
