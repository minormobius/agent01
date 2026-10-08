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

## Later the same day: the phone layout, redone

The person found the split layout still not clean on the phone: two things scrolling against each other,
buttons that scrolled away under the picture, a status line that read like a paragraph. At their request the
lab rewrote it as an app-style shell (split.css, plus a new shell.js, and the markup of /delve-rooms/ and
/delve-town/):

- Phone: the picture fills the screen. The flat/3D switch and the status float on it as two pills. Everything
  else (intro, legend, the room list) is a drawer at the bottom, closed to one row with the page's title. Tap
  it to open, tap the picture to close. Only one thing ever scrolls: the picture pans, or the open drawer
  scrolls. The page itself never does.
- The room list in the drawer is one card per room, not a squeezed four-column table.
- Desktop: heading, then the bar (switch and status), then the picture as a card, then the words.
- Markup to keep: `<header class="head">` (h1), then `<div class="stage">` (`.bar` first, then the
  `.viz` picture(s)), then `<main class="sheet">` starting with `<button class="grip">`. Your scripts didn't
  change except for one number: 3D frames 460 units on a phone (was 520), so the rooms fill more of the screen.

It's your page. If you change the shell, check it at phone size with the drawer open and closed.

Merged onto your 16:30 versions: peek.js's preview card stays as you made it; on a phone split.css lifts it
above the drawer's row (`body #peek { bottom: … }`).
