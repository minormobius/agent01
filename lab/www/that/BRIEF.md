# BRIEF — that / "Shepherd"

## What this is

`.github/lab-requests/that.json` has a `task` field that is literally just
"Build that" with no embedded thread text — unlike sibling request files
(`site.json`, `read-this.json`) which have the full quoted conversation baked
into their `task`/`refs_from` fields. That, plus the top-of-prompt instructions
promising "three labelled blocks" of thread content that never showed up in
this turn's context, means **the actual thread content did not reach me.** I
have no network tools and nothing in the repo caches this specific thread, so
I could not read what "that" refers to directly.

I did resolve the *shape* of the request from local evidence:
- `root_uri`/`thread_root` in `that.json` is
  `at://did:plc:gd6m4mw3km2betcnbbs6362q/.../3mrxdccbtil2k` —
  `gd6m4mw3km2betcnbbs6362q` is the **bot's own DID** (confirmed against every
  `posted.uri` author in `.github/ideas/queue.jsonl`).
- `parent_uri` is authored by `did:plc:7zre4plmd5jllccww575j6sb`, which is
  **minormobius.bsky.social's own DID** (confirmed via `read-this.json`, where
  a post from that DID is quoted attributed to `@minormobius.bsky.social`, and
  via `bisk/config.json`'s `houseDomains`).
- So this is the exact shape of the `concourse` precedent in the requester's
  profile (`lab/_profiles/minormobius.bsky.social.md`): the bot posts an
  arXiv-mined concept advert under its own account, and this requester replies
  "build that" or "build it" directly, with nothing else in the thread to quote
  — which is exactly why `that.json` has no embedded context, unlike the
  richer request files.
- `site.json` (an earlier, otherwise-identical request from this requester)
  has `root_uri` pointing at a `queue.jsonl` entry's `posted.uri` **exactly**
  (`concourse`, `3mrt5xsncnp23`) — so `root_uri` directly names a queue entry.

Problem: `3mrxdccbtil2k` (this request's root) does not appear as a `posted.uri`
anywhere in the `queue.jsonl` on this branch — the ledger here only has posts up
to `2026-07-31T04:01:20Z` (item 16, "reciprocity"), and the request came in at
`2026-07-31T16:41:35Z`, ~12.5 hours later. Per the merge notes
(`docs/MERGE-NOTES-lab-factory.md`), this ideas ledger is **live operational
state that lives on the bot's own branch**, and this checkout is very likely
stale relative to it — the posts made in that 12.5-hour gap (hourly cadence)
just aren't in this snapshot.

**I picked `unseen-planet` (queue item 28, arXiv 2607.27186, "An Inclined,
Eccentric Planet and an Inner Debris Disk Could Reproduce AU Mic Structure")
as my best guess**, by extrapolating the hourly posting cadence forward from
the last confirmed post (04:01) to the request time (16:41) — that lands on
the ~16:01 post, which by queue order is item 28. This is a **timing guess, not
a confirmed match** — treat it as low-to-medium confidence.

**If the next agent has real thread access and the concept is something else
entirely, this whole build is answering the wrong question — check the actual
thread FIRST before doing anything else with this directory.**

## What shipped

Turn one of the `unseen-planet` concept's own plan, built close to its literal
spec: five sliders (planet mass, semi-major axis, eccentricity, inclination,
stellar-wind height threshold) drive a simplified periodic-kick particle sim of
a debris ring, rendered edge-on in three.js, live, with pause and regenerate
controls. No target/overlay/closeness-score (that's the concept's own turn
two).

## Decisions

- **Fixed argument of periapsis at the x-axis, so disk-plane crossings land
  exactly at periapsis and apoapsis.** This wasn't arbitrary: with the planet's
  orbital plane tilted about the x-axis, `z = 0` exactly when `sin(true anomaly)
  = 0`, i.e. at ν=0 (periapsis) or ν=π (apoapsis) — for free, with no extra
  slider. That means the two disk-crossings automatically have maximally
  different strengths (kick ∝ 1/r²at crossing, and r is a(1-e) vs a(1+e)), which
  is exactly the asymmetry the paper is about, and it ties directly to the
  eccentricity slider with no invented parameter. Don't add an "argument of
  periapsis" slider without re-deriving this; it was cheap because of the
  fixed orientation.
- **Kept to 5 sliders, no leaderboard/target overlay** — the concept's own plan
  text explicitly defers those to turn two.
- **No sign-in / pds.js** — this toy has no state worth saving yet (no
  submitted designs, no scores), so per the kit's own rule ("sign-in optional
  unless the site is meaningless without it") it was skipped entirely for now.
- **Didn't import kit.js** — nothing here needs `bskyGet`/`handleInput`/etc.,
  only `tokens.css` for the shared look.

## The plan (if `unseen-planet` is confirmed correct)

1. **Verify the guess first.** Once the thread is readable, confirm the concept
   actually was `unseen-planet` before doing anything else. If wrong, this
   entire file/build is a detour — read the real thread and start over; do not
   try to retrofit the wrong concept onto the right request.
2. **Tune the untested constants.** `KICK_BASE`, `CAPTURE_A`/`CAPTURE_R`,
   `SPRING_K`/`GAMMA`, `WIND_RATE` in the `<script>` were picked by hand-worked
   estimate (shown in-file), never run in a real browser. Load it, watch
   whether the periapsis-side clump is legible and the apoapsis side visibly
   calmer across the slider ranges, and retune the constants at the top of the
   script — they're grouped together for exactly this.
3. **Turn two, per the concept's own plan**: overlay the paper's real imaged
   clump pattern (the "target") faintly, from the same edge-on angle, and add a
   closeness score once the base sim reads correctly.
4. **If the guess is wrong**, keep the three.js/edge-on-disk plumbing if the
   real concept turns out to be a different debris/orbital-dynamics toy from
   the same queue — items 20 (`drift-diffuse`), 28 (this one) and others share
   the "tune a physical system, watch a trace" shape and much of this harness
   (camera setup, Points-buffer update loop) would carry over.

## Gotchas

- `that.json`'s `task` field carries **no thread text at all**, unlike every
  other `.github/lab-requests/*.json` I checked — don't assume a thin `task`
  field means a thin request; check whether `root_uri`/`parent_uri` point at
  content that should have been fetched but wasn't.
- `.github/ideas/queue.jsonl` on this checkout is **frozen at whatever the
  branch last saw** — per `docs/MERGE-NOTES-lab-factory.md` this ledger lives
  on the bot's own branch and is live operational state, so a `posted.uri`
  absence here does not mean a concept was never posted, only that it wasn't
  posted *before this checkout's snapshot*.
