---
name: dweet
description: Write, check, render and publish a dweet — a 256-character animation in JavaScript or GLSL, drawn 60 times a second on a 1920x1080 canvas and stored as an ATProto record. Check it headlessly with node alone (length, size tier, the Bluesky post budget, and whether it actually draws anything at a given moment), render real frames or a GIF with a browser, and hand it over as a bsky.mino.mobi/dweet link. Use when asked to make, golf, inspect or publish a tiny canvas animation.
---

# dweet, headlessly

A dweet is **the body of a function**, called 60 times a second:

```js
u(t, S, C, T, R, c, x)
```

| name | is |
|---|---|
| `t` | seconds, a float, from 0 |
| `S` `C` `T` | `Math.sin` `Math.cos` `Math.tan` |
| `R(r,g,b,a)` | `"rgba(…)"` |
| `c` | the canvas, **1920×1080** |
| `x` | its 2D context |

**The canvas is not auto-cleared.** `c.width|=0` is the ten-character clear and
the first thing most dweets do; leaving it out is how you get trails, on
purpose or otherwise.

GLSL instead of JS is a flag on the record. The body is a fragment shader with
`t` (seconds), `r` (resolution), `FC` (fragcoord) and `o` (out colour) already
declared — **and a sketch written in demosky/Shadertoy's `mainImage(out vec4,
in vec2)` form runs here unchanged**, uniforms and all. Note `S`/`C`/`T` are a
*JS* shorthand: in a shader write `sin`/`cos`/`tan`.

Everything below needs **node 22 and nothing else**, except `render.mjs`, which
wants a Chromium and says so if it has none. Run the commands from
`bsky/dweet/`.

## The loop

```
write source → check → (render) → judge → golf → …  → publish → hand over a link
```

| step | command | reads back |
|---|---|---|
| check | `node agent/check.mjs <src> [--at 0,2,4] [--json]` | length against the cap, byte size and its demoscene tier, dwitter portability, **the Bluesky post budget**, and — by running it — **whether it draws anything at each moment**, whether it clears, which canvas API it touches. Exit 1 if invalid, throwing, or blank everywhere |
| render | `node agent/render.mjs <src> --out DIR [--at t] [--frames n] [--gif a.gif]` | real pixels from the real sandbox: a PNG per frame, lit-pixel counts, `report.json`, optionally an animated GIF. Exit 1 if every frame is blank. Needs Chromium |
| link | `node agent/link.mjs <src> [--title t]` | the permalink that carries the whole dweet, and the exact post text with its grapheme count |
| what exists | `node agent/feed.mjs [--tail 30] [--at <handle>]` | dweets on the network — the live firehose, or one repo's records |

`<src>` is the same thing everywhere: **a file**, `-` for stdin,
`seed:<name>` (the house set — `heartbeat`, `ribbon`, `spirograph`, `ripples`,
`interop`), an **`at://` uri**, a **permalink**, or `--src '<source>'`.

## What check.mjs is for

It answers the question you cannot answer by reading your own source:

```
  t=0           0 ink       0 calls   <- draws NOTHING here
  t=1         100 ink     100 calls
  t=2         200 ink     200 calls
  t=4         401 ink     401 calls
  t=8           0 ink       0 calls   <- draws NOTHING here
```

That is the house `heartbeat`, whose loop is `for(a=t%8;a>0;a-=.01)` — zero
iterations at `t=0` and again at `t=8`, its period. **A dweet that draws
nothing in its first seconds is the commonest way one looks broken**, and the
first still this surface ever captured was a perfectly black 1280×720 frame
for exactly that reason. It costs milliseconds and no browser to find out.

Two things it is NOT:

- **Draw calls are not pixels.** A dweet can make a thousand of them off-screen
  or in black on black. `check` says it did something, never that it looks like
  anything. For that, `render.mjs`.
- **It does not rasterise.** The context is instrumented, not drawn on. If a
  dweet READS THE CANVAS BACK (`getImageData`, `createPattern`, `drawImage` of
  itself) it branches on pixels that never existed, so the counts are not what
  a browser would do — `readsBack: true` says so and you should render instead.

GLSL is not run by `check.mjs` at all: a shader needs a GPU. It reports the
dialect and the uniforms, and `render.mjs` compiles it for real — a broken
shader comes back with the driver's own message and line number
(`compile: ERROR: 0:2: 'S' : no matching overloaded function found`).

## The cap, and why it is 256

256 **graphemes**, and the number does three jobs:

1. **A whole dweet fits in one Bluesky post with a link.** A post is 300
   graphemes; 256 + a blank line + a 22-character shortened link is 280.
   `check.mjs` prints that budget as `post`, so you find out before you post,
   not after.
2. It **is** the top size tier, so every ASCII sketch lands in a named
   demoscene class — `64b`, `128b`, `256b` — with no escape hatch.
3. It is a power of two.

Size tiers are counted in **UTF-8 bytes**, the cap in **graphemes**. For ASCII
— which golfed code nearly always is — they coincide; an emoji is 1 grapheme
and 4 bytes, so it costs the tier four times what it costs the cap.

Dwitter's 140 survives as a **badge**: a js dweet of 140 graphemes or fewer
uses exactly dwitter.net's namespace and runs there unchanged. `check.mjs`
prints whether yours does.

## Golfing

The tiers are the game. Things that actually buy characters here, in the order
they usually pay:

- `c.width|=0` to clear (10) beats `x.clearRect(0,0,1920,1080)` (26).
- `S`/`C`/`T` are free; `Math.sin` is not.
- `x.fillStyle=R(…)` when the colour moves, a literal string when it does not.
- Drop a harmonic. The house heart is three cosine terms because the fourth is
  visually indistinguishable and cost 7 characters — that was measured by
  computing the curve's bounds, not by eye.
- `for(a=t%8;a>0;a-=.01)` — a loop over a *phase* rather than an index often
  removes both the initialiser and the bound.

Re-run `check.mjs` after each pass: it prints `bytes -> tier (N to spare)`, so
you can see the next tier coming.

## Publishing

A dweet is a `com.minomobi.dweet.dweet` record in the author's **own** repo:

| field | |
|---|---|
| `src` | the source, ≤ 2048 bytes / 256 graphemes |
| `lang` | `js` or `glsl` |
| `title` | optional, ≤ 64 |
| `remixOf` | optional `at://` uri of the dweet this came from |
| `captureTime` | optional ms — the moment to show when paused |

**Set `captureTime`.** It is the frame a paused card shows, and without it a
dweet that draws itself over time shows a black rectangle. Use `check.mjs` to
find a moment with ink in it, and `render.mjs --at` to look at it.

Writing needs a sign-in, so it happens in the page: open the permalink, press
**remix**, and post. There is no headless publish — the scope is granted to a
browser session, not to a script, and a script holding a PDS credential is the
thing this whole surface is arranged to avoid.

## Handing over

`node agent/link.mjs <src>` prints
`https://bsky.mino.mobi/dweet/?s=<base64url>&l=glsl&t=<title>` — the **whole
dweet travels in the URL**, so the link works before anything is posted, for a
draft, and for a house seed that is not a record at all. Opening it pins that
dweet above the feed, playing, with a **remix** button.

Give the person the link and the numbers you judged by.

## Honesty

Report what `check` and `render` say, not what you expect the source to do.

- A dweet that draws nothing at every sampled moment **is not working**, even
  if the source looks right. Say so and try later times.
- If Chromium is not installed, say you did not look at it — do not describe a
  picture you did not render.
- `check.mjs` counts draw calls, not pixels. "It draws 400 rectangles" is not
  "it looks good".
- A GIF is **not** how a dweet animates on Bluesky, and never will be: that
  CDN transcodes every image blob and motion there is an external player on a
  host allowlist. The moving post is `app.bsky.embed.video` with
  `presentation: "gif"`, which the page does from a real browser. The GIF is
  for everywhere else.
