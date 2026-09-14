# henderhead — an unofficial fan site for Matt Henderson's demos

`henderhead.mino.mobi` · worker `henderhead` · branch
`claude/henderson-fan-page-demo-xhgtrj` · static assets + a thin worker.

[Matt Henderson](https://bsky.app/profile/matthen.com) posts a small
mathematical demo most days. They are beautiful, and they are videos. This site
rebuilds them as things with knobs on.

---

## Read this before adding anything

**The demos here are independent implementations, written from the mathematics
he described in public.** That is not a formality — it is the whole basis on
which the site is defensible:

- **Never copy his media.** No images, no video, no GIFs, no frames, not as a
  thumbnail and not "just for the OG card". Every picture on this site is
  produced by this site's own code. If a page needs to show his original, it
  links to the post.
- **Credit above the fold, on every page.** Name and a link to the specific
  post, in the header, not in a footnote.
- **Never imply endorsement.** He has not endorsed this. The front page says so
  and the pages must not contradict it.
- **No ads, no analytics, no accounts, no tracking of any kind.** There are none
  and there will be none. `_headers` sets a Content-Security-Policy with
  `default-src 'self'` so that this is enforced rather than promised — adding a
  font CDN or an analytics script means visibly widening that header, which is
  the point. It has to live in `_headers`, not `worker.js`: Static Assets
  answers a request that matches a file **without invoking the worker**, so a
  header set in the worker reaches `/api/demos` and no page on the site.

### Gate zero: the pipeline is not built, and must not be

The site's stated intention is a job that watches his feed and rebuilds each new
demo automatically. **It does not exist, and building it is out of scope for any
task that has not cleared the consent gate on the front page** (`/#consent`):
he has to have been asked, in plain words, and have said yes.

As of 2026-09-09 he has not been asked. Nothing watches his feed. `/api/demos`
reports `consent.asked: false` and `automatedPipelineRunning: false`, and
`demos.js` has no state meaning "a bot is working on this". If you are here to
add automation, the first step is not code.

If consent is refused, or withdrawn, or he asks for a specific demo to go: set
that entry's `state` to `declined` (or delete the surface), push, and it is gone
on the next deploy. Do not argue the point on his behalf in a commit message.

## Layout

| Path | What |
|---|---|
| `index.html` + `home.js` | the front page: the shelf, the queue, the consent gate |
| `demos.js` | **the data.** One record per demo, `state: built \| queued`. The front page and `/api/demos` are both projections of it — edit here, never the HTML |
| `worker.js` | `/api/demos` only. No state, no secrets |
| `_headers` | the CSP and friends. These cannot go in `worker.js` — see above |
| `cf/` | demo #1 — continued-fraction Fourier curves |
| `craft/` | demo #2 — a cellular automaton made of crafting recipes |
| `wheel/` | demo #3 — a leaky waterwheel that is the Lorenz system |
| `ball/` | demo #4 — a ball bouncing under gravity in a circle |
| `.assetsignore` | keeps `CLAUDE.md` and `cf/engine/` off the public site |

## `cf/` — continued fraction Fourier

After [his post of 2026-09-09](https://bsky.app/profile/matthen.com/post/3mv2xgpwkg22t):
*"Drawing a picture from the continued fraction of a number. The continued
fraction terms drive a Fourier series."*

    z(t) = Σ_k exp(i q_k t) / q_k^α        q_k = the convergent denominators

α = 1 is his first picture; α = ½ is *"introducing a sqrt lifts more detail"*.
q₀ = 1 for every number and a₀ appears nowhere else, so **only the fractional
part draws**.

| File | What |
|---|---|
| `cf/engine/` | the Rust crate. `cf.rs` continued fractions, `curve.rs` sampling + the additive plane, `lib.rs` the C ABI, `tests.rs` 22 known-answer tests |
| `cf/cffourier.wasm` | the built module, **committed** so the site serves with no build step. CI rebuilds it and ships what it built |
| `cf/engine.js` | the glue. Every returned view points into wasm memory and dies at the next engine call |
| `cf/numbers.js` | the constants table and what a typed string resolves to. Shared with the selftest, so no DOM in it |
| `cf/app.js` | modes, canvas, exports |
| `cf/cf.selftest.mjs` | node, against the committed `.wasm`. Run it after touching anything above |

```bash
cargo test --manifest-path henderhead/cf/engine/Cargo.toml       # the maths
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path henderhead/cf/engine/Cargo.toml
cp henderhead/cf/engine/target/wasm32-unknown-unknown/release/cffourier.wasm \
   henderhead/cf/cffourier.wasm
node henderhead/cf/cf.selftest.mjs                               # the seam
```

### Things that will bite you

- **No wasm-bindgen and no wasm-pack, deliberately.** The module has *zero*
  imports — `sin` and `cos` come from Rust's own libm — so it is 53 KB, needs no
  import object and no generated shim, and the whole build is one `cargo build`.
  Reaching for bindgen to pass one struct would throw all of that away.
- **`set_ratio` and `set_surd` take i64, so JS must pass `BigInt`.** A plain
  number throws.
- **Undersampling does not look coarse, it looks *wrong*.** A curve with a
  frequency of 15 000 in it draws a smooth, plausible, entirely fictitious shape
  if you give it 2 000 samples. `PER_CYCLE` in `app.js` is samples per cycle of
  the *fastest* term, and `Q_DRAW` caps which terms are drawn at all; both exist
  to stop the page lying about a number. Do not lower them to buy frame rate.
- **The overlay counts pixels, not samples.** `Plane::draw` skips a sample that
  lands on the pixel it is already on, so brightness means "how many of the
  numbers pass through here" and does not change when the sample count does.
  There is a test for it.
- **A decimal is not the constant it stands for.** π enters as 40 digits and is
  expanded exactly as *that rational*; the panel prints how far up the term list
  the digits can vouch for. Keep that distinction visible — it is the difference
  between the page being right and the page being confident.
- `henderhead.mino.mobi` did not exist before this surface. The first deploy
  creates and attaches it: check the run log says `(custom domain)`.

## `craft/` — the crafting automaton

After [his post of 2026-09-11](https://bsky.app/profile/matthen.com/post/3mva6fo4ew22c):
*"A cellular automaton from Minecraft crafting recipes"*, and then *"I added
random motion to keep the grid alive — and banned buttons"*.

**There was no code and no write-up — only 40 seconds of video.** The rule here
was read off it frame by frame (`/tmp` is gone; the method was: pull the mp4
from the author's PDS with `com.atproto.sync.getBlob`, step it at 6 fps, find
the green highlight boxes by colour, and diff the cells before and after each
one). What that establishes, and what it does not, is written out on the page
itself under *What the video shows, and what it doesn't* — keep that section
honest if you change the rule.

| File | What |
|---|---|
| `craft/engine/src/recipes.rs` | **the rule.** The item list and every recipe shape, typed out rather than lifted from the game's data files. A legend of four ingredients covers the whole table |
| `craft/engine/src/world.rs` | the grid: motion, matching, crafting, spill, restock |
| `craft/engine/src/lib.rs` | the C ABI, plus a JSON description of the rule that the page reads instead of writing the table down twice |
| `craft/craftca.wasm` | the built module, **committed**; CI rebuilds it and ships what it built |
| `craft/items.js` | **our** item art — the labels and the drawing code |
| `craft/app.js` | grid, histogram, recipe book, controls |
| `craft/craft.selftest.mjs` | node, over the ABI. Also the only place that checks the rule and the art describe the same set of items |

```bash
cargo test --manifest-path henderhead/craft/engine/Cargo.toml
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path henderhead/craft/engine/Cargo.toml
cp henderhead/craft/engine/target/wasm32-unknown-unknown/release/craftca.wasm \
   henderhead/craft/craftca.wasm
node henderhead/craft/craft.selftest.mjs
```

### Things that will bite you

- **No Minecraft textures, ever.** Every icon is drawn by `items.js` out of a
  few isometric primitives. The recipes are the game's because a recipe is a
  fact about the game; the pictures are not facts. If you add an item, draw it.
  The selftest fails on an item with no art *and* on art for an item the rule
  does not have, so the two cannot drift apart.
- **A tick is a unit of the automaton's time, not a frame.** The page runs
  `speed` ticks per *second*. Tying it to the frame rate — which is where this
  started — makes every other parameter meaningless, because 60 ticks a second
  is about thirty times the video's pace and burns the grid down before you can
  see anything.
- **Firing every available match every tick is wrong** and was the first thing
  that had to go: it strips the grid bare in about a hundred ticks, which is
  not what the video looks like. `craft_rate` is the fix and it is fractional,
  because a 700-cell grid at the video's pace wants well under one craft a tick.
- **The empty squares in a recipe are load-bearing.** A chest is eight planks
  *around a hole*. `try_craft` requires the hole to be empty, and there is a
  test for it.
- **Yields are the ecology.** A recipe returning more than it consumes places
  the extra in the consumed cells first, then the nearest empty ones. This is an
  inference, not something the video states outright — but his closing histogram
  ranks items very nearly in order of yield, which a rule that discarded the
  extras could not produce.
- **The rule has no sinks, so it must run down.** Nothing consumes a slab or a
  lever or a shovel once it exists, so every long run ends the same way. The
  restock control is ours, not his, and it is a *level* rather than a rate on
  purpose: a constant drip packs the grid solid and a full grid cannot craft at
  all. Both facts have tests; do not "fix" them.
- **Ties are undecided.** Five planks in a U are a boat, a slab and a stick all
  at once. The one U in the video becomes a boat, so `Biggest` is the default —
  but it is a switch on the page and should stay one.

## `wheel/` — the chaotic waterwheel

After [his post of 2026-09-13](https://bsky.app/profile/matthen.com/post/3mvg57cbsuc23):
*"Approximating the Lorenz attractor with a chaotic leaky water wheel."*

**The odd one out: almost nothing here was reverse-engineered.** This is the
Malkus waterwheel and it has a published derivation (Strogatz, *Nonlinear
Dynamics and Chaos*, §9.1 — Matt linked the lecture himself). So the job was not
to guess a rule but to *demonstrate* one, and the tests can be sharp in a way
the other two demos' cannot: the continuum wheel must **be** the Lorenz system,
not resemble it.

    σ = ν/(I k)      β = 1      ρ = π g r q₁ / (ν k²)

The derivation is redone in this repo's own coordinates at the top of
`engine/src/wheel.rs`; read that before touching anything.

| File | What |
|---|---|
| `wheel/engine/src/wheel.rs` | the physics: `Wheel` (n buckets, RK4), `Continuum` (the three-mode reduction), `Lorenz`, and the change of variables between them |
| `wheel/engine/src/lib.rs` | the C ABI. Four systems step in lockstep: wheel, twin, continuum, Lorenz |
| `wheel/waterwheel.wasm` | the built module, **committed**; CI rebuilds it and ships what it built |
| `wheel/app.js` | the wheel drawing, the regime gauge, the divergence plot |
| `wheel/wheel.selftest.mjs` | node, over the ABI — restates the headline results across the seam |

```bash
cargo test --manifest-path henderhead/wheel/engine/Cargo.toml
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path henderhead/wheel/engine/Cargo.toml
cp henderhead/wheel/engine/target/wasm32-unknown-unknown/release/waterwheel.wasm \
   henderhead/wheel/waterwheel.wasm
node henderhead/wheel/wheel.selftest.mjs
```

### Things that will bite you

- **σ has to clear β+1 = 2 or there is no chaos at any flow rate.** σ = ν/(Ik),
  so it is the *damping* that buys chaos. Picking parameters without checking
  this is how the first draft of the engine ended up with a wheel that could
  only ever spin steadily, and every regime test failed at once. The gauge on
  the page says `ρ_Hopf = ∞` when this happens; believe it.
- **The Lorenz run has to start where the wheel starts.** An evenly filled wheel
  has a₁ = b₁ = 0, which is X = ω₀/k, **Y = 0, Z = ρ** — not Z = 0. Getting that
  wrong puts the overlay a long way off and it spends the first minute flying in
  from nowhere. The selftest catches it.
- **The page starts the wheel already running** (`reset_running`), every bucket
  holding q/(kn). From dry, the first bucket to fill throws the centre of mass
  out to the rim and the trail's opening move is a huge arc that sits across the
  picture for eight minutes. This is a presentation choice and it is commented
  as one.
- **Do not add the water's own moment of inertia to `I`.** It is a real effect
  and it would break the exact correspondence the whole page is about. The
  derivation assumes I constant; so does this.
- **The overlay diverging is not a bug.** The wheel and the exact Lorenz
  solution lie on top of each other for the first half-minute and then part,
  because both are chaotic and the finite bucket count is a perturbation. That
  is what the correspondence predicts. Do not "fix" it by syncing them.
- Accuracy matters more here than in the other two demos, because the subject
  *is* how fast small errors grow. RK4, substeps capped at 2 ms.

## `ball/` — bouncing ball chaos

After [his post of 2026-09-14](https://bsky.app/profile/matthen.com/post/3mvi6wjvk6k2p):
*"chaos from bouncing a ball in a circle… The system seems to move between
Stable Eras and Chaotic Eras."*

**The trap here is a rule that looks right and is not.** A ball bouncing along
straight chords inside a circle is *integrable*: the angle of incidence is
conserved at every bounce, neighbours separate linearly, and four bounces ahead
is perfectly predictable. Build that and the page looks plausible for five
seconds and contradicts its own source. The rule was measured off the video
instead — tracking the white dot frame by frame shows x constant while y
accelerates, then dx constant while dy changes linearly. **Parabolas. There is
gravity.** The ball is still reaching near its drop height at t = 78 s, so the
bounces are elastic.

| File | What |
|---|---|
| `ball/engine/src/ball.rs` | the physics: flight, the exact bounce solve, specular reflection, the cubic solver |
| `ball/engine/src/lib.rs` | the C ABI, the fan of futures, the spread metric, the Poincaré section and survey, the Lyapunov shadow |
| `ball/bouncer.wasm` | the built module, **committed**; CI rebuilds it and ships what it built |
| `ball/app.js` | the arena, the spread plot, the clickable phase portrait |
| `ball/ball.selftest.mjs` | node, over the ABI |

```bash
cargo test --manifest-path henderhead/ball/engine/Cargo.toml
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path henderhead/ball/engine/Cargo.toml
cp henderhead/ball/engine/target/wasm32-unknown-unknown/release/bouncer.wasm \
   henderhead/ball/bouncer.wasm
node henderhead/ball/ball.selftest.mjs
```

### Things that will bite you

- **Do not step the flight.** Between bounces the path is a parabola, so the
  wall hit is a quartic root — and because the ball sits exactly on the circle
  after a bounce, the constant term vanishes and what is left is a closed-form
  cubic. Stepping a small dt and testing for "outside" bleeds energy at every
  bounce, and in a system whose entire subject is how fast small errors grow
  that is not acceptable. There is a test asserting the drift stays under 1e-9
  over five thousand bounces.
- **The Lyapunov shadow lives in section coordinates**, not in full state
  space. Renormalising a full state leaves the shadow a billionth *off* the
  circle, and the exact cubic is only valid exactly on it; feeding it a near
  miss solves the wrong polynomial and the exponent comes out around 100
  instead of 0.3. The section representation is on the wall by construction.
- **`clock` must accumulate the whole flight, not the part after the last step
  boundary.** Getting that wrong made every per-unit-time rate on the page come
  out about four times too big, and it is invisible unless you check a number
  against the Rust tests.
- **The eras are not islands, at this energy.** That was the first draft's
  explanation and the phase portrait refuted it: at the video's drop height the
  section is an almost uniform chaotic sea. The honest account is fluctuation in
  the *local* stretching rate around a long-run average — and the islands are
  real but live at lower energies, which is what the drop-height control is for.
  Do not quietly put the islands story back.
- **Gravity is not an energy control.** Rescale time and any g becomes 1, so the
  phase portrait does not depend on it. The drop height is the energy: E = gy at
  release and the ball can never rise above it. The survey is rebuilt when the
  height changes and deliberately not when gravity does.

## Adding a demo

1. Add the record to `demos.js` with `state: 'queued'` first — the queue is
   public, so what is being considered is legible before it appears.
2. Build it under its own directory with its own `index.html`. Give it a
   `catalogue.json` entry with `"p": "henderhead"`, or
   `scripts/catalogue-coverage.mjs` will fail preflight on it.
3. Header credit + link to his post. Say in the prose what is his and what is
   yours.
4. Flip `state` to `'built'` and set `href`.
5. `node scripts/preflight.mjs --fix`, then push to the branch above.
