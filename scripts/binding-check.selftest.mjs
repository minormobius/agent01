#!/usr/bin/env node
// binding-check.selftest.mjs — the pure half of binding-check.mjs. No filesystem, no network.
import { endpointHosts, bindingFor } from './binding-check.mjs';

let failures = 0;
const check = (name, ok) => { if (!ok) { failures++; console.error(`  FAIL  ${name}`); } else console.log(`  ok    ${name}`); };

const e = endpointHosts('airchat.mino.mobi, yapchat.mino.mobi');
check('a comma list of hosts is every host', e.hosts.join() === 'airchat.mino.mobi,yapchat.mino.mobi');
check('a host with a path is a mount, not a host', endpointHosts('cad.mino.mobi/parts').mounts[0] === 'cad.mino.mobi');
check('prose around a host is ignored', endpointHosts('crm.mino.mobi (pending attach)').hosts.join() === 'crm.mino.mobi');
check('a worker name is not a host', endpointHosts('bounty-minomobi').hosts.length === 0);

const cd = { routes: [{ pattern: 'fin.mino.mobi', custom_domain: true }] };
const rt = { routes: [{ pattern: 'ns.mino.mobi/*', zone_name: 'mino.mobi' }] };
check('a custom domain binds its host', bindingFor(cd, 'fin.mino.mobi') === 'custom_domain');
check('a zone route binds its host', bindingFor(rt, 'ns.mino.mobi') === 'route');
check('a route for another host binds nothing', bindingFor(rt, 'math.mino.mobi') === null);
check('a path-scoped route is not the whole host', bindingFor({ routes: [{ pattern: 'ns.mino.mobi/api/*', zone_name: 'mino.mobi' }] }, 'ns.mino.mobi') === null);
check('a bare string route (no zone) does not count', bindingFor({ routes: ['ns.mino.mobi/*'] }, 'ns.mino.mobi') === null);
check('no routes at all is unbound — the golden rule', bindingFor({ name: 'x' }, 'x.mino.mobi') === null);

console.log(failures ? `binding-check selftest: ${failures} FAILURE(S)` : 'binding-check selftest: PASS');
process.exit(failures ? 1 : 0);
