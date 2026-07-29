# `com.minomobi.lab.*` — the lab factory's lexicons

Two record types, shared by every agent-built site on `minomobi.com`:

| NSID | What it is |
|---|---|
| [`com.minomobi.lab.doc`](com.minomobi.lab.doc.json) | something a visitor made, saved or configured |
| [`com.minomobi.lab.score`](com.minomobi.lab.score.json) | a result worth comparing |

They are written to the **visitor's own repository**, never to a lab server.
See [`lab/_kit/README.md`](../_kit/README.md) for how a site uses them and why
there are two for the whole factory rather than two per site.

## Publishing

```bash
node scripts/publish-lexicons.mjs --check   # validate + print the DNS name
node scripts/publish-lexicons.mjs --write   # write the records (needs bot creds)
```

A schema is JSON until **two** things are true, and the second is the one people
forget:

1. A `com.atproto.lexicon.schema` record exists whose **record key is the NSID**
   and whose `id` field equals that key. `--write` does this, and the
   `publish-lexicons` workflow runs it on an explicit dispatch — a push only
   validates, because a lexicon is a promise and publishing should be a decision.
2. A **DNS TXT record** points at the DID holding them. No script can do this.

### The DNS name is not the obvious one

Resolution takes the NSID, **drops the final segment**, reverses the rest, and
queries `_lexicon.<that>`. It does **not** recurse up or down the hierarchy, so
only the exact computed name works:

```
com.minomobi.lab.doc  →  authority com.minomobi.lab  →  lab.minomobi.com

  _lexicon.lab.minomobi.com   TXT   "did=did:plc:…"
```

`_lexicon.minomobi.com` is the natural guess and it is **wrong** — a real name we
own, at which nothing resolves. One record covers the whole `com.minomobi.lab`
namespace, which is why both schemas live under it, and `lab.minomobi.com` is
already a route on the lab worker.

The publishing DID is the service account that holds the handle `minomobi.com`.
The schemas describe what the factory writes, so the same identity should assert
them; anything else points minomobi's namespace at an account with no visible
relationship to minomobi.

## Changing one

**A lexicon is a promise**, and the point of publishing is that readers you do
not know about can rely on it. Add optional fields freely. Do not remove or
repurpose a required one — if a shape must change incompatibly, it is a new
NSID.

## Human steps, in order

1. `--write` once, from a dispatch. The run prints the DID it published as.
2. Create `_lexicon.lab.minomobi.com  TXT  "did=<that DID>"` in the Cloudflare
   zone for `minomobi.com`.
3. Redeploy `workers/auth/` so the scope ceiling includes the two collections —
   the auth worker only grants what its `client-metadata.json` declares, and
   `WRITE_COLLECTIONS` is what builds that.

Until (3), a lab site's `signIn()` asks for a scope the auth server will not
grant. Until (2), the schemas are published and simply not discoverable, which
is a fine state to sit in — publishing first is how you learn the DID.
