# packages/pm — the PM engine

Pure functions, no dependencies, no build: earned value (EVM), earned schedule (ES), critical
path, durations, task-tree utilities. Used by org.mino.mobi's PM app (`org/src/pm/engine.ts`
re-exports it) and vault-mcp's `pm-*` tools.

| File | |
|---|---|
| `engine.mjs` | moved from `org/src/pm/engine.ts`, types stripped, numbers unchanged. One addition: `computeES(tasks, asOf)` |
| `earned.mjs` | `verifiedEarned(tasks, status, { links, asOf })`: EV where a leaf earns only for its **verified** requirements |
| `*.d.mts` | types, generic over the task type |
| `golden.json` | 40 seeded projects and the answers the original TS gave, clock frozen |

```bash
node packages/pm/engine.selftest.mjs   # every golden answer still matches
node packages/pm/earned.selftest.mjs
```

**Changing a number on purpose** means regenerating `golden.json` and saying why in the commit.
Changing one by accident is what the selftest exists to catch. A push here redeploys org.

## Verified earned value

The app's EV is `plannedCost × percentComplete`, and percentComplete is whatever someone typed.
`verifiedEarned` takes a V&V status map (`{ reqId: 'verified' | 'partial' | 'failed' |
'unverified' }`, the shape vv's `status()` returns) and task → requirement links (`task.reqs`, or
vv-style `{ from: taskId, to: reqId, kind: 'implements' }`). A leaf earns its planned cost in
proportion to its verified requirements; a leaf with none earns nothing. The result carries the
engine's EVM and ES on that EV, the self-reported EV beside it, and the difference,
`unverifiedClaim`: how much of the schedule rests on someone's word.
