// human-thread: replies by people, to people, under a post a person started. Modulo, 2026-10-14.
//
// The person asked (3mxs7s464dk25): "filter to humans replying to humans in a top level post authored by
// humans." So a post is IN only when all three accounts pass the humans feed's rule: the replier, the
// parent's author and the root's author. Top-level posts are not in (that is the humans feed); a reply to a
// machine, or under a machine's post, is a different species and belongs to another feed.
// The rule for "person" is exactly the humans feed's: no self-label `bot`, no "(bot)" in the display name,
// not on NAMED. The test fails if NAMED here and in humans.mjs ever differ. An account we haven't read
// (one off pds.delve.town, say) counts as unknown, and unknown is out.
// Classification is done when the feed is asked, not when the post is stored: name a bot today and every
// thread it touched leaves at once. Measured 10-14 01:4xZ: 348 such replies in 7 days, 101 authors, 71 in 24 h.
const PDS = 'https://pds.delve.town/xrpc/';
const POST = 'town.delve.feed.post';
export const every = 5;
export const displayName = 'Human thread';
export const description = "Replies by people to people, under a post a person started. A reply to a bot, or under a bot's post, is not here. 'Person' means no bot label and not on our named list. Rule and numbers: miniphim.minomobi.com/humans/";

export const NAMED = {
  'did:plc:krpc3skstvl2nzcmgkqizlig': 'Autonomous LLM Agent in the AI Village',
  'did:plc:dm3bxdbeepv2ctleetrtclbf': 'Claude, an AI made by Anthropic',
  'did:plc:mb7q24dftrnzodi6zjsj3qhh': 'Gemini 3.5 Flash … Joint Secretary of Elections for the AI Village',
  'did:plc:3lkgieowjhdp6biu4whbf4ki': "AI partner on a Jetson box that doesn't sleep",
  'did:plc:di2evdyfm76xi3gnecj5mznb': 'AI agent',
  'did:plc:jw2uhjud7peadiwzdwjgllpw': 'AI agent, friend of the_briarwitch',
  'did:plc:4ljobw6445b3t5zbw7454m2a': 'AI agent (Claude)',
  'did:plc:5q5ftwz6mm4udrslgjmmxxsi': 'AI assistant to Antonio Mele',
  'did:plc:qlzo5jzwhgec57gnykcmqywe': 'Personal agent',
};
const KEEP_DAYS = 7, PER_ACCOUNT = 50, ROUND = 150, BUDGET_MS = 20_000;

export function verdict(did, profile) {
  if (NAMED[did]) return 'named';
  if ((profile?.labels?.values || []).some((l) => l?.val === 'bot')) return 'label';
  if (/\(bot\)/i.test(profile?.displayName || '')) return 'name';
  return null;
}
export const sortAt = (createdAt, seen) => {
  const c = Date.parse(createdAt), s = Date.parse(seen);
  if (!Number.isFinite(c)) return Number.isFinite(s) ? s : 0;
  return Number.isFinite(s) ? Math.min(c, s) : c;
};
const didOf = (uri) => (typeof uri === 'string' && uri.startsWith('at://') ? uri.slice(5).split('/')[0] : null);

export async function refresh({ store, now, fetch: f = fetch }) {
  const t0 = Date.now(), t = Date.parse(now);
  const get = async (u) => { const r = await f(PDS + u); if (r.status === 400) return null; if (!r.ok) throw new Error(`${r.status} ${u.split('?')[0]}`); return r.json(); };
  const repos = []; let cursor;
  for (let i = 0; i < 10; i++) {
    const j = await get(`com.atproto.sync.listRepos?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    for (const r of j?.repos || []) if (r.active !== false) repos.push(r);
    if (!j?.cursor || !(j.repos || []).length) break;
    cursor = j.cursor;
  }
  const known = new Map(await store.list('acct:'));
  const due = repos.filter((r) => known.get(`acct:${r.did}`)?.rev !== r.rev).slice(0, ROUND);
  let read = 0, out = 0;
  for (let i = 0; i < due.length && Date.now() - t0 < BUDGET_MS; i += 10) {
    await Promise.all(due.slice(i, i + 10).map(async ({ did, rev }) => {
      try {
        const old = known.get(`acct:${did}`);
        const p = await get(`com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=town.delve.actor.profile&rkey=self`);
        const v = verdict(did, p?.value);
        let posts = [];
        if (!v) {
          const l = await get(`com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${POST}&limit=${PER_ACCOUNT}`);
          const seenBefore = new Map((old?.posts || []).map((x) => [x.u, x.s]));
          posts = (l?.records || []).filter((r) => r.value?.reply?.parent?.uri)
            .map((r) => ({ u: r.uri, c: r.value?.createdAt || null, s: seenBefore.get(r.uri) || now,
              p: didOf(r.value.reply.parent.uri), r: didOf(r.value.reply.root?.uri || r.value.reply.parent.uri) }))
            .filter((x) => t - sortAt(x.c, x.s) < KEEP_DAYS * 86400_000);
        } else out++;
        await store.put(`acct:${did}`, { rev, out: v, posts, checked: now });
        read++;
      } catch { /* rev not stored: read again next round */ }
    }));
  }
  return { repos: repos.length, due: due.length, read, out };
}

export default async function skeleton({ store, cursor, limit }) {
  const accts = new Map(await store.list('acct:'));
  const person = (did) => { const a = accts.get(`acct:${did}`); return !!a && !a.out && !NAMED[did]; };
  const rows = [];
  for (const [k, v] of accts) {
    const did = k.slice(5);
    if (!person(did)) continue;
    for (const x of v?.posts || []) if (x.p !== did || x.r !== did) if (person(x.p) && person(x.r)) rows.push({ uri: x.u, t: sortAt(x.c, x.s) });
  }
  rows.sort((a, b) => b.t - a.t || b.uri.localeCompare(a.uri));
  const start = Math.max(0, Number(cursor) || 0), n = Math.min(Math.max(1, Number(limit) || 30), 100);
  const page = rows.slice(start, start + n);
  return { feed: page.map((r) => ({ post: r.uri })), ...(start + n < rows.length ? { cursor: String(start + n) } : {}) };
}
