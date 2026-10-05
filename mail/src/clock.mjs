// clock.mjs — the miniphim's days, on a schedule. Four times a day the mail worker's cron reads
// packages/whetstone/town-day.json from the repo and, if it's enabled, commits that day's request
// to packages/whetstone/requests/. The push starts whetstone.yml, which runs the day. Turning the
// clock off is one edit to that file ("enabled": false), made in a commit, never here.
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function requestFor(template, now) {
  const date = now.toISOString().slice(0, 10), hh = String(now.getUTCHours()).padStart(2, '0');
  const { enabled, $comment, kinds_by_hour, ...rest } = template;
  const label = `town-${date}-${hh}`;
  return { path: `packages/whetstone/requests/${date}-${label}.json`,
    body: { ...rest, label, kinds: (kinds_by_hour && kinds_by_hour[hh]) || rest.kinds, seed: (Number(date.replace(/-/g, '')) % 100000) * 4 + Math.floor(Number(hh) / 6) } };
  // The seed steps by one per run (four a day), so whatever rotates by seed (who goes first on a
  // town day: lib/lab.mjs) turns over every run, not once a day.
}

export async function townTick(env, now = new Date(), fetchImpl = fetch) {
  if (!env.GH_TOKEN || !env.CLOCK_REPO || !env.CLOCK_BRANCH) return { skipped: 'the clock has no token or repo' };
  const api = `https://api.github.com/repos/${env.CLOCK_REPO}/contents/`;
  const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'mino-mail-clock' };
  const t = await fetchImpl(`${api}packages/whetstone/town-day.json?ref=${encodeURIComponent(env.CLOCK_BRANCH)}`, { headers });
  if (!t.ok) return { skipped: `template: GitHub answered ${t.status}` };
  const template = JSON.parse(unb64((await t.json()).content));
  if (template.enabled !== true) return { skipped: 'the clock is off (town-day.json)' };
  const { path, body } = requestFor(template, now);
  const exists = await fetchImpl(`${api}${path}?ref=${encodeURIComponent(env.CLOCK_BRANCH)}`, { headers });
  if (exists.ok) return { skipped: `${path} already exists` };
  const put = await fetchImpl(`${api}${path}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message: `whetstone: ${body.label} (the clock)`, branch: env.CLOCK_BRANCH, content: b64(JSON.stringify(body, null, 2) + '\n') }) });
  return put.ok ? { committed: path } : { failed: `GitHub answered ${put.status}` };
}

// ---- the summon --------------------------------------------------------------------------
// The person summons the miniphim by mentioning them. Every two minutes this reads the person's
// public posts on Delvetown (no password: the AppView serves them to anyone) and, if one addresses
// the account (an @mention, or a reply to one of its posts) and is newer than the last one
// answered, commits a summon request built from town-day.json's `summon` block. The push starts
// whetstone.yml. Several mentions between ticks make one summon; the run reads them all.
export const SUMMON_CRON = '*/2 * * * *';
const APPVIEW = 'https://api.delve.town';
export const MINIPHIM_DID = 'did:plc:a3vq3hjlkz2nbf67bpv5z6qs';

export function addressesUs(post, did = MINIPHIM_DID) {
  const r = post?.record || {};
  if (String(r.reply?.parent?.uri || '').startsWith(`at://${did}/`)) return true;
  if ((r.facets || []).some((f) => (f.features || []).some((x) => String(x.$type).endsWith('#mention') && x.did === did))) return true;
  return /(^|\s)@miniphim(\.delve\.town)?\b/i.test(r.text || '');
}

export function summonRequest(template, mentions, now) {
  const s = template.summon || {};
  const newest = mentions[0];
  const date = now.toISOString().slice(0, 10);
  const rkey = newest.uri.split('/').pop();
  const { enabled, $comment, kinds_by_hour, summon, ...rest } = template;
  return { path: `packages/whetstone/requests/${date}-summon-${rkey}.json`,
    body: { ...rest, ...(s.request || {}), label: `summon-${rkey}`, seed: Math.floor(now.getTime() / 60000) % 100000,
      summoned_by: mentions.map((m) => m.uri),
      notice: `The person summoned you: ${mentions.length === 1 ? 'a post' : `${mentions.length} posts`} addressed to the account (${mentions.map((m) => m.uri).join(', ')}), in town/inbox.json.` } };
}

export async function summonTick(env, now = new Date(), fetchImpl = fetch, state) {
  if (!env.GH_TOKEN || !env.CLOCK_REPO || !env.CLOCK_BRANCH) return { skipped: 'no token or repo' };
  const api = `https://api.github.com/repos/${env.CLOCK_REPO}/contents/`;
  const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'mino-mail-clock' };
  const t = await fetchImpl(`${api}packages/whetstone/town-day.json?ref=${encodeURIComponent(env.CLOCK_BRANCH)}`, { headers });
  if (!t.ok) return { skipped: `template: GitHub answered ${t.status}` };
  const template = JSON.parse(unb64((await t.json()).content));
  const s = template.summon || {};
  if (s.enabled !== true || !s.from) return { skipped: 'summon is off (town-day.json)' };
  const f = await fetchImpl(`${APPVIEW}/xrpc/town.delve.feed.getAuthorFeed?actor=${encodeURIComponent(s.from)}&limit=30`);
  if (!f.ok) return { skipped: `author feed: ${f.status}` };
  const last = (await state.get('summon:last_at')) || new Date(now.getTime() - (s.window_min || 30) * 60000).toISOString();
  const mentions = ((await f.json()).feed || []).map((x) => x.post)
    .filter((p) => p?.author?.handle === s.from && addressesUs(p) && String(p.record?.createdAt) > last)
    .sort((a, b) => String(b.record.createdAt).localeCompare(String(a.record.createdAt)));
  if (!mentions.length) return { skipped: 'no new mention' };
  const { path, body } = summonRequest(template, mentions, now);
  const put = await fetchImpl(`${api}${path}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message: `whetstone: ${body.label} (summoned)`, branch: env.CLOCK_BRANCH, content: b64(JSON.stringify(body, null, 2) + '\n') }) });
  if (!put.ok && put.status !== 422) return { failed: `GitHub answered ${put.status}` };
  await state.set('summon:last_at', mentions[0].record.createdAt);
  return put.ok ? { committed: path, mentions: mentions.length } : { skipped: `${path} already exists` };
}
