// zest/game.js — the falling-solids game.
//
// Everything meaningful happens elsewhere: embed-geometry.js turns a post into
// a solid, rounds.js decides what counts as a hit and whether you beat chance.
// This file is physics, pixels and pointer events.
//
// One rule shapes the whole renderer: the solid on screen must be EXACTLY the
// one the maths described. No stylised bevels, no "make it look more organic",
// no per-post random seeds in the material. If a shape looks boring, that is
// information about the post, and hiding it would make the page a lie.

import * as THREE from 'three';
import {
  DEFAULTS, harmonicMesh, readEmbedding, makeProjector, icosphere, framingDistance,
} from './embed-geometry.js';
import { buildRound, scoreRound, comboMultiplier, verdict, cos } from './rounds.js';
import { loadPosts, embedTexts, loadBasis, MODES, BASIS_MODES, SOURCES } from './feed.js';

const GRAVITY = -9.2;
const SPAWN_EVERY = 0.85;      // seconds between launches
const DETAIL_FALLING = 3;      // 642 verts — plenty at the size these render
const DETAIL_ANCHOR = 4;
// Falling solids are drawn at half their nominal size so several fit on screen
// and a swipe is a choice rather than an inevitability. It is a UNIFORM scale,
// so the relative sizes — which carry how strange each post is — are untouched.
const FALL_SCALE = 0.5;
// …but "half" is only right for a landscape window. A portrait phone is narrow
// in WORLD units too (worldW = worldH x aspect), so the biggest solids cover
// ~44% of the screen width there against ~16% on a desktop.
//
// The taper is deliberately PARTIAL (0.6 + 0.4 x ratio, not the ratio itself).
// Scaling straight down by the width ratio also shrinks the typical solid, which
// was never the problem — only the rare oversized outliers were — and it left
// everything too small to hit with a thumb. This lands a typical solid near 15%
// of the width on a phone and its largest near 35%.
const REFERENCE_WORLD_W = 13;

export class Zest {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#stage');
    this.blade = root.querySelector('#blade');
    this.bladeCtx = this.blade.getContext('2d');
    this.hud = {
      score: root.querySelector('#score'),
      combo: root.querySelector('#combo'),
      mistakes: root.querySelector('#lives'),
      progress: root.querySelector('#progress'),
      status: root.querySelector('#status'),
      readout: root.querySelector('#readout'),
      banner: root.querySelector('#banner'),
      cards: root.querySelector('#cards'),
      anchorText: root.querySelector('#anchor-text'),
    };

    this.mode = 'free';          // 'free' | 'hunt'
    this.score = 0;
    this.streak = 0;
    this.mistakes = 0;
    this.plays = [];
    this.actors = [];
    this.debris = [];
    this.trail = [];
    this.spawnClock = 0;
    this.queue = [];
    this.running = false;
    this.round = null;
    this.roundIndex = 0;

    this.initThree();
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
  }

  // ───────────────────────────────────────────────────────────── scene

  initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x08090d, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x08090d, 16, 34);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    this.camera.position.set(0, 0, 14);

    // Lighting is deliberately hard and directional. Soft ambient light is
    // flattering and would smooth away exactly the high-band ripple the quiet
    // dimensions produce — the grain has to survive to the screen or the whole
    // second half of the map is decoration.
    this.scene.add(new THREE.AmbientLight(0x2a3348, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(4, 7, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ea8ff, 1.5);
    rim.position.set(-6, -2, -5);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0xffcf8a, 60, 40);
    warm.position.set(-5, 4, 6);
    this.scene.add(warm);

    // the anchor is rendered in its own little scene, into a scissored corner
    this.anchorScene = new THREE.Scene();
    this.anchorCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    // framed on the largest possible solid, so the anchor never clips and its
    // size still reads against the ones falling past it
    this.anchorCamera.position.set(0, 0, framingDistance(38));
    this.anchorScene.add(new THREE.AmbientLight(0x39435e, 1.1));
    const aKey = new THREE.DirectionalLight(0xffffff, 2.4);
    aKey.position.set(3, 5, 6);
    this.anchorScene.add(aKey);
    const aRim = new THREE.DirectionalLight(0x8ab4ff, 1.4);
    aRim.position.set(-4, -3, -3);
    this.anchorScene.add(aRim);

    this.resize();
  }

  resize() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.blade.width = w * (window.devicePixelRatio || 1);
    this.blade.height = h * (window.devicePixelRatio || 1);
    this.blade.style.width = w + 'px';
    this.blade.style.height = h + 'px';
    this.bladeCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.bladeCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    // World half-width at z = 0, so launches always land on screen.
    const vFov = (this.camera.fov * Math.PI) / 180;
    this.worldH = 2 * Math.tan(vFov / 2) * this.camera.position.z;
    this.worldW = this.worldH * this.camera.aspect;
    this.fallScale = FALL_SCALE * Math.min(1, 0.6 + 0.4 * (this.worldW / REFERENCE_WORLD_W));
  }

  // ───────────────────────────────────────────────────────────── data

  async boot(sourceKey = 'simcluster') {
    this.setStatus('reaching for the feed…');
    let loaded;
    try {
      loaded = await loadPosts({ src: sourceKey, limit: 70 });
    } catch (err) {
      this.setStatus('could not reach the feed — ' + err.message, true);
      return false;
    }
    if (!loaded.posts.length) {
      this.setStatus('the feed returned no text-only posts to work with', true);
      return false;
    }

    this.setStatus(`embedding ${loaded.posts.length} posts…`);
    const { vectors, mode, note } = await embedTexts(loaded.posts.map((p) => p.text));
    this.embedMode = mode;
    this.embedNote = note;

    this.setStatus('fetching the corpus basis…');
    const basisInfo = await loadBasis(vectors);
    this.basis = basisInfo.basis;
    this.basisInfo = basisInfo;
    this.proj = makeProjector(this.basis);

    this.pool = loaded.posts.map((p, i) => {
      const read = readEmbedding(vectors[i], this.basis, this.proj);
      return { id: p.uri, post: p, vec: vectors[i], read, unit: read.unit };
    });

    this.sourceLabel = loaded.label;
    this.cursor = loaded.cursor;
    this.reportProvenance();
    return true;
  }

  /** Say, on the page, exactly what the shapes were computed from. */
  reportProvenance() {
    const bits = [];
    bits.push(this.embedMode === MODES.SEMANTIC
      ? '<b>bge-base-en-v1.5</b> embeddings'
      : '<b class="warn">lexical fallback</b> — these shapes read spelling, not meaning');
    bits.push(this.basisInfo.mode === BASIS_MODES.CORPUS
      ? `basis fitted on <b>${this.basisInfo.n}</b> posts (shared)`
      : `<b class="warn">session basis</b> (${this.basisInfo.n} posts) — not comparable with another screen`);
    bits.push(`${this.pool.length} posts from <b>${this.sourceLabel}</b>`);
    const notes = [this.embedNote, this.basisInfo.note].filter(Boolean);
    this.hud.status.innerHTML = bits.join(' · ') + (notes.length ? `<div class="note">${notes.join(' — ')}</div>` : '');
  }

  setStatus(text, isError) {
    this.hud.status.innerHTML = isError ? `<b class="warn">${text}</b>` : text;
  }

  // ───────────────────────────────────────────────────────── geometry

  meshFor(read, detail, scale = 1) {
    const g = harmonicMesh(read.unit, {
      detail,
      L: this.proj.L,
      amp: read.amp,
      radius: read.radius * scale,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    geo.computeBoundingSphere();
    return { geo, raw: g };
  }

  materialFor(read, opts = {}) {
    const c = new THREE.Color(read.color.rgb[0], read.color.rgb[1], read.color.rgb[2]);
    return new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.34,
      metalness: 0.16,
      emissive: c.clone().multiplyScalar(0.22),
      flatShading: false,
      side: opts.side || THREE.FrontSide,
    });
  }

  // ───────────────────────────────────────────────────────────── play

  startFree() {
    this.mode = 'free';
    this.round = null;
    this.mistakes = 0;
    this.queue = shuffled(this.pool).slice();
    this.begin();
    this.banner('Grove', 'Slice anything. Every cut shows you the post that made the shape. Nothing is scored — this is the reading room.');
  }

  startHunt() {
    this.mode = 'hunt';
    this.score = 0;
    this.streak = 0;
    this.mistakes = 0;
    this.roundIndex = 0;
    this.nextRound();
    this.begin();
  }

  nextRound() {
    this.plays = [];
    this.roundIndex++;
    this.round = buildRound(this.pool, { ripeFraction: 0.32, size: 18, candidates: 12 });
    this.queue = this.round.items.slice();
    this.setAnchor(this.round.anchor);
    this.banner(
      `Round ${this.roundIndex}`,
      `Slice the posts that <b>mean the same kind of thing</b> as the shape in the corner. About ${Math.round(this.round.baseRate * 100)}% of the ${this.round.total} posts that fall are ripe. Slicing a stranger costs points — never the round, because stopping early on mistakes would bias the test at the end.`
    );
  }

  setAnchor(item) {
    if (this.anchorMesh) {
      this.anchorScene.remove(this.anchorMesh);
      this.anchorMesh.geometry.dispose();
      this.anchorMesh.material.dispose();
    }
    const { geo } = this.meshFor(item.read, DETAIL_ANCHOR);
    this.anchorMesh = new THREE.Mesh(geo, this.materialFor(item.read));
    this.anchorScene.add(this.anchorMesh);
    this.anchorRead = item.read;
    this.hud.anchorText.textContent = this.mode === 'hunt' ? '(hidden until the round ends)' : item.post.text;
  }

  begin() {
    for (const a of this.actors) this.retire(a);
    this.actors = [];
    this.spawnClock = 0;
    this.running = true;
    this.updateHud();
    if (!this._raf) {
      this.last = performance.now();
      this._raf = requestAnimationFrame(this.tick.bind(this));
    }
  }

  spawn() {
    if (!this.queue.length) {
      if (this.mode === 'free') this.queue = shuffled(this.pool).slice();
      else return;
    }
    const entry = this.queue.shift();
    const item = entry.item || entry;
    const ripe = entry.ripe ?? null;

    const { geo, raw } = this.meshFor(item.read, DETAIL_FALLING, this.fallScale);
    const mesh = new THREE.Mesh(geo, this.materialFor(item.read));
    const halfW = this.worldW / 2;
    const x = (Math.random() * 1.5 - 0.75) * halfW;

    // Launch so the apex lands comfortably inside the frame: v = sqrt(2·g·h).
    const apex = this.worldH * (0.16 + Math.random() * 0.2);
    const vy = Math.sqrt(2 * -GRAVITY * (this.worldH / 2 + apex));
    mesh.position.set(x, -this.worldH / 2 - 2, (Math.random() - 0.5) * 2.2);
    this.scene.add(mesh);

    const spinAxis = new THREE.Vector3(...item.read.spin.axis).normalize();
    this.actors.push({
      item, ripe, mesh, raw,
      vel: new THREE.Vector3((x > 0 ? -1 : 1) * (0.4 + Math.random() * 1.5), vy, 0),
      spinAxis, spinRate: item.read.spin.rate * 1.5,
      alive: true,
    });
  }

  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.running) {
      this.spawnClock -= dt;
      if (this.spawnClock <= 0) {
        this.spawn();
        this.spawnClock = SPAWN_EVERY * (0.75 + Math.random() * 0.5);
      }
    }

    const floor = -this.worldH / 2 - 3;
    for (const a of this.actors) {
      a.vel.y += GRAVITY * dt;
      a.mesh.position.addScaledVector(a.vel, dt);
      a.mesh.rotateOnAxis(a.spinAxis, a.spinRate * dt);
      if (a.mesh.position.y < floor) {
        a.alive = false;
        if (this.mode === 'hunt') this.fellPast(a);
      }
    }
    for (const d of this.debris) {
      d.vel.y += GRAVITY * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotateOnAxis(d.spinAxis, d.spinRate * dt);
      d.life -= dt;
      if (d.life < 0.6) d.mesh.material.opacity = Math.max(0, d.life / 0.6);
    }

    this.actors = this.actors.filter((a) => { if (!a.alive) { this.retire(a); return false; } return true; });
    this.debris = this.debris.filter((d) => { if (d.life <= 0) { this.retire(d); return false; } return true; });

    if (this.anchorMesh) this.anchorMesh.rotation.y += dt * 0.45;

    this.drawBlade(dt);
    this.render();

    if (this.mode === 'hunt' && this.running && !this.queue.length && !this.actors.length) this.endRound();

    this._raf = requestAnimationFrame(this.tick.bind(this));
  }

  render() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.scene, this.camera);

    // the anchor, into the corner box the HUD reserves for it
    const box = this.root.querySelector('#anchor-box');
    if (box && this.anchorMesh) {
      const r = box.getBoundingClientRect();
      const rootRect = this.root.getBoundingClientRect();
      const x = r.left - rootRect.left, y = rootRect.bottom - r.bottom;
      this.renderer.setScissorTest(true);
      this.renderer.setViewport(x, y, r.width, r.height);
      this.renderer.setScissor(x, y, r.width, r.height);
      this.anchorCamera.aspect = r.width / r.height;
      this.anchorCamera.updateProjectionMatrix();
      this.renderer.render(this.anchorScene, this.anchorCamera);
      this.renderer.setScissorTest(false);
    }
  }

  retire(a) {
    this.scene.remove(a.mesh);
    a.mesh.geometry.dispose();
    a.mesh.material.dispose();
  }

  // ──────────────────────────────────────────────────────────── blade

  bindPointer() {
    const pos = (e) => {
      const r = this.root.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top, t: performance.now() };
    };
    const down = (e) => { this.cutting = true; this.trail = [pos(e)]; };
    const move = (e) => {
      if (!this.cutting) return;
      if (e.cancelable) e.preventDefault();
      const p = pos(e);
      const prev = this.trail[this.trail.length - 1];
      this.trail.push(p);
      if (this.trail.length > 24) this.trail.shift();
      if (prev) this.testCut(prev, p);
    };
    const up = () => { this.cutting = false; };

    this.root.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this.root.addEventListener('touchstart', down, { passive: true });
    this.root.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }

  drawBlade(dt) {
    const ctx = this.bladeCtx;
    ctx.clearRect(0, 0, this.blade.width, this.blade.height);
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p.t < 240);
    if (this.trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.strokeStyle = pass === 0 ? 'rgba(140,200,255,0.20)' : 'rgba(235,248,255,0.92)';
      ctx.lineWidth = pass === 0 ? 22 : 3.5;
      ctx.stroke();
    }
  }

  /** Screen-space segment against each actor's projected disc. */
  testCut(p0, p1) {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = new THREE.Vector3();
    for (const a of this.actors) {
      if (!a.alive) continue;
      v.copy(a.mesh.position).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      if (v.z > 1) continue;

      // Screen radius of the bounding sphere, from the vertical FOV.
      const dist = this.camera.position.distanceTo(a.mesh.position);
      const worldR = a.mesh.geometry.boundingSphere.radius;
      const rPix = (worldR / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist)) * h;

      if (segDist(p0.x, p0.y, p1.x, p1.y, sx, sy) < rPix * 0.92) {
        this.slice(a, p0, p1);
      }
    }
  }

  // ──────────────────────────────────────────────────────────── slice

  slice(a, p0, p1) {
    a.alive = false;

    // Cut plane: the swipe direction on screen, lifted into the actor's own
    // frame so the two halves keep their cut as they tumble away.
    const dir = new THREE.Vector3(p1.x - p0.x, -(p1.y - p0.y), 0).normalize();
    const nrm = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    const localN = nrm.clone().applyQuaternion(a.mesh.quaternion.clone().invert()).normalize();

    const halves = splitByPlane(a.raw, localN);
    for (let s = 0; s < 2; s++) {
      if (!halves[s].indices.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(a.raw.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(a.raw.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(halves[s].indices, 1));
      const mat = this.materialFor(a.item.read, { side: THREE.DoubleSide });
      mat.transparent = true;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(a.mesh.position);
      mesh.quaternion.copy(a.mesh.quaternion);
      this.scene.add(mesh);
      const push = nrm.clone().multiplyScalar(s === 0 ? 2.6 : -2.6);
      this.debris.push({
        mesh,
        vel: a.vel.clone().multiplyScalar(0.55).add(push),
        spinAxis: dir.clone(),
        spinRate: 3.2 * (s === 0 ? 1 : -1),
        life: 1.9,
      });
    }

    // the pit: a small glowing core, revealed by the cut
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(a.item.read.radius * this.fallScale * 0.3, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true })
    );
    core.position.copy(a.mesh.position);
    this.scene.add(core);
    this.debris.push({ mesh: core, vel: a.vel.clone().multiplyScalar(0.3), spinAxis: dir.clone(), spinRate: 1, life: 0.9 });

    const sx = (p0.x + p1.x) / 2, sy = (p0.y + p1.y) / 2;
    this.judge(a, sx, sy);
  }

  judge(a, sx, sy) {
    if (this.mode === 'free') {
      this.showCard(a, sx, sy, null);
      return;
    }
    this.plays.push({ ripe: !!a.ripe, sliced: true });
    if (a.ripe) {
      this.streak++;
      this.score += 100 * comboMultiplier(this.streak);
      this.showCard(a, sx, sy, true);
    } else {
      this.streak = 0;
      this.mistakes++;
      this.score = Math.max(0, this.score - 60);
      this.showCard(a, sx, sy, false);
    }
    // A round ALWAYS runs its full slate. Ending early once you have made n
    // mistakes is optional stopping, and it biases the very binomial test the
    // scoreboard reports — the null model assumes a fixed number of trials.
    // Mistakes cost points, never the measurement.
    this.updateHud();
  }

  /**
   * A post left the screen unsliced. EVERY one is recorded, ripe or not — a
   * post you correctly left alone is a decision you made, and dropping those
   * from the tally would inflate the round's base rate and quietly make the
   * binomial test harder than the game you were actually playing.
   */
  fellPast(a) {
    this.plays.push({ ripe: !!a.ripe, sliced: false });
    if (a.ripe) this.streak = 0;
    this.updateHud();
  }

  showCard(a, x, y, correct) {
    const el = document.createElement('div');
    el.className = 'card' + (correct === true ? ' good' : correct === false ? ' bad' : '');
    const sim = this.round ? cos(this.round.anchor.unit, a.item.unit) : null;
    const tag = correct === true ? '<span class="tag good">ripe</span>'
      : correct === false ? '<span class="tag bad">stranger</span>' : '';
    const simLine = sim === null ? '' : `<div class="sim">shape similarity to the anchor: <b>${sim.toFixed(3)}</b>${this.round ? ` &nbsp;τ = ${this.round.tau.toFixed(3)}` : ''}</div>`;
    el.innerHTML = `${tag}<div class="txt">${escapeHtml(a.item.post.text)}</div>
      <div class="by">@${escapeHtml(a.item.post.author.handle)}</div>${simLine}`;
    el.style.left = Math.min(Math.max(12, x - 150), this.root.clientWidth - 312) + 'px';
    el.style.top = Math.min(Math.max(12, y - 40), this.root.clientHeight - 160) + 'px';
    el.style.setProperty('--tint', a.item.read.color.hex);
    this.hud.cards.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 3000);
  }

  // ─────────────────────────────────────────────────────────── rounds

  endRound() {
    this.running = false;
    const s = scoreRound(this.plays);
    const v = verdict(s);
    this.hud.anchorText.textContent = this.round.anchor.post.text;
    this.banner(
      `Round ${this.roundIndex} — ${v.tone === 'read' ? 'you read it' : v.tone === 'chance' ? 'chance' : 'inconclusive'}`,
      `<div class="v ${v.tone}">${v.text}</div>
       <table class="tally">
         <tr><td>sliced, ripe</td><td>${s.hits}</td><td>sliced, stranger</td><td>${s.falseAlarms}</td></tr>
         <tr><td>let a ripe one fall</td><td>${s.misses}</td><td>correctly left alone</td><td>${s.correctRejections}</td></tr>
       </table>
       <div class="anchor-reveal"><b>the anchor was:</b> ${escapeHtml(this.round.anchor.post.text)}</div>`,
      [{ label: 'Next round', fn: () => { this.nextRound(); this.begin(); } },
       { label: 'Stop', fn: () => this.gameOver() }]
    );
  }

  gameOver() {
    this.running = false;
    this.banner('Stopped', `Final score <b>${this.score}</b> after ${this.roundIndex} round${this.roundIndex === 1 ? '' : 's'}.`,
      [{ label: 'Play again', fn: () => this.startHunt() },
       { label: 'Grove (free slicing)', fn: () => this.startFree() }]);
  }

  banner(title, html, actions) {
    const b = this.hud.banner;
    // One wrapper, not three siblings: #banner is a centring grid, so loose
    // children become separate rows and the panel tears itself apart vertically.
    b.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h2>${title}</h2><div class="body">${html}</div>`;
    const row = document.createElement('div');
    row.className = 'actions';
    for (const a of (actions || [{ label: 'Go', fn: () => {} }])) {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      btn.onclick = () => { b.classList.remove('show'); a.fn(); };
      row.appendChild(btn);
    }
    wrap.appendChild(row);
    b.appendChild(wrap);
    b.classList.add('show');
  }

  updateHud() {
    this.hud.score.textContent = this.mode === 'hunt' ? this.score : '—';
    this.hud.combo.textContent = this.streak >= 3 ? `${comboMultiplier(this.streak)}×` : '';
    this.hud.mistakes.textContent = this.mode === 'hunt' && this.mistakes ? `✕ ${this.mistakes}` : '';
    this.hud.progress.textContent = this.round ? `round ${this.roundIndex} · ${this.plays.length}/${this.round.total}` : '';
  }
}

// ───────────────────────────────────────────────────────────── helpers

/**
 * Split a mesh's triangles into two groups by which side of a plane through the
 * origin their centroid falls. The cut edge is left open — with DoubleSide
 * materials that reads exactly like a cut through a solid, and it avoids
 * re-triangulating a surface whose whole point is its fine detail.
 */
export function splitByPlane(raw, normal) {
  const { positions, indices } = raw;
  const nx = normal.x, ny = normal.y, nz = normal.z;
  const a = [], b = [];
  for (let f = 0; f < indices.length; f += 3) {
    const i0 = indices[f] * 3, i1 = indices[f + 1] * 3, i2 = indices[f + 2] * 3;
    const cx = (positions[i0] + positions[i1] + positions[i2]) / 3;
    const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3;
    const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3;
    const side = cx * nx + cy * ny + cz * nz;
    const dst = side >= 0 ? a : b;
    dst.push(indices[f], indices[f + 1], indices[f + 2]);
  }
  return [{ indices: Uint32Array.from(a) }, { indices: Uint32Array.from(b) }];
}

export function segDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
