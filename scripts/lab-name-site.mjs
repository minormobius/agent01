#!/usr/bin/env node
// lab-name-site.mjs — what the site the agent just built should be called.
//
//   printf '%s\n' $taken | node scripts/lab-name-site.mjs --dir lab/www/foo --current foo
//
// Prints ONE LINE: the slug the site should live at. Prints the current name
// unchanged when there is no improvement to make, so the caller never has to
// decide what an empty answer meant. Exits non-zero only on a usage error —
// a title it cannot use is a normal outcome, not a failure, and must never take
// down a build that has otherwise succeeded.
//
// WHY THIS RUNS IN CI AND NOT IN THE BOT. The name has to be decided after the
// agent has written the <title> and before anything is published, and the only
// component that is awake at that moment is the build. The bot finds out
// afterwards, from .github/lab-names/<slug>.json — see readBuildName in
// workers/bsky-bot/src/index.ts for why that file rather than a callback.
//
// THE TAKEN SET COMES FROM DISK, ON STDIN. Not from the registry: the registry
// knows only the sites the bot created, while lab/www/ on the publish branch is
// every path the domain actually serves — including retired names that are now
// redirect stubs, which are exactly the ones a new site must not land on.

import { readFileSync } from 'node:fs';
import { slugFromTitle, rename } from './lib/site-name.mjs';

/** The <title>, decoded no further than the naming function needs. It handles
 *  entities and folding itself; this only has to find the text. */
export function titleOf(html) {
  const m = String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = arg('dir');
  const current = arg('current');
  if (!dir || !current) {
    console.error('usage: lab-name-site.mjs --dir <site dir> --current <slug>  [taken slugs on stdin]');
    process.exit(2);
  }

  let html = '';
  try {
    html = readFileSync(`${dir}/index.html`, 'utf8');
  } catch {
    // No index.html is a broken build, and the gates will have said so. Nothing
    // to name from, so the placeholder stands.
    process.stdout.write(`${current}\n`);
    process.exit(0);
  }

  let taken = new Set();
  try {
    taken = new Set(
      readFileSync(0, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean),
    );
  } catch { /* no stdin is a legitimate way to say "nothing is taken" */ }
  // The site's own directory is on the publish branch once it has been built
  // before, and it must not count as a collision with itself.
  taken.delete(current);

  const title = titleOf(html);
  const want = rename(title, current, (s) => taken.has(s));
  if (want) {
    console.error(`naming: "${title}" → ${want} (was ${current})`);
  } else if (title) {
    console.error(`naming: "${title}" → keeping ${current}${slugFromTitle(title) ? '' : ' (no usable slug in the title)'}`);
  } else {
    console.error(`naming: no <title> in ${dir}/index.html — keeping ${current}`);
  }
  process.stdout.write(`${want || current}\n`);
}
