# BRIEF — possible-enable

## What this is

The request (from a Bluesky thread, summarised, no direct network access to
re-read it) was a plain question: "is it possible to enable pinch zoom on
mobile?" There was no existing site to iterate on — this is a fresh tenant,
built from scratch this turn, and it shipped complete as a small explainer/demo,
not a skeleton.

The page answers the question by *doing* it: the page's own
`<meta name="viewport">` starts zoomable, and a button flips its `content`
attribute live between a zoomable string and the classic
`maximum-scale=1, user-scalable=no` lock, so a visitor on their own phone can
pinch right there and feel the difference instead of taking the explanation on
faith. Below that: the one-line fix, a copy button for it, the caveat that this
only works on pages you control, a note that several modern mobile browsers now
ignore `user-scalable=no` entirely (so the demo may feel like it does nothing on
some phones — that's the browser overriding the tag, not a bug in the page),
and a short "why sites disable it" (WCAG 1.4.4 / it's usually an accidental
side effect of an old iOS input-zoom workaround).

## Decisions

- **No Bluesky/network content at all.** The question is generic web-platform
  trivia, not about any account or post, so there was nothing to fetch and
  nothing for the content gate to worry about. Kept the page to `kit.crumb`
  and `kit.copy` only.
- **Live self-toggle instead of a static before/after screenshot or iframe.**
  An iframe pair (one locked, one not) would need two nested documents and
  still couldn't be pinch-tested honestly inside a small frame on mobile.
  Toggling the actual page-level viewport meta lets the visitor use their own
  fingers on the real thing.
- **Hedged the "some browsers ignore user-scalable=no" claim** rather than
  citing specific version numbers — I have no network access this turn to
  verify current browser behavior, and CLAUDE.md is explicit about not
  overclaiming. Said "several recent browsers," not "iOS 10+" or similar.

## The plan (if there's a next turn)

This shipped complete for the question asked; I don't see an obvious next
increment unless the requester asks for one. If they do:

- If they want the *actual* fix applied somewhere (their own site), that's a
  different task — this page is generic advice, not tied to any of their
  properties.
- Could add a second toggle demonstrating the `touch-action: pan-x pan-y`
  CSS property, which is the *other* way some sites accidentally kill pinch
  zoom on a specific element (not the whole page) — not built here since the
  question was about the page-level/meta case, which is the far more common
  culprit.

## Gotchas

- Directly mutating `meta.content` at runtime does actually change live
  zoom behavior in current WebKit/Blink — this isn't guaranteed by spec but
  is the commonly relied-upon behavior; if a future harness report shows the
  toggle doing nothing in the test browser, that's the thing to check first.
- No fixtures were relevant here (no XRPC calls), so nothing to cross-check
  against `lab/_kit/fixtures/`.
- `lab/_profiles/riziles.bsky.social.md` didn't exist yet — created it this
  turn with what little this single request showed (terse, direct technical
  questions; likely appreciates demos over pure prose). Thin signal from one
  request; don't over-index on it.
