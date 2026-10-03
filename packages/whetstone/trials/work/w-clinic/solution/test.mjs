import { median, summarize, parse } from './dashboard.mjs';
let bad = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
eq('median of odd count', median([3, 1, 2]), 2);
eq('median of one', median([7]), 7);
eq("median of even count", median([10, 2, 30, 4]), 7);
eq('one seen visit on a Wednesday', summarize(parse('id,signed_in,seen_at\n1,2026-03-04 09:00,2026-03-04 09:12\n')),
  [{ week: '2026-03-02', visits: 1, seen: 1, walkouts: 0, median_wait_min: 12 }]);
process.exit(bad ? 1 : 0);
