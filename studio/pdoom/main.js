// main.js — Upping My P(doom): a music video danced by the figure rig.
//
// The song plays from YouTube; its clock drives everything. Each frame: where in the song
// (bar, beat), each dancer's pose from the compiled dance (dance.json, choreo.js), a cut to
// the bar's shot, the stage in 2D, and each dancer raymarched into its own small canvas,
// cropped to where it stands on screen, composited back to front.
//
//   ?t=64&still        one frame, no YouTube (stills, tests, the share card)
//   ?silent            the dance without the song (an internal clock)
//   ?offset=0.12       the song's offset against YouTube's clock, in seconds
//   ?shot=face         hold one kind of shot (face, bust, full, hand, wide) on Mino
//   ?look=pc98         the PC-98 look: 16 colours, 400 lines, dithered (pc98.js; the button too)

import { makeRig, solve } from '../vendor/figure/lib/rig.js';
import { buildBody } from '../vendor/figure/lib/body.js';
import { makeRenderer, camera, project, STYLE, handDetail } from '../vendor/figure/lib/shader.js';
import { playDance, liveDance } from '../vendor/figure/lib/choreo.js';
import { dot, add, scale, sub } from '../vendor/figure/lib/vec.js';
import { EXPRESSIONS } from '../vendor/figure/lib/face.js';
import { blinkAt, saccadeAt, easedExpression } from '../vendor/figure/lib/liveface.js';
import { SONG, SECTIONS, CAST, SHOTS } from './show.js';
import { drawBack, drawFront, PALETTES } from './stage.js';
import { makePC98 } from './pc98.js';
import { hairColors } from '../vendor/figure/lib/hair.js';

const qs = new URLSearchParams(location.search);
// ink darker than the stage's night: the rig's default ink (drawn on paper) is lighter than
// this backdrop, and an outline lighter than what is behind it reads as a glow
const INK = { ...STYLE, ink: '#12081a' };
const spb = 60 / SONG.bpm;
const END = SONG.bars * 4;

// ---- the cast, compiled ---------------------------------------------------------------
const compiled = await (await fetch('./dance.json')).json();
// the mouth: how open, and how round, through the song (voice.json: derived from the vocal
// band of the original, only where a line is sung; numbers, not audio)
const voice = await (await fetch('./voice.json')).json().catch(() => null);
const voiceAt = (t) => {
  if (!voice) return { open: 0, round: 0 };
  const i = t * voice.fps, j = Math.floor(i), u = i - j, at = (a, k) => (a[Math.max(0, Math.min(a.length - 1, k))] || 0);
  return { open: (at(voice.open, j) * (1 - u) + at(voice.open, j + 1) * u) / 99, round: (at(voice.round, j) * (1 - u) + at(voice.round, j + 1) * u) / 9 };
};
// the crew sing along on the choruses
const CHORUS = [[12, 20], [33, 43], [53, 60], [60, 76], [77, 84]];
const dancers = CAST.map((c, i) => {
  const rig = makeRig(c.spec);
  // alive: springs over the keyframes (overlap, overshoot, settle) and breath; each dancer its own seed
  const D = liveDance(playDance(rig, compiled.dancers[i]), { spb: 60 / SONG.bpm, seed: i, rig });
  const canvas = document.createElement('canvas');
  let R = null;
  try { R = makeRenderer(canvas, { supersample: 1 }); } catch {}
  return { ...c, rig, D, canvas, R, gaze: [0, 0], P: null };
});

// ---- the clock --------------------------------------------------------------------------
const stored = (() => { try { return Number(localStorage.getItem('pdoom-offset')) || 0; } catch { return 0; } })();
const clock = { mode: qs.has('still') ? 'still' : 'idle', offset: qs.has('offset') ? Number(qs.get('offset')) : stored, t: Number(qs.get('t') || 0), anchorT: 0, anchorPerf: 0, playing: false };
let player = null;
function songTime() {
  const now = performance.now();
  if (clock.mode === 'still' || clock.mode === 'idle') return clock.t;
  if (clock.mode === 'silent') return clock.playing ? clock.anchorT + (now - clock.anchorPerf) / 1000 : clock.anchorT;
  // YouTube: its currentTime is coarse, so run our own clock from an anchor and re-anchor on drift
  if (!player?.getCurrentTime) return 0;
  if (!clock.playing) return player.getCurrentTime() - clock.offset;
  return clock.anchorT + (now - clock.anchorPerf) / 1000 - clock.offset;
}
setInterval(() => {
  if (clock.mode !== 'yt' || !clock.playing || !player?.getCurrentTime) return;
  const cur = player.getCurrentTime(), predicted = clock.anchorT + (performance.now() - clock.anchorPerf) / 1000;
  if (Math.abs(cur - predicted) > 0.12) { clock.anchorT = cur; clock.anchorPerf = performance.now(); }
}, 400);

function loadYouTube() {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube did not load'));
    document.head.append(s);
    setTimeout(() => reject(new Error('YouTube did not answer')), 12000);
  });
}
async function playWithSong() {
  document.body.classList.add('playing');
  note('loading the song from YouTube…');
  try {
    const YT = await loadYouTube();
    clock.mode = 'yt';
    player = new YT.Player('yt', {
      videoId: SONG.youtube, width: 356, height: 200,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
      events: {
        onReady: (e) => { e.target.playVideo(); const d = e.target.getDuration?.(); if (d && Math.abs(d - SONG.duration) > 0.6) note(`this upload runs ${d.toFixed(1)} s (the original ${SONG.duration} s): nudge the sync if the dance drifts`); else note(''); },
        onStateChange: (e) => {
          clock.playing = e.data === 1;
          if (clock.playing) { clock.anchorT = player.getCurrentTime(); clock.anchorPerf = performance.now(); }
        },
      },
    });
  } catch (err) {
    note(`${err.message}. Watching without sound.`);
    playSilent();
  }
}
function playSilent() {
  document.body.classList.add('playing', 'silent');
  clock.mode = 'silent'; clock.playing = true; clock.anchorT = clock.t || 0; clock.anchorPerf = performance.now();
}

// ---- where in the song --------------------------------------------------------------------
function sectionAt(bar) {
  let i = 0;
  while (i + 1 < SECTIONS.length && SECTIONS[i + 1][0] <= bar) i++;
  const [b0, name, palette, doom] = SECTIONS[i];
  const next = SECTIONS[i + 1];
  const doomNow = next ? doom + (next[3] - doom) * Math.min(1, (bar - b0) / (next[0] - b0)) : doom;
  return { name, palette, doom: doomNow, bar0: b0 };
}
const CHORUS_HITS = [12, 33, 53, 60, 77];

// ---- the camera ------------------------------------------------------------------------
let camState = null, lastShot = -1;
function shotCam(beat, W, H) {
  let i = 0;
  while (i + 1 < SHOTS.length && SHOTS[i + 1].bar * 4 <= beat) i++;
  const force = qs.get('shot');                       // ?shot=face|bust|full|hand|wide: hold one kind of shot (for looking)
  const s = force ? { ...SHOTS[i], kind: force, on: force === 'wide' ? 'all' : 0 } : SHOTS[i], next = SHOTS[i + 1];
  const len = next ? (next.bar - s.bar) * 4 : 8, u = Math.max(0, Math.min(1, (beat - s.bar * 4) / len));
  const aspect = W / H, d = dancers[s.on === 'all' ? 0 : s.on], P = d.P, h = d.rig.m.H;
  let target, height;
  if (s.kind === 'wide') { target = [0, 4.2, -0.6]; height = Math.max(12.5, 25 / aspect); }
  else if (s.kind === 'full') { target = [P.J.pelvis[0], h * 0.52, P.J.pelvis[2]]; height = Math.max(h * 1.25, 3.4 / aspect); }
  else if (s.kind === 'bust') { target = add(P.J.headPivot, [0, -0.45, 0]); height = Math.max(3.4, 2.7 / aspect); }
  else if (s.kind === 'face') { target = add(P.J.headPivot, scale(P.F.head.y, 0.3)); height = Math.max(1.9, 1.7 / aspect); }
  // the hand: the forearm and the hand, so a gesture reads by its arm (a point at the lens foreshortens to nothing)
  else { const f = add(P.J.wrist_r, scale(P.F.hand_r.z, d.rig.m.hand)); target = [0, 1, 2].map((k) => P.J.elbow_r[k] * 0.35 + f[k] * 0.65); height = Math.max(3.2, 2.8 / aspect); }
  const cut = i !== lastShot; lastShot = i;
  if (cut || !camState) camState = { target };
  else camState.target = camState.target.map((x, k) => x + (target[k] - x) * 0.18);
  return camera({ target: camState.target, yaw: s.yaw + s.drift * u, pitch: s.pitch, height, aspect });
}

// ---- drawing ---------------------------------------------------------------------------
const cv = document.getElementById('stage'), ctx = cv.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
let quality = 1, frameMs = 16, lastFrame = 0;
function size() { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
size(); addEventListener('resize', size);
// the PC-98 look: a post-pass over the finished frame, onto a canvas laid over the stage
let post = null;
const look = { pc98: qs.get('look') === 'pc98' };
function setLook(on) {
  // pinned: the ink, the skin in light and shade, and each dancer's hair; the other 8 follow the stage
  const fixed = [INK.ink, INK.skin, INK.skinShade, ...new Set(CAST.map((c) => hairColors(c.spec.hair).base))];
  if (on && !post) { try { post = makePC98(document.getElementById('post'), { fixed }); } catch { post = null; } }
  look.pc98 = on && !!post;
  document.body.classList.toggle('pc98', look.pc98);
}

function poseAt(d, beat) {
  const b = Math.max(0, Math.min(END - 0.01, beat));
  const { pose } = d.D.at(b);
  // the hair swings with the body: its acceleration, from the pelvis a quarter beat either side
  const dt = 0.25, a = d.D.raw(Math.max(0, b - dt)).pose.root.pos, c = d.D.raw(Math.min(END - 0.01, b + dt)).pose.root.pos;
  const T = dt * spb, acc = [0, 1, 2].map((k) => (a[k] - 2 * pose.root.pos[k] + c[k]) / (T * T));
  // the face alive: its expression eased from the dance's, a blink, the eyes' darts, the mouth singing
  const t = b * spb, idx = dancers.indexOf(d);
  const ex = easedExpression((tt) => d.D.raw(Math.max(0, tt / spb)).pose.expression, t);
  const e = { ...(typeof ex === 'string' ? EXPRESSIONS[ex] : ex), blink: blinkAt(t, idx) };
  const bar = b / 4, sings = d.lead ? 1 : CHORUS.some(([a, z]) => bar >= a && bar < z) ? 0.55 : 0;
  if (sings) {
    const v = voiceAt(t);
    e.mouthOpen = Math.max((e.mouthOpen || 0) * 0.35, v.open * sings);
    e.mouthRound = v.round * 0.8 * Math.min(1, v.open * 3);
    e.smile = (e.smile ?? 0.2) * (1 - 0.5 * v.open * sings);
  }
  const sac = saccadeAt(t, idx);
  const gaze = [Math.max(-1, Math.min(1, d.gaze[0] + sac[0])), Math.max(-1, Math.min(1, d.gaze[1] + sac[1]))];
  return { ...pose, expression: e, gaze, hairAccel: acc.map((x) => Math.max(-40, Math.min(40, x))) };
}

function frame() {
  const t0 = performance.now();
  const W = cv.width, H = cv.height;
  const t = songTime(), beat = (t - SONG.t0) / spb, bar = Math.floor(beat / 4);
  for (const d of dancers) d.P = solve(d.rig, poseAt(d, beat));
  const sec = sectionAt(Math.max(0, bar));
  const cam = shotCam(Math.max(0, beat), W, H);
  const pulse = beat >= 0 ? Math.exp(-(((beat % 1) + 1) % 1) * 5) : 0;
  const hit = CHORUS_HITS.filter((b) => beat >= b * 4).pop();
  const S = { palette: sec.palette, doom: sec.doom, beat: Math.max(0, beat), pulse, spots: dancers.map((d) => [d.P.J.pelvis[0], d.P.J.pelvis[2]]), confetti: hit === undefined ? -1 : (beat - hit * 4) * spb };
  drawBack(ctx, cam, W, H, S);
  // the LED wall lights them from behind: a rim of the section's colour, kicked by the beat
  const rim = { color: (PALETTES[sec.palette] || PALETTES.night).edge, k: 0.65 + 0.3 * pulse };
  // the dancers, far to near, each raymarched in its own crop of the screen
  const order = dancers.map((d) => ({ d, z: dot(sub(d.P.J.pelvis, cam.c), cam.f) })).sort((a, b) => b.z - a.z);
  const pxPerHead = H / (2 * cam.halfH);
  for (const { d } of order) {
    if (!d.R) continue;
    const pts = Object.values(d.P.J).map((p) => project(cam, p, W, H));
    const pad = 1.4 * pxPerHead;
    let x0 = Math.min(...pts.map((p) => p[0])) - pad, x1 = Math.max(...pts.map((p) => p[0])) + pad;
    let y0 = Math.min(...pts.map((p) => p[1])) - pad, y1 = Math.max(...pts.map((p) => p[1])) + pad;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    // the canvas keeps its size while it can (resizing a WebGL canvas reallocates its buffers,
    // and doing it every frame as a dancer moved cost seconds a frame): sizes snap to a 64 px
    // grid and only change when the figure outgrows its canvas or shrinks well inside it
    const q = d.lead ? quality : quality * 0.8;
    const needW = (x1 - x0) * q, needH = (y1 - y0) * q;
    if (!d.cw || needW > d.cw || needH > d.ch || needW < d.cw * 0.6 || needH < d.ch * 0.6) {
      d.cw = Math.ceil(needW / 64) * 64; d.ch = Math.ceil(needH / 64) * 64;
      d.canvas.width = d.cw; d.canvas.height = d.ch;
    }
    const bw = d.cw / q, bh = d.ch / q;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - bw / 2; y0 = cy - bh / 2;
    const target = add(add(cam.c, scale(cam.r, ((cx / W) * 2 - 1) * cam.halfW)), scale(cam.u, (1 - (cy / H) * 2) * cam.halfH));
    const crop = { ...cam, c: target, halfH: (bh / H) * cam.halfH, halfW: (bw / W) * cam.halfW };
    // the eyes find the camera (used next frame)
    const toCam = cam.f.map((x) => -x);
    d.gaze = [dot(toCam, d.P.F.head.x), dot(toCam, d.P.F.head.y)].map((v) => Math.max(-1, Math.min(1, v * 2.2)));
    // lines thin with the figure: an outline drawn for a close-up is as thick as a finger in a wide shot
    const ls = Math.max(0.55, Math.min(1, (pxPerHead * q) / 70));
    d.R.draw(buildBody(d.P, { hands: handDetail(d.P, crop, d.canvas.height) }), d.P, crop, { ...INK, lines: { out: 2.6 * ls, in: 1.5 * ls, crease: 1.2 * ls, vary: 0.5 }, rim });
    ctx.drawImage(d.canvas, x0, y0, bw, bh);
  }
  drawFront(ctx, cam, W, H, S);
  if (look.pc98) post.draw(cv);
  hud(t, beat, sec);
  // hold the frame rate: the dancers' resolution follows the time BETWEEN frames (the GPU's
  // raymarching runs after this function returns, so timing the function alone sees none of it)
  if (lastFrame && clock.mode !== 'still') {
    frameMs = frameMs * 0.9 + (t0 - lastFrame) * 0.1;
    if (frameMs > 34) quality = Math.max(0.4, quality - 0.02); else if (frameMs < 20) quality = Math.min(1, quality + 0.01);
  }
  lastFrame = t0;
}

// ---- the page ---------------------------------------------------------------------------
const hudEl = document.getElementById('hud');
function hud(t, beat, sec) {
  if (!document.body.classList.contains('playing')) return;
  const b = Math.max(0, Math.min(END - 1, beat));
  hudEl.textContent = `${sec.name} · bar ${Math.floor(b / 4)} · P(DOOM) ${sec.doom.toFixed(0)}%`;
}
const noteEl = document.getElementById('note');
function note(s) { noteEl.textContent = s; noteEl.hidden = !s; }
function setOffset(v) {
  clock.offset = Math.round(v * 100) / 100;
  try { localStorage.setItem('pdoom-offset', String(clock.offset)); } catch {}
  document.getElementById('offset').textContent = `${clock.offset >= 0 ? '+' : ''}${clock.offset.toFixed(2)} s`;
}
document.getElementById('play').addEventListener('click', playWithSong);
document.getElementById('silent').addEventListener('click', playSilent);
document.getElementById('earlier').addEventListener('click', () => setOffset(clock.offset - 0.05));
document.getElementById('later').addEventListener('click', () => setOffset(clock.offset + 0.05));
setOffset(clock.offset);

// the benchmark: the frame-by-frame checks, per dancer (report.json, written by the build)
fetch('./report.json').then((r) => r.json()).then((rep) => {
  const all = rep.dancers.flatMap((d) => d.checks), ok = all.filter((c) => c.ok).length;
  document.getElementById('score').textContent = `${ok}/${all.length} checks hold, every frame of the song`;
  const list = document.getElementById('report-list');
  for (const d of rep.dancers) {
    const li = document.createElement('li');
    const bad = d.checks.filter((c) => !c.ok);
    li.innerHTML = `<b>${d.name}</b> ${d.checks.length - bad.length}/${d.checks.length} over ${d.frames} frames` + bad.map((c) => `<div class="bad">✗ ${c.name.replace('dance: ', '')}: ${c.value} (${c.limit}) · ${c.detail}</div>`).join('');
    list.append(li);
  }
}).catch(() => {});
setLook(look.pc98);
document.getElementById('look').addEventListener('click', () => { setLook(!look.pc98); if (clock.mode === 'still') frame(); });
document.getElementById('bench').addEventListener('click', () => document.getElementById('report').toggleAttribute('hidden'));

if (qs.has('silent')) playSilent();
function loop() { frame(); if (clock.mode !== 'still') requestAnimationFrame(loop); }
loop();
window.__pdoom = { ready: true, clock, dancers, frame, setLook, get post() { return post; }, get quality() { return quality; } };
