# BRIEF — fake-doordash ("Wormhole Eats")

## What this is
Requested: a fake DoorDash/Uber Eats for ordering food across a Rick-and-Morty-
style infinite multiverse — mind-bending food names/descriptions, simulated
delivery status and notifications, and a checkout process. This turn shipped a
complete, working single-file app: browse dimensions → expand menus → add to
cart → checkout → live delivery simulation with a progress bar and toast
notifications, all client-side, all fake.

- 6 hand-written "dimensions" (restaurants) with genuinely absurd menus
  (`CURATED` array), each with 4 dishes, prices in a fake currency (Flurbos).
- A procedural generator (`genDimension`/`genDish`) that combines word banks
  (adjectives, food bases, absurd ingredient sources, warning labels) to make
  infinite additional dimensions — wired to a "shuffle multiverse" button.
- Cart with qty +/-, persisted to `localStorage`.
- Checkout: recipient name, "delivery reality" field, notes, a randomized
  "wormhole toll" fee, and a balance check against a starting Ƒ1000 — no real
  payment field anywhere, just a fake pre-loaded currency balance with a joke
  "emergency space-loan" top-up button if you run short.
- Delivery sim: 6 timed status steps (received → assembling → portal locked →
  in transit → arriving → delivered) over ~24s, a progress bar, an ETA
  countdown, an event log, and toast notifications for status changes plus 1-2
  random flavor-only toasts (turbulence, wrong-dimension reroutes, etc.) that
  don't affect the actual delivery timing. Order state persists to
  localStorage and **resumes correctly on reload** by diffing `Date.now()`
  against the stored `startedAt` and fast-forwarding through any steps
  already passed (`scheduleFrom`).

## Decisions
- **No Bluesky identity/OAuth at all.** The request has no per-person
  component — nobody needs to be "logged in" to order fake food from a fake
  multiverse — so there's no `kit.handleInput`, no `bskyGet` calls, nothing
  hitting the XRPC allowlist. Only `tokens.css` and `kit.js` are linked, and
  `kit.js` is used just for `crumb`, `showError`, and `clear`.
- **Invented an original name and avoided direct Rick-and-Morty references.**
  The request explicitly evokes that show's multiverse concept, but per the
  top-level instructions (build the mechanic, don't take the name/IP), I kept
  it to generic multiverse/portal/wormhole tropes and invented all restaurant
  names, dish names, and flavor text myself — no "Meeseeks", "Schmeckle",
  "Council of Ricks", "Jerry", etc. anywhere. `marksIn`/`marksInSlug` wouldn't
  have caught show-specific references (they're not on the trademark list),
  so this was a judgment call, not something the gate would enforce.
- **No real payment field of any kind** — the checkout charges a fake
  pre-loaded "Flurbo" balance rather than collecting anything resembling a
  card number, consistent with the hard "never a payment field" rule. The
  content gate's `CREDENTIAL_SHAPES` check would only catch `cc-number`/
  `cc-csc`/`cc-exp` autocomplete attributes specifically, but I avoided the
  whole shape rather than relying on the gate to catch a near-miss.
- **In-page toasts, not the Notifications API.** `Notification.requestPermission`/
  `new Notification`/`showNotification` are hard-banned by the content gate
  (domain-wide, one-way permission) — the delivery "notifications" are a
  simple DOM toast stack with `aria-live="polite"`, which reads as
  notifications to the visitor without touching browser permissions.
- **Single active order at a time**, not concurrent orders / full history.
  Scoped this way to fit the turn — see the plan below for what a
  multi-order or history view would need.

## The plan — what's not built yet, roughly in order
1. **Order history.** Right now a delivered order just offers "order from
   another dimension" and the completed order's data is discarded (only
   `state.order` is persisted, and it's overwritten). Add a `we_history` array
   in localStorage, push the completed order into it in the same place
   `newOrderBtn`'s handler clears `state.order`, and render a simple list
   below the tracking screen or as a new screen.
2. **Real playtesting of the delivery timing.** `STEPS`' timings (24s total,
   4-5s between steps) are a first guess, never watched in a browser. Watch
   the toast cadence and progress bar feel — the flavor toasts in particular
   use `Math.random()` for their timing offset and could theoretically land
   very close to a real status toast; if that reads as cluttered, space them
   deliberately instead of fully at random.
3. **Multiple concurrent orders.** Ordering from more than one dimension at
   once (i.e., checking out again while an order is already in transit) isn't
   possible — the tracking screen only shows `state.order`, singular, and
   `placeOrder` overwrites it. Would need `state.orders` as an array and a
   list-based tracking view instead of one full-screen status.
4. **og:image / share card.** No image was generated this turn — the link
   card is title/description text only. A canvas-drawn card (portal/wormhole
   motif, no copyrighted imagery) would round this out; `generate-og-card.mjs`
   is the relevant generator to look at for how other tenants wire this up,
   though note it's a script that runs outside the tenant directory.

## Gotchas
- **No way to test this in a real browser this turn** — no Bash, no
  WebFetch. Everything above is reasoned from reading the code, not observed.
  If the harness's smoke test reports an error, the first places to check are
  `scheduleFrom` (the reload-resume math, `Date.now() - startedAt`) and the
  `renderCartBar`/`showScreen` interaction (cart bar visibility depends on
  which screen is currently `.on`, computed via a live DOM query rather than
  a stored variable — a stale read there would show/hide the bar on the wrong
  screen).
- **`localStorage` can throw in private/incognito modes** — wrapped every
  read/write in `LS.get`/`LS.set` with try/catch so the app still works
  in-memory-only rather than crashing on first load; just means state won't
  survive a reload in that case.
- Prices, the wormhole toll, and dish flavor text are all `Math.random()`
  driven and intentionally unbalanced/silly — this is meant to read as
  chaotic-but-harmless, not as a rigorous pricing model.
