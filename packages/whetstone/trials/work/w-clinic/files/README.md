# clinic wait dashboard

`node dashboard.mjs visits.csv` prints one JSON line per week (weeks start Monday, dates are local
clinic time, no time zones involved):

    {"week":"2026-03-02","visits":41,"seen":38,"walkouts":3,"median_wait_min":17.5}

- `visits`: everyone who signed in that week.
- `seen`: those with a `seen_at`.
- `walkouts`: those who signed in and left without being seen (empty `seen_at`).
- `median_wait_min`: median of (seen_at − signed_in) in minutes over the people who were seen. With an
  even count it is the mean of the two middle values. `null` if nobody was seen.

Weeks print in date order. `node test.mjs` runs the tests.

The clinic switched from a paper sign-in sheet to a tablet on 2026-03-16. Staff say the
dashboard's numbers have looked wrong ever since.
