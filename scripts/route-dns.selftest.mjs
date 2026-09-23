#!/usr/bin/env node
// route-dns.selftest.mjs — the pure half of route-dns.mjs: which routes need DNS, and what
// to do about the records a host already has. No network.
import { stripJsonc, plainRoutes, decide } from './route-dns.mjs';

let failures = 0;
const check = (name, ok) => { if (!ok) { failures++; console.error(`  FAIL  ${name}`); } else console.log(`  ok    ${name}`); };

const cfg = JSON.parse(stripJsonc(`{
  // a comment with "quotes" and a // inside
  "name": "fin",
  "routes": [
    { "pattern": "fin.mino.mobi", "custom_domain": true },
    { "pattern": "perp.mino.mobi/*", "zone_name": "mino.mobi" }, /* block */
    { "pattern": "*.mino.mobi/*", "zone_name": "mino.mobi" },
    "legacy.example/*",
  ],
  "vars": { "URL": "https://x.mino.mobi/a//b" }
}`));
check('JSONC with comments, trailing commas and // inside strings parses', cfg.vars.URL === 'https://x.mino.mobi/a//b');
const pr = plainRoutes(cfg);
check('custom domains and bare-string routes are skipped', pr.length === 2);
check('the host is the pattern up to its first slash', pr[0].host === 'perp.mino.mobi' && pr[0].zone === 'mino.mobi');
check('a wildcard host is flagged', pr[1].wildcard === true && pr[0].wildcard === false);
check('a config with no routes has none', plainRoutes({ name: 'x' }).length === 0);

check('no record -> create', decide([]).action === 'create');
check('a proxied AAAA is enough', decide([{ type: 'AAAA', content: '100::', proxied: true }]).action === 'ok');
check('a proxied CNAME is enough', decide([{ type: 'CNAME', content: 'x', proxied: true }]).action === 'ok');
check('a custom-domain (read-only) record is refused, not taken over',
  decide([{ type: 'AAAA', content: '100::', proxied: true, meta: { read_only: true } }]).action === 'refuse');
check('a DNS-only record is refused (the route would never see the traffic)',
  decide([{ type: 'A', content: '1.2.3.4', proxied: false }]).action === 'refuse');
check('a TXT alone does not block: the AAAA is created beside it',
  decide([{ type: 'TXT', content: 'v=spf1', proxied: false }]).action === 'create');

console.log(failures ? `route-dns selftest: ${failures} FAILURE(S)` : 'route-dns selftest: PASS');
process.exit(failures ? 1 : 0);
