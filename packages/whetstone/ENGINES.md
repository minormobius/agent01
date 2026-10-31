# Engines: what an agent can run

An **engine** is a folder in this repo that an agent can run with node and nothing else, plus a
guide that tells it how. The CAD engine is the first. The souls are the first agents to use it, and
they won't be the last, so the contract below is written for any agent and any harness, not just
this lab.

## The contract

A folder qualifies as an engine when all of these are true:

1. **It runs on node 22 alone.** No `npm install`, no network, no secrets, no browser. Binaries such
   as `.wasm` are committed. Anything that needs more is listed as unavailable in `what`, the way
   CAD lists PNG rendering.
2. **It runs from a copy.** Nothing reaches outside its own folder (`../../`), so it works the same
   copied to `engines/cad/` in a lab folder, to a runner, or to someone's laptop.
3. **It runs read-only.** It writes only where the caller says (`--stl ../../box.stl`), never into
   its own folder.
4. **It has a guide**: one file an agent reads first (CAD: `SKILL.md`). It covers the loop, the
   commands, what each one reads back, the units, and the failure modes in their own words.
5. **It has a health command** that proves, in seconds, that this copy works. The lab runs it on the
   staged copy before any model is called, and an engine that fails stops the run.
6. **It has a selftest.** The health command proves the copy runs. The selftest, run by preflight on
   every change, proves the answers are right.

## Adding one

1. Make the folder meet the contract. Check point 2 by copying it somewhere else and running the
   health command there with write permission removed (`chmod -R a-w`).
2. Add an entry to `engines.json`: `path`, `exclude` (subfolders the engine doesn't need, such as
   heavy harnesses or `node_modules`), `guide`, `health`, and `what`. `what` is one honest paragraph
   for the agent: what it does, and what it can't do here.
3. Name it in a request (`"engines": "cad,dataviz"`) and read the run's log for
   `engine <name>: staged …, health ok`.

## In the lab

`run.mjs` stages each named engine once per run and runs its health command. `lib/work.mjs`
copies it into every session's `seed/` and `work/`, so it is never a change, and marks it
read-only. `lib/commons.mjs` never harvests `engines/`. Each session finds `engines/README.md`
(the index, built from `what` and `guide`), and TODAY.md names the engines lent that day. An
agent's outputs (an STL, a measurement, a chart) go in its own files, where the lab keeps them like
any other work.

## Registered

| Engine | Path | Health | Guide |
|---|---|---|---|
| `cad` | `packages/cad` (without `bakeoff/`) | `node agent/build.mjs bench:plate` | `SKILL.md` |
| `dataviz` | `packages/dataviz` | `node dataviz.selftest.mjs` | `README.md` |

Next to write, when a project needs it: **sound**. Tape's enclosure needs one: the response of a
small driver in a sealed or ported printed box (Thiele–Small parameters in, a frequency response
and a port-noise check out). Whoever builds it, souls or anyone else, builds it to this contract.
