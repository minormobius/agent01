// Shared Bluesky video post — extracted from the playground's proven flow.
// uploadVideoEmbed mints a service-auth token, uploads the blob to bsky's video
// service, polls until processed, and returns an app.bsky.embed.video. postFeedVideo
// wraps that in a feed post. Used by /clip.

import { resolvePds, parseAtUri } from './data.js';

// MediaRecorder mimes that reliably MUX AUDIO (so the voiceover survives). webm
// (vp9/vp8 + opus) is the dependable combo in Chrome; mp4 last for Safari.
export function pickClipMime() {
  const opts = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const m of opts) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

// Posting video to bsky needs the transition:generic scope (it authorizes
// getServiceAuth for the video service).
export function canPostVideo(user) { return (((user && user.scope) || '').includes('transition:generic')); }

export async function uploadVideoEmbed(auth, user, blob, aspect, altText, onStatus) {
  const pdsUrl = await resolvePds(user.did);
  if (!pdsUrl) throw new Error('could not resolve your PDS');
  const aud = 'did:web:' + new URL(pdsUrl).host;
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const sa = await auth.request(`/pds/server/getServiceAuth?aud=${encodeURIComponent(aud)}&lxm=com.atproto.repo.uploadBlob&exp=${exp}`);
  if (!sa.ok) throw new Error(`getServiceAuth ${sa.status}: ${(await sa.text().catch(() => '')).slice(0, 140)}`);
  const { token } = await sa.json();
  if (!token) throw new Error('no service token returned');

  onStatus && onStatus('uploading video…');
  const name = `fluoddity${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
  let up;
  try {
    up = await fetch(`https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(user.did)}&name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'video/webm' }, body: blob,
    });
  } catch (e) { throw new Error(`uploadVideo blocked (CORS/network): ${e.message}`); }
  if (!up.ok) throw new Error(`uploadVideo ${up.status}: ${(await up.text().catch(() => '')).slice(0, 160)}`);
  let st = await up.json(); st = st.jobStatus || st;
  let blobRef = st.blob, jobId = st.jobId;
  const deadline = Date.now() + 180000;
  while (!blobRef && jobId && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    let js;
    try { js = await fetch(`https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { throw new Error(`getJobStatus blocked: ${e.message}`); }
    if (!js.ok) throw new Error(`getJobStatus ${js.status}`);
    st = (await js.json()).jobStatus || {};
    if (st.state === 'JOB_STATE_FAILED') throw new Error(`processing failed: ${st.error || st.message || 'unknown'}`);
    if (st.blob) blobRef = st.blob;
    else onStatus && onStatus(`processing video… ${st.progress || 0}%`);
  }
  if (!blobRef) throw new Error('processing timed out');
  const embed = { $type: 'app.bsky.embed.video', video: blobRef, aspectRatio: aspect };
  if (altText) embed.alt = altText.slice(0, 1000);
  return embed;
}

export async function postFeedVideo(auth, user, { blob, aspect, text, facets, altText, onStatus }) {
  const embed = await uploadVideoEmbed(auth, user, blob, aspect, altText, onStatus);
  onStatus && onStatus('posting…');
  const res = await auth.pds.createRecord('app.bsky.feed.post', {
    $type: 'app.bsky.feed.post', text, facets: facets || [], embed, langs: ['en'], createdAt: new Date().toISOString(),
  });
  const { rkey } = parseAtUri(res.uri);
  return { uri: res.uri, url: `https://bsky.app/profile/${user.handle}/post/${rkey}` };
}
