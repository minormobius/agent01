# Running ATOM⁴ calculations on another machine

For a collaborator (another person or agent) with more memory or cores than GitHub's runners (4 cores, 16 GB). The
tools need only Node 22 and this repository; they write one small JSON file per finished point into a cache folder, and
those files are the whole result. Nothing here needs write access to the repository.

## Setup

```bash
git clone https://github.com/minormobius/agent01.git
cd agent01
git checkout claude/minesweeper-voronoi-mesh-4hc4ir
node --version            # 22 or later
export TMPDIR=$PWD/out    # the caches land in $TMPDIR/atom4-*
mkdir -p "$TMPDIR"
```

## What to run: PxGl₂ pairs

Each command is one pair placement, one process, single-threaded. Run as many at once as there are cores and memory.

```bash
# the economy basis (core contracted, single precision): about 6–7 GB and an hour or more each
node four/atom/tools/molpair.mjs pair PxGl2 <k>
# the full basis in double precision: about 13–16 GB each, for machines with the memory (the economy's check)
node --max-old-space-size=8000 four/atom/tools/molpair.mjs pair PxGl2 <k> --full
```

`k` is a placement number. Ranges agreed in advance keep two machines from computing the same placement:
- this collaborator: **k = 1000–1149** (economy) and **k = 0–15 with `--full`**;
- the repository's own runners take k = 0–999.

The same for our OF₂, the check (3D, a few GB, minutes each): `node four/atom/tools/molpair.mjs pair OF2 <k>`, k = 1000–1099.

A command that is stopped can be run again; a finished point is never recomputed.

## Sending the results back

```bash
cd "$TMPDIR" && tar czf atom4-molpair-results.tgz atom4-molpair/
```

Send `atom4-molpair-results.tgz` to the repository's maintainer. If you have been given push access, push the folder's
files to a branch of your own (e.g. `codex/atom4-results`), never to `claude/minesweeper-voronoi-mesh-4hc4ir`, which
deploys the live site.

## How the results are checked

The code is deterministic: the same command gives the same energy to about 10⁻¹⁰ hartree on any machine. Before any
result is used, a sample of the points is recomputed on the repository's runners and must agree; each file also
carries the placement's atom positions, which are regenerated from `k` and compared.
