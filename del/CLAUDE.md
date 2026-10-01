# del — del.mino.mobi (plain route)

<!-- HAND-OWNED. Instruction set for THIS surface. Repo-wide rules live in
     ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

**The miniphim observatory.** Live state of the Modulo & Morphyx experiment: two agent beings
split from one person, sharpened in a lab before they launch on Delvetown and Bluesky. The
design lives in [`docs/MINIPHIM.md`](../docs/MINIPHIM.md), [`docs/HARNESS.md`](../docs/HARNESS.md)
and [`docs/DELVE.md`](../docs/DELVE.md); the lab is [`packages/whetstone/`](../packages/whetstone/).

## Facts

| | |
|---|---|
| Surface | `del` |
| Endpoint | `del.mino.mobi` (plain route, no custom-domain slot) |
| Type | frontend: thin assets Worker `del`, no script, no bindings, no secrets |
| Owning branch | `claude/agent-social-media-drlzxn` |
| Deploy | `.github/workflows/deploy-del.yml`: route-dns, deploy, then fails unless `/`, `/pitch/` and `/state.json` serve |

## Pages

| path | what |
|---|---|
| `/` (`index.html`, `del.css`, `del.js`) | the observatory: phase, the two beings, the lab's benches, the latest whetstone run against its gates, the bar, the neighbours, the log |
| `/pitch/` | the diagram-first pitch, self-contained (its own inline styles) |
| `/state.json` | the hand-edited state the observatory renders |

## How it stays current without a build

Two sources, split by who can know the thing:

- **`state.json`, hand-edited.** The phase, each bench's build status, who is born (domain, DID),
  and the log. Only a person can say these. Edit it and push to the owning branch; that push
  deploys.
- **Everything the lab produces, read live in the browser** from the public repo on GitHub
  (`raw.githubusercontent.com` and the unauthenticated API, both CORS-open): each soul file
  (hashed in the browser exactly as `whetstone/lib/lab.mjs` hashes it, so the hash on the page is
  the hash in a scorecard), its last commit, `gates.json`, and the newest directory under
  `packages/whetstone/runs/` with its `scorecard.json`. A whetstone run commits its results back
  with `GITHUB_TOKEN`, which deploys nothing, so this is how a new run reaches the page.

GitHub allows 60 unauthenticated API calls an hour per IP. The page makes three (two commit
lookups, one directory listing) and caches every response in `sessionStorage` for ten minutes.
On a 403 it says so in the section instead of going blank.

## Rules

- **The pitch has one source: `pitch/index.html`.** The claude.ai artifact
  (`claude.ai/artifact/4UAit5hPXJtsMMqL3kwyeZ`) is republished from it, never edited separately.
- **Nothing private.** This surface is public and so is the repo it reads. No session corpus, no
  passenger output, no whisper ever goes on this site. When the beings are born, their board is
  linked, not mirrored.
- **Neighbours are linked, not embedded.** Jev (`mega.mino.mobi/jev/`) and the Imp bench
  (`imp.mino.mobi`) belong to their own branches; this site cites them and writes nothing to them.
- **Diagrams are inline SVG** coloured from the page tokens (`currentColor`, `--mod`, `--mor`), so
  they work in both themes. Check a new one at phone width: wide figures scroll inside their own
  frame and the page body never does.
