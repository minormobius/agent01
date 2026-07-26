/**
 * Mino Bsky Bot — THE OUTER LOOP of the lab factory.
 *
 * Every cron tick it reads its notifications, decides which mentions are
 * requests for a website, reserves what each one needs, and fires the build.
 * The build itself is lab-build.yml; this worker never touches code.
 *
 *   mention → whitelist → SlotRegistry.claim → repository_dispatch → reply
 *
 * Routing is deterministic and needs no model call: every ATProto reply carries
 * reply.root.uri, and every later reply in a thread carries the SAME root, so
 * the root URI is an exact key into "which site is this about". See
 * docs/LAB-FACTORY.md §10.
 */

export { SlotRegistry } from './registry';

export interface Env {
  STATE: KVNamespace;
  SLOT_REGISTRY: DurableObjectNamespace;
  BLUESKY_HANDLE: string;
  BLUESKY_APP_PASSWORD: string;
  /** Comma-separated handles allowed to request builds. FAIL-CLOSED: empty
   *  means nobody, because an open trigger is how the bot that inspired this
   *  got pulled for cost. */
  WHITELIST: string;
  /** owner/repo to dispatch into. */
  GITHUB_REPO: string;
  /** PAT with actions:write. Fine-grained, scoped to GITHUB_REPO. */
  GITHUB_TOKEN: string;
  /** "true" to actually dispatch. Anything else = observe and reply only,
   *  which is how you watch the router behave before it can spend money. */
  BOT_ENABLED: string;
}

const PDS = "https://bsky.social/xrpc";

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

async function getSession(env: Env): Promise<Session> {
  // Try cached session
  const cached = await env.STATE.get("session", "json") as Session | null;
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
      await env.STATE.put("session", JSON.stringify(refreshed));
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
  await env.STATE.put("session", JSON.stringify(session));
  return session;
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
  const session = await getSession(env);

  // Load cursor (last seen notification timestamp)
  const cursor = await env.STATE.get("notif_cursor");

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
    await env.STATE.put("notif_cursor", newCursor);
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

/** Fire lab-build.yml. repository_dispatch resolves only for workflows that
 *  exist on the DEFAULT branch — a workflow on a feature branch 404s here. */
async function dispatchBuild(env: Env, payload: Record<string, string>): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mino-bsky-bot",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "lab-build", client_payload: payload }),
  });
  if (!res.ok) {
    throw new Error(`dispatch failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
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

  // FAIL-CLOSED. An unset whitelist admits nobody.
  const allowed = (env.WHITELIST ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(handle.toLowerCase())) {
    console.log(`[bot] ignoring @${handle} — not whitelisted`);
    return;
  }
  if (text.length < 8) {
    await reply(session, env, mention, "Tell me what to build and I'll make you a page.");
    return;
  }

  // The thread root is the identity key. For a top-level mention the post IS
  // the root; for a reply it is the thread's root — the same value either way
  // for every post in that thread.
  const rootUri = mention.record?.reply?.root?.uri ?? mention.uri;

  const stub = env.SLOT_REGISTRY.get(env.SLOT_REGISTRY.idFromName("factory"));
  const claim = await (await stub.fetch("https://registry/claim", {
    method: "POST",
    body: JSON.stringify({ rootUri, did: mention.author.did, handle, text }),
  })).json() as { ok: boolean; slug?: string; slot?: string; mode?: string; reason?: string };

  if (!claim.ok) {
    await reply(session, env, mention, claim.reason ?? "Can't take that one right now.");
    return;
  }

  const { slug, slot, mode } = claim as { slug: string; slot: string; mode: string };

  if (env.BOT_ENABLED !== "true") {
    console.log(`[bot] DRY RUN — would build ${slot}/${slug} (${mode}) for @${handle}`);
    await reply(session, env, mention,
      `Heard you. (Dry run — dispatch is off, so nothing is building yet.)\nWould be: ${slot}.minomobi.com/${slug}/`);
    return;
  }

  try {
    await dispatchBuild(env, {
      slot, slug, task: text, thread_root: rootUri, requester: handle,
    });
  } catch (err) {
    console.error(`[bot] dispatch failed for @${handle}:`, err);
    await reply(session, env, mention, "Couldn't start the build — the factory is wedged. Try again shortly.");
    return;
  }

  await reply(session, env, mention, mode === "iterate"
    ? `On it — updating ${slot}.minomobi.com/${slug}/ . I'll reply when it's live.`
    : `Building. It'll be at ${slot}.minomobi.com/${slug}/ shortly.\nHeads up: lab sites are leases, not homes — the URL recycles eventually.`);
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
      const cursor = await env.STATE.get("notif_cursor");
      return Response.json({ ok: true, cursor });
    }

    if (url.pathname === "/poll") {
      ctx.waitUntil(pollNotifications(env));
      return Response.json({ ok: true, message: "polling triggered" });
    }

    return new Response("mino-bsky-bot", { status: 200 });
  },
};
