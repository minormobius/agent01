# handle → did

A single-page Bluesky handle resolver, served at `minomobi.com/handle/`
(a permanent name on the lab factory — see `../index.html` for what that means:
static, ephemeral, no build step).

## What was asked

Type a Bluesky handle (`bsky.app`, `alice.bsky.social`, etc.), see the
resolved DID, profile (display name, avatar, description, follower/following/
post counts), and the account's PDS service endpoint pulled from its DID
document. One `index.html`, inline CSS/JS only, no dependencies, no external
requests besides the three APIs the task specifies.

## How it works

Three calls, all client-side, all unauthenticated CORS-enabled endpoints:

1. `com.atproto.identity.resolveHandle` on `public.api.bsky.app` — handle → DID.
2. `app.bsky.actor.getProfile` on the same host, called with the DID (not the
   raw handle) so the profile fetch can't drift from the identity just
   resolved.
3. For `did:plc:*` identities only: `GET https://plc.directory/<did>`, scan
   `service[]` for `type === "AtprotoPersonalDataServer"`, read its
   `serviceEndpoint`. `did:web:*` identities publish their DID document
   elsewhere (their own domain's `/.well-known/did.json`), which the task
   said to skip rather than chase — so for `did:web` the PDS row just renders
   "(none found — likely a did:web identity)". The plc.directory call is also
   wrapped in its own try/catch so a 404 or network hiccup there degrades to
   the same message instead of failing the whole lookup.

## Decisions worth knowing about

- **Input validation** is a light regex (`something.tld`-shaped) purely to
  give a friendly message before hitting the network; the real validation is
  whatever `resolveHandle` returns. A 400 from that call is surfaced as
  "handle not found" with the upstream message appended.
- **Errors are always visible**, never silent: a status line above the result
  card narrates each network step ("Resolving handle…", "Fetching profile…",
  "Looking up PDS…"), and a distinct red error box catches thrown errors —
  bad handle, non-OK HTTP status, or `fetch` throwing outright (offline /
  CORS / DNS). The result card only gets the `.show` class on full success,
  so a failed lookup can't leave stale data on screen.
- **Two one-click examples** (`bsky.app`, `jay.bsky.team`) — both official
  Bluesky-team accounts, chosen because they're stable, always resolvable,
  and don't depend on some third party's handle still existing later.
- Counts (`followersCount` etc.) are abbreviated (1.2K / 3.4M) for layout;
  the raw DID and PDS endpoint are left unabbreviated in a `<dl>` since those
  are the values someone would actually want to copy.
- Follows the factory's visual language exactly: `#0e0e11` background,
  monospace stack, `#e8a33d` amber accent, `46rem` centered column,
  breadcrumb → h1 → one-line subtitle, same crumb/muted color choices as
  `../index.html`. Unlike the factory index, this page writes a full
  `<html><head>…</head><body>…</body></html>` skeleton rather than a bare
  fragment — no functional difference, just made explicit since this page
  has more moving parts (form, live region, card) worth structuring clearly.

## Left open

- Not tested against a live network from this sandbox (outbound fetch to
  `public.api.bsky.app` / `plc.directory` wasn't exercised here) — the HTML
  was checked for well-formed tag balance only. Whoever deploys this should
  do one real resolve (e.g. click the `bsky.app` example) and confirm the
  card populates and the PDS endpoint looks like a real PDS host.
- No rate-limiting/debounce on the form — a user mashing "Resolve" fires
  concurrent requests; the last `render()` to complete wins. Not expected to
  matter at this traffic level, but worth knowing if it ever does.
- No caching of prior lookups; every submit re-fetches all three endpoints.
