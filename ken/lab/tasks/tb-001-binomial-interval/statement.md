# tb-001 · exact binomial confidence intervals

Every rate this programme reports is a binomial proportion printed with no
interval: a recall of 0.667, a catch rate of 0.45, a verdict accuracy of 96.3%
over 1200 replications. None of them carries a statement of how precisely they
are known.

Build the missing piece.

## What is wanted

A module exporting `interval(x, n, alpha = 0.05)`, returning
`{ lower, upper, point, x, n, alpha }` for `x` successes in `n` independent
trials, using the **Clopper–Pearson** construction: the interval obtained by
inverting the exact binomial test, rather than a normal approximation to it.

It must be exact rather than asymptotic, and it must behave at `x = 0` and
`x = n`, which is where approximations return a zero-width interval and where
this programme spends much of its time.

## Two efforts

**A · the estimator.** `interval()` itself. Correctness here is checkable
against the equations that define the limits, and against closed forms at the
two corners.

**B · the property.** An interval procedure is correct when it covers the true
rate at least `1 − alpha` of the time, whatever that rate is. For the binomial
that is checkable exactly, by summation over outcomes rather than by
simulation.

## Constraints

- Node ES modules. No dependencies, no network, no filesystem.
- Any special functions you need must be implemented in the module.
- The module is graded by executing checks against it. It must import cleanly
  and export `interval` as a named export.
