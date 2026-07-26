/**
 * SlotRegistry — the lab factory's bookkeeping, in one Durable Object.
 *
 * Three jobs, deliberately kept apart because they answer different questions
 * (docs/LAB-FACTORY.md §10):
 *
 *   thread → identity    which site is this mention about?
 *   slot   → capacity    where does a new site go?
 *   DID    → concurrency how many builds may this person have running?
 *
 * A Durable Object rather than KV because two of these are read-modify-write
 * under contention: KV is eventually consistent and would happily hand the same
 * slot to two simultaneous mentions. DO storage is serialized, so a lease is
 * actually a lease.
 *
 * It also holds the session and the notification cursor, which KV would have
 * served fine — but they were the ONLY reason this worker needed a KV namespace,
 * and that namespace was a human provisioning step before the bot could run at
 * all. os-api set the precedent when R2 turned out to be unavailable on this
 * plan: keep state in the DO you already need, and stop depending on a second
 * product. One store, one migration, no id to paste into a config file.
 */

export interface Env {
  SLOT_REGISTRY: DurableObjectNamespace;
}

/** Slots this factory owns. Adding one here is the only change needed. */
export const SLOTS = ['alph', 'beta', 'gamm'] as const;
export const SLOT_CAPACITY = 100;

/** One in-flight build per requester, so nobody queues five and eats five slots. */
const LOCK_TTL_MS = 30 * 60 * 1000;

interface Site {
  slug: string;
  slot: string;
  did: string;
  handle: string;
  rootUri: string;
  createdAt: number;
  updatedAt: number;
  builds: number;
}

type ClaimResult =
  | { ok: true; slug: string; slot: string; mode: 'create' | 'iterate' }
  | { ok: false; reason: string };

/** Turn a request into a URL-safe slug. Deterministic, readable, and bounded —
 *  it becomes a path segment, so it is validated the same way the workflow
 *  validates it rather than trusted. */
function slugify(text: string): string {
  const stop = new Set(['a', 'an', 'the', 'build', 'make', 'me', 'please', 'can', 'you', 'my', 'for', 'site', 'website', 'page', 'app']);
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const base = words.slice(0, 2).join('-').slice(0, 24).replace(/-+$/, '');
  return /^[a-z0-9]/.test(base) ? base : 'site';
}

export class SlotRegistry {
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

    if (url.pathname === '/state') {
      const sites = [...(await this.ctx.storage.list<Site>({ prefix: 'th:' })).values()];
      const locks = [...(await this.ctx.storage.list<number>({ prefix: 'lock:' })).keys()];
      return json({ sites: sites.length, locks, byslot: countBySlot(sites) });
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
  }): Promise<ClaimResult> {
    const store = this.ctx.storage;

    // Per-requester concurrency. Expired locks are reclaimed rather than
    // stranding someone whose build died without releasing.
    const lock = await store.get<number>(`lock:${req.did}`);
    if (lock && Date.now() - lock < LOCK_TTL_MS) {
      return { ok: false, reason: 'you already have a build running — reply again once it lands' };
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
      existing.updatedAt = Date.now();
      existing.builds += 1;
      await store.put(`th:${req.rootUri}`, existing);
      await store.put(`lock:${req.did}`, Date.now());
      return { ok: true, slug: existing.slug, slot: existing.slot, mode: 'iterate' };
    }

    // New site. Pick the emptiest slot so load spreads rather than filling
    // alph to 100 before beta sees anything.
    const sites = [...(await store.list<Site>({ prefix: 'th:' })).values()];
    const counts = countBySlot(sites);
    const slot = [...SLOTS].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))[0];
    if ((counts[slot] ?? 0) >= SLOT_CAPACITY) {
      return { ok: false, reason: 'every slot is full — recycling is not built yet' };
    }

    // Slugs are unique across the whole factory, not per slot: the durable site
    // branch is claude/lab-<slug>, which has no slot in it.
    const taken = new Set(sites.map((s) => s.slug));
    let slug = slugify(req.text);
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }

    const site: Site = {
      slug, slot, did: req.did, handle: req.handle, rootUri: req.rootUri,
      createdAt: Date.now(), updatedAt: Date.now(), builds: 1,
    };
    await store.put(`th:${req.rootUri}`, site);
    await store.put(`lock:${req.did}`, Date.now());
    return { ok: true, slug, slot, mode: 'create' };
  }
}

function countBySlot(sites: Site[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sites) out[s.slot] = (out[s.slot] ?? 0) + 1;
  return out;
}
