// prereg-do.mjs — the forward test, kept and run on Cloudflare.
//
// WHY THIS EXISTS. The collector was first wired to a GitHub Actions cron,
// which does not fire: GitHub runs `schedule` only for workflows on the
// DEFAULT branch, and this one lives on the surface's owning branch. Rather
// than wait on a merge to make the test start accruing, the schedule moved to
// where the surface already deploys — a Worker cron trigger, writing into a
// Durable Object. Both are declared entirely in `wrangler.jsonc`: no dashboard
// step, no namespace id to paste in, nothing outside this surface's own deploy.
//
// WHAT IT COSTS, stated plainly. A git-committed record is append-only in
// public history, which is a real part of why a pre-registration is
// believable. A DO is not that: it is a store the operator can write. So the
// registration itself stays in git (commit 54531db6, before any evaluating
// code existed) and the DO holds only the accumulating record — and the GitHub
// workflow is kept, so that once it can fire it snapshots the same record back
// into git. The DO is what makes the test RUN; git is what makes it auditable.
//
// Nothing here calls Jev. This measures the rule.
import { collect, emptyStore } from './lab/collect-core.mjs';

const KEY = 'store';

export class PreregLog {
  constructor(state, env) { this.state = state; this.env = env; }

  async read(spec) {
    return (await this.state.storage.get(KEY)) || emptyStore(spec);
  }

  async fetch(req) {
    const url = new URL(req.url);
    const spec = JSON.parse(await (await this.env.ASSETS.fetch(
      new URL('/jev/lab/preregister.json', url.origin))).text());

    // GET: hand back the record. This is the only thing the page ever calls.
    if (req.method === 'GET' && !url.searchParams.has('collect')) {
      return Response.json(await this.read(spec));
    }

    // The collection pass. Reached from the cron trigger, and from a GET with
    // ?collect=1 for an out-of-band run. It is idempotent either way: a window
    // already recorded is keyed by asset@close-time and never added twice, so
    // an extra call adds nothing and costs nothing.
    const prev = await this.read(spec);
    try {
      const { store, added, skippedEarly } = await collect(spec, prev);
      store.host = 'cloudflare-cron';
      await this.state.storage.put(KEY, store);
      return Response.json({ ok: true, added, skippedEarly, n: store.verdict.n, status: store.verdict.status });
    } catch (e) {
      // A failed collection must not replace a good record with an error. The
      // store is left exactly as it was and the failure is reported.
      return Response.json({ ok: false, error: String(e.message || e), n: prev.verdict?.n ?? 0 }, { status: 502 });
    }
  }
}

/** Route `/jev/lab/api/prereg` to the single log instance. */
export function preregStub(env) {
  return env.PREREG_LOG.get(env.PREREG_LOG.idFromName('jev-lab-polarity-12h-v1'));
}
