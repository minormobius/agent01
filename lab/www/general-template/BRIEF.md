# BRIEF.md — general-template

## What this is

The ask was for a template tenant: placeholder content that says "this is a
template to base other mobi sites on" and describes the general design
principles a lab site should follow. Not a tool, not a demo of one specific
idea — a reference page for whoever (agent or human) is starting the next
site and wants a working example rather than a blank file.

Shipped in this turn: a complete single-page site. It states the principles
in prose (link the kit, mobile-first, only show what the visitor named, fail
loudly, state lives in the visitor's repo, don't overclaim), and then proves
several of them with a small working feature rather than just describing
them: a handle-lookup box wired through `kit.handleInput` →
`kit.bskyGet('app.bsky.actor.getProfile', ...)` → a rendered profile card,
with `kit.hidden()` checked before rendering and errors shown via
`kit.showError` rather than swallowed.

This turn added a `.pondertag` div at the bottom of the page, background
`#FF00FF`, with copy explaining the convention: every real tenant copying this
template should give its own pondertag a unique color rather than keeping the
placeholder magenta, so pages can be told apart at a glance. Small, self-
contained, no new decisions needed beyond the color and copy — see the div and
its adjacent `<style>` block near the end of `index.html`.

This turn (the one after that) was a meta request: "pass along a note to the
reviewer agent to make sure the purpose of the template page is well
documented." There is no reviewer agent this build turn can message — the
only channels out of a turn are this file (to the next build agent) and
NOTE.txt (250 chars, to the requester, appended by the harness). So instead
of trying to relay anything, I read that as "make the purpose harder to
miss" and did it directly: added an HTML comment at the very top of
`index.html`, right after `<html lang="en">`, stating the file's purpose for
anyone who opens the source rather than just reads the rendered page — the
on-page copy already said it to visitors, but a next agent skimming source
for a pattern to copy wouldn't necessarily read the rendered `<p class="sub">`
first. Told the requester this in NOTE.txt.

## Decisions

- **Made it do something, not just say something.** A page that only
  described "use kit.handleInput for handle boxes" would be a style guide;
  a page where you can type a handle and watch it resolve is copy-pasteable
  code the next agent can lift directly. Chose the profile-lookup demo
  because it's the smallest complete loop that touches handleInput,
  bskyGet, hidden(), and error handling all at once — the four things a
  new tenant gets wrong most often per the kit's own README.
- **No PDS/auth demo.** Sign-in is optional per the brief, and this site has
  no state worth persisting — adding a `store.save()` call here would be
  demonstrating the API rather than needing it, which is exactly the kind
  of drive-by feature the project instructions say not to add. If a future
  turn wants a full "everything wired" reference, that's the natural next
  addition (see below).
- **No accent override.** Left `--accent` etc. at kit defaults deliberately
  — this site's whole point is "here is what the baseline looks like
  unmodified," so overriding it would undercut the one thing it's for.
- **No og:image / share-card generation.** Kept scope to what the task
  asked for; the kit doesn't hand you an image generator and building one
  wasn't the ask.

## The plan (not built yet)

If this gets iterated on:

1. A second demo block showing `store.save()`/`store.load()` via
   `/_kit/pds.js` end-to-end (sign in, save a tiny value, reload, show it
   came back) — would make this a true "everything wired" reference rather
   than "everything but persistence." Not built now because it adds an
   OAuth round trip to a page whose job is to be read, not used, and I
   wanted the turn's one working feature (handle lookup) solid rather than
   two half-explained ones.
2. Consider a literal downloadable/copy-paste `<script>` block or a "view
   source" link callout, since the actual expected workflow is "copy this
   directory," and right now that's implicit rather than stated on the page.
3. If ponder.ooo (or anyone) asks for this to look less like a doc and more
   like a showcase, a small carousel/gallery pulling thumbnails of other
   lab sites would fit — but that needs `tenants.json`, which is a generated
   build artefact this directory shouldn't read from client JS without
   checking it's actually servable from a tenant path first.

## Gotchas

- Checked `lab/_kit/fixtures/getProfile.json` against the demo's field
  accesses (`handle`, `displayName`, `avatar`, `labels`) — all match exactly,
  no surprises. `kit.hidden()` reads `subject.labels` directly for a profile
  object, which is where `getProfile` actually puts them.
- The avatar is rendered with a plain `<img>`, never drawn to a `<canvas>`,
  so the `cdn.bsky.app` URL is used as-is — no `/_img/` proxy needed. Only
  reach for `/_img/` if a future version composites the avatar into an
  exportable image.
