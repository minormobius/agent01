#!/usr/bin/env node
// safe-fetch.selftest.mjs — the addresses a stranger must not be able to aim
// the runner at.
//
//   node scripts/safe-fetch.selftest.mjs
//
// Offline by design: everything here is address classification and URL parsing,
// so it needs no network and cannot flake on one. The redirect-following path
// is exercised against a localhost server, which is also the one address the
// guard must refuse — so that test asserts the refusal rather than a fetch.

import { createServer } from 'node:http';
import {
  isPublicV4, isPublicV6, isPublicAddress, urlObjection, hostObjection, safeFetch, expandV6,
} from './lib/safe-fetch.mjs';

let pass = 0, fail = 0;
const ck = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${msg}`); } };

// --- IPv4 -----------------------------------------------------------------
for (const ip of ['8.8.8.8', '1.1.1.1', '151.101.1.140', '199.108.4.5']) {
  ck(isPublicV4(ip), `${ip} should be public`);
}
for (const ip of [
  '127.0.0.1',        // loopback — everything else listening on the runner
  '127.1.2.3',        // the whole /8, not just .0.1
  '0.0.0.0',
  '10.0.0.7',
  '172.16.0.1', '172.31.255.254',
  '192.168.1.1',
  '169.254.169.254',  // cloud metadata
  '100.64.0.1',       // CGNAT
  '224.0.0.1',        // multicast
  '255.255.255.255',
  '198.18.0.1',
  '192.0.2.5', '198.51.100.5', '203.0.113.5',
]) {
  ck(!isPublicV4(ip), `${ip} must be refused`);
}
// Boundaries: one address either side of 172.16/12.
ck(isPublicV4('172.15.255.255'), '172.15.255.255 is outside RFC1918 and public');
ck(isPublicV4('172.32.0.0'), '172.32.0.0 is outside RFC1918 and public');
ck(!isPublicV4('172.16.0.0'), '172.16.0.0 is the first RFC1918 address');
ck(!isPublicV4('172.31.255.255'), '172.31.255.255 is the last RFC1918 address');

ck(!isPublicV4('not.an.ip'), 'a hostname is not a public IP');
ck(!isPublicV4('999.1.1.1'), 'an out-of-range octet is not an IP');

// --- IPv6 -----------------------------------------------------------------
ck(isPublicV6('2606:4700:4700::1111'), 'a public v6 address is public');
for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
  ck(!isPublicV6(ip), `${ip} must be refused`);
}
// THE ONE THAT MATTERS MOST: a v4 address wearing a v6 costume. A guard that
// checks these as "some v6 address" waves ::ffff:127.0.0.1 straight through.
ck(!isPublicV6('::ffff:127.0.0.1'), 'IPv4-mapped loopback must be refused');
ck(!isPublicV6('::ffff:169.254.169.254'), 'IPv4-mapped metadata address must be refused');
ck(!isPublicV6('64:ff9b::127.0.0.1'), 'NAT64-wrapped loopback must be refused');
ck(isPublicV6('::ffff:8.8.8.8'), 'IPv4-mapped public address is still public');
// THE FORM THAT ACTUALLY REACHES THE GUARD. new URL() normalises an embedded
// dotted quad into hex, so these are what hostObjection() really sees — and a
// prefix-matching guard let the first one straight through.
ck(!isPublicV6('::ffff:7f00:1'), 'IPv4-mapped loopback in hex form must be refused');
ck(!isPublicV6('::ffff:a9fe:a9fe'), 'IPv4-mapped metadata address in hex form must be refused');
ck(isPublicV6('::ffff:808:808'), 'IPv4-mapped 8.8.8.8 in hex form is still public');
ck(!isPublicV6('0:0:0:0:0:ffff:7f00:1'), 'the fully-expanded mapped loopback is refused too');
ck(expandV6('::1') !== null && expandV6('1:2:3:4:5:6:7:8:9') === null, 'expandV6 rejects over-long addresses');
ck(!isPublicV6('fe80::1%eth0'), 'a zone id does not smuggle a link-local address through');

ck(isPublicAddress('8.8.8.8') && !isPublicAddress('::1'), 'isPublicAddress dispatches on family');

// --- URLs -----------------------------------------------------------------
ck(urlObjection('https://arxiv.org/abs/2006.07859') === null, 'a normal citation is fine');
ck(urlObjection('http://example.com/x') === null, 'plain http is fine');

const refused = (u) => ck(urlObjection(u) !== null, `must refuse ${u}`);
refused('file:///etc/passwd');
refused('ftp://example.com/x');
refused('gopher://example.com/');
refused('http://user:pw@example.com/');       // credentials are aiming, not citing
refused('http://example.com:8080/');          // odd ports are internal services
refused('http://127.0.0.1/');
refused('http://127.0.0.1:80/');
refused('http://169.254.169.254/latest/meta-data/');
refused('http://[::1]/');
refused('http://[::ffff:127.0.0.1]/');
refused('http://10.0.0.1/');
refused('not a url at all');

// data: and javascript: have no host, so they must be caught by scheme alone.
refused('data:text/html,<script>1</script>');
refused('javascript:alert(1)');

// --- host resolution ------------------------------------------------------
ck(await hostObjection('127.0.0.1') !== null, 'a literal loopback host is refused');
ck(await hostObjection('8.8.8.8') === null, 'a literal public host is allowed');
{
  const why = await hostObjection('localhost');
  ck(why !== null, 'localhost must be refused however it resolves');
}
{
  // A name that cannot resolve is refused rather than attempted — UNKNOWN is
  // not YES. The .invalid TLD is reserved for exactly this and can never exist.
  const why = await hostObjection('nothing.invalid');
  ck(why !== null, 'an unresolvable host is refused');
}

// --- redirects are checked per hop ---------------------------------------
// The point of following redirects by hand. A public-looking first hop is not
// a promise about the second, and `redirect: 'follow'` would never have asked.
await new Promise((resolve) => {
  const server = createServer((req, res) => {
    if (req.url === '/to-metadata') {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    } else { res.writeHead(200); res.end('ok'); }
  });
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    // Localhost itself is refused, which is the first thing to prove.
    let threw = null;
    try { await safeFetch(`http://127.0.0.1:${port}/`); } catch (e) { threw = e; }
    ck(threw !== null, 'safeFetch refuses a localhost URL outright');
    ck(threw && /not a public address|not 80 or 443/.test(threw.message),
       `refusal names the reason, got: ${threw && threw.message}`);
    server.close(resolve);
  });
});

console.log(fail ? `✗ safe-fetch: ${fail} failed, ${pass} passed` : `✓ safe-fetch — ${pass} passed`);
process.exit(fail ? 1 : 0);
