# ATProto as Public Commons Infrastructure

## What We Built

The bakery is a static frontend (React on Cloudflare Pages) that reads and
writes structured data to the AT Protocol network. There is no application
server. The user's PDS *is* the backend. Cloudflare serves the HTML. That's
the whole stack.

```
[Static HTML/JS on Cloudflare Pages]
        |
        | fetch()
        v
[User's PDS]  <-->  [ATProto Relay Network]
```

The bakery app specifically uses the `exchange.recipe.recipe` lexicon to store
bread recipes — flour blends, hydration percentages, instructions — as
structured records in the user's personal data repository.

## Why This Matters

ATProto repos are not social media profiles. They are **user-owned, publicly
addressable, cryptographically signed data stores** federated across the
network. Every record has a stable AT URI (`at://did/collection/rkey`), and
anyone with a network connection can read it through a relay or directly from
the PDS.

This means the pattern we built — static frontend + ATProto backend — is not
specific to recipes. It is a **general-purpose architecture for building
viewers into a decentralized public commons**.

Swap the lexicon and the rendering template and you have a completely different
application reading from the same infrastructure:

- **A bookshelf.** Store a novel as a series of lexicon records, render them
  in a static reader. The author's PDS is the publishing house.
- **A textbook platform.** Markdown content with embedded references, all
  version-controlled by the protocol itself.
- **A personal wiki.** Interlinked documents stored as records, browsable by
  anyone, editable only by the owner.
- **A static markdown viewer.** One HTML page that resolves an `at://` URI
  and renders whatever it finds. Novels, documentation, field notes — the
  viewer doesn't care.

The gap between "I deployed a recipe site" and "anyone can build a window into
a permanent public library" is about one lexicon definition.

## The Architecture Pattern

The key properties that make this work:

1. **No server needed.** The frontend is static files. The data layer is the
   ATProto network. Hosting costs are near zero (Cloudflare Pages free tier).

2. **Auth is the user's.** We authenticate with the user's PDS via app
   passwords. There is no user database, no session store, no OAuth provider.

3. **Data is portable.** If the user moves their PDS, their data moves with
   them. The app doesn't care where the PDS lives — it resolves the DID and
   follows.

4. **Reads are free and public.** Anyone can read any public record from the
   relay or PDS without authentication. This is what makes it a *commons* —
   reading costs nothing and requires no permission.

5. **The lexicon is the API contract.** A shared lexicon definition (like
   `exchange.recipe.recipe`) is all that's needed for interoperability. Any
   app that understands the schema can read and display the data.

## For Future Claudes

This repo is focused on the bakery — a flour blend calculator that publishes
bread recipes to ATProto. That's the scope of `main`.

But if you're reading this and thinking about what else could be built on this
pattern, here's what you need:

1. **Define a lexicon** in the `exchange.*` or your own namespace. See
   `atproto-data/lexicons/recipe.json` for the structure.

2. **Write a static frontend** that calls the ATProto XRPC endpoints. See
   `bakery/src/atproto.js` — it's plain `fetch()`, no SDK required. The core
   operations are:
   - `com.atproto.identity.resolveHandle` — handle to DID
   - `com.atproto.repo.listRecords` — enumerate a collection
   - `com.atproto.repo.getRecord` — fetch one record by AT URI
   - `com.atproto.repo.createRecord` — write (requires auth)

3. **Deploy to Cloudflare Pages** via wrangler. The `wrangler.jsonc` in this
   repo shows the minimal config.

4. **Work on a feature branch.** Keep `main` about the bakery.

The atmosphere is a library. Build a window into it.
