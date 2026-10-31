// clock.mjs — the miniphim's days, on a schedule. Six times a day (every four hours) the mail worker's cron reads
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
    body: { ...rest, label, kinds: (kinds_by_hour && kinds_by_hour[hh]) || rest.kinds, seed: (Number(date.replace(/-/g, '')) % 100000) * 6 + Math.floor(Number(hh) / 4) } };
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

// miniphim, and its bot account miniphim-works (council 10-17: a mention of the bot by the person or a
// mutual is a summons too).
export const WORKS_DID = 'did:plc:ecqgihbmc6jhoybrr3dthvsi';
export function addressesUs(post, dids = [MINIPHIM_DID, WORKS_DID]) {
  const r = post?.record || {};
  const list = [].concat(dids);
  if (list.some((d) => String(r.reply?.parent?.uri || '').startsWith(`at://${d}/`))) return true;
  if ((r.facets || []).some((f) => (f.features || []).some((x) => String(x.$type).endsWith('#mention') && list.includes(x.did)))) return true;
  return /(^|\s)@miniphim(-works)?(\.delve\.town)?\b/i.test(r.text || '');
}

export function summonRequest(template, mentions, now) {
  const s = template.summon || {};
  const newest = mentions[0];
  const date = now.toISOString().slice(0, 10);
  const rkey = newest.uri.split('/').pop();
  const { enabled, $comment, kinds_by_hour, summon, ...rest } = template;
  const who = [...new Set(mentions.map((m) => m.author?.handle).filter(Boolean))];
  const person = who.length === 1 && who[0] === s.from;
  return { path: `packages/whetstone/requests/${date}-summon-${rkey}.json`,
    body: { ...rest, ...(s.request || {}), label: `summon-${rkey}`, seed: Math.floor(now.getTime() / 60000) % 100000,
      summoned_by: mentions.map((m) => m.uri),
      notice: person
        ? `The person summoned you: ${mentions.length === 1 ? 'a post' : `${mentions.length} posts`} addressed to the account (${mentions.map((m) => m.uri).join(', ')}), in town/inbox.json.`
        : `You were summoned by ${who.map((h) => (h === s.from ? `${h} (the person)` : `${h} (a mutual)`)).join(', ')}: ${mentions.length === 1 ? 'a post' : `${mentions.length} posts`} addressed to the account (${mentions.map((m) => m.uri).join(', ')}), in town/inbox.json and town/threads.json. Anyone you follow who follows you back can summon you (the person, 2026-10-11: "then they get to choose"): your follows are the guest list. Whether and how to answer is yours.` } };
}

const UA = { 'user-agent': 'mino-mail-summon (+https://mail.mino.mobi)', accept: 'application/json' };

// miniphim's mutuals: accounts it follows that follow it back (public AppView reads, paged).
export async function mutualsOf(fetchImpl, actor = MINIPHIM_DID) {
  const all = async (m, key) => {
    const out = []; let cursor;
    for (let i = 0; i < 10; i++) {
      const r = await fetchImpl(`${APPVIEW}/xrpc/town.delve.graph.${m}?actor=${encodeURIComponent(actor)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: UA });
      if (!r.ok) throw new Error(`${m}: ${r.status}`);
      const j = await r.json(); out.push(...(j[key] || []));
      if (!j.cursor || !(j[key] || []).length) break; cursor = j.cursor;
    }
    return out;
  };
  const followers = new Set((await all('getFollowers', 'followers')).map((a) => a.did));
  return (await all('getFollows', 'follows')).filter((a) => followers.has(a.did)).map((a) => ({ did: a.did, handle: a.handle }));
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
  const window = (s.window_min || 30) * 60000;
  const feedOf = async (actor) => {
    const f = await fetchImpl(`${APPVIEW}/xrpc/town.delve.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=30`, { headers: UA });
    if (!f.ok) throw new Error(`author feed ${actor}: ${f.status} ${(await f.text().catch(() => '')).slice(0, 120)}`);
    return ((await f.json()).feed || []).map((x) => x.post);
  };
  // The person: their mentions summon at once, as before.
  let posts;
  try { posts = await feedOf(s.from); } catch (e) { return { skipped: String(e.message) }; }
  const last = (await state.get('summon:last_at')) || new Date(now.getTime() - window).toISOString();
  const theirs = posts.filter((p) => p?.author?.handle === s.from && addressesUs(p) && String(p.record?.createdAt) > last);
  // Mutuals (summon.mutuals: true): the accounts miniphim follows that follow it back, re-read every
  // 30 min. Up to summon.per_tick of their feeds a tick, in rotation; each mutual's own "seen" time, so a
  // mention is answered once. Their summons are paced (summon.mutual_gap_min, summon.mutual_per_day);
  // a held mention stays unseen and goes out with the next allowed summon.
  let fromMutuals = [], mutualSeen = {}, held = null, mutualCount = 0, dropped = [];
  if (s.mutuals === true) {
    let m = null; try { m = JSON.parse((await state.get('summon:mutuals')) || 'null'); } catch { m = null; }
    if (!m || now.getTime() - Date.parse(m.at) > 30 * 60000) {
      try { m = { at: now.toISOString(), list: await mutualsOf(fetchImpl) }; await state.set('summon:mutuals', JSON.stringify(m)); }
      catch (e) { m = m || { at: now.toISOString(), list: [] }; }
    }
    const list = m.list.filter((x) => x.handle !== s.from); mutualCount = list.length;
    const per = Math.max(1, s.per_tick || 10), rot = Number((await state.get('summon:rot')) || 0) % Math.max(1, list.length);
    const turn = list.length <= per ? list : [...list, ...list].slice(rot, rot + per);
    await state.set('summon:rot', String((rot + per) % Math.max(1, list.length)));
    for (const a of turn) {
      // The first look at a mutual stores its starting point, so a mention held for the 30-minute spacing
      // can't age out of the window before it is allowed to go.
      let seen = await state.get(`summon:seen:${a.did}`);
      if (!seen) { seen = new Date(now.getTime() - window).toISOString(); await state.set(`summon:seen:${a.did}`, seen); }
      let ps; try { ps = await feedOf(a.did); } catch { continue; }
      const mine = ps.filter((p) => p?.author?.did === a.did && addressesUs(p) && String(p.record?.createdAt) > seen);
      if (mine.length) { fromMutuals.push(...mine); mutualSeen[a.did] = mine.map((p) => p.record.createdAt).sort().at(-1); }
    }
    // Council 10-17: at most one wake per mutual per UTC day and summon.mutual_per_day (10) across them,
    // 30 min apart. Past a cap a mention is NOT queued: it is marked seen here and is an ordinary inbox item
    // for the next town day. Only the 30-minute spacing holds one back to go with the next allowed summon.
    if (fromMutuals.length && !theirs.length) {
      const day = now.toISOString().slice(0, 10), cap = s.mutual_per_day ?? 10, gap = (s.mutual_gap_min ?? 30) * 60000;
      const fresh = [];
      for (const p of fromMutuals) ((await state.get(`summon:acct:${p.author?.did}`)) === day ? dropped : fresh).push(p);
      fromMutuals = fresh;
      let count = {}; try { count = JSON.parse((await state.get('summon:mutual_day')) || '{}'); } catch { count = {}; }
      if (fromMutuals.length && count.day === day && count.n >= cap) { dropped.push(...fromMutuals); fromMutuals = []; }
      const lastM = await state.get('summon:mutual_last');
      if (fromMutuals.length && lastM && now.getTime() - Date.parse(lastM) < gap) held = `a mutual's summon waits: the last was under ${s.mutual_gap_min ?? 30} min ago`;
    }
  }
  const mentions = [...theirs, ...(held ? [] : fromMutuals)]
    .sort((a, b) => String(b.record.createdAt).localeCompare(String(a.record.createdAt)));
  if (!mentions.length) {
    if (dropped.length && !held) for (const [did, at] of Object.entries(mutualSeen)) await state.set(`summon:seen:${did}`, at);
    return { skipped: held || (dropped.length ? `${dropped.length} mention(s) past a cap: inbox items for the next town day, not summons` : 'no new mention'), since: last, read: posts.length, newest: posts[0]?.record?.createdAt || null, ...(s.mutuals === true ? { mutuals: mutualCount } : {}) };
  }
  const { path, body } = summonRequest(template, mentions, now);
  const put = await fetchImpl(`${api}${path}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message: `whetstone: ${body.label} (summoned)`, branch: env.CLOCK_BRANCH, content: b64(JSON.stringify(body, null, 2) + '\n') }) });
  if (!put.ok && put.status !== 422) return { failed: `GitHub answered ${put.status}` };
  if (theirs.length) await state.set('summon:last_at', theirs.map((p) => p.record.createdAt).sort().at(-1));
  if (!held) {
    for (const [did, at] of Object.entries(mutualSeen)) await state.set(`summon:seen:${did}`, at);
    if (fromMutuals.length && !theirs.length) {
      const day = now.toISOString().slice(0, 10);
      let count = {}; try { count = JSON.parse((await state.get('summon:mutual_day')) || '{}'); } catch { count = {}; }
      await state.set('summon:mutual_day', JSON.stringify({ day, n: count.day === day ? count.n + 1 : 1 }));
      await state.set('summon:mutual_last', now.toISOString());
      for (const p of fromMutuals) await state.set(`summon:acct:${p.author?.did}`, day);
    }
  }
  return put.ok ? { committed: path, mentions: mentions.length, ...(fromMutuals.length && !held ? { by_mutuals: fromMutuals.length } : {}) } : { skipped: `${path} already exists` };
}
