// extras.js — the two things under a piece's Begin button: the score, and the video.
//
//   View the score  -> clef.mino.mobi, opened on this piece's score.ly
//   Export video    -> an MP4 rendered offline (lib/export.js), then the share sheet
//
// A piece passes what it knows; this file owns the panel and its states.

import { FORMATS, plan, inspect, renderAudio, renderOffline, renderRealtime, drawCredits, shareOrSave } from './export.js';

const CLEF = 'https://clef.mino.mobi/';

export function mountExtras({ slug, title, subtitle, events, seconds, makeRenderer, ink = '#2a2426', onInk = '#f4eee2', piano }) {
  const card = document.getElementById('card');
  const row = document.createElement('p');
  row.className = 'extras';
  const scoreUrl = new URL(`../${slug}/score.ly`, import.meta.url).href;
  row.innerHTML = `<a class="x-score" href="${CLEF}#src=${scoreUrl}">View the score</a><span aria-hidden="true"> · </span><button type="button" class="x-export">Export video</button>`;
  card.querySelector('#go').after(row);

  const panel = document.createElement('div');
  panel.id = 'export';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Export video');
  panel.innerHTML = `
    <h2>Export video</h2>
    <p class="x-note">Rendered on this device, frame by frame, with the piano — not a screen recording.</p>
    <div class="x-formats">${Object.entries(FORMATS).map(([k, f], i) => `<button type="button" data-f="${k}"${i === 0 ? ' class="on"' : ''}>${f.label}</button>`).join('')}</div>
    <div class="x-bar" hidden><div></div></div>
    <p class="x-status" aria-live="polite"></p>
    <div class="x-actions">
      <button type="button" class="x-go">Render</button>
      <button type="button" class="x-share" hidden>Save to Photos / Share</button>
      <button type="button" class="x-cancel">Close</button>
    </div>`;
  panel.style.setProperty('--bgc', onInk);
  panel.style.setProperty('--panel', onInk === '#f4eee2' ? 'rgba(244,238,226,0.96)' : 'rgba(14,18,36,0.94)');
  document.body.appendChild(panel);

  const $ = (s) => panel.querySelector(s);
  let fmt = 'vertical', abort = null, blob = null, photos = true;
  const status = (s) => { $('.x-status').textContent = s; };
  const bar = (f) => { $('.x-bar').hidden = f === null; $('.x-bar div').style.width = `${Math.round((f ?? 0) * 100)}%`; };

  panel.querySelectorAll('.x-formats button').forEach((b) => b.addEventListener('click', () => {
    if (abort) return;
    fmt = b.dataset.f;
    panel.querySelectorAll('.x-formats button').forEach((x) => x.classList.toggle('on', x === b));
    blob = null; $('.x-share').hidden = true; $('.x-go').hidden = false; status('');
  }));

  row.querySelector('.x-export').addEventListener('click', () => {
    piano?.stop?.();
    card.style.visibility = 'hidden';
    panel.hidden = false;
    status('');
    $('.x-go').focus();
  });
  $('.x-cancel').addEventListener('click', () => {
    if (abort) { abort.abort(); return; }
    panel.hidden = true;
    card.style.visibility = '';
  });

  $('.x-go').addEventListener('click', async () => {
    const { w, h } = FORMATS[fmt];
    // Made and resumed NOW, inside the tap, before any await: Safari leaves a
    // context created later suspended, and a real-time recording of it is silent.
    let ac = null;
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ambient */ }
      const AC = window.AudioContext || window.webkitAudioContext;
      try { ac = new AC({ sampleRate: 48000 }); } catch { ac = new AC(); }
      ac.resume();
    } catch { ac = null; }
    abort = new AbortController();
    const signal = abort.signal;
    $('.x-go').hidden = true; $('.x-share').hidden = true;
    $('.x-cancel').textContent = 'Cancel';
    try {
      status('Rendering the piano…'); bar(0);
      const audio = await renderAudio(events, seconds, { onProgress: (f) => bar(f * 0.15), signal });
      // Draw at half the pixel size and twice the density: the layout is the
      // page's own at a phone-like size, so strokes keep their proportions.
      const r = makeRenderer(w / 2, h / 2, 2);
      const draw = (ctx, t) => {
        r.draw(ctx, t);
        drawCredits(ctx, w, h, t, seconds, { title, subtitle, ink });
      };
      // ?export=realtime forces the recording route (for testing it on a machine
      // that would otherwise render offline).
      const force = new URLSearchParams(location.search).get('export');
      const how = force === 'realtime'
        ? { mode: 'realtime', mime: ['video/mp4', 'video/webm'].find((m) => window.MediaRecorder?.isTypeSupported(m)) }
        : await plan(w, h);
      if (!how) throw new Error('this browser can neither encode nor record video');
      let t0 = performance.now();
      if (how.mode === 'offline') {
        status('Painting and encoding, frame by frame…');
        blob = await renderOffline({ w, h, seconds, draw, audio, support: how, signal, onProgress: (f) => {
          bar(0.15 + f * 0.85);
          const el = (performance.now() - t0) / 1000;
          if (f > 0.03) status(`Painting and encoding · ${Math.round(f * 100)}% · about ${Math.ceil((el / f) * (1 - f))} s left`);
        } });
      } else {
        status(`This browser records in real time: keep this tab open and in front for ${Math.round(seconds)} s.`);
        t0 = performance.now();
        if (!ac) throw new Error('this browser gives the page no audio to record');
        blob = await renderRealtime({ w, h, seconds, draw, audio, mime: how.mime, ac, signal, onProgress: (f) => bar(0.15 + f * 0.85) });
      }
      status('Checking the file…');
      const got = await inspect(blob);
      photos = got.photos;
      if (got.silent) {
        blob = null;
        throw new Error(`the finished file has no sound in it (${got.video} video, ${got.audio} audio${got.level !== null ? `, ${got.level.toFixed(0)} dB` : ''}) — please tell whoever runs this site which browser you used`);
      }
      bar(null);
      const mb = (blob.size / 1e6).toFixed(1);
      status(`Done: ${mb} MB, ${Math.round(seconds)} s, with sound. ` + (photos ? 'Save it to your photos, or share it anywhere.' : 'This browser has no H.264 video encoder, so the picture uses an open codec: the file plays in any web browser and uploads fine, but Apple’s Photos and QuickTime may not play it. Safari, or Chrome or Firefox on a Mac or a phone, makes a camera-roll file.'));
      $('.x-share').hidden = false;
      $('.x-share').focus();
    } catch (err) {
      bar(null);
      status(err?.name === 'AbortError' ? 'Cancelled.' : `Could not export: ${err?.message || err}`);
      $('.x-go').hidden = false;
    } finally {
      try { ac?.close(); } catch { /* closed */ }
      abort = null;
      $('.x-cancel').textContent = 'Close';
    }
  });

  $('.x-share').addEventListener('click', async () => {
    if (!blob) return;
    const how = await shareOrSave(blob, title.toLowerCase());
    if (how === 'downloaded') status('Downloaded. On a phone, open it from Files and choose Save Video to put it in Photos.');
  });
}

/** Styles for the extras row and the panel; the piece's own CSS variables colour them. */
export const EXTRAS_CSS = `
  .extras { margin: 14px 0 0; font: 500 11px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
  .extras a, .extras button { color: var(--ink); background: none; border: 0; padding: 4px 2px; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--accent); }
  .extras a:hover, .extras button:hover { color: var(--accent); }
  .extras span { color: var(--dim); }
  #export { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 5;
    width: min(92vw, 460px); padding: 22px 22px 18px; background: var(--panel, var(--veil)); color: var(--ink);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(128,128,128,.25); border-radius: 3px; }
  #export h2 { margin: 0 0 4px; font: italic 400 30px/1.1 var(--serif); }
  #export .x-note { margin: 0 0 14px; color: var(--dim); font-size: 16px; line-height: 1.35; }
  #export .x-formats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  #export button { font: 500 11px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; padding: 10px 12px; border-radius: 2px; cursor: pointer;
    border: 1px solid rgba(128,128,128,.4); background: transparent; color: var(--ink); }
  #export .x-formats button.on { border-color: var(--accent); color: var(--accent); }
  #export .x-go, #export .x-share { background: var(--ink); color: var(--bgc, #f4eee2); border-color: var(--ink); }
  #export .x-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  #export .x-bar { height: 3px; background: rgba(128,128,128,.25); border-radius: 2px; overflow: hidden; }
  #export .x-bar div { height: 100%; width: 0; background: var(--accent); transition: width .2s; }
  #export .x-status { min-height: 1.4em; margin: 10px 0 0; font: 500 11px/1.5 var(--mono); color: var(--dim); }
`;
