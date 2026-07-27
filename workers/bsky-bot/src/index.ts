/**
 * Mino Bsky Bot — THE OUTER LOOP of the lab factory.
 *
 * Every cron tick it reads its notifications, decides which mentions are
 * requests for a website, reserves what each one needs, and fires the build.
 * The build itself is lab-build.yml; this worker never touches code.
 *
 *   mention → whitelist → SiteRegistry.claim → commit a request file → reply
 *
 * Routing is deterministic and needs no model call: every ATProto reply carries
 * reply.root.uri, and every later reply in a thread carries the SAME root, so
 * the root URI is an exact key into "which site is this about". See
 * docs/LAB-FACTORY.md §10.
 */

export { SiteRegistry } from './registry';

export interface Env {
  REGISTRY: DurableObjectNamespace;
  BLUESKY_HANDLE: string;
  BLUESKY_APP_PASSWORD: string;
  /** Comma-separated handles allowed to request builds, ALWAYS, regardless of
   *  the mutual list. FAIL-CLOSED: empty means nobody. Use it for the operator
   *  and nothing else — the social list below is the real admission control. */
  WHITELIST: string;
  /** Handle whose MUTUAL FOLLOWS may request builds. Everyone who follows this
   *  account and is followed back is admitted; unfollowing revokes. Empty
   *  disables the social list entirely, leaving only WHITELIST. */
  WHITELIST_MUTUALS_OF: string;
  /** owner/repo to dispatch into. */
  GITHUB_REPO: string;
  /** Fine-grained PAT with contents:write on GITHUB_REPO. The bot dispatches by
   *  COMMITTING a request file, not via repository_dispatch — see dispatchBuild. */
  GITHUB_TOKEN: string;
  /** Branch the request file is committed to. Its push trigger runs the build. */
  GITHUB_BRANCH: string;
  /** "true" to actually dispatch. Anything else = observe and reply only,
   *  which is how you watch the router behave before it can spend money. */
  BOT_ENABLED: string;
}

const PDS = "https://bsky.social/xrpc";
/** Reads go to the AppView: no auth needed, and it applies takedowns. */
const APPVIEW = "https://public.api.bsky.app/xrpc";

// ---------------------------------------------------------------------------
// XRPC helpers (raw fetch, no @atproto/api)
// ---------------------------------------------------------------------------

async function xrpc(
  method: "GET" | "POST",
  endpoint: string,
  opts: { token?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<any> {
  const url = new URL(`${PDS}/${endpoint}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {};
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.body) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json() as any;
  if (!res.ok) {
    throw new Error(`XRPC ${endpoint} ${res.status}: ${json.error ?? JSON.stringify(json)}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Auth — session cached in KV, refresh on expiry
// ---------------------------------------------------------------------------

interface Session {
  did: string;
  accessJwt: string;
  refreshJwt: string;
  createdAt: number;
}

/** The registry DO doubles as this worker's store — see src/registry.ts. */
function registry(env: Env): DurableObjectStub {
  return env.REGISTRY.get(env.REGISTRY.idFromName("factory"));
}
async function stGet<T>(env: Env, path: string): Promise<T> {
  return await (await registry(env).fetch(`https://registry${path}`)).json() as T;
}
async function stPut(env: Env, path: string, body: unknown): Promise<void> {
  await registry(env).fetch(`https://registry${path}`, { method: "PUT", body: JSON.stringify(body) });
}

async function getSession(env: Env): Promise<Session> {
  // Try cached session
  const cached = await stGet<Session | null>(env, "/session");
  if (cached) {
    // Access tokens last ~2 hours. Refresh if older than 90 min.
    const age = Date.now() - cached.createdAt;
    if (age < 90 * 60 * 1000) return cached;

    // Try refresh
    try {
      const res = await xrpc("POST", "com.atproto.server.refreshSession", {
        token: cached.refreshJwt,
      });
      const refreshed: Session = {
        did: res.did,
        accessJwt: res.accessJwt,
        refreshJwt: res.refreshJwt,
        createdAt: Date.now(),
      };
      await stPut(env, "/session", refreshed);
      return refreshed;
    } catch {
      // Refresh failed, fall through to fresh login
    }
  }

  // Fresh login
  const res = await xrpc("POST", "com.atproto.server.createSession", {
    body: { identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_APP_PASSWORD },
  });
  const session: Session = {
    did: res.did,
    accessJwt: res.accessJwt,
    refreshJwt: res.refreshJwt,
    createdAt: Date.now(),
  };
  await stPut(env, "/session", session);
  return session;
}

// ---------------------------------------------------------------------------
// Admission control — the mutual-follow list
// ---------------------------------------------------------------------------

/** How stale the mutual list may get before a refresh. An hour means revoking
 *  access by unfollowing takes up to an hour to bite, which is the right trade:
 *  the alternative is 20+ paginated requests every five-minute tick. */
const MUTUALS_TTL_MS = 60 * 60 * 1000;
/** Pages of 100.
 *
 *  This was 25 — 2,500 accounts — and it silently undercounted: the operator had
 *  6,528 followers, so a third of the follower graph was never fetched and every
 *  mutual living beyond page 25 was refused. It logged a warning nobody could
 *  see, which is the same as not warning. Two fixes: a ceiling with real
 *  headroom, and `truncated` reported on /state where it is visible.
 *
 *  Cost of the higher cap: ~83 unauthenticated AppView reads once an hour at the
 *  current graph size. That is nothing. */
const MUTUALS_MAX_PAGES = 200;

async function listDids(method: string, actor: string): Promise<{ dids: Set<string>; truncated: boolean }> {
  const dids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MUTUALS_MAX_PAGES; page++) {
    const params: Record<string, string> = { actor, limit: "100" };
    if (cursor) params.cursor = cursor;
    const res = await fetch(`${APPVIEW}/${method}?${new URLSearchParams(params)}`);
    if (!res.ok) throw new Error(`${method} ${res.status}`);
    const json = await res.json() as { follows?: { did: string }[]; followers?: { did: string }[]; cursor?: string };
    for (const a of json.follows ?? json.followers ?? []) dids.add(a.did);
    cursor = json.cursor;
    if (!cursor) return { dids, truncated: false };
  }
  return { dids, truncated: true };
}

/**
 * MUTUALS ARE THE ALLOWLIST. Anyone who follows the operator and is followed
 * back may request a build; unfollowing revokes it. That is admission control
 * a human already maintains for other reasons, which beats a list in a config
 * file that goes stale the day it is written.
 *
 * Keyed on DID, never handle: handles change, and a handle that changes hands
 * would otherwise inherit someone else's access.
 */
async function refreshMutuals(env: Env): Promise<void> {
  const of = (env.WHITELIST_MUTUALS_OF ?? "").trim();
  if (!of) return;

  // A cache is only valid for the parameters that produced it. Raising
  // MUTUALS_MAX_PAGES fixed an undercount, but the wrong answer was already
  // stored and would have been served for another 45 minutes — long enough to
  // conclude the fix had not worked. Storing the cap alongside the result makes
  // any future change to it self-healing on the next tick.
  const cached = await stGet<{ dids: string[] | null; at: number; pages?: number }>(env, "/mutuals");
  const sameParams = cached.pages === MUTUALS_MAX_PAGES;
  if (cached.dids && sameParams && Date.now() - cached.at < MUTUALS_TTL_MS) return;

  try {
    const [follows, followers] = await Promise.all([
      listDids("app.bsky.graph.getFollows", of),
      listDids("app.bsky.graph.getFollowers", of),
    ]);
    const truncated = follows.truncated || followers.truncated;
    if (truncated) {
      console.log(`[bot] WARNING: mutual list truncated at ${MUTUALS_MAX_PAGES} pages — some mutuals will be refused`);
    }
    const mutual = [...follows.dids].filter((d) => followers.dids.has(d));
    await stPut(env, "/mutuals", { dids: mutual, truncated, pages: MUTUALS_MAX_PAGES });
    console.log(`[bot] mutuals of @${of}: ${mutual.length} (follows ${follows.dids.size}, followers ${followers.dids.size})`);
  } catch (err) {
    // Keep whatever we had. A failed refresh must not widen the door, and must
    // not slam it either — the cached set stays authoritative until it succeeds.
    console.error(`[bot] mutual refresh failed, keeping the cached list:`, err);
  }
}

/** FAIL-CLOSED. An unset whitelist and an unfetched mutual list admit nobody. */
async function isAllowed(env: Env, did: string, handle: string): Promise<boolean> {
  const always = (env.WHITELIST ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (always.includes(handle.toLowerCase())) return true;
  const { dids } = await stGet<{ dids: string[] | null }>(env, "/mutuals");
  return Boolean(dids?.includes(did));
}

// ---------------------------------------------------------------------------
// Notification polling
// ---------------------------------------------------------------------------

interface Notification {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string };
  reason: string; // "mention" | "reply" | "like" | "repost" | "follow" | "quote"
  /** The post record. For a reply this carries
   *  reply: { root: {uri, cid}, parent: {uri, cid} } — the root URI is the
   *  factory's identity key (docs/LAB-FACTORY.md §10). */
  record: {
    text?: string;
    reply?: { root?: { uri: string; cid: string }; parent?: { uri: string; cid: string } };
    [k: string]: unknown;
  };
  indexedAt: string;
}

async function pollNotifications(env: Env): Promise<void> {
  // The worker deploys before the Bluesky account exists, and its cron starts
  // ticking immediately. Without this it would attempt a login every 5 minutes
  // — 288 a day against a createSession budget of 300/day — and fill the logs
  // with a failure that means nothing more than "not set up yet".
  if (!env.BLUESKY_HANDLE || !env.BLUESKY_APP_PASSWORD) {
    console.log("[bsky-bot] no credentials — skipping poll");
    return;
  }
  const session = await getSession(env);

  // Before reading anything: make sure we know who is allowed to ask.
  await refreshMutuals(env);

  // Load cursor (last seen notification timestamp)
  const { cursor } = await stGet<{ cursor: string | null }>(env, "/cursor");

  const params: Record<string, string> = { limit: "50" };
  if (cursor) params.cursor = cursor;

  const res = await xrpc("GET", "app.bsky.notification.listNotifications", {
    token: session.accessJwt,
    params,
  });

  const notifications: Notification[] = res.notifications ?? [];
  const newCursor: string | undefined = res.cursor;

  // Mentions only — including mentions that are replies, which is how
  // iteration arrives. A plain reply with no @ is chatter and is ignored on
  // purpose: requiring the mention makes "is this a request?" a string test
  // rather than a judgement call, which keeps a model out of the router.
  const mentions = notifications.filter((n) => n.reason === "mention");

  if (mentions.length > 0) {
    console.log(`[bsky-bot] ${mentions.length} new mention(s)`);
  }

  for (const mention of mentions) {
    try {
      await handleMention(mention, session, env);
    } catch (err) {
      console.error(`[bsky-bot] Error handling mention from @${mention.author.handle}:`, err);
    }
  }

  // Save cursor for next poll
  if (newCursor) {
    await stPut(env, "/cursor", { cursor: newCursor });
  }

  // Mark notifications as read
  if (notifications.length > 0) {
    await xrpc("POST", "app.bsky.notification.updateSeen", {
      token: session.accessJwt,
      body: { seenAt: new Date().toISOString() },
    });
  }
}

// ---------------------------------------------------------------------------
// Request handler — whitelist, claim, dispatch, reply
// ---------------------------------------------------------------------------

/** Strip the bot's own @handle and leading whitespace: what remains is the task. */
function taskFrom(text: string, botHandle: string): string {
  return text.replace(new RegExp(`@${botHandle.replace(/\./g, "\\.")}\\b`, "gi"), "").trim();
}

/** Fire lab-build.yml by COMMITTING a request file.
 *
 *  The obvious mechanism is repository_dispatch, and it is what this used to do
 *  — but dispatch (and workflow_dispatch) only resolve for workflows present on
 *  the DEFAULT branch: GitHub 404s a workflow living on a feature branch. That
 *  would force the whole factory to merge to main before it could be exercised
 *  once, which is exactly backwards for something still being shaped.
 *
 *  A `push` trigger has no such rule. So the bot writes
 *  .github/lab-requests/<slug>.json to the build branch via the Contents API,
 *  the push fires lab-build.yml, and the factory runs from whatever branch it
 *  currently lives on. Same payload, same code path.
 *
 *  Cost of this choice, stated plainly: the PAT needs contents:write rather than
 *  actions:write, which is broader — it can write any file in the repo. It is
 *  still scoped to this one repository, the only thing listening on that path is
 *  this workflow, and the containment gate governs what a build may produce
 *  regardless. Revisit if the factory ever moves to main permanently.
 *
 *  WHOSE COMMITS ARE THESE? A fine-grained PAT belongs to a GitHub USER — there
 *  is no GitHub identity for this worker — so without the author/committer
 *  fields below every lab request would read as the operator having personally
 *  committed it, when in fact a stranger's mention caused it. The fields are
 *  metadata only: the audit trail and the permission check still resolve to the
 *  token's owner, and nothing here pretends otherwise. What they buy is a commit
 *  log where you can tell at a glance which commits a human made.
 */
const COMMIT_AUTHOR = { name: "mino lab (bot)", email: "admin@mino.mobi" };
async function dispatchBuild(env: Env, payload: Record<string, string>): Promise<void> {
  const path = `.github/lab-requests/${payload.slug}.json`;
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mino-bsky-bot",
    "Content-Type": "application/json",
  };
  const branch = env.GITHUB_BRANCH || "main";

  // Iterating reuses the slug, so the file already exists and the API needs its
  // blob sha to accept an update. A 404 here just means this is a new site.
  let sha: string | undefined;
  const head = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (head.ok) sha = ((await head.json()) as { sha: string }).sha;

  const body = { ...payload, requestedAt: new Date().toISOString() };
  const res = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      branch,
      message: `lab request: ${payload.slug} (@${payload.requester})`,
      content: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(body, null, 2) + "\n"))),
      author: COMMIT_AUTHOR,
      committer: COMMIT_AUTHOR,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`request commit failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function reply(
  session: Session, env: Env, to: Notification, text: string,
): Promise<void> {
  // root is the thread's root when the mention is itself a reply, else the
  // mention. This is the same expression the registry keys on, so the bot's
  // own reply keeps the thread on one key.
  const root = to.record?.reply?.root ?? { uri: to.uri, cid: to.cid };
  await xrpc("POST", "com.atproto.repo.createRecord", {
    token: session.accessJwt,
    body: {
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: text.slice(0, 300),
        createdAt: new Date().toISOString(),
        reply: { root, parent: { uri: to.uri, cid: to.cid } },
      },
    },
  });
}

async function handleMention(
  mention: Notification, session: Session, env: Env,
): Promise<void> {
  const handle = mention.author.handle;
  const text = taskFrom(mention.record?.text ?? "", env.BLUESKY_HANDLE);

  if (!(await isAllowed(env, mention.author.did, handle))) {
    console.log(`[bot] ignoring @${handle} — not a mutual and not on WHITELIST`);
    return;
  }
  if (text.length < 8) {
    await reply(session, env, mention,
      "Tell me what to build and I'll make you a page. Add \"name: yourname\" to pick the URL.");
    return;
  }

  // The thread root is the identity key. For a top-level mention the post IS
  // the root; for a reply it is the thread's root — the same value either way
  // for every post in that thread.
  const rootUri = mention.record?.reply?.root?.uri ?? mention.uri;

  const stub = registry(env);
  const claim = await (await stub.fetch("https://registry/claim", {
    method: "POST",
    body: JSON.stringify({ rootUri, did: mention.author.did, handle, text }),
  })).json() as { ok: boolean; slug?: string; mode?: string; named?: boolean; reason?: string };

  if (!claim.ok) {
    await reply(session, env, mention, claim.reason ?? "Can't take that one right now.");
    return;
  }

  const { slug, mode, named } = claim as { slug: string; mode: string; named: boolean };
  const url = `minomobi.com/${slug}/`;

  if (env.BOT_ENABLED !== "true") {
    console.log(`[bot] DRY RUN — would build ${slug} (${mode}) for @${handle}`);
    await reply(session, env, mention,
      `Heard you. (Dry run — dispatch is off, so nothing is building yet.)\nWould be: ${url}`);
    return;
  }

  try {
    // The build replies in-thread when it finishes, and a reply needs URI *and*
    // CID for both root and parent — ATProto strong refs are content-addressed,
    // so a URI alone will not do. Carrying them in the request file is the only
    // way the workflow can get them: it never talks to Bluesky to look anything
    // up, and by the time it runs the notification is long gone.
    const rootRef = mention.record?.reply?.root ?? { uri: mention.uri, cid: mention.cid };
    await dispatchBuild(env, {
      slug, task: text, thread_root: rootUri, requester: handle,
      root_uri: rootRef.uri, root_cid: rootRef.cid,
      parent_uri: mention.uri, parent_cid: mention.cid,
    });
  } catch (err) {
    console.error(`[bot] dispatch failed for @${handle}:`, err);
    await reply(session, env, mention, "Couldn't start the build — the factory is wedged. Try again shortly.");
    return;
  }

  // The name is permanent, so say so once, on the build that fixes it — and if
  // we picked it rather than being told, say how to pick next time.
  await reply(session, env, mention, mode === "iterate"
    ? `On it — updating ${url} . Same name, same URL, new version.`
    : named
      ? `Building. It'll be at ${url} shortly, and that URL is yours to keep.\nReply in this thread to change it.`
      : `Building. It'll be at ${url} shortly, and that URL is yours to keep.\nI picked the name — start a request with "name: yourname" to choose your own.`);
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export default {
  // Cron trigger — poll notifications
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pollNotifications(env));
  },

  // HTTP — health check + manual trigger
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      const { cursor } = await stGet<{ cursor: string | null }>(env, "/cursor");
      return Response.json({ ok: true, cursor });
    }

    if (url.pathname === "/poll") {
      ctx.waitUntil(pollNotifications(env));
      return Response.json({ ok: true, message: "polling triggered" });
    }

    // Observability during bring-up. This worker has no custom domain, but it
    // IS reachable on workers.dev, and without this the only way to see whether
    // the router did anything is the bot's own replies — which tell you nothing
    // when it stays silent.
    //
    // REDACTED ON PURPOSE. The DO's /state carries requester DIDs and thread
    // URIs; this endpoint is unauthenticated on a public hostname, so it returns
    // counts and site names only. Names are public URLs already; who asked for
    // what is not this endpoint's to publish.
    if (url.pathname === "/state") {
      const raw = await stGet<{ sites: number; locks: string[]; names: string[]; buildsThisHour: number; hourlyCap: number }>(env, "/state");
      const mutuals = await stGet<{ dids: string[] | null; at: number; truncated?: boolean }>(env, "/mutuals");
      return Response.json({
        sites: raw.sites,
        names: raw.names,
        buildsInFlight: raw.locks.length,
        buildsThisHour: raw.buildsThisHour,
        hourlyCap: raw.hourlyCap,
        mutuals: mutuals.dids ? mutuals.dids.length : null,
        mutualsTruncated: mutuals.truncated ?? null,
        mutualsAgeMinutes: mutuals.at ? Math.round((Date.now() - mutuals.at) / 60000) : null,
        enabled: env.BOT_ENABLED === "true",
        credentials: Boolean(env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD),
        canDispatch: Boolean(env.GITHUB_TOKEN),
      });
    }

    return new Response("mino-bsky-bot", { status: 200 });
  },
};
