// node scripts/lib/dossier.selftest.mjs
//
// The corpus is the research surface: an agent greps it and cites what it
// finds. Two things have to hold or the dossier is quietly wrong — ONE POST PER
// LINE, so a grep hit carries its own text, and the rkey in column 1 being a
// real citation. Both are tested here. The AppView calls are not.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escapeText, postKind, corpusLine, postUrl, postUri, writeCorpus } from './dossier.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

console.log('— one post per line, whatever the post contains —');
{
  ck(!escapeText('a\nb').includes('\n'), 'a newline in a post does not become a newline in the file');
  ck(escapeText('a\nb') === 'a\\nb', 'it becomes a literal backslash-n');
  ck(escapeText('a\tb') === 'a\\tb', 'A TAB IS THE FIELD SEPARATOR, so a tab in the text is escaped too');
  // Backslash must be escaped FIRST or the escaping is not reversible: a post
  // containing a literal \n would come back as a newline.
  ck(escapeText('a\\nb') === 'a\\\\nb', 'a literal backslash-n in the source stays distinguishable');
  ck(escapeText('a\r\nb') === 'a\\nb', 'CRLF collapses to one escape');

  const line = corpusLine({ rkey: 'abc123', createdAt: '2024-03-04T05:06:07Z', text: 'multi\nline\tpost' });
  ck(line.split('\t').length === 4, 'exactly four fields survive a post full of separators');
  ck(!line.includes('\n'), 'and the line is one line');
  ck(line.startsWith('abc123\t2024-03-04\t'), 'rkey and date lead');
}

console.log('— kind, because "they said X" and "they said X to someone" differ —');
{
  ck(postKind({ isReply: true }) === 'reply', 'a reply is a reply');
  ck(postKind({ embed: 'record' }) === 'quote', 'a quote-post is a quote');
  ck(postKind({ embed: 'images' }) === 'post', 'an image post is still a standalone post');
  ck(postKind({}) === 'post', 'the default is post');
  ck(postKind({ isReply: true, embed: 'record' }) === 'reply', 'a quote-reply reads as a reply — it is aimed at someone');
}

console.log('— citations resolve to something clickable —');
{
  ck(postUrl('a.bsky.social', 'xyz') === 'https://bsky.app/profile/a.bsky.social/post/xyz',
    'the bsky.app URL is what a human can open');
  ck(postUri('did:plc:q', 'xyz') === 'at://did:plc:q/app.bsky.feed.post/xyz',
    'the at:// URI is what the API needs');
}

console.log('— the corpus on disk —');
{
  const dir = mkdtempSync(join(tmpdir(), 'dossier-'));
  const posts = [
    { rkey: 'a1', createdAt: '2023-05-01T00:00:00Z', text: 'trams are good', isReply: false },
    { rkey: 'b2', createdAt: '2024-06-01T00:00:00Z', text: 'trams\nare better', isReply: true },
    { rkey: 'c3', createdAt: '2024-07-01T00:00:00Z', text: '', isReply: false },
    { rkey: 'd4', createdAt: '2024-08-01T00:00:00Z', text: '   ', isReply: false },
  ];
  const stats = writeCorpus(posts, dir, { handle: 'a.bsky.social', did: 'did:plc:q' });

  ck(stats.total === 2, 'posts with no text are left out — they are not searchable and not quotable');
  ck(stats.first === '2023-05-01' && stats.last === '2024-06-01', 'the span covers what was kept');
  ck(stats.years.join(',') === '2023,2024', 'sharded by year');

  const all = readFileSync(join(dir, 'all.tsv'), 'utf8');
  ck(all.trim().split('\n').length === 2, 'all.tsv has one line per post');
  ck(all.indexOf('a1') < all.indexOf('b2'), 'oldest first, so a sweep reads chronologically');
  ck(readFileSync(join(dir, 'by-year', '2024.tsv'), 'utf8').includes('b2'), 'and the year shard holds its own');

  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  ck(readme.includes('ONE POST PER LINE'), 'the README states the contract the agent depends on');
  ck(readme.includes('\\n'), 'and warns that newlines are escaped, so the agent does not "fix" them');
  ck(readme.includes('https://bsky.app/profile/a.bsky.social/post/<rkey>'), 'and shows how to cite');
  ck(readme.includes('never invent one'), 'and says not to invent an rkey — a fake citation is the worst failure here');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
