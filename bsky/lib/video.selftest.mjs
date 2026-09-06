/**
 * Known-answer tests for the video path.
 *
 * The bug these exist for: Bluesky serves HLS, only Safari plays it from a
 * bare `<video src>`, and the old markup set that src unconditionally. On
 * every other browser the poster and the play button appeared and pressing
 * play did NOTHING — no error, no console message, no fallback. A control
 * that visibly exists and silently refuses is the worst kind of broken,
 * because from the outside it is indistinguishable from a dead video.
 *
 *   node bsky/lib/video.selftest.mjs
 */

import { renderEmbed } from './blobs.js';
import { nativeHls } from './video.js';

let failed = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed++;
};

const DID = 'did:plc:abc123';
const CID = 'bafkreiexamplevideo000000000000000000000000000000000000000';

console.log('lib/video.selftest\n');

// In node there is no `document`, which is the same branch a non-Safari
// browser takes. That is what makes the fallback markup testable at all.
console.log('capability detection');
ok('nativeHls() is false with no document, and does not throw', nativeHls() === false);
ok('it is stable across calls', nativeHls() === false);

console.log('\nthe raw (Jetstream) shape — blob ref, no URLs');
{
  const html = renderEmbed({
    embed: { $type: 'app.bsky.embed.video',
      video: { $type: 'blob', ref: { $link: CID }, mimeType: 'video/mp4' },
      aspectRatio: { width: 16, height: 9 } },
  }, DID, null);

  ok('renders a video cell', html.includes('class="media video"'));
  ok('reserves the aspect ratio', html.includes('aspect-ratio:16 / 9'));
  ok('the DID is percent-encoded for the video host', html.includes('did%3Aplc%3Aabc123'));
  ok('carries a poster', html.includes('thumbnail.jpg'));

  // The heart of it.
  ok('does NOT set a src the browser cannot play', !/<video[^>]*\ssrc=/.test(html));
  ok('parks the playlist on data-hls instead', html.includes('data-hls="https://video.bsky.app/watch/'));
  ok('offers a play control', html.includes('data-vplay'));
  ok('keeps the open-elsewhere fallback', html.includes('class="vfallback"'));
}

console.log('\nthe hydrated (#view) shape — complete URLs');
{
  const html = renderEmbed(null, DID, {
    $type: 'app.bsky.embed.video#view',
    playlist: 'https://video.bsky.app/watch/did%3Aplc%3Aabc123/xyz/playlist.m3u8',
    thumbnail: 'https://video.bsky.app/watch/did%3Aplc%3Aabc123/xyz/thumbnail.jpg',
    aspectRatio: { width: 4, height: 3 },
  });
  ok('renders from the view', html.includes('class="media video"'));
  ok('uses the view playlist', html.includes('data-hls="https://video.bsky.app/watch/did%3Aplc%3Aabc123/xyz/playlist.m3u8"'));
  ok('uses the view thumbnail as the poster', html.includes('poster="https://video.bsky.app/watch/did%3Aplc%3Aabc123/xyz/thumbnail.jpg"'));
}

console.log('\ndegenerate input');
{
  ok('a video embed with no blob renders nothing',
    renderEmbed({ embed: { $type: 'app.bsky.embed.video' } }, DID, null) === '');
  ok('a video embed with no DID renders nothing',
    renderEmbed({ embed: { $type: 'app.bsky.embed.video', video: { ref: { $link: CID } } } }, null, null) === '');
}

console.log('\nescaping — a playlist URL ends up inside an attribute');
{
  const html = renderEmbed(null, DID, {
    $type: 'app.bsky.embed.video#view',
    playlist: 'https://video.bsky.app/x"><img src=x onerror=alert(1)>',
    thumbnail: '',
  });
  ok('a non-https playlist is refused outright', renderEmbed(null, DID, {
    $type: 'app.bsky.embed.video#view', playlist: 'javascript:alert(1)', thumbnail: '',
  }) === '');
  // What matters is that no TAG is created. The literal text `onerror=` does
  // survive, escaped, inside the attribute value — that is inert, and asserting
  // on the substring rather than on the structure is how a test starts failing
  // for the wrong reason.
  ok('the quote is escaped, so the attribute is not broken out of', !html.includes('"><img'));
  ok('no <img> tag is created', !/<img/i.test(html));
  ok('only the elements we wrote are present',
    (html.match(/<[a-z]/gi) || []).length === 4);   // div, video, button, a
}

console.log(failed ? `\nvideo selftest FAILED (${failed})` : '\nvideo selftest passed');
process.exit(failed ? 1 : 0);
