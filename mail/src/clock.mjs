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
    body: { ...rest, label, kinds: (kinds_by_hour && kinds_by_hour[hh]) || rest.kinds, seed: Number(date.replace(/-/g, '')) % 100000 + Number(hh) } };
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
