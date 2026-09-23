/**
 * The hand-over: a link that carries the whole dweet, and the post that would
 * carry it.
 *
 *   node agent/link.mjs <src> [--title t] [--note "…"] [--json]
 *
 * Prints the permalink and the exact text of the Bluesky post, with its
 * grapheme count against the 300 limit and which optional part (if any) was
 * dropped to fit. Exit 1 if the dweet is invalid.
 *
 * The permalink is deliberately NOT an `at://` uri. A record URI is canonical
 * and needs a DID document lookup, a PDS round trip and a record that has
 * actually landed — three ways for a shared link to be dead in the minute
 * after posting, which is the minute it gets clicked. The source is 256
 * characters; it fits in a query string, and then the link is true offline,
 * true for a draft, and true for a house seed that is not a record at all.
 */
import { arg, has, positional, resolveSource, emit, die } from './common.mjs';
import { validate, countChars, sizeClass } from '../sandbox.js';
import { composePost, permalink, graphemes, POST_MAX, LINK_TEXT } from '../share.js';

let source;
try { source = await resolveSource(positional(), { lang: arg('--lang') }); }
catch (err) { die(err.message); }
const { src, lang, title } = source;

const v = validate({ src, lang });
const size = sizeClass(src);
const url = permalink(arg('--base', 'https://bsky.mino.mobi/dweet/'), { src, lang, title });
const post = composePost({
  src, lang, title, chars: countChars(src), tier: size.label,
  url, note: arg('--note'),
});

const out = {
  valid: v.ok, error: v.ok ? null : v.error,
  permalink: url,
  post: {
    text: post.text,
    graphemes: graphemes(post.text),
    max: POST_MAX,
    dropped: post.dropped,
    linkText: LINK_TEXT,
    facets: post.facets,
  },
};

emit(out, [
  url,
  '',
  `  post  ${out.post.graphemes}/${POST_MAX} graphemes`
    + (post.dropped.length ? `   (${post.dropped[0]} dropped to fit)` : ''),
  '',
  ...post.text.split('\n').map((l) => `  | ${l}`),
  '',
  `  the link renders as "${LINK_TEXT}" — the facet points at the full URL,`,
  '  which is how every client shortens one.',
  ...(v.ok ? [] : ['', `  INVALID: ${v.error}`]),
]);

process.exit(v.ok ? 0 : 1);
