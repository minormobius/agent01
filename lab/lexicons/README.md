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

## Running it — all of it is a marker bump

Nothing here needs a human at a console. `workflow_dispatch` does not resolve
for workflows off the default branch, which is why the UI button does not exist
yet; the repo's answer, borrowed from `setup-email-routing.yml`, is a marker
comment and a push trigger on the workflow's own path.

| Bump the marker in… | and the push |
|---|---|
| [`publish-lexicons.yml`](../../.github/workflows/publish-lexicons.yml) | publishes the schema records **and** writes the DNS TXT record, then reads both back from outside |
| [`propagate-auth-scope.yml`](../../.github/workflows/propagate-auth-scope.yml) | adds the two collections to the ceiling **on the auth surface's own branch**, which fires `deploy-auth` |

Both are idempotent, so a no-op re-run is the normal outcome and is harmless.

**Editing a schema does not publish it.** A push that touches `lab/lexicons/`
validates and stops; only a marker bump asserts. A lexicon is a promise, so
editing one should be cheap and publishing one should be a decision.

**The DID is never hardcoded.** The publish step logs in, reports the DID it
published as, and the DNS step writes that. A constant would survive exactly
until the service account was replaced — which has already happened once.

**The Cloudflare token's DNS permission is measured, not assumed.** The same
token can read zones and cannot create an email destination, which
`setup-email-routing.yml` found the hard way. If the DNS write is refused, the
step prints the exact permission to add (Zone → DNS → Edit) and the exact record
to create by hand, rather than failing on a 403 that reads like the record
already existed.

**Green is not proof**, so the last step resolves the TXT record through
`cloudflare-dns.com` and reads both schema records back out of the repo — from
outside, after the job changed them.

### What is still genuinely a human decision

Widening `CLOUDFLARE_API_TOKEN` if it turns out to lack DNS edit. The workflow
will tell you, precisely, and the fallback is one record pasted into the
dashboard.

### The auth ceiling was already behind

While writing this, the auth branch's `WRITE_COLLECTIONS` turned out to be
missing **three collections beyond the lab's two** —
`com.minomobi.hoop.story.content`, `com.minomobi.hoop.story.rumor` and
`com.minomobi.ecdysium.save`. Those sites can request scopes the auth server
will refuse. `propagate-auth-scope.yml` takes an explicit list and deliberately
does **not** ship them: they belong to surfaces nobody has reasoned about here,
and widening a ceiling on somebody else's behalf is a decision, not a tidy-up.
Pass them to the workflow when that call has been made.
