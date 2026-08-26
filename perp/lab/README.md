# lab — tensor component analysis on price action

A test of whether the method in [Bedbrook, Nath, Zhang, Linderman, Brunet &
Deisseroth, *Lifelong behavioral screen reveals an architecture of vertebrate
aging*, Science 2026](https://www.science.org/doi/10.1126/science.aea9795)
transfers from killifish behaviour to price action.

**Not a surface.** Nothing here is served — `lab` is in `.assetsignore`. This is
the working record of an investigation, kept because the result is mostly a
negative one and negative results rot fastest.

```bash
node lab/build-tensor.mjs     # ~1 min, writes lab/tensor.json (gitignored)
node lab/experiment.mjs       # ~4 min, prints everything below
node test/tca.selftest.mjs    # known-answer proof of the decomposition itself
```

## The analogy

The killifish work records one animal continuously from adolescence to death,
takes several behavioural measurements at high rate, and folds them into a
three-mode tensor — **measurements × time-of-day × day-of-life** — decomposed by
CP/PARAFAC. The day-of-life factors are the aging trajectory.

The mapping to a single asset is exact in shape: **measurements × hour-of-day ×
calendar day**. Few measurements, taken often, over a long span. Here that is
7 × 24 × 1170 days of BTC, from 2023-06-08.

| | killifish | BTC |
|---|---|---|
| individual | one fish | one asset |
| measurements | movement, bursts, sleep | return, \|return\|, range, volume, close position, premium, funding |
| within-cycle | time of day (circadian) | hour of day (UTC) |
| across-cycle | day of life | calendar day |
| outcome | lifespan | — *no analogue; this is the weak point* |

## What the data says

### 1. Only *activity* has a daily rhythm — direction has none

The precondition for TCA beating plain PCA is that the time mode carries
something. Tested against a permutation null that shuffles hours independently
**per day**:

| feature | observed η² | null max | verdict |
|---|---|---|---|
| `logvol` | 0.191 | 0.00082 | real, 232× |
| `parkinson` (range) | 0.0735 | 0.00114 | real, 64× |
| `absret` | 0.0368 | 0.00169 | real, 22× |
| `premium`, `funding` | ~0.0005–0.001 | ~0.0002–0.0005 | marginal — ratio inside the null's own spread |
| `ret`, `closepos` | ~0.001 | ~0.0016 | **not distinguishable** (p ≈ 0.20, 0.01) |

Volume troughs at 05:00 UTC and peaks at 14:00 (US open), swinging 1.3 SD.
Direction of travel has no time-of-day signature at all. The fish analogy holds
precisely here: **an animal's activity is circadian, its heading is not.**

> The null has to permute hours independently per day. One permutation shared
> across all days is only a relabelling of the groups, and η² is invariant under
> relabelling — that null reproduces the observed statistic *exactly* and reads
> as a passing test while measuring nothing. It cost an hour to notice.

### 2. Day coherence is strong; the time mode is nearly inert

| R | observed R² | day-shuffled | hour-shuffled | restart similarity |
|---|---|---|---|---|
| 1 | 0.2310 | 0.0474 | 0.2297 | 1.000 |
| 2 | 0.3477 | 0.0568 | 0.3362 | 1.000 |
| 3 | 0.4016 | 0.0715 | 0.3548 | 0.928 |
| 4 | 0.4259 | 0.0889 | 0.3695 | 0.969 |
| 5 | 0.4442 | 0.0944 | 0.3790 | 0.546 |

Destroying **day** coherence collapses the fit (0.348 → 0.057). Destroying the
**within-day order** barely touches it (0.348 → 0.336).

That is the central finding, and it is a limitation: BTC's diurnal profile is
essentially *the same every day*, so it factors out as a constant shape and the
third mode carries almost no discriminative information. The killifish study
gets its power from the opposite fact — an aging fish's daily rhythm
**changes**, with sleep migrating into daytime and the pattern fragmenting.
Isolating just the day × hour interaction (removing the static profile and each
day's level) does show real shape variation, R² 0.084 against a surrogate's
0.029 — but restart similarity there is 0.33–0.73, so those components are not
stably identifiable.

Reliable rank is **2** (similarity 1.000), with 4 still acceptable (0.969) and a
collapse at 5.

### 3. It does predict — modestly, and only above the right benchmark

Next-day log realised volatility, 5-fold blocked CV, **factors and scalers fit
on training folds only**:

| predictors | OOS R² | gain |
|---|---|---|
| today's realised vol | 0.2043 | — |
| HAR-RV (daily + weekly + monthly) | 0.2474 | — |
| HAR-RV + PCA on daily means (3 PC) | 0.2519 | +0.005 |
| **HAR-RV + TCA day-factors (R=4)** | **0.2732** | **+0.026**, 4/5 folds |

The tensor structure is doing the work: PCA over the *same seven features*
averaged per day adds a fifth as much. TCA keeps the within-day distribution,
not just the daily mean.

> **Leakage is the whole story here.** Fitting the decomposition on all days and
> then cross-validating gave TCA-alone an OOS R² of 0.261 against a 0.204
> baseline — an apparently strong standalone result. Refitting per fold, the
> same number is 0.201, i.e. no better than the baseline. Every headline in this
> file is the no-leakage version.

### 4. What the components are

At R = 4 (feature loadings; `ret` and `closepos` load ≈ 0 on everything):

| component | couples | within-day shape | day-mode lag-1 AC |
|---|---|---|---|
| 1 | premium + funding + volume + range | **flat** | 0.71 |
| 2 | volume + range + \|ret\|, *minus* premium/funding | **flat** | 0.53 |
| 3 | range + \|ret\| + volume | rises to a 22:00 peak | 0.03 |
| 4 | volume + range + \|ret\| | sharp 14:00 peak, 06:00 trough | 0.18 |

Component 1 is carry-with-activity; component 2 is activity with carry going the
other way — the de-risking signature. Only 3 and 4 have real temporal shape,
which is exactly why hour-shuffling costs so little. The yearly means of
factors 1 and 2 drift monotonically from 2023 to 2026, tracking the same funding
regime inversion the surface's front page shows.

## Verdict

The method transfers, and it is not merely PCA in a costume — but the gain is
**+0.026 OOS R² on next-day volatility**, not a new lens on markets. The reason
is specific and worth stating: TCA earns its third mode when the within-cycle
pattern *changes across cycles*. In killifish it does, and that change is the
aging signal. In BTC the daily rhythm is close to static, so the third mode
mostly holds a constant.

Where it would likely pay off better, in rough order of promise:

1. **Many assets as "individuals."** The fish study's real power is a
   population with outcomes. Crypto has thousands of tokens and genuine death
   events (delisting, volume collapse) — a direct analogue of lifespan, which a
   single asset cannot provide.
2. **Assets whose daily rhythm actually changes** — anything with a session
   structure that shifts (equities across earnings, FX across policy regimes).
3. **Finer within-cycle resolution.** At 15-minute bars the intraday shape has
   far more room to vary; Hyperliquid retains ~5000 candles per interval, so
   that is ~7 weeks deep there and would need another source for history.

## Constraints found along the way

- **Hyperliquid `candleSnapshot` retains ~5000 candles per interval, whatever
  the interval** — 1d covers all history, 4h reaches 2024-05, 1h only 2026-01,
  15m ~7 weeks. It also ignores `startTime` as a forward cursor and returns the
  most recent window, so it cannot be paginated backwards. `fundingHistory` has
  no such cap. Hourly OHLCV over the full span therefore comes from Coinbase.
- `lab/tensor.json` and `lab/cb-1h-ohlcv.json` are gitignored — regenerate with
  `build-tensor.mjs`.
