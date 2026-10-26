# The ATOM⁴ compute queue

ATOM⁴'s long calculations run on GitHub's runners, not in the agent's sandbox. The sandbox is reclaimed a few
minutes after a session goes idle, and a detached run goes with it. A runner has 4 cores and 16 GB, runs a job for
up to 6 hours, and doesn't care whether anyone is watching. The workflow is
[`atom4-compute.yml`](../workflows/atom4-compute.yml).

## Queueing a run

Edit [`atom4.json`](atom4.json) and push it to the branch that owns `four` and `games` (`claude/minesweeper-voronoi-mesh-4hc4ir`). That push
fires the workflow. Once the workflow file is on the default branch, it can also be run by hand.

```json
{
  "run": "clusters-hexamers-1",
  "why": "what the run is for, in a sentence",
  "minutes": 330,
  "groups": [
    { "name": "x6-a", "cmds": ["node four/atom/tools/clusters.mjs 4 6 2400 --shard 0/8", "…up to four"] }
  ]
}
```

- **One group, one runner.** A group holds up to four commands, run side by side (one per core). Groups run in
  parallel, up to 20 at once.
- **Commands are ATOM⁴ tools and nothing else.** `plan.mjs` refuses anything that isn't
  `node four/<part>/tools/<tool>.mjs` followed by plain words, and `run.mjs` spawns node without a shell.
- **`minutes` is the deadline.** It can be at most 340. At the deadline each command is stopped. The tools save their
  caches every few seconds, so pushing the same queue again (bump `run`) resumes from where they stopped.
- **`"enabled": false`** keeps a queue file without running it.

## Where the results go

To the orphan branch **`atom4-data`**:
- `tmp/atom4-*/`: the tools' caches, exactly what they keep in `$TMPDIR`;
- `runs/<run>/<group>/`: each command's log, `status.json`, and the run's `run.json` (result, code commit, Actions
  link).

Every runner restores `tmp/` from that branch before it starts, and the collect job writes back only the files each
group changed. Two groups must not write the same cache file. Sharded searches (`clusters.mjs --shard i/m`) each
write their own.

To use the results in the sandbox:

```bash
git fetch origin atom4-data && git worktree add /tmp/atom4-data origin/atom4-data   # or git archive
cp -r /tmp/atom4-data/tmp/atom4-* /tmp/            # the tools' default TMPDIR
node four/atom/tools/clusters.mjs bake           # then regenerate the pages as usual
```

`atom4-data` holds no workflows, so its pushes wake nothing. It isn't a `claude/*` branch, and it is never merged:
the merge flow skips it, and `main` never needs it.

## Limits worth knowing

- `pairsearch.mjs` and `census.mjs` start their own Hartree–Fock processes, up to 6 GB each, four at a time. Give
  one of them a group to itself.
- One run at a time (`concurrency`). A second push waits for the first run to finish.
- Artifacts are kept for 7 days. If the collect job fails, the groups' output can still be fetched from the run
  page.
