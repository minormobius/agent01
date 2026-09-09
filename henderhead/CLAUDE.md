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
