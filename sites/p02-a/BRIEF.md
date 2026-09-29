# BRIEF — My Commute

## What this is

Request, in their words: "Hiiii please build me a demo called 'My Commute'
which simulates a super light single person watercraft that goes from Lake
Merritt to Oracle in Redwood Shores." Nothing else in the thread modified or
extended this — no replies from the requester, just the one ask.

Reading it as a numbered acceptance list:

1. Named "My Commute".
2. A demo/simulation, not a static illustration — something that runs.
3. The vehicle is a watercraft, and specifically light + single-person (an
   e-foil / personal foilboard, not a ferry or a jet boat).
4. Route is real and specific: Lake Merritt (Oakland) → Oracle's Redwood
   Shores campus. Both are real, identifiable places on San Francisco Bay,
   roughly 20 miles apart as the crow flies.

Shipped: a full-bleed canvas simulation. Real lat/lon waypoints for both
endpoints and five points in between (Estuary mouth, San Leandro Bay,
mid-South-Bay, off the Port of Redwood City, Westpoint Slough) approximate
the water route a small craft would actually have to take — down the Oakland
Estuary, south through the open bay, then into the Redwood Shores lagoon
system, rather than a straight line drawn over land. Distance is computed at
runtime via haversine over those points, not hard-coded.

Physics that actually run: throttle → target speed, with inertia (speed
eases toward target, it doesn't snap); a battery that drains on a cube-law
power draw (drag scales with v³, which is roughly right for a planing hull)
and can run out before arrival at high throttle; and a chop model — each
route segment carries an "exposure" (sheltered channel vs. open bay) that
drags the effective speed down, so the boat is visibly slower and choppier
in the middle of the bay than in the calm channel at each end. A "Playback
speed" (warp) control fast-forwards the sim clock; the elapsed/ETA readouts
are real-world minutes for the craft, independent of how fast you're
watching it.

## Decisions

- **2D canvas, not three.js.** The kit vendors three.js and it was tempting,
  but a top-down bay crossing is a 2D problem — a boat, a path, a coastline.
  Three.js would have added a camera/lighting rig for no visual gain here.
  Canvas 2D is also cheaper to get right in one sitting, per this
  requester's stated "keep it performance inexpensive" preference from their
  other site.
- **Stylized coastline, not a real map.** No tiles, no external map data are
  available (no network, no CDN). The bay/land shapes on screen are drawn
  procedurally around the real route bounding box — they read as "a bay,"
  they are not a claim of geographic accuracy. The route line and the boat's
  physics ARE built from real coordinates; only the coastline silhouette is
  decorative. Said explicitly in the on-page copy so this isn't overclaimed.
- **Full-bleed canvas with corner HUD panels, not a document page.** This
  requester's other site (a space-colony sim) was explicitly full-bleed with
  minimal corner chrome rather than a scrolling document — followed that
  precedent here since the same "let me see the thing" instinct applies.
- **No sign-in / no PDS save.** The ask was for a simulation to watch and
  drive, not a leaderboard or a saved state. Adding OAuth here would be
  scope creep the request didn't ask for, and the kit's own guidance is to
  skip sign-in unless the site is meaningless without it.
- **Chop/wind model is a simplified per-segment "exposure" curve, not real
  tide or wind data** (none is available without network access). Said so
  in the on-page copy rather than presenting it as live conditions.

## The plan (not built yet)

1. **Wind/weather control.** Right now exposure-driven chop is fixed per
   segment. A slider for "conditions today" (calm/choppy/rough) that scales
   the whole chop curve would make the physics feel less deterministic on a
   second watch. Small change: multiply the exposure curve by a single
   global factor from a new slider.
2. **A capsize / swamped state.** Currently if the battery hits zero the
   boat just drifts to a stop. A more dramatic failure state (e.g. if chop
   × speed exceeds a threshold, the craft "takes on water" and has to slow
   down) would raise the stakes without much new code — reuse the existing
   chop and speed variables, just add a threshold check next to the battery
   check in the physics step.
3. **Mini-map / zoomed detail near each shore.** The full-route view makes
   the Lake Merritt channel and the Redwood Shores lagoon (the most
   "real" parts of the route) tiny slivers at the top and bottom of the
   screen. An inset that zooms in near the boat when it's inside a
   low-exposure (sheltered) segment would show that detail off without
   redesigning the main view.
4. If this becomes a recurring site for them (their pattern per the profile
   is "iterate on a site over many turns"), expect terse follow-up asks —
   take numeric/geometric ones literally rather than rounding.

## Verified with the eyes tools

Checked each acceptance-list item against a running browser, not just the
code:

1. Named "My Commute" — `<title>`, `<h1>`, og tags. Confirmed in every
   screenshot.
2. Runs as a live simulation, not a static picture — `watch` over 3.6s of
   real time showed distance/elapsed climbing frame to frame at default
   settings (0.1→0.7 mi, 0:15→3:03).
3. Light single-person watercraft — described as a one-person electric
   foilboard in the subhead; physics (top speed ~25 mph, ~2.4 kWh pack)
   match that class of craft, not a ferry.
4. Real route, both endpoints — both named on the map and in the readouts;
   `drive` confirmed the trip completes ("Arrived at Oracle · Redwood
   Shores", 23.0 mi) and that distance is computed from the real
   coordinates, not a fixed number.

Also drive-tested: throttle slider (0% correctly decelerates to a stop and
holds; 100% raises speed and chop-linked drag is visible in "sea state"
going from calm→moderate→rough as the boat crosses open water); playback
speed slider; Pause/Play (freezes distance, correct label toggle);
Reset/"Watch again" (returns to Lake Merritt, distance 0, battery 100%);
battery drain under sustained full throttle (traced to ~0% right around
arrival at 90% throttle — "rolled in on fumes" copy fires correctly).
Checked 1280×800, 1440×900, 390×844 (mobile), and 360×740 (narrow phone) —
fixed two layout bugs found this way: the stats panel's translucent
background wasn't rendering (a `display:contents` wrapper was discarding
its own box) which let canvas labels bleed through illegibly, and the
route's southern endpoint was initially hidden behind the bottom HUD panel
on phone-width viewports where controls stack instead of sitting
side-by-side — fixed by measuring the actual panel positions at runtime
instead of guessing a fixed padding percentage. At 360px width, mid-route
labels are hidden (only the two named endpoints show) because they
overlapped each other in that little vertical space.

## Gotchas

- **Lat/lon → canvas projection**: used a simple equirectangular projection
  scaled by `cos(midLatitude)` so degrees-of-longitude don't look stretched
  at this latitude (~37.6°N, cos ≈ 0.79). Fit the route's bounding box into
  the canvas with padding and letterboxing so it looks right at any aspect
  ratio, including a portrait phone. If you change the waypoints, the
  padding math needs re-checking — it assumes the route is taller
  (north-south) than it is wide, which is true for this specific route but
  won't hold if a future route is mostly east-west.
- **rAF dt clamping matters.** Without clamping the per-frame delta, an
  inactive/backgrounded tab produces one enormous dt on refocus and the
  boat jumps or the battery instantly drains. Clamped dtReal to 100ms max
  per frame before scaling by warp.
- Kit's `tokens.css` is linked for the palette/focus-ring tokens, but the
  layout itself doesn't use the kit's `main`/`h1`/document flow at all — it's
  full-bleed. That's intentional (see Decisions) but worth knowing before
  assuming the kit's default layout classes apply here.

## Review round

Reported: at 390×844 and 360×740, Pause/Reset were dead — `elementFromPoint`
on both buttons resolved to `stats-panel`, not the button. Root cause as
described: the mobile media query's `#stats-panel { grid-template-columns:
repeat(3, 1fr) }` lost to the base rule's `#stats-panel.panel { ... }` on
specificity (ID+class beats ID), so the panel stayed 2-column/3-row instead
of 3-column/2-row and grew tall enough to cover the buttons above it.

Fixed the selector to `#stats-panel.panel` so it wins. Checking it in a
running browser turned up a second layer under the same symptom: even with
3 columns, the controls panel's mobile `bottom: 8.5rem` was still a guessed
constant, and the stats panel's *real* height depends on its content — it
starts short (values render as "—") and grows once real readouts land
("0.1 / 23.0 mi" wraps to two lines where "—" didn't), so the guessed gap
was sized for the wrong moment and still overlapped by ~16–28px after the
sim started. Replaced the guess with the same "measure the real panel
position at runtime" approach already used for the canvas's own bottom
padding: `layoutMobileHud()` sets the controls panel's `bottom` from the
stats panel's live `getBoundingClientRect()`, and a cheap per-frame check
(`watchMobileHudHeight`) re-runs it if the stats panel's rendered height
changes, since that change isn't a `resize` event.

Verified via `mcp__eyes__drive` at both 390×844 and 360×740: after the sim
populates real values, `controls-panel.bottom < stats-panel.top` (negative
overlap, i.e. a real gap), `elementFromPoint` on both buttons' centers *and*
all four corners returns the button (not `stats-panel`), and real
`click_selector` clicks on `#playpause`/`#reset` land and change state
(Pause→Play toggle, Reset zeroes distance). Re-checked 1280×800 and
1440×900 afterward — desktop layout unaffected.
