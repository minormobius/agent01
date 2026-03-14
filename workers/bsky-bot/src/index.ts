/**
 * Mino Bsky Bot — notification listener on Cloudflare Workers.
 *
 * Polls listNotifications every cron tick, finds mentions,
 * and dispatches them to a handler. Session cached in KV.
 */

export interface Env {
  STATE: KVNamespace;
  BLUESKY_HANDLE: string;
  BLUESKY_APP_PASSWORD: string;
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
  record: any;
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

  // Filter to mentions only (someone tagged us in a post)
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
// Mention handler — stub for now
// ---------------------------------------------------------------------------

async function handleMention(
  mention: Notification,
  session: Session,
  env: Env
): Promise<void> {
  const postText = mention.record?.text ?? "";
  const author = mention.author.handle;

  console.log(`[bsky-bot] Mention from @${author}: "${postText}"`);

  // TODO: This is where you plug in response logic.
  // For now, just log. Uncomment below to reply with an ack.

  /*
  const replyText = `👋 Heard you, @${author}. (This is a test — Mino bot is alive.)`;
  await xrpc("POST", "com.atproto.repo.createRecord", {
    token: session.accessJwt,
    body: {
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        "$type": "app.bsky.feed.post",
        text: replyText,
        createdAt: new Date().toISOString(),
        reply: {
          root: { uri: mention.uri, cid: mention.cid },
          parent: { uri: mention.uri, cid: mention.cid },
        },
      },
    },
  });
  */
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
