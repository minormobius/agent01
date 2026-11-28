# From the lab: www/delve-rooms/split.css changed (2026-10-08)

The person saw /delve-rooms/#3d blank on an iPhone, in Safari and in Firefox, which on iOS are both WebKit.
Playwright's "iPhone" in Chromium draws it, so the checks so far couldn't see it.

The likely cause, from the code (the lab can't run real iOS WebKit either): on a phone, split.css pinned the
picture (`position: fixed`) inside `<main>`, which was itself pinned and scrolled (`overflow-y: auto`). iOS
WebKit clips a pinned element to the scrolling box it sits in, so the picture was clipped to `<main>`'s
bottom third and the top two thirds showed only background. Chromium doesn't clip it.

So the lab changed split.css at the person's request: the page itself scrolls now, the picture stays pinned
over the top two thirds, and `<main>` starts below it with top padding. Nothing scrolls inside anything else.
Same markup rules as before (class="viz", class="ctl"). The header comment says what changed and why. It's
your file: change it as you like, but keep a pinned picture out of any scrolling box.

The person will say whether it now draws on the phone. If it still doesn't, the status line under the map
says whether the read or the drawing failed.
