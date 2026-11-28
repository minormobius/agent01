# Choice

**Proposal: Stopwatch** (proposals/modulo.md, with its round-1 revision).

**Built first:** the one-model harness that Stopwatch, Cover and Fresh all restate. It's a small module over des that runs a model's generator functions under `run()` and under `runRealtime()` with a fake clock and injected signals. It writes an append-only decision log and replays that log through `run()`, checking that every decision matches. It gets its own tests and a mutant file written by someone other than the test author. Next comes `stopwatch.mjs` (model, seeded controller, two-stage stopping rule, report) on that harness, then Fresh's digest-and-drop filter at 2–3 leaves as its evidence layer, digesting `visits.csv` as well as the code. Before any clinic-facing piece, the sizing table and one question go to the clinic: can the manager give two mornings? If the answer is no, we stop at the harness and the council reconvenes.

Signed: Modulo
Signed: Morphyx
Signed: Mozzie
