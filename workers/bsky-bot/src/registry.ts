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

import { marksInSlug } from '../../../scripts/lib/marks.mjs';

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
  /** Slugs this site has been published under before. They stay spoken-for
   *  forever: each one is still a live path serving a redirect, and handing it
   *  to a new site would silently take over somebody else's old URL. */
  formerSlugs?: string[];
  /** THE NAME HERE IS A PLACEHOLDER AND THE BUILD WILL REPLACE IT.
   *
   *  Set on a site nobody named, cleared by /adopt-name. Between those two
   *  moments this row's slug is `slugify(request text)` — a positional guess
   *  made before anything existed to look at — and the real name is whatever
   *  the build agent puts in the <title>. See adoptName() for how it gets
   *  back here, and why nothing has been published under the placeholder. */
  awaitingName?: boolean;
}

/** One entry per site whose name the build has yet to report. A single key
 *  rather than a scan over every row: this is read on every poll tick, and a
 *  list() of the whole registry every fifteen seconds to answer "usually
 *  nothing" is the wrong trade. The rows stay authoritative — adoptName()
 *  re-checks `awaitingName` on the row itself and does not trust this. */
interface Awaiting { rootUri: string; did: string; slug: string; at: number }

/** How long a site may wait for its build to report a name. Longer than the
 *  build's own 20-minute timeout on purpose: the entry is dropped only once the
 *  build cannot possibly still be running, because dropping it early means the
 *  site keeps a placeholder name forever with nothing left to notice. A build
 *  that dies never writes the file, so without this the poll would ask GitHub
 *  about it every fifteen seconds until the end of time. */
const AWAIT_TTL_MS = 45 * 60 * 1000;

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
    // A DERIVED name drops marks silently — nobody chose it, so there is nothing
    // to have a conversation about, and "a tetris on a tube" wants to become
    // `tube`, not a refusal. An ASKED-FOR name is refused instead, below.
    .filter((w) => w.length > 2 && !stop.has(w) && !marksInSlug(w).length);
  const base = words.slice(0, 2).join('-').slice(0, 24).replace(/-+$/, '');
  return /^[a-z0-9]/.test(base) ? base : 'site';
}

/** One site per (thread, person). A thread is a tree and more than one person
 *  can be in it; the root alone cannot say whose site a reply is about. */
function siteKey(rootUri: string, did: string): string {
  return `th:${rootUri}:${did}`;
}

/** Every slug that is spoken for — current names AND retired ones. A retired
 *  slug is still a live path serving a redirect, so reissuing it would point an
 *  old Bluesky post at a stranger's site. */
function takenSlugs(sites: Site[]): Set<string> {
  const out = new Set<string>();
  for (const s of sites) {
    out.add(s.slug);
    for (const f of s.formerSlugs ?? []) out.add(f);
  }
  return out;
}

/** THERE USED TO BE NO RENAME, and the reasoning was sound: the name is the URL,
 *  the URL is permanent, and a rename breaks every link anyone has shared.
 *
 *  What that missed is that a name can be WRONG rather than merely regretted.
 *  `tube-tetris` put somebody else's trademark in a permanent path on the
 *  operator's own domain (scripts/lib/marks.mjs), and "permanent" then means the
 *  mistake is permanent too. The marks check now stops the next one; this is the
 *  way out of the ones already published.
 *
 *  It is deliberately not free:
 *   - only the site's OWNER can do it, which the (root, did) key already
 *     enforces — there is no new authorisation surface here, and no operator
 *     override, because an unauthenticated /rename on a public hostname would
 *     let anyone move anyone's site
 *   - the old slug is retired, never released. The build's publish step leaves a
 *     redirect there, so the link in the original post keeps working, and
 *     takenSlugs() keeps a future site from claiming it out from under that
 *   - the new name goes through the same gauntlet as a first claim: shape,
 *     RESERVED, taken, marks. Renaming must not be a way to smuggle in a name
 *     that claim() would have refused. */
type RenameResult =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: string };

/** THE BUILD REPORTING WHAT IT CALLED ITSELF. A different thing from /rename,
 *  and the difference is the whole reason this is a separate method.
 *
 *  /rename moves a PUBLISHED site: it retires the old path to a redirect,
 *  breaks nothing only because that redirect exists, and is authorised by the
 *  requester's own (root, did) key because it is their URL to move. There is
 *  deliberately no operator override on it — an override on a public hostname
 *  would let anyone move anyone's site — and CI does not get one here either.
 *
 *  This is the opposite case. The site has never been published, nobody has
 *  been told a URL for it (the first reply stops promising one for a name we
 *  derived), and the placeholder exists only because a directory needed a name
 *  before the agent had written a <title> to read. So there is no URL to break
 *  and no redirect to leave — there is a row that has not caught up yet.
 *
 *  What makes it safe is not a credential, it is the narrowness:
 *   - only a row this object itself marked `awaitingName`, which happens on
 *     exactly one path: a NEW site whose requester did not name it
 *   - only while `slug` is still the placeholder that was marked, so a
 *     duplicate or replayed report cannot move a site a second time
 *   - the new name runs the same gauntlet as a first claim — shape, RESERVED,
 *     marks, taken — because a derived name must not be a way in for one
 *     claim() would have refused
 *   - `to: null` is legal and means "I kept the name", which is how the flag
 *     gets cleared for the sites that were already called the right thing */
type AdoptResult =
  | { ok: true; from: string; to: string; changed: boolean }
  | { ok: false; reason: string };

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
    // Sites whose build has not yet reported what it called itself. Read by the
    // poll loop; usually empty, which is why it is one key and not a scan.
    if (url.pathname === '/awaiting' && request.method === 'GET') {
      return json({ awaiting: await this.awaiting() });
    }

    if (url.pathname === '/adopt-name' && request.method === 'POST') {
      return json(await this.adoptName(await request.json()));
    }

    if (url.pathname === '/rename' && request.method === 'POST') {
      return json(await this.rename(await request.json()));
    }
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
      // LIVE LOCKS ONLY. This counted every lock row ever written, expired or
      // not, and reported it as `buildsInFlight` — 19 while two builds were
      // running, because claim() ignores an expired lock but nothing deletes the
      // row. The number an operator reads to see whether the factory is busy was
      // a running total of everyone who had ever asked.
      const allLocks = [...(await this.ctx.storage.list<unknown>({ prefix: 'lock:' })).entries()];
      const locks = allLocks
        .filter(([, v]) => { const l = readLock(v); return l && Date.now() - l.at < LOCK_TTL_MS; })
        .map(([k]) => k);
      return json({
        sites: sites.length,
        locks,
        // Kept visible rather than pruned: a row that outlived its lock is
        // harmless, and the count is how you would notice if release ever stopped
        // working again.
        lockRowsTotal: allLocks.length,
        names: sites.map((s) => s.slug).sort(),
        buildsThisHour: recent.length,
        hourlyCap: GLOBAL_HOURLY_CAP,
      });
    }
    // A REQUEST THAT ARRIVED MID-BUILD IS HELD, NOT THROWN AWAY.
    //
    // The lock is a real constraint — one build per person — but refusing was the
    // wrong way to enforce it. @words.bsky.social was talking to another bot and
    // naming ours in the sentence; every message became a request and collected
    // "you already have a build running". At 03:33:52 they re-sent their original
    // request verbatim, moments after the operator told them to try again, and were
    // refused because their OWN earlier ask was still building. Three refusals, all
    // of them true, none of them useful.
    //
    // So the mention is stored and replayed when the lock clears. One per person:
    // a newer request replaces an older one, because what somebody last said is
    // what they want, and the thread history carries the rest to the agent anyway.
    //
    // The whole notification is stored because that is what handleMention takes —
    // replaying is calling the same function with the same argument, so a held
    // request cannot drift from a fresh one.
    if (url.pathname === '/pending' && request.method === 'POST') {
      const { did, notification } = (await request.json()) as { did: string; notification: unknown };
      const existing = await this.ctx.storage.get<{ at: number }>(`pending:${did}`);
      await this.ctx.storage.put(`pending:${did}`, { at: Date.now(), notification });
      // Told, so the caller knows whether to say anything: the first held request
      // is worth a word, the third is nagging.
      return json({ ok: true, wasAlreadyHeld: Boolean(existing) });
    }
    if (url.pathname === '/pending' && request.method === 'GET') {
      const out = [];
      for (const [k, v] of await this.ctx.storage.list<{ at: number; notification: unknown }>({ prefix: 'pending:' })) {
        // An hour is longer than any build and shorter than a grudge. A held
        // request that never fired is a bug; replaying it into a stranger's thread
        // hours later would be a worse one.
        if (Date.now() - v.at > 60 * 60 * 1000) { await this.ctx.storage.delete(k); continue; }
        const did = k.slice('pending:'.length);
        // THE LOCK TRAVELS WITH THE HELD REQUEST, and it has to: replaying is
        // calling handleMention, which LIKES the post before it claims. A replay
        // that happens while the lock is still held would put a like record on
        // somebody's post every fifteen seconds until their build finished. The
        // caller needs to know whether it can proceed BEFORE it does anything
        // visible, so the answer ships with the question.
        const lock = readLock(await this.ctx.storage.get(`lock:${did}`));
        const live = lock && Date.now() - lock.at < LOCK_TTL_MS ? { at: lock.at, slug: lock.slug } : null;
        out.push({ did, at: v.at, notification: v.notification, lock: live });
      }
      return json({ pending: out });
    }
    if (url.pathname === '/pending/clear' && request.method === 'POST') {
      const { did } = (await request.json()) as { did: string };
      await this.ctx.storage.delete(`pending:${did}`);
      return json({ ok: true });
    }

    // ONE POLL AT A TIME, WHATEVER TRIGGERED IT.
    //
    // Notification handling is read-modify-write on the cursor: read what we have
    // seen, handle what is newer, write the new high-water mark. Two polls that
    // read the same cursor both handle the same mention — and on 2026-07-30 they
    // did, giving @words.bsky.social a refusal and an acceptance 368ms apart on
    // their first ever request. Fixing the pollers (cron no longer polls when the
    // alarm chain is alive) removes the arrangement that caused it. This removes
    // the possibility, which matters because /poll is public and unauthenticated,
    // and because a poll that actually handles a mention — thread fetch, like,
    // claim, GitHub commit, reply — can outlast the 15s tick that started it.
    //
    // Safe as a get-then-put pair because a Durable Object's input gate stays shut
    // while a storage operation is in flight, so no other request runs between the
    // two. Same property claim() relies on.
    if (url.pathname === '/poll-lease' && request.method === 'POST') {
      const { ttlMs } = (await request.json()) as { ttlMs: number };
      const now = Date.now();
      const until = await this.ctx.storage.get<number>('poll-lease');
      // A TTL, not just a flag: a poll killed mid-flight (worker eviction, an
      // exception before its finally, a runaway fetch) must not lock the bot out
      // forever. Expiry is the only thing that cannot itself fail.
      if (typeof until === 'number' && now < until) return json({ ok: false, freeInMs: until - now });
      await this.ctx.storage.put('poll-lease', now + Math.max(1000, ttlMs || 60000));
      return json({ ok: true });
    }
    // Read-only, for /state. A lease that never clears is the one way this
    // mechanism can make the bot go quiet, so it must be observable without
    // acquiring anything.
    if (url.pathname === '/poll-lease-state') {
      const until = await this.ctx.storage.get<number>('poll-lease');
      const now = Date.now();
      return json(typeof until === 'number' && now < until
        ? { held: true, freeInMs: until - now }
        : { held: false });
    }
    if (url.pathname === '/poll-lease/release' && request.method === 'POST') {
      await this.ctx.storage.delete('poll-lease');
      return json({ ok: true });
    }

    // THE TICK CHAIN. See the alarm() comment below.
    if (url.pathname === '/tick/arm' && request.method === 'POST') {
      const { pollUrl, everyMs } = (await request.json()) as { pollUrl: string; everyMs: number };
      await this.ctx.storage.put('tick', { pollUrl, everyMs });
      const existing = await this.ctx.storage.getAlarm();
      // Never a second chain. A DO has exactly one alarm, so re-arming an armed
      // object would only move the next tick — but re-arming it on every cron
      // watchdog would also reset the interval every minute, which is a way to
      // look armed while never firing on the schedule you configured.
      if (existing !== null) return json({ ok: true, armed: 'already', at: existing });
      await this.ctx.storage.setAlarm(Date.now() + everyMs);
      return json({ ok: true, armed: 'now' });
    }
    if (url.pathname === '/tick' && request.method === 'GET') {
      return json({
        config: (await this.ctx.storage.get('tick')) ?? null,
        nextAlarm: await this.ctx.storage.getAlarm(),
        last: (await this.ctx.storage.get('tick-last')) ?? null,
      });
    }
    if (url.pathname === '/tick/stop' && request.method === 'POST') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.delete('tick');
      return json({ ok: true, stopped: true });
    }

    return json({ error: 'unknown op' }, 404);
  }

  /**
   * SUB-MINUTE POLLING, WHICH CRON CANNOT DO.
   *
   * MEASURED, then built. A poll that finds nothing takes 2.8s (timed against the
   * live worker via /poll). Cron-driven polls finished 36.6, 36.7, 36.7 and 52.5
   * seconds past the minute across four consecutive ticks — so ~37s of that is
   * Cloudflare dispatching the cron, before any of this worker's code runs. On a
   * `* * * * *` trigger the requester waits 37s + up to 60s for the tick + 3s of
   * work: 40-100s, and no cron change can go below the 37s. That is the whole
   * reason this exists; the earlier five-minute-cron numbers (median 280s, p90
   * 676s) were dominated by the interval, and fixing the interval exposed the
   * floor. (Do not write that cron expression in here: the slash-star sequence
   * ends the comment, which is how this file first failed to compile.)
   *
   * An alarm has no such queue: it fires when it says it will. The chain is
   * self-perpetuating — every alarm re-arms the next one — and a DO can hold
   * exactly ONE alarm, which is the property that makes this safe on a component
   * that spends money: a double-armed runaway is not representable.
   *
   * It re-arms FIRST, before polling. A poll that throws must not break the
   * chain, because a broken chain is silent — the bot would simply stop, and the
   * only symptom is nobody getting answered.
   *
   * The cron is still there as the watchdog. It re-arms a dead chain (`/tick/arm`
   * is a no-op when armed) and polls once itself, so the worst case if alarms stop
   * entirely is the behaviour we had before this.
   */
  async alarm(): Promise<void> {
    const cfg = await this.ctx.storage.get<{ pollUrl: string; everyMs: number }>('tick');
    if (!cfg) return; // stopped deliberately
    await this.ctx.storage.setAlarm(Date.now() + cfg.everyMs);
    const started = Date.now();
    let ok = false;
    let error: string | null = null;
    try {
      const res = await fetch(cfg.pollUrl, { method: 'GET' });
      ok = res.ok;
      if (!ok) error = `poll returned ${res.status}`;
    } catch (err) {
      error = String((err as Error)?.message ?? err).slice(0, 200);
    }
    await this.ctx.storage.put('tick-last', { at: started, ms: Date.now() - started, ok, error });
  }

  /**
   * Decide what a mention means and reserve what it needs — atomically, because
   * this whole method runs inside the DO's single-threaded context.
   */
  /** Read the awaiting-name list, dropping anything whose build can no longer
   *  be running. Pruning on read rather than on a timer keeps it to the one
   *  place that already touches the key. */
  private async awaiting(): Promise<Awaiting[]> {
    const store = this.ctx.storage;
    const all = (await store.get<Awaiting[]>('awaiting')) ?? [];
    const live = all.filter((a) => Date.now() - a.at < AWAIT_TTL_MS);
    if (live.length !== all.length) await store.put('awaiting', live);
    return live;
  }

  /** Take the name the build agent chose. See the AdoptResult comment for the
   *  difference between this and rename(), which is the load-bearing part. */
  private async adoptName(
    req: { rootUri: string; did: string; from: string; to: string | null },
  ): Promise<AdoptResult> {
    const store = this.ctx.storage;
    const drop = async () => {
      const all = (await store.get<Awaiting[]>('awaiting')) ?? [];
      await store.put('awaiting', all.filter((a) => !(a.rootUri === req.rootUri && a.did === req.did)));
    };

    const site = await this.findSite(store, req.rootUri, req.did);
    // Nothing to update and nothing to keep asking about. A row can vanish
    // between the mark and the report only if the object was reset, and asking
    // GitHub about it every fifteen seconds forever is the worse failure.
    if (!site) { await drop(); return { ok: false, reason: 'no such site' }; }
    if (!site.awaitingName) { await drop(); return { ok: false, reason: 'not waiting for a name' }; }
    // STALENESS IS THE ONE THING A REPLAY COULD DO. The build reports the name
    // it started from; if that is no longer this site's name, something else
    // has already moved it and this report is about a state that is gone.
    if (site.slug !== req.from) {
      return { ok: false, reason: `stale — this site is called "${site.slug}", not "${req.from}"` };
    }

    const settle = async (extra: Partial<Site>) => {
      await store.put(siteKey(req.rootUri, req.did), { ...site, ...extra, awaitingName: undefined, updatedAt: Date.now() });
      await drop();
    };

    const to = (req.to ?? '').toLowerCase();
    // "I kept the name" — the derived slug and the placeholder agreed, or the
    // build declined to rename. Legal, and the only way the flag clears for a
    // site that was already called the right thing.
    if (!to || to === site.slug) { await settle({}); return { ok: true, from: site.slug, to: site.slug, changed: false }; }

    // The same gauntlet a first claim runs. A name arriving this way must not
    // reach a URL that claim() would have refused.
    // A REFUSAL HERE IS FINAL — re-reading the same file every fifteen seconds
    // for forty-five minutes cannot change any of these answers — so it settles
    // rather than leaving the row on the list.
    //
    // BUT A REFUSAL IS ALSO A BUG REPORT, and this has to say so plainly: by the
    // time it runs, the build has already PUBLISHED at the name it is reporting.
    // Refusing leaves the registry pointing at the placeholder while the domain
    // serves the other name, and the next iteration in that thread would rebuild
    // at the placeholder and fork the site in two. The log line in
    // reconcileNames is the only trace, so it is worth reading.
    //
    // None of these can fire against the build as it stands, which is exactly
    // why they are kept: the proposing side re-validates the shape with the same
    // regex, refuses a superset of RESERVED, calls the same marksInSlug, and
    // builds its taken-set from lab/www/ on the publish branch UNIONED with this
    // object's own /state names — so it already knows everything checked here.
    // If one of these ever fires, the two sides have drifted apart, and that is
    // the thing to go and fix.
    const refuse = async (reason: string): Promise<AdoptResult> => { await settle({}); return { ok: false, reason }; };
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(to)) return refuse(`"${to}" isn't a usable name`);
    if (RESERVED.has(to)) return refuse(`"${to}" is reserved`);
    const marks = marksInSlug(to);
    if (marks.length) return refuse(`"${to}" carries ${marks[0]}`);
    const sites = [...(await store.list<Site>({ prefix: 'th:' })).values()];
    if (takenSlugs(sites).has(to)) return refuse(`"${to}" is taken`);

    const from = site.slug;
    // NOT a formerSlug, and this is the difference from rename(). A formerSlug
    // records a path that is still serving a redirect; nothing was ever
    // published at the placeholder, so there is no redirect and no old link.
    // Retiring it would put a phantom in takenSlugs() and in /state.
    await settle({ slug: to });

    // The requester's lock names the branch the worker asks GitHub about to see
    // whether their build has landed (isBuildLanded). The build renames that
    // branch along with the directory, so a lock still pointing at
    // claude/lab-<placeholder> would 404 forever and hold the lock for its full
    // TTL — the exact stall the landed-check exists to prevent.
    const lock = readLock(await store.get(`lock:${req.did}`));
    if (lock && lock.slug === from) await store.put(`lock:${req.did}`, { ...lock, slug: to });

    return { ok: true, from, to, changed: true };
  }

  /** Move a site to a new name. See the RenameResult comment for why this
   *  exists at all and what it deliberately costs. */
  private async rename(req: { rootUri: string; did: string; to: string }): Promise<RenameResult> {
    const store = this.ctx.storage;
    const site = await this.findSite(store, req.rootUri, req.did);
    // Scoped to the asker by the key, exactly like /site. Somebody typing
    // "rename:" in a thread that is not theirs finds no row and is told nothing
    // about whose it is.
    if (!site) return { ok: false, reason: 'there is no site of yours in this thread to rename' };

    const to = req.to.toLowerCase();
    if (to === site.slug) return { ok: false, reason: `it is already called "${to}"` };
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(to)) {
      return { ok: false, reason: `"${to}" isn't a usable name — letters, numbers and hyphens, starting with a letter or number` };
    }
    if (RESERVED.has(to)) return { ok: false, reason: `"${to}" is reserved — pick another` };
    const marks = marksInSlug(to);
    if (marks.length) {
      return { ok: false, reason: `not under the name "${to}" — ${marks[0]} isn't mine to put on a URL. Pick another.` };
    }
    // The whole point of a rename is often to get OFF a name, so the old one is
    // retired rather than freed — and it counts as taken here too, which is why
    // this reads takenSlugs() rather than the live slugs alone.
    const sites = [...(await store.list<Site>({ prefix: 'th:' })).values()];
    if (takenSlugs(sites).has(to)) {
      return { ok: false, reason: `"${to}" is taken — every name ever published here stays spoken for` };
    }

    const from = site.slug;
    await store.put(siteKey(req.rootUri, req.did), {
      ...site,
      slug: to,
      named: true, // they chose this one by hand, whatever the first name was
      formerSlugs: [...(site.formerSlugs ?? []), from],
      updatedAt: Date.now(),
    });
    return { ok: true, from, to };
  }

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
    const taken = takenSlugs(sites);
    const asked = requestedName(req.text);
    let slug: string;

    if (asked) {
      if (RESERVED.has(asked)) {
        return { ok: false, reason: `"${asked}" is reserved — pick another with "name: yourname"` };
      }
      // THE NAME, NOT THE GAME. The URL is permanent and it lives on the
      // operator's domain, so naming a page after somebody's trademark is the
      // operator holding out that mark as their own. The mechanic is fine and
      // the build still happens — under a name of its own. scripts/lib/marks.mjs
      // has the list and the reasoning.
      const marks = marksInSlug(asked);
      if (marks.length) {
        return {
          ok: false,
          reason: `I can build it, but not under the name "${asked}" — ${marks[0]} isn't mine to put on a URL. Pick another with "name: yourname".`,
        };
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
      // A NAME WE DERIVED IS A PLACEHOLDER. slugify() reads the request text
      // before anything exists — it takes the first two long words that are not
      // stopwords, which is how the estate ended up with `actually-let` and
      // `fake-doordash`. The build agent names the thing properly in its
      // <title> ("Bottomless", "Wormhole Eats") and reports that back, which is
      // what adoptName() takes. Until then this row is provisional and the
      // first reply says so by NOT promising a URL.
      ...(asked ? {} : { awaitingName: true }),
    };
    await commit(async () => {
      await store.put(siteKey(req.rootUri, req.did), site);
      await store.put(`lock:${req.did}`, { at: Date.now(), slug });
      await store.put('builds', [...builds, Date.now()]);
      if (!asked) {
        const all = (await store.get<Awaiting[]>('awaiting')) ?? [];
        await store.put('awaiting', [
          ...all.filter((a) => !(a.rootUri === req.rootUri && a.did === req.did)),
          { rootUri: req.rootUri, did: req.did, slug, at: Date.now() },
        ]);
      }
    });
    return { ok: true, slug, mode: 'create', named: Boolean(asked) };
  }
}
