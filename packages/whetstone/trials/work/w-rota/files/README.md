# rota — the clinic shift rota

    node cli.mjs people.json 2026-11-02 28

prints the rota as JSON, one key per date, each a list of two names:

    {"2026-11-02":["Ana","Bea"],"2026-11-03":[...], ...}

It must follow POLICY.md. It exits non-zero with a message on stderr if no rota can be made.
`node test.mjs` runs the tests. Code: `lib/people.mjs` (load and validate the team),
`lib/calendar.mjs` (dates), `lib/assign.mjs` (who works when), `cli.mjs`.
