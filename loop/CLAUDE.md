# loop — loop.mino.mobi

The public viewing surface for the agent loop: the ticket graph it reasons over,
the ready queue, the governor, and the quality-against-turn-count curve.

**The architecture this displays is [`docs/LOOPS.md`](../docs/LOOPS.md). The
programme it serves is [`docs/CLOSED-LOOP.md`](../docs/CLOSED-LOOP.md).** Read
LOOPS.md before changing anything under `.github/loop/` — this directory is only
the window.

## Facts

| | |
|---|---|
| Surface | `loop` |
| Dir | `loop/` |
| Endpoint | `loop.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/loop-graph-ticketing-surface-7qxu7c` |
| Deploy | [`.github/workflows/deploy-loop.yml`](../.github/workflows/deploy-loop.yml) |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "loop"`.

## The domain, and what the first deploy proved

`loop.mino.mobi` did not resolve before this surface existed — checked from the
sandbox with sibling hosts on the same zone answering 200, so it was the domain
and not the network. **The first deploy created it**, from the `routes[]`
declaration in `wrangler.jsonc`: run `30875224557` logged

```
Deployed loop triggers (1.65 sec)
  loop.mino.mobi (custom domain)
```

and the site now answers `/health` with 200.

That corrects an over-reading of [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7,
which lists "attach / detach custom domains" as dashboard-only. That holds for
*detaching* and for moving a domain between workers; a **new** hostname on a
zone already in the account is created by the deploy. Recorded as a finding in
the ledger so the next surface does not plan around a step it does not need.

**The first run's symptoms were misleading and only a first run sees them.** DNS
took ~10s to resolve, and Cloudflare then served error 1104 for a few minutes
while the certificate was issued: verify attempts 1–2 got NXDOMAIN, 3–5 got 500,
and the site was fine minutes later. That is provisioning, not a binding
failure. The verify step is no longer `continue-on-error`, so from here a
failure means a real unbinding.

Golden rule as it applies here: the honest check is the **wrangler log line**,
not the curl. If a deploy only mentions `loop.workers.dev`, the domain has been
detached and the live site is not this code.

## The two trees, and why they are separate

```
.github/loop/     the LEDGER — not served to the internet
loop/             the VIEW   — served, generated from the ledger
```

The root worker serves `assets.directory: "."`, so the repo root is
internet-facing — but `.github/` is not part of that, which is the same reason
the ideas bot keeps its state there
([`docs/IDEAS-BOT.md`](../docs/IDEAS-BOT.md)).

The split is not tidiness. **An autonomous loop writes its own ledger.** If the
ledger were served directly, every bead body an agent composed would be public
the instant it was written, and the loop would hold a direct write path to a
public page. Instead `scripts/gen-loop-data.mjs` derives `loop/data/graph.json`,
and *that* commit is what deploys. Publishing stays a separate, reviewable act.

`preflight` asserts the two agree — a hand-edited view, or a ledger change
committed without regenerating, would leave the page showing a graph that is not
the graph the scheduler reads. That divergence is invisible from outside: the
page still renders, it is just wrong.

## Files

| File | What it is |
|---|---|
| `index.html` | the whole site — one file, no build step, no dependencies |
| `worker.js` | thin router: `/api/graph.json` (CORS-open), `/health`, else static assets |
| `wrangler.jsonc` | worker `loop`, custom domain `loop.mino.mobi` |
| `data/graph.json` | **generated** — `node scripts/gen-loop-data.mjs --write` |

`data/graph.json` is in the `GENERATED` table in `scripts/preflight.mjs`. Never
edit it; `preflight --fix` rebuilds it.

## `/health` says more than "I am up"

It reports whether the loop is enabled, how many beads are in what state, how
many turns have been recorded, whether the judge is calibrated, and whether the
graph is coherent — returning 503 when it is not.

That is deliberate. `workers/cron` was deployed, answered `/health`, and
dispatched **nothing for its entire life** because a token was never set. A
health endpoint that only says "I am up" is the golden rule's lesson wearing
different clothes: **green is not proof, and neither is deployed.**

## Things that will look like bugs and are not

- **The curve is empty.** No turn has run. The panel says so in words rather
  than drawing an axis with nothing on it, and it will stay empty until
  `.github/loop/runs.jsonl` holds real measurements. A seeded example curve on a
  public page is indistinguishable from a measured one to everyone except
  whoever seeded it.
- **The status pill says "loop disabled".** That is the default and it is
  correct. `enabled` in `.github/loop/config.json` is the master switch, off
  until someone signs the commit that turns it on.
- **The judge reports "NO — scores are not a measurement yet".** Also correct:
  `judge.calibrated` is false, so `loop-judge.yml` records the probe signal and
  withholds a score rather than inventing one. An uncalibrated judge is a
  number, not a measurement.
- **Beads marked `proposed` never enter the queue.** By design. Promotion is a
  decision; a loop that promotes its own proposals has no gate at all.

## The overview strip is derived from the FILESYSTEM

The panel at the top of the page reports progress against the **oracle stack**
(`foam/FACTORIO.md` §2) — seven machine checks the game must pass — and each one
is marked built by asking whether its checker exists on disk. Not a
hand-maintained list, because a progress dashboard that can claim something the
repo does not have is worse than none.

It is the oracle stack rather than turn count or bead count on purpose. A loop
can run a hundred green turns refining what it already had; this one did, and
`lp-ec52ed` records why it was structurally unable to do anything else. **A gate
coming into existence is the only number here that means the system can now
build something it previously could not.**

## Changing the page

No build step and no dependencies — the house rule. `index.html` carries its own
CSS and JS inline and renders both themes via `prefers-color-scheme`. The DAG is
laid out from the `layers` array the generator computes (longest-path layering),
drawn as plain SVG; a real layout engine would be more code than it saves at
this size, and there is nothing here to put one behind.

If you change the payload shape, change `scripts/gen-loop-data.mjs` and
`scripts/lib/beads.mjs` together, run `node scripts/beads.selftest.mjs`, and
regenerate.
