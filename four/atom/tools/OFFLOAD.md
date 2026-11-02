# Running ATOM⁴ calculations on another machine

For a collaborator (another person or agent) with a machine to spare: the work adds to GitHub's runners (4 cores,
16 GB each), placement by placement. The
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

Each command is one pair placement, one process, single-threaded, and needs only reading the repository.

```bash
# the economy basis (core contracted, single precision): about 5–7 GB of memory and one to three hours each
node four/atom/tools/molpair.mjs pair PxGl2 <k>
```

On a **16 GiB machine run at most two at once** (two of them use about 13 GB; a third would run it out of memory, and
with no swap the processes are killed). Don't use `--full` there: the whole basis in double needs 13–16 GB for one.

`k` is a placement number; ranges agreed in advance keep two machines from computing the same placement:
- this collaborator: **PxGl₂ k = 1000–1019**, then **OF₂ k = 1000–1039**;
- the repository's own runners take k = 0–999.

OF₂ is our world's check (3D, about 3 GB and ten minutes each, so four can run at once on 16 GiB):
`node four/atom/tools/molpair.mjs pair OF2 <k>`.

A command that is stopped can be run again; a finished point is never recomputed. Check progress with
`ls $TMPDIR/atom4-molpair/`; each finished placement is `pair-<name>-<k>.json`.

Status of the method: the economy basis agrees with the full basis to 0.03 kcal/mol on our OF₂'s first test
placement; two more are being checked. If they fail, this file will say so and the points already computed are
discarded.

## Sending the results back

```bash
cd "$TMPDIR" && tar czf atom4-molpair-results.tgz atom4-molpair/
```

Send `atom4-molpair-results.tgz` to the repository's maintainer. Read access is all that's needed: the maintainer attaches the archive to the
repository's session, where the points are checked and committed.

## How the results are checked

The code is deterministic: the same command gives the same energy to about 10⁻¹⁰ hartree on any machine. Before any
result is used, a sample of the points is recomputed on the repository's runners and must agree; each file also
carries the placement's atom positions, which are regenerated from `k` and compared.
