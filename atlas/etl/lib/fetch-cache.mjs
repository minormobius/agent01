// fetch-cache.mjs — download once, keep it out of the repo.
//
// Raw source archives are tens of megabytes and are NOT committed: the repo
// carries the derived, simplified artefacts and the script that rebuilds them.
// Cache lives under $ATLAS_CACHE (default: os tmpdir), so a rebuild in a fresh
// sandbox just re-downloads.

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const CACHE = process.env.ATLAS_CACHE || join(tmpdir(), 'atlas-cache');

// Several publishers (BLS, and INEGI intermittently) reject the default
// undici user-agent outright. A browser UA is the difference between a 403 and
// the data; it is not an attempt to hide what this is.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

export function cachePath(url) {
  mkdirSync(CACHE, { recursive: true });
  const slug = (url.split('/').pop() || 'file').replace(/[^\w.-]/g, '_').slice(-60);
  return join(CACHE, `${createHash('sha1').update(url).digest('hex').slice(0, 10)}-${slug}`);
}

/** GET `url` as a Buffer, cached on disk by URL. */
export async function get(url, { label = '' } = {}) {
  const path = cachePath(url);
  if (existsSync(path) && statSync(path).size > 0) {
    process.stderr.write(`  · cached ${label || url} (${(statSync(path).size / 1e6).toFixed(1)} MB)\n`);
    return readFileSync(path);
  }
  process.stderr.write(`  ↓ ${label || url}\n`);
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  process.stderr.write(`    ${(buf.length / 1e6).toFixed(1)} MB\n`);
  return buf;
}

export const getText = async (url, opts) => (await get(url, opts)).toString('utf8');
