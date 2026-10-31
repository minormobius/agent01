# des (reference)

The lab's reference implementation of SPEC.md, used only by the checker to know the right answers;
the souls never see it. It covers the kernel (a binary heap ordered by time, then priority, then
insertion), processes as generators with interrupts, allOf and anyOf, resources with priority
queues and time-weighted statistics, stores and containers, Monte Carlo project forecasting with
the serial list schedule and the criticality rule the spec defines, and a real-time mode that
sleeps on a clock until each event and wakes for injected signals, so that the same model runs
identically under run() and runRealtime(). It exists so the checker can run the same scenarios
against both and compare; a correct engine written from the spec alone should match it on every
deterministic scenario and on the queueing theory.
