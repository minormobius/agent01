# Tangled remix pipeline (`/<site>/` → forkable repos)

Publishes self-contained sites as forkable ("remixable") repos on [tangled](https://tangled.org) (git-on-ATProto). Proven on erdos; the live knot host is `tangled.org` (not the Cloudflare-fronted `knot1.tangled.sh`), repo path is `<owner>/<repo>`, push over SSH forcing IPv4.

- **`bootstrap-tangled-key.yml`** — generates the deploy keypair on a runner, stores the private half as the `TANGLED_SSH_KEY` secret via `gh` (needs a one-time fine-grained PAT `SECRETS_PAT` with Secrets:write), prints the public half to paste into tangled Settings → Keys.
- **`mirror-tangled.yml`** — *works*: force-pushes a self-contained site to its tangled template repo on every change. Vars `TANGLED_HANDLE` (owner) + `TANGLED_KNOT` (`tangled.org`).
- **`remixify.yml` + `scripts/tangled-ensure-repo.mjs`** — **WIP, do not rely on**: `putRecord`s a `sh.tangled.repo` record then pushes. Incomplete — it copies `repoDid` and skips the knot's real XRPC registration, so repos get conflated. Needs the create XRPC the tangled UI fires (capture via DevTools). Dormant on `main` (push trigger scoped to the feature branch).
- `scripts/publish-to-tangled.sh`, `scripts/setup-tangled-key.sh` — local-machine equivalents of the workflows.

---

<!-- Moved out of root CLAUDE.md. Referenced from the GitHub Actions section there. -->
