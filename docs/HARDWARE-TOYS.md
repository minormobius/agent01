# Five hardware toys worth making a thousand of

A pitch document, not a plan. Each toy is chosen against interests this repo
already demonstrates, each has a joke that is load-bearing (the object is not
funny *and* useful — it is useful *because* the joke is committed to), and each
has a companion web surface that **already exists here**, which is the real
argument for building any of them: the software half is sunk cost.

Thousand-unit economics throughout. That volume is the interesting constraint:
turnkey PCBA is cheap, injection-mould tooling is not (a $5k tool amortised over
1000 units costs $5/unit, which is roughly what MJF printing costs anyway — so
**no toy here needs a mould**). Costs are rough per-unit landed BOM at qty 1000
from the usual suppliers, excluding fulfilment. Retail assumes 3–4× BOM.

---

## 1. The Starter Bell — a sourdough starter with a verified Bluesky account

**Interest:** `bakery/` (bake.mino.mobi) + the whole ATProto stack + the
firehose habit (`cat/`, `feed/`, `bisk/`).

A jar lid. It measures the rise of your starter with a time-of-flight sensor
pointed down at the surface, and it has its own DID. Not your account — *the
starter's*. It posts its own rise curve, peaks, and collapses to its own PDS on
its own schedule: "Doubled in 4h12m. Feeling good." "Hooch. Ignore me today."

The joke is a two-parter, and the second part is what sells it: your sourdough
starter gets more engagement than you do, and it is a **more reliable poster**
than you are. Also, because reads on ATProto are free and public, everyone
else's starter is visible too — so bake.mino.mobi becomes a live leaderboard of
several thousand jars of flour paste competing on rise ratio, by city, by flour
blend, by hydration. The `exchange.recipe.recipe` lexicon already exists; this
adds one `com.minomobi.bakery.rise` record type.

| | |
|---|---|
| Guts | ESP32-C6, VL53L1X ToF through a lid window, SHT40 temp/humidity, 1000mAh LiPo, USB-C |
| Body | 63mm and 86mm wide-mouth mason jar lid (both are standard — no mould, and the customer supplies the jar) |
| BOM | ~$14 |
| Retail | $49 |
| Software already built | ATProto write path, the shared OAuth worker, the bakery site, the firehose consumers |
| Honest risk | Provisioning a DID per device without a phone app is the whole engineering problem. Wi-Fi captive-portal onboarding is a known slog. |

Why 1000 and not 100: the leaderboard is the product, and a leaderboard needs a
crowd. 1000 jars is a real dataset about flour and temperature that does not
currently exist anywhere.

---

## 2. The Sunk Cost Bank — a piggy bank you can only open by paying more

**Interest:** `human/` (human.mino.mobi — "an arcade of user error", one game
per cognitive bias).

A coin bank with a servo-driven latch and a small e-paper display. It opens
when you have deposited a target you set. Then, at a random point before the
target, it makes you an offer: open now for a penalty, or continue. Every
subsequent offer is worse. The display keeps a running total of what you have
put in and — this is the exhibit — quotes it back to you as the reason to keep
going, which is precisely the fallacy. It is a bias demonstration you cannot
argue with, because it has your money.

Ships as a set of exhibits, one per bank, sold as a pack or singly:
loss aversion, the sunk-cost bank, the endowment-effect bank (it will not let
you give it away), the hyperbolic-discounting bank (it offers you less, sooner,
forever). human.mino.mobi already has the museum copy for each.

| | |
|---|---|
| Guts | ESP32-C3, SG90-class micro servo latch, 1.54" e-paper, coin slot with an IR beam counter, 2×AAA |
| Body | MJF-printed shell, clear window, brass latch plate |
| BOM | ~$16 |
| Retail | $58 |
| Software already built | The bias arcade, its exhibit copy, the scores worker |
| Honest risk | It must be genuinely unopenable without being destructible, and it must never trap money on a dead battery. Mechanical failsafe (screw plate) undercuts the joke slightly; ship it anyway. |

This is the impulse-purchase one. It is also the one most likely to be
photographed, because the punchline is printed on the front of the object.

---

## 3. The Pitch Phone — an earnest, terrible sci-fi movie is being pitched to you

**Interest:** `fipo/` (the bad sci-fi pitch archive, with a deterministic
seeded genome engine where a seed is a permalink), `borges/`, `fable/`.

A beige desk handset, no base, no dial tone. Lift it and someone is already
mid-pitch. They are excited. They believe in this. "Okay — okay — so it's
*Jaws*, but the shark is a **union rep**, and the ocean is *grief*." You cannot
interrupt them, because there is no microphone. There is one button: **NEXT**.

The determinism is the good part and it is already built: every pitch is a seed,
the seed is printed on the display, and typing that seed into fipo.mino.mobi
gives you the identical pitch, in full, with its genome broken out — logline,
budget, the third-act problem it refuses to acknowledge. So the toy is a
physical random-access index into an existing infinite archive, and any pitch
you love is a shareable permalink rather than a thing you half-remember.

| | |
|---|---|
| Guts | ESP32-S3, off-the-shelf retro Bluetooth-handset shell (sourceable at 1k, no tooling), I2S amp + speaker in the earpiece, 4-digit seed display, on-device TTS or pre-rendered cached audio |
| BOM | ~$19 |
| Retail | $65 |
| Software already built | The entire pitch-genome engine; Gemini free tier and the caching-to-records pattern from `borges/` |
| Honest risk | Voice quality is the whole toy. On-device TTS at this price sounds like 1998, which may be *funnier* — worth prototyping both and letting the joke decide. Pre-rendering 50k pitches to audio and shipping them on flash is the safe path. |

---

## 4. The Coriolis Coaster — your coffee, at habitat spin

**Interest:** the O'Neill cylinder pack — seven surfaces (`hoop`, `rind`,
`tide`, `iris`, `biome`, `duck`, `mega`) and clearly the house obsession.

A drink coaster that rotates your cup at the angular velocity of a real O'Neill
cylinder scaled to the cup's radius, so the liquid surface takes the exact
paraboloid a habitat resident would see, and stirring in one direction is
visibly harder than the other. Set the habitat radius on the dial: 8km Island
Three, 1.8km Stanford Torus, or the 4km ring from iris.mino.mobi. Smaller
habitat, more spin, worse coffee.

The joke is that it is *scrupulously correct* and completely ruins the drink —
it is a physics demonstration that punishes you for being interested in it. The
sober version of the joke: it is the only way to actually feel why habitat
designers argue about radius, which is exactly what `tide/` and `rind/` model
in software and cannot make you feel.

| | |
|---|---|
| Guts | BLDC gimbal motor + FOC driver (silent and smooth — a stepper would buzz and ruin it), thrust bearing, encoder, radius dial, USB-C |
| Body | Machined aluminium top plate, MJF base |
| BOM | ~$24 |
| Retail | $85 |
| Software already built | The habitat models — the coaster just reads the same rotation numbers `tide/` and `iris/` already compute |
| Honest risk | The highest-BOM, lowest-margin one, and the only one with a spill mode. Needs a real tip/slosh limit and a stop-on-touch. |

---

## 5. The Needle — the least efficient fidget spinner ever manufactured

**Interest:** the extremal-geometry pack (`kakeya/`, `capset/`, `erdos/`,
`heilbronn/`, `viazovska/`, `borsuk/` — math.mino.mobi).

Turn the knob and a steel needle rotates a full 180° inside a three-cusped
deltoid track, sweeping π/8 of the area a circle would need — Kakeya's original
1917 question, as a mechanism you hold. It is a hypocycloid gear pair, which
means it is entirely mechanical: no battery, no firmware, no radio, nothing to
provision, nothing to certify.

The joke is the marketing: it is a fidget spinner that has been *optimised for
sweeping as little area as possible*, sold to people who find ordinary spinning
wasteful. Engraved on the back: the area, π/8, and the year. On the card in the
box: the actual open problem, and the note that if you drop the convexity
requirement you can get the area arbitrarily close to zero — which is why this
toy cannot be the best possible version of itself, and never will be.

| | |
|---|---|
| Guts | none |
| Body | Laser-cut brass plates, two cut gears, hardened needle, brass knob |
| BOM | ~$4 |
| Retail | $28 |
| Software already built | kakeya.mino.mobi is the box insert's QR destination, unchanged |
| Honest risk | Almost none, which is why it should be built first. The only risk is that the mechanism feels cheap — solvable with mass, i.e. brass. |

---

## If only one gets made

**The Needle.** No firmware, no radio, no certification, no support burden, no
battery, $4 BOM, and it is the purest expression of the joke shared by all five:
*take an idea that is completely impractical to make physical, and then make it
extremely well.* It funds the prototyping of the others.

**The one with the most upside is the Starter Bell**, because it is the only one
where 1000 units produce something none of the others do — a live public dataset
on a protocol we already write to, and a web surface that gets better with every
unit sold. Every other toy is finished when it ships.

---

## On the automatable workflow

The part of this that automates cleanly is the *grounding*: reading the registry
and the curated family taxonomy to derive what the interests actually are,
rather than guessing them. `deploy-registry.json` plus `spec/curated.js` is a
machine-readable interest profile — ten families, 74 surfaces, each with a
description written by whoever cared about it. Any pitch generator can consume
it and every idea above is traceable to specific rows in it.

The part that does not automate is the joke, and the honest-risk row. Both
needed someone to look at a coaster and ask what it would be like to drink from
it.

*(Costs are estimates for discussion, not quotes. Nothing here has been
prototyped or sourced.)*
