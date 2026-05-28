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

const FIRE_MAP = {
  '0 13 * * *':    'bisk-digest.yml',     // daily 13:00
  '30 13 * * *':   'autopilot-brief.yml', // daily 13:30 (after bisk)
  '30 21 * * 1-5': 'sync-finance.yml',    // weekdays 21:30
  '0 6 1 * *':     'fetch-lexicons.yml',  // monthly, 1st @ 06:00
};

async function dispatch(env, workflow) {
  const url = `https://api.github.com/repos/${env.REPO}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_PAT}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'minomobi-cron',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  const body = res.ok ? '' : await res.text();
  return { ok: res.ok, status: res.status, body };
}

export default {
  async scheduled(event, env, ctx) {
    const workflow = FIRE_MAP[event.cron];
    if (!workflow) {
      console.error(`Unmapped cron: ${event.cron}`);
      return;
    }
    const r = await dispatch(env, workflow);
    if (!r.ok) {
      console.error(`Dispatch ${workflow} failed: ${r.status} ${r.body}`);
    } else {
      console.log(`Dispatched ${workflow} (cron ${event.cron})`);
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
      const r = await dispatch(env, m[1]);
      return new Response(r.ok ? `dispatched ${m[1]}\n` : `${r.status}: ${r.body}\n`, {
        status: r.ok ? 202 : 502,
      });
    }

    return new Response(
      'minomobi-cron — GET /health · POST /fire/<workflow.yml> (Bearer ADMIN_KEY)\n',
      { status: 404 },
    );
  },
};
