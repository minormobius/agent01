# BRIEF — ping-user

## WHAT THIS IS

The thread asked after7.bsky.social to "ping user and ask them to build
something cool." after7 replied with a link to an external prototype
(mino.aisloppy.com/s/ping-minomobi): a "Ping User Notification Center" with a
hardcoded target (@minomobi.com) and a button that says "Ping sent!" no matter
what — there's no way that page actually notifies anyone.

This is the real, generalized version, shipped as a first turn:

- Type any Bluesky handle (kit.handleInput typeahead, plus a manual
  resolveHandle/getProfile fallback for Enter-without-picking).
- Pick or shuffle a nudge message ("build something cool" and seven variants).
- "Open in Bluesky →" opens `https://bsky.app/intent/compose?text=...`
  prefilled with `ping @handle — <message> 📡`, in a new tab. The visitor
  posts it (or doesn't) from their own account.
- A session-local log (localStorage) of pings drafted in this browser, purely
  so the page feels alive — explicitly labeled as local-only, not a real inbox.

Maximalist rainbow chrome (animated gradient heading, gradient-bordered panel,
filled+pulsing gradient send button) per lab/_profiles/ezba.bsky.social.md —
decoration on chrome, body text stays at kit-default contrast.

## DECISIONS

- **Rejected faking a "sent" state.** The whole prototype linked in the task
  is the joke of a notification that goes nowhere. Building the same lie with
  better graphics felt worse than building something that actually works —
  handing off to Bluesky's real compose intent means a click here can genuinely
  reach someone, just via the visitor's own post rather than a phantom backend.
- **Popup-blocker workaround for the un-resolved-handle path.** See GOTCHAS.
- **No deep-link (`?to=handle`) support.** Would be a nice share feature — "ping
  this specific person" links — but wasn't essential for a first turn and ran
  low on the clock. See THE PLAN.
- **No global/shared ping counter.** There's no backend, so any counter would
  either be per-browser (uninteresting) or fake (exactly what's being avoided).
  Left it out rather than build a fake shared number.

## THE PLAN

Nothing is broken or half-built — this is a complete, working first pass — but
if there's a next turn:

1. **`?to=handle` deep link.** On load, read a query param, pre-fill the handle
   field, and auto-resolve via the same resolveTyped() path already in the
   script. Lets someone share "ping bsky.app" as a direct link. Small, isolated
   change — add a `boot()` that reads `URLSearchParams` before anything else.
2. **A "pinged me" landing state.** If someone opens `?to=`, the ping is already
   *for* them, not something they're about to send — worth different copy
   ("someone wants you to see this" vs. "who are you pinging"). Needs a design
   decision, not just code: does the page detect this and change its whole
   framing, or is that scope creep? Flag it to the requester rather than guess.
3. **Nicer template rotation.** Right now "shuffle" can repeat the current
   message. Trivial fix (exclude current from the pick), didn't feel worth the
   remaining time on a first turn.

## GOTCHAS

- **window.open() after an await gets popup-blocked.** The straightforward
  `await resolveTyped(); window.open(url)` loses the click's user-activation
  by the time the network round-trip finishes, and Safari/Chrome then block it
  as a popup rather than a user-initiated navigation. Fixed by opening a blank
  tab *synchronously* in the click handler (`window.open('', '_blank')`) and
  setting `.location.href` on it once the handle resolves. Only needed when the
  visitor typed a handle and hit the button without picking from the dropdown
  first — picking from `kit.handleInput`'s dropdown already sets `current`
  synchronously, so that path opens directly with `noopener` as normal.
- **`kit.handleInput` sets `input.value` programmatically on pick** — that does
  NOT fire an `input` event, so my `hideWho()`-on-input listener doesn't
  clobber the just-resolved profile card. Don't add a MutationObserver or
  similar "fix" for that; there's nothing to fix.
- Only two XRPC calls in this file (`resolveHandle`, `getProfile`) — both on
  the content-gate allowlist. `searchActorsTypeahead` is called by `kit.js`
  itself, which the gate doesn't scan (it's outside the tenant directory), so
  don't assume you need to special-case it here.
- **Never set an `<img>` `src` to `""`.** `getProfile`'s `avatar` field is
  optional (see `lab/_kit/fixtures/getProfile.json` vs. a no-avatar account) —
  the first version fell back to `actor.avatar || ''` and also shipped a
  static `src=""` on the placeholder `<img>` in the HTML. An empty `src` isn't
  "no image", it's a same-document request: the browser re-fetches the
  current page URL as an image and fails to decode it, which is what a smoke
  test reports as a failed root-resource load. Fixed by only setting `src`
  when an avatar URL exists and removing the attribute (not blanking it)
  otherwise.
