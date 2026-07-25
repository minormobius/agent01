# OAuth — grandfathered exceptions and migration status

<!-- Moved out of root CLAUDE.md. The RULES (canonical architecture,
     narrow scopes, adding a new site, what to never do) stay there;
     this memo carries the per-site migration bookkeeping. -->

## Grandfathered exceptions (don't extend these to new sites)

| Site | OAuth | Why it's separate | Migration cost |
|------|-------|-------------------|----------------|
| **poll** | Own BFF at `poll/apps/api/src/oauth/` | Shipped before `workers/auth/` existed. The auth worker was *extracted from* poll (see the file headers: "Extracted from poll/apps/api/src/oauth/..."). | **Hard.** Poll *is* the OAuth BFF for itself and its sub-rooms (mmo, draw, paint). Migrating means redesigning session storage and likely deprecating poll's `/api/auth/*` route surface. |
| **airchat** | Own OAuth at `airchat/oauth/` | Cloned poll's modules to vanilla JS when airchat needed to ship; `airchat/oauth/jwt.js` says "Port of poll's apps/api/src/oauth/jwt.ts". | **Medium.** Custom scope (`atproto repo:com.minomobi.airchat.voice blob:audio/*`) is already a scope the auth worker can grant. Migration = (1) bump auth worker's umbrella to cover `blob:audio/*`, (2) use `auth.pds.uploadBlob()` through the proxy, (3) drop `airchat/oauth/`. Worth doing on the next airchat refactor. |
| **mmo, draw, paint** | Call poll's `/api/{draw,mmo}/oauth/start` | These backends live *inside* poll's worker — they're rooms in poll's house, not separate sites. | **Tied to poll.** Migrating them means migrating poll or moving them out of poll's worker first. |

**Mental model**: sites that have their own Worker doing BFF-style OAuth are grandfathered. Sites that are static frontends (or could be static + a thin Worker) should use `workers/auth/`. When in doubt, use the shared worker.

## Migration status of the rest

**Already on the shared worker** (`packages/oauth-client/auth.js`):

| Site | How it uses the lib |
|------|---------------------|
| bakery | imports `AuthClient` directly (`bakery/src/atproto.js`) |
| photo | `photo/src/lib/auth.js` is a thin wrapper around `AuthClient` — exports the function-shaped API (`init`, `login`, `logout`, `authFetch`, etc.) so call sites are unchanged |
| wave | `wave/src/lib/auth.ts` is the same wrapper pattern in TS (`authInit`, `authLogin`, `authLogout`, `authFetch`, `AuthUser`) |
| wiki | `wiki/src/lib/auth.ts` is the same wrapper pattern in TS |

Why a wrapper instead of changing every call site to `new AuthClient()` directly? Diff minimization, stable surface area inside the project, and a single place to swap the implementation if the shared lib's API evolves. New projects should still call `new AuthClient()` directly — the wrapper is a migration aid for projects with existing call sites.

**Still doing it themselves** (have inline OAuth code in HTML/JS rather than a clean `auth.ts` file):

| Site | Where the OAuth bits live | Migration effort |
|------|---------------------------|------------------|
| labglass | `labglass/js/atproto.js` | Trivial once you isolate the OAuth section |
| music | inline in `music/index.html` (~1228 lines, OAuth around line 1228+) | Medium — needs un-mixing from page JS |
| sweat | inline in `sweat/index.html` (OAuth around line 385+) | Medium |
| answers | `answers/assets/answers.js` + `answers/docs.html` | Medium |
| cluster | inline in `cluster/index.html` (OAuth around line 634+) | Medium |
| org | `org/src/pds.ts` (auth + PDS mixed) | Medium |

Bakery is the reference for direct usage: `bakery/src/atproto.js` imports the shared lib. Photo/wave/wiki are references for the wrapper pattern.

## What to never do

- **Never reimplement OAuth in a new site.** Use the shared worker.
- **Never commit the patched `database_id` back to `workers/auth/wrangler.jsonc`.** The `TODO_CREATE_DATABASE` literal is intentional — the deploy workflow handles it.
- **Never widen the umbrella scope in `client-metadata.json` casually.** Every site that uses the worker inherits the ceiling. Add new scopes only when a real feature needs them.

---
