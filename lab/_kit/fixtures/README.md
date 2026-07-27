# fixtures — what the API actually returns

Real captured responses from every endpoint a lab site is allowed to call.
**Read these instead of remembering field names.**

They exist because of a specific gap. The build agent has no `Bash`, no
`WebFetch` and no `WebSearch` — it cannot make one request. So it writes
`profile.displayName` from memory and finds out never; the page renders
`undefined` and looks fine to everyone except the person who opens it.

Giving the agent the network would close that gap and open a worse one: an
outbound request is an exfiltration channel, and the secret-scan gate only
inspects published files (`docs/LAB-FACTORY.md` §11.6). So the network stays
shut and the knowledge comes in on disk instead — a curated corpus rather than
an open door.

| File | Endpoint |
|---|---|
| `resolveHandle.json` | `com.atproto.identity.resolveHandle` |
| `resolveHandle.error.json` | the same, with a handle that does not exist |
| `getProfile.json` | `app.bsky.actor.getProfile` |
| `getAuthorFeed.json` | `app.bsky.feed.getAuthorFeed` |
| `getPostThread.json` | `app.bsky.feed.getPostThread` |
| `getFollowers.json` | `app.bsky.graph.getFollowers` |
| `searchActors.json` | `app.bsky.actor.searchActors` |

**The error fixture matters as much as the successes.** Every site takes input
from a visitor, and a typo is the most common input. `resolveHandle.error.json`
is what a bad one returns — a page that does not handle it is a page that breaks
the first time someone fat-fingers a handle.

Captured by hand against the live AppView. Re-capture with `curl` when a lexicon
changes; the point is that they are *real*, so never write one from memory —
that would reintroduce the exact problem they exist to solve.
