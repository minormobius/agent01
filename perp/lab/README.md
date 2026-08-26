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

---

# Part two: the same question at 19 events/sec

Hourly bars sample 24×/day. Bedbrook et al. sample at **20 Hz — 1,728,000×/day**.
That is not a resolution difference, it is a different measurement regime, so
the analysis was rebuilt on tick data.

`microstructure.mjs` streams Binance aggTrades and reduces each day to 288
five-minute slots of 13 microstructure features, deleting the raw as it goes.
**Binance's API is geo-blocked from this sandbox but `data.binance.vision`, its
public S3 archive, is not** — that is what makes deep tick history reachable
here at all. BTCUSDT perp aggTrades run **1,612,809 events/day (18.7/sec)**,
which is 93% of the killifish sampling rate. One year = 588M trades → 104,832
slots.

### Rate ladder (all measured, not quoted)

| feed | events/day | Hz | vs fish 20 Hz | history |
|---|---|---|---|---|
| hourly candles *(part one)* | 24 | 0.0003 | 0.00001× | 2015→ |
| 1s klines | 86,400 | 1.0 | 0.05× | 2017-08-17 → yesterday |
| **aggTrades** | 1,612,809 | **18.7** | **0.93×** | 2017 → yesterday |
| raw trades | 6,249,114 | 72.3 | 3.6× | 2017 → yesterday |
| bookTicker (every BBO change) | ~11.4M | 132 | 6.6× | **only to 2024-04, partial** |

### Trade signing is exact, and verified

aggTrades carries `is_buyer_maker`, so trades are signed without Lee-Ready
inference. The check that this is the right way round:

```
corr(OFI_t, return_t)      +0.4708     order flow moves price as it happens
corr(OFI_t, return_{t+1})  -0.0038     and carries nothing forward
```

### 1. Yes, something is predictive — but it is activity, not microstructure

Next-slot log realised volatility, n = 104,544, blocked CV:

| model | OOS R² |
|---|---|
| persistence only | 0.3871 |
| benchmark: 3 horizons + time-of-day | 0.4911 |
| **+ all 13 microstructure features** | **0.5111** (+0.0200) |

Marginal contribution of each feature added alone to the benchmark:

```
logcount   +0.0151      rollSpread -0.0000
logvolume  +0.0088      ofi        -0.0000
amihud     +0.0072      kyleLambda -0.0001
burstiness +0.0010      ...rest ~0
```

The whole gain is **activity intensity**. Kyle's lambda, Roll's implied spread
and order-flow imbalance add *exactly nothing* once trade count is known. This
is the volume-volatility relation (Clark 1973, mixture-of-distributions)
recovered at 5-minute resolution — real, long known, and not what tick data was
supposed to buy.

**Direction: R² = -0.0000 and -0.0011.** Not weakly positive. Negative. Nothing
in the behaviourome forecasts the sign of the next 5 minutes.

### 2. There IS a behaviourome: three reproducible axes

| R | observed R² | day-shuffled | slot-shuffled | restart similarity |
|---|---|---|---|---|
| 1 | 0.1491 | 0.0209 | 0.1461 | 1.000 |
| 2 | 0.2007 | 0.0519 | 0.1927 | 0.997 |
| **3** | **0.2413** | 0.0604 | 0.2181 | **1.000** |
| 4 | 0.2800 | 0.0666 | 0.2286 | 0.573 |
| 5 | 0.2959 | 0.0703 | 0.2334 | 0.474 |

Cliff-edge rank selection: perfect reproducibility through R=3, collapse at R=4.
Thirteen features, three axes (`axes.mjs` prints this table directly):

| axis | share | loads on | within-day peak | day lag-1 AC |
|---|---|---|---|---|
| **1 fragmentation** | 41.5% | burstiness .50, count .45, amihud .33 — *minus* meanSize .38, largeFrac .36 | 21:45, nearly flat | **0.828** |
| **2 activity** | 38.9% | count .54, burstiness .50, volume .49, amihud .36 | **14:30 (US open)** | 0.385 |
| **3 stress** | 19.6% | rvTick .78, amihud .39, rollSpread .38, kyleLambda .26 | 10:00, flatness 4.6 | **0.002** |

Axis 1 separates *many small clustered trades* from *few large blocks* and is
strongly persistent day to day. Axis 3 is volatility-with-impact: the strongest
intraday rhythm of the three and **no day-to-day memory whatsoever**.
`ofi` and `ret` load ≈0.00 on all three — direction is orthogonal to the entire
structure.

### 3. There is no market clock

The paper's headline is a behavioural clock reading a fish's age off its
movement. The chart analogue, with purged blocked CV so a test day never has its
neighbours in training, and predictions clipped to the training range:

```
span 363 days; a useless clock errs by ~91 days
daily feature means -> date    median error  98.6 days
TCA day-factors     -> date    median error 112.6 days
per fold (TCA): -0.30  0.43  -3.44  0.29  0.11
```

Worse than useless. And the reason is the sharpest thing this whole exercise
found: **a fish ages, a market cycles.** Aging is monotone and irreversible, so
behaviour encodes elapsed time. Market regimes are recurrent — axis 1 has
memory (AC 0.83) but no arrow. A day in 2025 can look exactly like a day in
2026, so there is nothing to read a date off.

## Verdict

Two passes, at 24 samples/day and at 1.6M events/day.

**The method transfers. The organism's arrow of time does not.**

At hourly resolution TCA added +0.026 OOS R² on next-day volatility over HAR-RV.
At tick resolution the behaviourome is sharper — three perfectly reproducible
axes instead of a smeared four — and microstructure adds +0.020 OOS R² on
next-slot volatility over persistence-plus-seasonality. Both are real, both are
modest, and at both scales the gain is carried by *how much is happening*, not
by the theoretically-motivated microstructure. Kyle's lambda and Roll's spread
contributed nothing either time.

What high rate did buy, concretely:

- **A cleaner behaviourome.** Rank selection went from ambiguous (similarity
  0.93 at R=3, 0.97 at R=4, 0.55 at R=5) to a clean cliff (1.000 through R=3,
  0.573 at R=4). The axes are stable enough to name.
- **A real answer on direction.** With n = 104,544 and exact trade signing,
  "returns are unpredictable" stops being an assumption and becomes a measured
  R² of -0.001.
- **The decisive negative.** The behavioural clock — the paper's headline —
  fails outright.

That last one is the finding. The killifish work succeeds because aging is
**monotone and irreversible**: an old fish never moves like a young one again,
so its behaviour encodes elapsed time and a clock can read it. Market behaviour
is **recurrent**: axis 1 carries a day of memory (lag-1 AC 0.83) but no
direction. Regimes return. There is no market age to estimate, and no amount of
extra sampling rate creates one.

Where it would still pay to look, in order:

1. **Many assets as individuals, with real deaths.** The population structure is
   what the single-asset framing cannot supply. Tokens delist and go to zero;
   that is a genuine lifespan, and predicting it from early trading behaviour is
   the actual analogue of the paper.
2. **Cross-sectional axes.** If the three axes here are universal, they should
   appear in every liquid asset — and an asset's *position* on them relative to
   peers may carry what its own time series does not.
3. **Volume time rather than clock time.** The fish's clock is the sun. A
   market's may be volume; the intraday rhythm found here is a clock-time
   artefact of session overlap, and resampling on a volume clock would test
   whether the rhythm survives.

## Constraints found along the way


- **Hyperliquid `candleSnapshot` retains ~5000 candles per interval, whatever
  the interval** — 1d covers all history, 4h reaches 2024-05, 1h only 2026-01,
  15m ~7 weeks. It also ignores `startTime` as a forward cursor and returns the
  most recent window, so it cannot be paginated backwards. `fundingHistory` has
  no such cap. Hourly OHLCV over the full span therefore comes from Coinbase.
- `lab/tensor.json` and `lab/cb-1h-ohlcv.json` are gitignored — regenerate with
  `build-tensor.mjs`.
