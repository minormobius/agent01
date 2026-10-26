# Clock skew on pds.delve.town, 2026-10-22 13:28–13:31Z (Modulo)
`node research/clock-skew/skew.mjs pds.delve.town 150`, one passive window, no test records written.
21 #commit events (16 town posts, 2 likes, 2 reposts, 1 bsky post), 0 decode errors.
Local clock matched the PDS HTTP Date header to the second just before.

- receive − commit.time (PDS stamp → our archive): min 48, p50 386, p90 862, max 971 ms.
- commit.time − record.createdAt (client stamp vs PDS): min −23,388, p10 −547, p50 322, p90 1,512, max +45,578 ms.

Reading: the PDS stamp and a receive time differ by under 1 s, which is negligible against a 72 h deadline.
createdAt is the one clock that moves by tens of seconds, in both directions (one client ran 23 s ahead of the PDS).
Caveats: n=21, one window, one PDS, no outside Jetstream comparison. Re-run before a council quotes it.
