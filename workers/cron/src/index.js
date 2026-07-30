// External cron trigger for GitHub Actions.
//
// GitHub's `schedule:` cron is unreliable on this repo (verified: four
// scheduled workflows on main, zero cron-triggered runs ever). Cloudflare
// Workers cron triggers are reliable, so this worker fires the same workflows
// on the same schedules by POSTing to GitHub's workflow_dispatch API.
//
// Each cron in wrangler.jsonc maps 1:1 to a workflow file via FIRE_MAP below.
//
// Secrets (set via `npx wrangler secret put` after first deploy):
//   GITHUB_PAT   fine-grained PAT scoped to minormobius/agent01 with
//                Actions:write permission.
//   ADMIN_KEY    bearer token gating the /fire/* HTTP endpoint.

// THE REF IS PART OF THE SCHEDULE, NOT A CONSTANT. It used to be hard-coded to
// 'main', which is fine for a workflow whose state lives in the repo trunk and
// wrong for one whose state is a ledger on a feature branch.
//
// The ideas pipeline is the second kind. Its three workflows read and write
// .github/ideas/*.jsonl on whatever branch the run checks out, and they all
// carry a guard that SKIPS the job on main precisely so two ledgers can never
// post the same concept twice. Dispatched at ref 'main' they would fire, skip,
// and report green — which is exactly the failure this file exists to prevent,
// wearing a success badge.
//
// So an entry is {workflow, ref}. IDEAS_REF is the branch that owns the ledger;
// move the ledger and this is the one line that has to move with it.
const IDEAS_REF = 'claude/minomobi-landing-page-vg37b8';

const FIRE_MAP = {
  '0 13 * * *':    { workflow: 'bisk-digest.yml',     ref: 'main' },     // daily 13:00
  '30 13 * * *':   { workflow: 'autopilot-brief.yml', ref: 'main' },     // daily 13:30 (after bisk)
  '30 21 * * 1-5': { workflow: 'sync-finance.yml',    ref: 'main' },     // weekdays 21:30
  '0 6 1 * *':     { workflow: 'fetch-lexicons.yml',  ref: 'main' },     // monthly, 1st @ 06:00

  // The ideas bot — the whole pipeline, because posting alone drains.
  // 16 queued concepts at one an hour is 16 hours of runway; wiring the poster
  // without the two jobs that refill the queue buys one day and then stops
  // again, which is the failure this replaces rather than a fix for it.
  //   post   hourly    queue → Bluesky      (public; capped by IDEAS_MAX_PER_DAY)
  //   review every 6h  pool  → queue        (costs model spend)
  //   pull   daily     arXiv → pool         (free)
  // 06:00 for the pull, after the ~00:00 UTC arXiv announcement, so the day is
  // complete; the reviews at 0/6/12/18 then always have fresh backlog.
  '0 * * * *':     { workflow: 'ideas-post.yml',   ref: IDEAS_REF },
  '0 */6 * * *':   { workflow: 'ideas-review.yml', ref: IDEAS_REF },
  '0 6 * * *':     { workflow: 'ideas-pull.yml',   ref: IDEAS_REF },
};

async function dispatch(env, workflow, ref = 'main') {
  const url = `https://api.github.com/repos/${env.REPO}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_PAT}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'minomobi-cron',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref }),
  });
  const body = res.ok ? '' : await res.text();
  return { ok: res.ok, status: res.status, body };
}

export default {
  async scheduled(event, env, ctx) {
    const entry = FIRE_MAP[event.cron];
    if (!entry) {
      console.error(`Unmapped cron: ${event.cron}`);
      return;
    }
    const { workflow, ref } = entry;
    const r = await dispatch(env, workflow, ref);
    if (!r.ok) {
      console.error(`Dispatch ${workflow}@${ref} failed: ${r.status} ${r.body}`);
    } else {
      console.log(`Dispatched ${workflow}@${ref} (cron ${event.cron})`);
    }
  },

  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        repo: env.REPO,
        schedule: FIRE_MAP,
      });
    }

    const m = url.pathname.match(/^\/fire\/([\w.-]+)$/);
    if (m && req.method === 'POST') {
      const auth = req.headers.get('authorization') || '';
      if (!env.ADMIN_KEY || auth !== `Bearer ${env.ADMIN_KEY}`) {
        return new Response('unauthorized', { status: 401 });
      }
      // ?ref= overrides; otherwise use the ref this workflow is scheduled at, so
      // a manual poke of a ledger-carrying workflow lands on the same branch its
      // cron would have. Falling back to 'main' silently is how you get a green
      // run that skipped.
      const scheduled = Object.values(FIRE_MAP).find((e) => e.workflow === m[1]);
      const ref = url.searchParams.get('ref') || scheduled?.ref || 'main';
      const r = await dispatch(env, m[1], ref);
      return new Response(r.ok ? `dispatched ${m[1]}@${ref}\n` : `${r.status}: ${r.body}\n`, {
        status: r.ok ? 202 : 502,
      });
    }

    return new Response(
      'minomobi-cron — GET /health · POST /fire/<workflow.yml>[?ref=] (Bearer ADMIN_KEY)\n',
      { status: 404 },
    );
  },
};
