#!/usr/bin/env node
// lab-rename.selftest.mjs — rehearse the git surgery a rename performs.
//
// WHY THIS AND NOT A UNIT TEST OF THE WORKER. The registry's half is TypeScript
// inside a Durable Object and is checked by tsc. The half that can actually
// destroy something is shell: a `cp -r` on a branch, a `git rm -r` on the
// publish branch, and a retry loop that re-merges from scratch and therefore
// undoes anything not reapplied. That is where a rename either carries the site
// or deletes it, and none of it is reachable from a type checker.
//
// So this builds a throwaway repo shaped like claude/lab-www, runs the same
// commands the workflow runs, and asserts the outcomes that matter:
//
//   1. the site ARRIVES at the new path with its contents (a move that loses
//      the contents is a delete)
//   2. the old path becomes a redirect, not a 404, because links are already
//      posted
//   3. the redirect survives the publish retry's re-merge — the exact class of
//      bug the retry loop's own comment describes

import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const STUB = new URL('./lab-redirect-stub.mjs', import.meta.url).pathname;
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const repo = mkdtempSync(join(tmpdir(), 'labrename-'));
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (p, body) => { mkdirSync(join(repo, p, '..'), { recursive: true }); writeFileSync(join(repo, p), body); };

try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  // Two tenants, because the destructive commands take a path and a typo in
  // that path takes out somebody else's site.
  write('lab/www/tube-tetris/index.html', '<title>tube tetris</title>');
  write('lab/www/tube-tetris/BRIEF.md', '# tube tetris\n\nfalling blocks on a cylinder\n');
  write('lab/www/turn-venn/index.html', '<title>turn venn</title>');
  git('add', '-A'); git('commit', '-q', '-m', 'two sites');

  const RETIRE = 'tube-tetris';
  const SLUG = 'tube-stacker';

  console.log('— the carry-over, on the site branch —');
  git('checkout', '-q', '-b', `claude/lab-${SLUG}`);
  execFileSync('cp', ['-r', join(repo, 'lab/www', RETIRE), join(repo, 'lab/www', SLUG)]);
  git('add', join('lab/www', SLUG));
  git('commit', '-q', '-m', `lab(${SLUG}): carry the site over from ${RETIRE}`);

  ck(existsSync(join(repo, 'lab/www', SLUG, 'index.html')), 'the site arrives at the new path');
  ck(readFileSync(join(repo, 'lab/www', SLUG, 'BRIEF.md'), 'utf8').includes('cylinder'),
    '  with its contents, not an empty directory');
  ck(existsSync(join(repo, 'lab/www', RETIRE, 'index.html')),
    '  and the old path is still there at this stage — retiring happens at publish');

  // The agent's turn: it relabels the copy. Only the new directory.
  write(`lab/www/${SLUG}/index.html`, '<title>tube stacker</title>');
  write(`lab/www/${SLUG}/BRIEF.md`, '# tube stacker\n\nfalling blocks on a cylinder\n');
  git('add', '-A'); git('commit', '-q', '-m', 'agent relabels');

  console.log('— the retirement, on the publish branch —');
  const retire = () => {
    if (!existsSync(join(repo, 'lab/www', RETIRE))) return;
    git('rm', '-r', '-q', join('lab/www', RETIRE));
    execFileSync('node', [STUB, join(repo, 'lab/www', RETIRE, 'index.html'), SLUG], { stdio: 'ignore' });
    git('add', join('lab/www', RETIRE, 'index.html'));
    git('commit', '-q', '-m', `lab(${SLUG}): retire /${RETIRE}/`);
  };

  git('checkout', '-q', 'main');
  git('checkout', '-q', '-B', '_publish');
  git('merge', '-q', '--no-edit', `claude/lab-${SLUG}`);
  retire();

  const stub = join(repo, 'lab/www', RETIRE, 'index.html');
  ck(existsSync(stub), 'the old path is a page, not a 404 — posted links still resolve');
  const html = readFileSync(stub, 'utf8');
  ck(html.includes(`href="/${SLUG}/"`), '  it links to the new URL');
  ck(/rel="canonical"[^>]*tube-stacker/.test(html), '  it carries a canonical pointing at the new URL');
  ck(/property="og:title"/.test(html), '  it keeps og tags, so the already-posted card still renders');
  ck(!/tetris/i.test(html), '  and it does not repeat the name being escaped');
  ck(!existsSync(join(repo, 'lab/www', RETIRE, 'BRIEF.md')), '  the rest of the old directory is gone');
  ck(existsSync(join(repo, 'lab/www', 'turn-venn', 'index.html')), 'the OTHER tenant is untouched');
  ck(existsSync(join(repo, 'lab/www', SLUG, 'index.html')), 'the renamed site is present at its new path');

  console.log('— and it survives the publish retry, which re-merges from scratch —');
  // Someone else published while we were merging. The loop resets _publish to
  // the remote and re-merges, which throws away the retirement commit. If
  // retire_old is not called again, the old directory comes back from the dead
  // and the rename silently half-happens.
  git('checkout', '-q', 'main');
  write('lab/www/another-site/index.html', '<title>another</title>');
  git('add', '-A'); git('commit', '-q', '-m', 'a concurrent publish');
  git('checkout', '-q', '-B', '_publish', 'main');
  git('merge', '-q', '--no-edit', `claude/lab-${SLUG}`);
  ck(existsSync(join(repo, 'lab/www', RETIRE, 'BRIEF.md')),
    'the re-merge really does resurrect the old directory (so the retry MUST redo it)');
  retire();
  ck(existsSync(stub) && !existsSync(join(repo, 'lab/www', RETIRE, 'BRIEF.md')),
    'calling retire_old again after the re-merge puts it back to a redirect');
  ck(existsSync(join(repo, 'lab/www', 'another-site', 'index.html')),
    "  and the concurrent publish's site is still there");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
