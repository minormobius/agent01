// sharp/rdap — the one place that talks to registries.
//
// Runs in the worker and in node unchanged: `fetch` and `AbortController` are
// the only platform surface, and both are given, not imported.
//
// Registries are somebody else's infrastructure and most of them rate-limit.
// So: a cap on how many TLDs one request may ask about, a small concurrency
// pool, one host at a time where the bootstrap points several TLDs at the same
// server, a hard per-query timeout, one retry on 429, and a per-isolate memo so
// the same question is never asked twice. Rudeness here gets the whole worker
// IP throttled, which breaks the feature for everyone.

import { rdapUrl, readRdap, summariseRecord, validLabel } from './tld.js';

// delayMs is not politeness theatre: the bootstrap points several TLDs at one
// operator (.ai, .run and .fyi are all Identity Digital), and asking them back
// to back earns a 429 — which this reports honestly as `unknown`, and `unknown`
// is useless to whoever asked. A third of a second between queries to the same
// host buys real answers for about a second of latency.
export const LIMITS = { maxTlds: 16, concurrency: 5, timeoutMs: 6000, retries: 2, delayMs: 350 };

const UA = 'sharp/1.0 (+https://rite.mino.mobi/sharp/; RDAP availability lookup)';

const memo = new Map();                       // "label.tld" -> result
const MEMO_MAX = 5000;

export function clearMemo() { memo.clear(); }

async function once(url, { fetchImpl, timeoutMs }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: {
        accept: 'application/rdap+json, application/json',
        // Identify the client. Registries throttle anonymous traffic harder,
        // and an operator who wants this to stop has somewhere to look.
        'user-agent': UA,
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

/** One domain, one answer. Never throws — a failure is a verdict, not an exception. */
export async function checkOne(label, tld, data, opts = {}) {
  const key = `${label}.${tld}`;
  if (memo.has(key)) return memo.get(key);

  const fetchImpl = opts.fetch || fetch;
  const timeoutMs = opts.timeoutMs || LIMITS.timeoutMs;
  const retries = opts.retries ?? LIMITS.retries;

  let result;
  if (!validLabel(label)) {
    result = { domain: key, label, tld, verdict: 'invalid', detail: null };
  } else if (!data.tldSet.has(tld)) {
    result = { domain: key, label, tld, verdict: 'invalid', detail: 'not a delegated TLD' };
  } else {
    const url = rdapUrl(label, tld, data.rdap);
    if (!url) {
      result = { domain: key, label, tld, verdict: 'unverifiable', detail: null };
    } else {
      let res = await once(url, { fetchImpl, timeoutMs });
      // A 429 means back off, not try again immediately. Exponential, and only
      // as many times as the caller allowed. Some registries refuse shared
      // cloud egress outright (403) or throttle it whatever the gap — from a
      // Worker those stay `unknown`, and that is the true answer, not a
      // problem to retry away.
      for (let i = 0; i < retries && (res.status === 429 || res.status >= 500); i++) {
        await sleep(700 * Math.pow(2, i));
        res = await once(url, { fetchImpl, timeoutMs });
      }
      const verdict = readRdap(res.status, res.body, true);
      let detail = null;
      if (verdict === 'taken') {
        try { detail = summariseRecord(JSON.parse(res.body)); } catch { /* a record we cannot read is still a record */ }
      }
      result = { domain: key, label, tld, verdict, detail, status: res.status };
    }
  }

  if (memo.size > MEMO_MAX) memo.clear();
  memo.set(key, result);
  return result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Many domains, politely. Groups by RDAP host so one registry is never asked
 * two things at once, then runs the groups through a small pool.
 */
export async function checkMany(pairs, data, opts = {}) {
  const limit = opts.maxTlds || LIMITS.maxTlds;
  const work = pairs.slice(0, limit);

  const byHost = new Map();
  for (const [label, tld] of work) {
    const url = rdapUrl(label, tld, data.rdap);
    const host = url ? new URL(url).host : `~none~${tld}`;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push([label, tld]);
  }

  const queues = [...byHost.values()];
  const out = [];
  const width = Math.min(opts.concurrency || LIMITS.concurrency, queues.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < queues.length) {
      const q = queues[next++];
      const gap = opts.delayMs ?? LIMITS.delayMs;
      for (let i = 0; i < q.length; i++) {
        if (i && gap) await sleep(gap);            // space the queries to one host
        out.push(await checkOne(q[i][0], q[i][1], data, opts));
      }
    }
  }));

  // Restore the caller's order; a pool returns whatever finishes first.
  const rank = new Map(work.map(([l, t], i) => [`${l}.${t}`, i]));
  out.sort((a, b) => rank.get(a.domain) - rank.get(b.domain));
  return out;
}
