# isoratio — session pipeline

`node cli.mjs sessions/*.csv` prints, for each session file, one JSON line:

    {"session":"s01","n":38,"delta_permil":-1.234567,"se_permil":0.0123}

The group's paper reports every sample to ±0.02‰ (1 standard error). A reviewer has written
back that this is "implausibly good for a single-collector instrument" and asked for the
reduction to be checked against the stated method. The method below is what the paper says
was done.

## Method (as published)

Each session file has cycles in time order: `t` (seconds), `kind` (`std` or `sample`), and
ion counts `a` and `b`.

1. **Ratio.** For every cycle, R = b / a.
2. **Drift.** Fit a straight line R_std(t) = α + β·t by ordinary least squares through the
   **standard** cycles only. For each **sample** cycle, δ = (R / R_std(t) − 1) × 1000, in ‰.
3. **Outliers.** Compute the mean and the sample standard deviation (n − 1) of the sample δ
   values, and reject any cycle more than **3** standard deviations from the mean. Do this
   **once**; do not iterate.
4. **Result.** Report the mean δ of the remaining cycles as `delta_permil` and its standard
   error, sample standard deviation / √n, as `se_permil`, with `n` the number of cycles kept.

Numbers are printed unrounded. `node test.mjs` runs the tests.
