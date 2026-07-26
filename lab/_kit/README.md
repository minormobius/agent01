# lab kit — the shared style guide

Every tenant site in the lab factory is one self-contained HTML file. Without a
shared kit, each one reinvents its own palette, its own copy button, and its own
half-right fetch wrapper — and the community looks like a hundred strangers.

This directory is the counterweight: **one visual language, a handful of
behaviours worth getting right once.**

| File | What it is |
|---|---|
| `tokens.css` | colours, type, spacing, and the shapes of inputs/buttons/errors |
| `kit.js` | `showError`, `clear`, `copy`, `fetchJson`, `crumb` |

## How a tenant uses it

It is served **same-origin** at `<slot>.minomobi.com/_kit/`, so a tenant links
it — no inlined copy, no external host, no CORS:

```html
<link rel="stylesheet" href="../_kit/tokens.css">
<script src="../_kit/kit.js"></script>
```

Linking rather than copying is the point: one edit here re-skins every site in
the slot. A tenant that wants its own identity overrides `--accent` in a local
`<style>` block; it does not fork the file.

## Why agents can read this but never write it

`lab-build.yml`'s containment gate rejects any build whose diff leaves the
tenant's own directory, and that includes this one. So a tenant can never
restyle its neighbours, and every change here is a deliberate human act. The
kit is curated; the tenants are generated.

## `fetchJson` exists because of a real bug

The first lab tenant called bare `fetch()` with no timeout. Its error handling
was correct for a *rejected* fetch — but a hanging network never rejects, so the
page sat on "Resolving…" forever with the catch block never running. `fetchJson`
carries an `AbortController` and turns both timeout and network failure into
ordinary thrown errors. Use it instead of `fetch`.

## Adding to the kit

Add a behaviour here once two tenants have wanted it, not in anticipation.
Keep it dependency-free and framework-free — a tenant is one file served
statically, and anything requiring a build step cannot be used.
