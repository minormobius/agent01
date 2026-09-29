# BRIEF — domain-availability ("Vacancy")

## What this is

The ask, verbatim: "domain availability. Can you build a tool that checks
domain available, and pull in whatever public info about that domain there
is. Check across a wide variety of tlds." No back-and-forth in the thread —
one message, terse, from minormobius.bsky.social.

Acceptance list, read literally:

1. Check whether a domain (name + TLD) is available.
2. Pull in whatever public info exists about that domain.
3. Do this across a wide variety of TLDs.

## The wall this hit immediately

Read the CSP in `lab/www/worker.js` before writing a line of JS.
`connect-src` is `'self' … https://auth.mino.mobi https://public.api.bsky.app
https://plc.directory https://*.host.bsky.network`. There is no WHOIS API, no
RDAP host, no DNS-over-HTTPS resolver on that list, and `img-src`/`font-src`
are equally closed — so there is no way, from this page's own JS, to ask
"is example.<tld> registered" and get a real answer. That's not a bug to
route around; the whole point of this CSP is that a lab page can only reach
what's explicitly allowed, and the operator hasn't vendored a domain-registry
API. Item 1 as a *live* check is not buildable here. I decided this was worth
saying plainly rather than faking a result — the task instructions are
explicit that faking a computed answer is the thing not to do.

## What shipped instead

**Vacancy.** Type a name, it's checked against a curated set of ~140 TLDs
across four categories (legacy, sponsored/restricted, modern gTLD, ccTLD).
For each TLD:

- Real syntax validation (label length 1–63, character set, hyphen
  placement, total length, the `xn--` punycode-prefix rule) — computed, not
  faked.
- A real eligibility flag for TLDs with well-known registration
  restrictions (.edu, .gov, .mil, .int, .aero, .coop, .museum, .post, .asia,
  .cat, .eu, .ca, .de, .us, .fr, .cn, .jp) with a one-line reason.
- Genuine static reference facts about the TLD itself (operator/region,
  category) — this is item 2, honestly scoped to "public info about the
  *TLD*" since domain-specific WHOIS (registrant, creation date, expiry) is
  exactly the live lookup that's unreachable.
- A same-tab-avoiding link that opens a **real, live WHOIS lookup** for the
  exact name+TLD at who.is, and a link to the TLD's own IANA root-zone
  record — both plain `<a href>` navigation, which the CSP does not
  restrict (only `fetch`/XHR/WebSocket are governed by `connect-src`).
  This is where "is it actually available" gets answered — the page hands
  off to something that can answer it instead of pretending to.

A banner at the top says exactly this, in plain language, before any input
box.

## Decisions

- **No handle input, no kit.handleInput, no PDS.** This tool has nothing to
  do with a Bluesky identity — there's no handle to type, nothing to save
  per-visitor. Skipping OAuth/localStorage entirely was deliberate, not an
  oversight.
- **Rejected: faking availability with a coin-flip or hash-based
  "simulated" result.** Would have satisfied the letter of the request
  while lying to whoever used it. The instructions are explicit about this
  ("never fake a result the request asks to see") and it's the single
  worst thing this build could have shipped.
- **Rejected: only listing .com/.net/.org.** The request explicitly said
  "wide variety of TLDs," so breadth of the curated set matters — ~140
  entries across legacy/sponsored/new/cc.
- Kept every TLD "fact" to things I'm confident are true and stable
  (well-documented registry purpose, long-standing eligibility rules).
  Skipped pricing entirely — it changes constantly and I have no way to
  verify current numbers from here, and a stale number reads as more
  wrong than an admitted gap.

## The plan (not built yet, in order)

1. **A real punycode encoder for non-ASCII input.** Right now a name with
   non-ASCII characters is flagged "likely needs IDN/punycode conversion"
   but not actually converted. Implementing RFC 3492 punycode in ~40 lines
   of vanilla JS is the natural next step and would let the who.is link
   carry the correct `xn--` form.
2. **Per-TLD length quirks** (a handful of ccTLDs impose their own minimum
   label length beyond the generic 1-char rule) — deliberately left out
   because I could not verify current values confidently enough to publish
   them as fact; would need a human to confirm before adding.
3. **Bulk mode** — a textarea of many names swept against a fixed shortlist
   of TLDs, for someone naming a project and wanting one page of "here's
   what to go check" instead of one name at a time.

## Verified in-browser (this turn)

Loaded under the production CSP with `mcp__eyes__look`/`drive`, no console
errors at any point:

- Desktop (1280×900): loads clean, notice banner reads correctly, form and
  controls all above the fold.
- Typed `example` → 164 TLDs render across all four category groups with
  correct counts; summary line updates correctly ("164 TLDs shown … syntax
  OK, 22 with an eligibility restriction").
- TLD filter (`io`) narrows correctly to `.solutions`, `.studio`, `.io` —
  confirmed via `eval` that the country-code group and `.io`'s full
  region/note text render, not just the visible two rows in-viewport.
- Typed `-bad-` → every row correctly flips to "syntax problem" with the
  right reason (leading/trailing hyphen), confirming the check is computed
  per keystroke, not per submit.
- "copy valid list" with an empty name → shows the inline error "type a
  name first" rather than silently doing nothing.
- "copy valid list" with a valid name → button feedback changes to
  "copied" (clipboard *read*-back isn't available in the harness, which is
  a harness permission limit, not a page bug — the write call completed
  without throwing).
- Mobile (390×844): no horizontal scroll, controls wrap into rows, each
  result stacks domain / badge / links / note cleanly, tap targets read as
  full-width and comfortably sized.
- Verified `look up`/`registry` link hrefs via `eval`:
  `https://who.is/whois/hey.com` and
  `https://www.iana.org/domains/root/db/com.html` — both real, both correct
  for the typed name.

Not verified: I did not click through an outbound link itself (no network
tools here), so I can't confirm who.is's current page shape past the URL
being well-formed.

## Gotchas for the next agent

- **connect-src is the load-bearing constraint on this whole tenant.**
  Re-read `lab/www/worker.js`'s CSP before adding *any* fetch call here —
  it will silently fail at runtime even if it looks fine in the code,
  because the CSP is enforced by the browser, not by this page.
- Outbound `<a href="https://who.is/...">` links are **not** restricted by
  `connect-src` — that directive governs `fetch`/XHR/WebSocket/EventSource,
  not navigation. This is what makes the link-out design legal under the
  same CSP that blocks a live fetch.
- Eligibility notes are opinions about *rules*, not live status — worded as
  "requires X" rather than "you don't qualify," since this page has no way
  to know who's asking.
