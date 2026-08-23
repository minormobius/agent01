// SkyFeed → feedgen — read a `skyfeedBuilder` block list off a published
// `app.bsky.feed.generator` record and produce the equivalent
// `com.minomobi.feedgen.def`.
//
// Why this exists: SkyFeed went unmaintained, and the feeds people built on it
// are still live records on their own PDS. The builder is gone but the
// definition is not, so a feed can be lifted off the record and re-hosted here
// without anyone retyping a six-hundred-character regex by hand.
//
// The conversion is deliberately lossy in a *loud* way: anything that does not
// map cleanly comes back in `warnings` rather than being dropped silently, so
// the person importing can see exactly which part of their feed did not
// survive the move.

const MEDIA_FOR_EMBED = {
  post: 'quote', record: 'quote', quote: 'quote',
  video: 'video',
  link: 'link', external: 'link', website: 'link',
  image: 'image', images: 'image',
};

// SkyFeed spells "how many images" as a set of removable buckets. Only the
// combination that removes every non-zero bucket is expressible as "no images";
// "remove posts with exactly one image, keep the ones with three" has no
// equivalent here and is reported instead of being approximated.
function resolveImageCount(values, warnings) {
  const v = new Set(values);
  const nonZero = ['1', '2+'].filter((k) => v.has(k));
  if (nonZero.length === 2) return { type: 'media', has: ['image'], mode: 'none' };
  if (v.has('0') && nonZero.length === 0) return { type: 'media', has: ['image'], mode: 'any' };
  warnings.push(`image_count ${[...v].join(', ')} has no exact equivalent — imported as "no images"`);
  return { type: 'media', has: ['image'], mode: 'none' };
}

function convertInput(b, warnings) {
  const t = b.inputType || b.input || '';
  if (t === 'firehose') return { type: 'firehose', seconds: Number(b.firehoseSeconds) || 86400 };
  if (t === 'list') return { type: 'list', uri: b.listUri || b.uri || '' };
  if (t === 'author' || t === 'user') return { type: 'author', actor: b.user || b.did || b.actor || '', filter: 'posts_no_replies' };
  if (t === 'search') return { type: 'search', q: b.value || b.query || b.q || '', sort: 'latest' };
  warnings.push(`unsupported input "${t || '(none)'}" — skipped`);
  return null;
}

function convertRemove(b, warnings) {
  const subject = b.subject || '';
  if (subject === 'language') {
    if (!b.language) return { type: 'noLang' };            // bare block: drop untagged posts
    // `!=` removes every *other* language, i.e. keeps this one — and keeps it
    // STRICTLY: a post tagged [en, pt] does have a language that is not en.
    return b.operator === '!='
      ? { type: 'lang', code: b.language, strict: true }
      : { type: 'lang', code: b.language, mode: 'exclude' };
  }
  if (subject === 'item') {
    if (b.value === 'reply') return { type: 'removeReplies' };
    if (b.value === 'repost') return { type: 'removeReposts' };
    warnings.push(`unsupported remove item "${b.value}" — skipped`);
    return null;
  }
  if (subject === 'embed') {
    const k = MEDIA_FOR_EMBED[String(b.value || '').toLowerCase()];
    if (k) return { type: 'media', has: [k], mode: 'none' };
    warnings.push(`unsupported embed "${b.value}" — skipped`);
    return null;
  }
  if (subject === 'list') return { type: 'list', uri: b.listUri || b.uri || '', mode: 'exclude' };
  warnings.push(`unsupported remove subject "${subject}" — skipped`);
  return null;
}

// fromSkyfeed(generatorRecord) → { def, warnings }
// `record` is the value of an app.bsky.feed.generator record carrying a
// `skyfeedBuilder`. Block order is preserved: SkyFeed applies blocks in
// sequence and so does the evaluator, so a reordering would change the feed.
export function fromSkyfeed(record) {
  const warnings = [];
  const builder = (record && record.skyfeedBuilder) || null;
  if (!builder || !Array.isArray(builder.blocks)) {
    return { def: null, warnings: ['this record has no skyfeedBuilder — nothing to import'] };
  }

  const inputs = [];
  const filters = [];
  let sort = { type: 'latest' };

  const imageCounts = builder.blocks.filter((b) => b.type === 'remove' && b.subject === 'image_count').map((b) => String(b.value));
  let imageCountEmitted = false;

  for (const b of builder.blocks) {
    if (b.type === 'input') {
      const i = convertInput(b, warnings);
      if (i) inputs.push(i);
    } else if (b.type === 'remove' && b.subject === 'image_count') {
      if (imageCountEmitted) continue;                      // collapse the bucket set into one filter
      imageCountEmitted = true;
      filters.push(resolveImageCount(imageCounts, warnings));
    } else if (b.type === 'remove') {
      const f = convertRemove(b, warnings);
      if (f) filters.push(f);
    } else if (b.type === 'regex') {
      if (!b.value) { warnings.push('empty regex block — skipped'); continue; }
      try { new RegExp(b.value, b.caseSensitive ? '' : 'i'); }
      catch { warnings.push(`invalid regex — skipped: ${String(b.value).slice(0, 60)}…`); continue; }
      filters.push({
        type: 'regex',
        mode: b.invert ? 'exclude' : 'include',
        pattern: b.value,
        target: b.target || 'text',
        caseSensitive: !!b.caseSensitive,
      });
    } else if (b.type === 'sort') {
      sort = { type: b.sortType === 'likes' || b.sortType === 'top' ? 'top' : 'latest' };
    } else {
      warnings.push(`unsupported block "${b.type}" — skipped`);
    }
  }

  return {
    def: {
      name: (builder.displayName || record.displayName || 'Imported feed').slice(0, 100),
      description: (record.description || '').slice(0, 2000),
      inputs,
      filters,
      sort,
      limit: 500,
    },
    warnings,
  };
}

// Accept an at:// generator URI or a bsky.app feed URL.
export function parseFeedRef(s) {
  const v = String(s || '').trim();
  let m = v.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/?#]+)/);
  if (m) return { repo: m[1], rkey: m[2] };
  m = v.match(/\/profile\/([^/]+)\/feed\/([^/?#]+)/);
  if (m) return { repo: decodeURIComponent(m[1]), rkey: m[2] };
  return null;
}
