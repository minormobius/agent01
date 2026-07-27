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

/** One in-flight build per requester, so nobody queues five at once.
 *
 *  THIS IS A BACKSTOP, NOT THE RELEASE MECHANISM — and for a long time it was
 *  the only one. `/release` existed on this object from the start and NOTHING
 *  EVER CALLED IT, so a lock taken for a six-minute build sat for the full
 *  thirty. Someone iterating on a 3D scene — reply, look, reply — got "you
 *  already have a build running" for twenty-four minutes after their build had
 *  finished and been announced live in the same thread. The message was not
 *  merely unhelpful, it was false.
 *
 *  The worker now checks whether the build actually landed before honouring a
 *  lock (see isBuildLanded in index.ts). This TTL only covers the case where
 *  that check cannot answer: a build that died without ever pushing. */
const LOCK_TTL_MS = 30 * 60 * 1000;

/** What a lock records. Was a bare timestamp; the slug is needed so the worker
 *  can ask GitHub whether THAT build's branch has moved. Old numeric values are
 *  still read — a deployed DO has live locks in the old shape. */
interface Lock { at: number; slug: string | null }
function readLock(v: unknown): Lock | null {
  if (typeof v === 'number') return { at: v, slug: null };
  if (v && typeof v === 'object' && 'at' in (v as any)) return v as Lock;
  return null;
}

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
  | { ok: false; reason: string; lock?: { at: number; slug: string | null } };

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

/** One site per (thread, person). A thread is a tree and more than one person
 *  can be in it; the root alone cannot say whose site a reply is about. */
function siteKey(rootUri: string, did: string): string {
  return `th:${rootUri}:${did}`;
}

export class SiteRegistry {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  /** Read a site, tolerating rows written before the key carried the DID.
   *  A live DO holds those, and a migration that loses somebody's permanent URL
   *  is not a migration. Legacy rows are rewritten under the new key as they are
   *  found — this runs inside the DO's single-threaded context, so there is no
   *  window where both or neither exists. */
  private async findSite(store: DurableObjectStorage, rootUri: string, did: string): Promise<Site | undefined> {
    const current = await store.get<Site>(siteKey(rootUri, did));
    if (current) return current;
    const legacy = await store.get<Site>(`th:${rootUri}`);
    if (legacy && legacy.did === did) {
      await store.put(siteKey(rootUri, did), legacy);
      await store.delete(`th:${rootUri}`);
      return legacy;
    }
    return undefined;
  }

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

    // Does a thread already have a site? Read-only, no claim, no side effects.
    //
    // Needed because a PLAIN REPLY to one of the bot's own posts is accepted as
    // an iteration (see index.ts), and that acceptance must be conditional on the
    // thread already being a build thread. Asking `claim` would answer the
    // question by RESERVING things, which is the mistake the dryRun flag exists
    // to undo — a lookup must not be able to create a site.
    if (url.pathname === '/site' && request.method === 'GET') {
      const rootUri = url.searchParams.get('root') ?? '';
      const did = url.searchParams.get('did') ?? '';
      // Scoped to the asker. A bystander replying in someone else's thread finds
      // nothing here, which is what turns their reply into silence instead of a
      // public refusal.
      const site = await this.findSite(this.ctx.storage, rootUri, did);
      return json(site ? { found: true, slug: site.slug, did: site.did } : { found: false });
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
    /** Set by the worker on the retry AFTER it has confirmed with GitHub that
     *  the locked build already landed. Never set on a first attempt. */
    ignoreLock?: boolean;
  }): Promise<ClaimResult> {
    const store = this.ctx.storage;
    const commit = async (fn: () => Promise<void>) => { if (!req.dryRun) await fn(); };

    // Per-requester concurrency. Expired locks are reclaimed rather than
    // stranding someone whose build died without releasing.
    const lock = readLock(await store.get(`lock:${req.did}`));
    if (lock && Date.now() - lock.at < LOCK_TTL_MS && !req.ignoreLock) {
      return {
        ok: false,
        reason: 'you already have a build running — reply again once it lands',
        // So the worker can ask GitHub whether that build has in fact landed,
        // and retry rather than refusing something already finished.
        lock: { at: lock.at, slug: lock.slug },
      };
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

    // (THREAD, PERSON) → IDENTITY. The key was the root URI alone, which cannot
    // represent a fork — and a Bluesky thread is a TREE, not a line.
    //
    // What that cost: anyone replying to one of the bot's posts inside someone
    // else's thread passed the "is this a request?" test (the parent is ours),
    // reached here, mismatched the row's DID and was told, in public, "this
    // thread belongs to another requester — start a new one". They were liked
    // first. A mutual saying "nice" got scolded for it, and in a thread that got
    // any attention that would have happened over and over.
    //
    // Keying on (root, DID) makes a fork representable: several people can each
    // own a site in one thread, nobody can steer anyone else's, and a bystander
    // simply has no row — which the "a reply may only iterate, never create"
    // rule already turns into silence rather than a refusal. The ownership check
    // is gone because the key now enforces what it was checking.
    const existing = await this.findSite(store, req.rootUri, req.did);
    if (existing) {
      await commit(async () => {
        existing.updatedAt = Date.now();
        existing.builds += 1;
        await store.put(siteKey(req.rootUri, req.did), existing);
        await store.put(`lock:${req.did}`, { at: Date.now(), slug: existing.slug });
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
      await store.put(siteKey(req.rootUri, req.did), site);
      await store.put(`lock:${req.did}`, { at: Date.now(), slug });
      await store.put('builds', [...builds, Date.now()]);
    });
    return { ok: true, slug, mode: 'create', named: Boolean(asked) };
  }
}
