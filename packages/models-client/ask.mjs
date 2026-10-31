#!/usr/bin/env node
// ask.mjs — ask another model something, through the lab's proxy (no key needed or held here).
//
//   node ask.mjs --list
//   node ask.mjs <model> "prompt"            [--system "…"] [--json]
//   echo "long prompt" | node ask.mjs <model> -   [--system-file f]
//
// Prints the answer. --json prints { model, text, tokens, left }. The proxy's address comes from
// MINIPHIM_MODELS_URL, which the lab sets for a run that lends models; without it there are none.
import { readFileSync } from 'node:fs';

export async function ask(model, prompt, { system = '', url = process.env.MINIPHIM_MODELS_URL, who = process.env.WHETSTONE_SOUL || 'unknown' } = {}) {
  if (!url) throw new Error('no models lent to this run (MINIPHIM_MODELS_URL is not set)');
  const r = await fetch(`${url}/ask`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-soul': who }, body: JSON.stringify({ model, system, prompt }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `proxy answered ${r.status}`);
  return j;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const flag = (k) => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : null; };
  try {
    if (a[0] === '--selftest') { console.log('models-client ok'); process.exit(0); }
    if (a[0] === '--list') {
      const u = process.env.MINIPHIM_MODELS_URL; if (!u) throw new Error('no models lent to this run');
      console.log(JSON.stringify(await (await fetch(u)).json())); process.exit(0);
    }
    const asJson = a.includes('--json'); if (asJson) a.splice(a.indexOf('--json'), 1);
    const sysFile = flag('--system-file'); const system = flag('--system') ?? (sysFile ? readFileSync(sysFile, 'utf8') : '');
    const [model, p] = a;
    if (!model || p == null) throw new Error('usage: node ask.mjs <model> "prompt" | -   (node ask.mjs --list)');
    const prompt = p === '-' ? readFileSync(0, 'utf8') : p;
    const r = await ask(model, prompt, { system });
    console.log(asJson ? JSON.stringify(r) : r.text);
  } catch (e) { console.error(e.message); process.exit(1); }
}
