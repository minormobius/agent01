/**
 * SiteRegistry — the lab factory's bookkeeping, in one Durable Object.
 *
 * Two jobs, deliberately kept apart because they answer different questions
 * (docs/LAB-FACTORY.md §10):
 *
 *   thread → identity    which site is this mention about?
 *   DID    → concurrency how many builds may this person have running?
 *
 * There used to be a third — slot → capacity — because the factory owned ten
 * subdomains of a hundred sites each and had to place a new site somewhere. That
 * is gone. Every site now lives at minomobi.com/<name>/, the name is chosen by
 * the requester and never reassigned, and Workers Static Assets allows 100,000
 * files per version, so a thousand single-page sites is about 4% of the ceiling.
 * The lease was defending a limit twenty-five times further away than it looked.
 *
 * A Durable Object rather than KV because both remaining jobs are
 * read-modify-write under contention: KV is eventually consistent and would
 * happily hand the same NAME to two simultaneous mentions. DO storage is
 * serialized, so first-come is actually first-come.
 *
 * It also holds the session and the notification cursor, which KV would have
 * served fine — but they were the ONLY reason this worker needed a KV namespace,
 * and that namespace was a human provisioning step before the bot could run at
 * all. os-api set the precedent when R2 turned out to be unavailable on this
 * plan: keep state in the DO you already need, and stop depending on a second
 * product. One store, one migration, no id to paste into a config file.
 */

export interface Env {
  REGISTRY: DurableObjectNamespace;
}

/** One in-flight build per requester, so nobody queues five at once. */
const LOCK_TTL_MS = 30 * 60 * 1000;

/** GLOBAL CEILING, independent of who is asking.
 *
 *  The per-requester lock bounds one person; it does nothing about three hundred
 *  people arriving at once, which is the actual shape of a launch. Each build
 *  spends the operator's own Claude subscription capacity — so an unbounded hour
 *  does not produce a bill, it produces an operator who cannot use their own
 *  tools for the rest of the week. That is worth a hard stop.
 *
 *  A rolling window, not a per-hour bucket: buckets let 2N through across a
 *  boundary, which is exactly when a launch is happening. */
const GLOBAL_HOURLY_CAP = 12;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

/** Names that would shadow something the factory serves at the same level.
 *  A site called `_kit` would hide the shared stylesheet from every tenant. */
const RESERVED = new Set([
  '_kit', '_profiles', 'index', 'assets', 'static', 'well-known',
  'tenants', 'admin', 'api', 'lab', 'about', 'null', 'undefined',
]);

interface Site {
  slug: string;
  did: string;
  handle: string;
  rootUri: string;
  createdAt: number;
  updatedAt: number;
  builds: number;
  /** Did the requester name it, or did we derive one? Only an asked-for name
   *  is worth refusing a collision over. */
  named: boolean;
}

type ClaimResult =
  | { ok: true; slug: string; mode: 'create' | 'iterate'; named: boolean }
  | { ok: false; reason: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

/** An explicit `name: whatever` anywhere in the request. The name is permanent
 *  and it is the URL, so asking for it outright beats inferring it from prose. */
export function requestedName(text: string): string | null {
  const m = text.match(/\bname:\s*([A-Za-z0-9][A-Za-z0-9-]{0,30})/);
  if (!m) return null;
  const slug = m[1].toLowerCase().replace(/-+$/, '');
  return SLUG_RE.test(slug) ? slug : null;
}

/** Fallback when nobody asked for a name. Deterministic, readable, bounded —
 *  it becomes a path segment, so the workflow re-validates it rather than
 *  trusting this. */
export function slugify(text: string): string {
  const stop = new Set(['a', 'an', 'the', 'build', 'make', 'me', 'please', 'can', 'you', 'my', 'for', 'site', 'website', 'page', 'app']);
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/\bname:\s*\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const base = words.slice(0, 2).join('-').slice(0, 24).replace(/-+$/, '');
  return /^[a-z0-9]/.test(base) ? base : 'site';
}

export class SiteRegistry {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const json = (o: unknown, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.pathname === '/claim' && request.method === 'POST') {
      return json(await this.claim(await request.json()));
    }
    if (url.pathname === '/release' && request.method === 'POST') {
      const { did } = (await request.json()) as { did: string };
      await this.ctx.storage.delete(`lock:${did}`);
      return json({ ok: true });
    }
    // Session + notification cursor. Plain get/put — no contention, no logic;
    // they live here purely so the worker needs no second storage product.
    if (url.pathname === '/session') {
      if (request.method === 'PUT') {
        await this.ctx.storage.put('session', await request.json());
        return json({ ok: true });
      }
      return json((await this.ctx.storage.get('session')) ?? null);
    }
    if (url.pathname === '/cursor') {
      if (request.method === 'PUT') {
        const { cursor } = (await request.json()) as { cursor: string };
        await this.ctx.storage.put('cursor', cursor);
        return json({ ok: true });
      }
      return json({ cursor: (await this.ctx.storage.get<string>('cursor')) ?? null });
    }

    // The mutual-follow allowlist, cached. Refreshed by the worker on a schedule
    // because it is many paginated requests; kept here so a cold start or a
    // failed refresh does not silently open or close the door.
    if (url.pathname === '/mutuals') {
      if (request.method === 'PUT') {
        const { dids, truncated, pages } = (await request.json()) as { dids: string[]; truncated?: boolean; pages?: number };
        await this.ctx.storage.put('mutuals', dids);
        await this.ctx.storage.put('mutualsAt', Date.now());
        await this.ctx.storage.put('mutualsPages', pages ?? 0);
        // Stored, not just logged. A truncated allowlist refuses real mutuals
        // and looks identical to a complete one from the outside — the whole
        // reason the undercount went unnoticed.
        await this.ctx.storage.put('mutualsTruncated', Boolean(truncated));
        return json({ ok: true, count: dids.length });
      }
      return json({
        dids: (await this.ctx.storage.get<string[]>('mutuals')) ?? null,
        at: (await this.ctx.storage.get<number>('mutualsAt')) ?? 0,
        truncated: (await this.ctx.storage.get<boolean>('mutualsTruncated')) ?? false,
        pages: (await this.ctx.storage.get<number>('mutualsPages')) ?? 0,
      });
    }

    // What the last poll actually saw. Counts and an error string only — never
    // notification content, since /state is public and unauthenticated.
    if (url.pathname === '/poll-result') {
      if (request.method === 'PUT') {
        await this.ctx.storage.put('lastPoll', { ...(await request.json() as object), at: Date.now() });
        return json({ ok: true });
      }
      return json((await this.ctx.storage.get('lastPoll')) ?? null);
    }

    if (url.pathname === '/state') {
      const recent = ((await this.ctx.storage.get<number[]>('builds')) ?? [])
        .filter((t) => Date.now() - t < GLOBAL_WINDOW_MS);
      const sites = [...(await this.ctx.storage.list<Site>({ prefix: 'th:' })).values()];
      const locks = [...(await this.ctx.storage.list<number>({ prefix: 'lock:' })).keys()];
      return json({
        sites: sites.length,
        locks,
        names: sites.map((s) => s.slug).sort(),
        buildsThisHour: recent.length,
        hourlyCap: GLOBAL_HOURLY_CAP,
      });
    }
    return json({ error: 'unknown op' }, 404);
  }

  /**
   * Decide what a mention means and reserve what it needs — atomically, because
   * this whole method runs inside the DO's single-threaded context.
   */
  private async claim(req: {
    rootUri: string;
    did: string;
    handle: string;
    text: string;
    /** Work out the answer, persist NOTHING.
     *
     *  BOT_ENABLED="false" is meant to be observe-and-reply — the bot routes and
     *  answers but does not build. It was still claiming: the very first real
     *  dry run took the name `clock-pls` permanently, held a 30-minute lock and
     *  spent one of twelve hourly builds, for a site that was never going to
     *  exist. A rehearsal that consumes the things it is rehearsing is not a
     *  rehearsal, and here it burned a PERMANENT name, which is the one resource
     *  in this system that cannot be given back. */
    dryRun?: boolean;
  }): Promise<ClaimResult> {
    const store = this.ctx.storage;
    const commit = async (fn: () => Promise<void>) => { if (!req.dryRun) await fn(); };

    // Per-requester concurrency. Expired locks are reclaimed rather than
    // stranding someone whose build died without releasing.
    const lock = await store.get<number>(`lock:${req.did}`);
    if (lock && Date.now() - lock < LOCK_TTL_MS) {
      return { ok: false, reason: 'you already have a build running — reply again once it lands' };
    }

    // GLOBAL CEILING. Checked before anything is reserved, so a refusal costs
    // nothing and leaves no state behind. Says WHEN, because "try later" with no
    // number is how you get someone retrying every thirty seconds.
    const builds = ((await store.get<number[]>('builds')) ?? [])
      .filter((t) => Date.now() - t < GLOBAL_WINDOW_MS);
    if (builds.length >= GLOBAL_HOURLY_CAP) {
      const freesAt = builds[0] + GLOBAL_WINDOW_MS;
      const mins = Math.max(1, Math.ceil((freesAt - Date.now()) / 60000));
      return { ok: false, reason: `the factory is at capacity (${GLOBAL_HOURLY_CAP}/hour) — try again in about ${mins} min` };
    }

    // THREAD → IDENTITY. Every reply in a thread carries the same root, so the
    // root URI is an exact key. No model call, no guessing.
    const existing = await store.get<Site>(`th:${req.rootUri}`);
    if (existing) {
      // A thread belongs to whoever started it. Someone else replying in it
      // cannot redirect the build.
      if (existing.did !== req.did) {
        return { ok: false, reason: 'this thread belongs to another requester — start a new one' };
      }
      await commit(async () => {
        existing.updatedAt = Date.now();
        existing.builds += 1;
        await store.put(`th:${req.rootUri}`, existing);
        await store.put(`lock:${req.did}`, Date.now());
        await store.put('builds', [...builds, Date.now()]);
      });
      return { ok: true, slug: existing.slug, mode: 'iterate', named: existing.named };
    }

    // NEW SITE. The name is the URL and the URL is permanent, so a collision is
    // a conversation, not something to paper over — but only when the requester
    // actually asked for that name. A name we derived ourselves gets a suffix,
    // because they never picked it and don't care.
    const sites = [...(await store.list<Site>({ prefix: 'th:' })).values()];
    const taken = new Set(sites.map((s) => s.slug));
    const asked = requestedName(req.text);
    let slug: string;

    if (asked) {
      if (RESERVED.has(asked)) {
        return { ok: false, reason: `"${asked}" is reserved — pick another with "name: yourname"` };
      }
      if (taken.has(asked)) {
        return { ok: false, reason: `"${asked}" is taken and names here are permanent — try "name: something-else"` };
      }
      slug = asked;
    } else {
      slug = slugify(req.text);
      if (RESERVED.has(slug)) slug = `${slug}-site`;
      if (taken.has(slug)) {
        let n = 2;
        while (taken.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
    }

    const site: Site = {
      slug, did: req.did, handle: req.handle, rootUri: req.rootUri,
      createdAt: Date.now(), updatedAt: Date.now(), builds: 1, named: Boolean(asked),
    };
    await commit(async () => {
      await store.put(`th:${req.rootUri}`, site);
      await store.put(`lock:${req.did}`, Date.now());
      await store.put('builds', [...builds, Date.now()]);
    });
    return { ok: true, slug, mode: 'create', named: Boolean(asked) };
  }
}
