/* jurassic — wiring.
 *
 * Owns the UI and nothing else. Every acoustic number displayed here was
 * computed in Rust and fetched through `Soundscape`; there is no second
 * propagation model in this file, and there must never be one, or the map and
 * the sound will quietly start disagreeing.
 */

import { Soundscape } from "./engine.js";
import { buildPlot } from "./scene.js";
import { ForestMap, F_LO, F_HI } from "./map.js";
import { SPECIES, EARS, LOCALITY, MAMMAL_LOCALISATION_Q, threshold, PLOT_M } from "./fauna.js";

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const kHz = (hz) => `${(hz / 1000).toFixed(hz < 10000 ? 2 : 1)} kHz`;

const state = {
  plotSeed: 1,
  ear: EARS[0],
  selected: SPECIES.find((s) => s.id === "sigmaboilus-peregrinus") || SPECIES[0],
  detectorOn: false,
  detectorDiv: 10,
};

let sound = null;
let map = null;
let plot = null;

boot();

async function boot() {
  const params = new URLSearchParams(location.search);
  state.plotSeed = clampInt(params.get("plot"), 1, 999999, 1);

  map = new ForestMap($("map"));
  map.onmove = (x, y) => {
    sound.setListener(x, y);
    map.listener = { x, y };
    refreshLive();
    map.draw();
  };
  map.onpick = (hit) => {
    const sp = SPECIES.find((s) => s.id === hit.voice.speciesId);
    if (sp) selectSpecies(sp);
  };
  map.onhover = (hit, px, py) => showTooltip(hit, px, py);
  // The chart is painted with the map's ramp, so it re-steps with the theme too.
  map.onscheme = () => {
    renderReach();
    renderSharpness();
  };

  try {
    sound = await Soundscape.load();
  } catch (err) {
    $("status").textContent = `engine failed to load — ${err.message}`;
    $("status").dataset.tone = "bad";
    return;
  }
  sound.onstate = onAudioState;
  sound.onactivity = (act) => {
    map.activity = act;
    map.draw();
    const dbfs = sound.peak > 0 ? 20 * Math.log10(sound.peak) : -90;
    $("meter-fill").style.width = `${Math.max(0, Math.min(100, (dbfs + 60) * (100 / 60)))}%`;
  };

  buildControls();
  loadPlot(state.plotSeed);
  $("engine-version").textContent = `kernel v${sound.version}`;
  $("status").textContent = "ready — press play, then walk about the plot";
  window.addEventListener("resize", () => map.resize());
  window.addEventListener("keydown", onKey);
}

// ------------------------------------------------------------------- plot --

function loadPlot(seed) {
  state.plotSeed = seed;
  plot = buildPlot(seed);
  map.plot = plot;
  map.listener = { x: 0, y: 0 };
  sound.setScene(plot.voices);
  sound.setListener(0, 0);
  map.activity = new Float32Array(plot.voices.length);
  $("plot-seed").value = seed;
  const url = new URL(location.href);
  url.searchParams.set("plot", seed);
  history.replaceState(null, "", url);
  selectSpecies(state.selected);
  renderReach();
  renderAirNote();
}

// -------------------------------------------------------------- selection --

function selectSpecies(sp) {
  state.selected = sp;
  map.selectedSpecies = sp.id;
  $("species-select").value = sp.id;
  renderDossier(sp);
  renderSharpness();
  refreshRings();
  refreshLive();
  renderAirNote();
  map.draw();
}

function refreshRings() {
  if (!plot) return;
  const sp = state.selected;
  const rings = [];
  plot.voices.forEach((v, i) => {
    if (v.speciesId !== sp.id) return;
    const thr = threshold(state.ear, v.carrierHz, v.carrierHz);
    rings.push({ x: v.x, y: v.y, radius: sound.audibleRadius(i, thr), carrierHz: v.carrierHz });
  });
  map.rings = rings;

  // A radius can be smaller than a pixel — which is the honest answer for an
  // ultrasonic call and a human ear, and also indistinguishable from a bug.
  // Say it in words rather than drawing a circle at a size it does not have.
  const mean = rings.reduce((n, r) => n + r.radius, 0) / Math.max(1, rings.length);
  // Below about a dozen pixels the circle disappears inside the singer's own
  // marker, so there is nothing to see even though something was drawn.
  const tiny = mean * map.scale < 12;
  $("map-reach").dataset.tiny = String(tiny);
  $("map-reach").innerHTML = tiny
    ? `<em>${sp.name}</em> carries only <strong>${fmt(mean, 1)} m</strong> to ${state.ear.label.toLowerCase()} —
       its circles are smaller than a pixel at this scale, so there is nothing to draw.
       Change who is listening, or switch the detector on and walk up to one.`
    : `Dashed circles: <em>${sp.name}</em> is audible to ${state.ear.label.toLowerCase()}
       out to <strong>${fmt(mean)} m</strong>.`;
}

// -------------------------------------------------------------- the panels --

function renderDossier(sp) {
  const badge = (kind) =>
    `<span class="badge badge-${kind}" title="${provenanceTitle(kind)}">${kind}</span>`;
  const i = plot.voices.findIndex((v) => v.speciesId === sp.id);
  const hemi = i >= 0 ? sound.hemisyllableS(i) : sp.teeth / sp.carrierHz;
  const { lo, hi } = MAMMAL_LOCALISATION_Q;
  const sharp = sp.q > hi;

  const rows = [
    ["call", `${kHz(sp.carrierHz)} ${badge(sp.from)}`],
    ["wing resonance", `${kHz(sp.feaHz)} ${badge(sp.from)}`],
    ["Q", `${sp.q} — ${sharp ? "sharper than a mammal can place" : "inside the mammalian band"}`],
    ["file", `${sp.teeth} teeth ${badge("digitised")}`],
    ["traverse", `${fmt(hemi * 1000, 1)} ms per stroke`],
    ["strokes", sp.opening > 0 ? "both — opening and closing" : "closing only"],
    ["chirp", `${sp.syllables} syllable${sp.syllables > 1 ? "s" : ""}, one every ${fmt(sp.periodS, 1)} s ${badge("modelled")}`],
    ["source level", `${sp.splDb} dB SPL at 1 m ${badge("modelled")}`],
    ["on this plot", `${sp.count} males`],
  ];

  const detune = Math.abs(sp.feaHz - sp.carrierHz) / sp.carrierHz;
  const detuneNote =
    detune > 0.12
      ? `<p class="caveat">Its wing wants to ring at ${kHz(sp.feaHz)}; the file drives it to
         ${kHz(sp.carrierHz)}. The instrument and the string disagree by ${fmt(detune * 100)} %.</p>`
      : "";

  $("dossier").innerHTML = `
    <h3><em>${sp.name}</em></h3>
    <p class="authority">${sp.family}</p>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${detuneNote}
    <p class="note"><strong>The file.</strong> ${sp.fileNote}</p>
    <p class="note">${sp.note}</p>
    <p class="cite">Call, wing resonance, Q and tooth count after Gu <em>et al.</em> 2026,
      PNAS 123(36):e2615107123, Figs. 3 and 4.</p>
  `;
}

function provenanceTitle(kind) {
  return {
    published: "Printed as a number in Gu et al. 2026.",
    digitised: "Read off one of that paper's published figures rather than a printed number.",
    measured: "A measurement of a living animal.",
    modelled: "Our value — not in the paper. Plausible, not a result.",
    hypothesis: "A claim about something that does not fossilise. Argument, not datum.",
  }[kind] || "";
}

/**
 * Where each call sits against the sharpness a mammalian ear can resolve.
 *
 * This is the paper's pure-tone argument as a picture. Gu et al. put the
 * directional resolution of a mammalian cochlea at about Q 9–13: a call much
 * narrower than that is hard for a mammal to place, so narrowing the band lets
 * a male sing loudly and still be difficult to find. Four of these nine sit
 * more than twice above the band — and two sit inside it.
 *
 * One series, so no legend box; the marks are labelled and the title names the
 * measure. Fill is the same frequency ramp as the map, so a dot here and a dot
 * there are the same animal.
 */
function renderSharpness() {
  if (!plot) return;
  const { lo, hi } = MAMMAL_LOCALISATION_Q;
  const rows = [...SPECIES].sort((a, b) => b.q - a.q);
  const W = 320;
  const PAD_L = 4;
  const VAL_W = 34;              // reserved right column, so a value label can
  const AXIS = W - VAL_W;        // never land on top of a species name
  const ROW = 32;
  const TOP = 16;                // room for the tick row
  const H = TOP + rows.length * ROW + 6;
  const QLO = 6;
  const QHI = 80;
  const x = (q) =>
    PAD_L + ((Math.log(Math.min(Math.max(q, QLO), QHI)) - Math.log(QLO)) /
      (Math.log(QHI) - Math.log(QLO))) * (AXIS - PAD_L);

  const ticks = [10, 20, 40, 80]
    .map((q) => `<text class="sharp-tick" x="${x(q)}" y="9" text-anchor="middle">${q}</text>`)
    .join("");

  const marks = rows
    .map((sp, k) => {
      const y = TOP + k * ROW + 18;
      const sel = sp.id === state.selected.id;
      return `
      <g class="sharp-row${sel ? " is-selected" : ""}" data-species="${sp.id}" tabindex="0"
         role="button" aria-label="${sp.name}, quality factor ${sp.q}, against a mammalian localisation limit of Q ${lo} to ${hi}">
        <rect class="sharp-hit" x="0" y="${y - 17}" width="${W}" height="${ROW}"></rect>
        <line class="sharp-stem" x1="${PAD_L}" y1="${y}" x2="${x(sp.q)}" y2="${y}"></line>
        <circle cx="${x(sp.q)}" cy="${y}" r="5.5" fill="${map.freqColor(sp.carrierHz)}"
                stroke="var(--surface-1)" stroke-width="2"></circle>
        <text class="sharp-name" x="${PAD_L}" y="${y - 8}" font-style="italic">${sp.name}</text>
        <text class="sharp-val" x="${W}" y="${y + 4}" text-anchor="end">${sp.q}</text>
      </g>`;
    })
    .join("");

  $("sharpness").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
         aria-label="Quality factor of each species' call against the Q ${lo} to ${hi} band a mammalian ear can resolve a direction within">
      <rect class="sharp-band" x="${x(lo)}" y="${TOP - 4}" width="${x(hi) - x(lo)}"
            height="${H - TOP - 2}"></rect>
      <text class="sharp-axis" x="${PAD_L}" y="9">Q</text>
      ${ticks}
      ${marks}
    </svg>
    <p class="reach-foot">
      Shaded: <strong>Q ${lo}–${hi}</strong>, the sharpness a mammalian cochlea can
      resolve a direction within. A call to the right of it is loud and hard to
      place — which is what Gu <em>et al.</em> argue pure tones were for. Two of
      the nine are no sharper than that band, and would have been the easy ones
      to find.
    </p>`;

  $("sharpness").querySelectorAll(".sharp-row").forEach((g) => {
    const pick = () => {
      const sp = SPECIES.find((s) => s.id === g.dataset.species);
      if (sp) selectSpecies(sp);
    };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
  });
}

/**
 * Reach by species: how far each call carries before it drops below the
 * selected ear's threshold. One series, so no legend box — the bars are
 * labelled and the title names the measure. Fill is the same sequential
 * frequency ramp the map uses, so a bar and a dot of the same colour are the
 * same animal.
 */
function renderReach() {
  if (!plot) return;
  const ear = state.ear;
  const rows = SPECIES.map((sp) => {
    const i = plot.voices.findIndex((v) => v.speciesId === sp.id);
    const thr = threshold(ear, sp.carrierHz, sp.carrierHz);
    return { sp, radius: i >= 0 ? sound.audibleRadius(i, thr) : 0, thr };
  }).sort((a, b) => b.radius - a.radius);

  const max = Math.max(PLOT_M / 2, ...rows.map((r) => r.radius));
  const W = 320;          // user units; the SVG scales uniformly, so text is safe
  const BARW = W - 46;    // room reserved at the right for the value labels
  const ROW = 42;
  const BAR = 12;
  const H = rows.length * ROW;

  const bars = rows
    .map((r, k) => {
      const w = (r.radius / max) * BARW;
      const y = k * ROW;
      const col = map.freqColor(r.sp.carrierHz);
      const sel = r.sp.id === state.selected.id;
      const label = `${r.sp.name}: audible to ${state.ear.label} out to ${fmt(r.radius)} metres`;
      return `
      <g class="reach-row${sel ? " is-selected" : ""}" data-species="${r.sp.id}" tabindex="0"
         role="button" aria-label="${label}">
        <rect class="reach-hit" x="0" y="${y}" width="${W}" height="${ROW}"></rect>
        <text class="reach-name" x="0" y="${y + 13}" font-style="italic">${r.sp.name}</text>
        <rect class="reach-bar" x="0" y="${y + 19}" width="${Math.max(w, 1.5)}" height="${BAR}"
              rx="4" fill="${col}"></rect>
        <text class="reach-val" x="${w + 6}" y="${y + 29}">${fmt(r.radius)} m</text>
      </g>`;
    })
    .join("");

  // The plot itself as a reference line: a call whose bar clears it is audible
  // right across the map.
  const halfX = (PLOT_M / 2 / max) * BARW;

  $("reach").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
         aria-label="Audible radius by species for the selected listener">
      <line class="reach-ref" x1="${halfX}" y1="0" x2="${halfX}" y2="${H}"></line>
      ${bars}
    </svg>
    <p class="reach-foot">
      Dashed line: <strong>${PLOT_M / 2} m</strong>, half the plot — a bar past it is
      audible everywhere on the map. Bars are shaded by carrier frequency, the same
      ramp as the dots.
    </p>`;

  $("reach").querySelectorAll(".reach-row").forEach((g) => {
    const pick = () => {
      const sp = SPECIES.find((s) => s.id === g.dataset.species);
      if (sp) selectSpecies(sp);
    };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
  });

  renderReachTable(rows);
}

/** The table view, so the chart is never the only way to read the numbers. */
function renderReachTable(rows) {
  $("reach-table").innerHTML = `
    <table>
      <caption>Audible radius by species — ${state.ear.label}</caption>
      <thead><tr><th scope="col">species</th><th scope="col">carrier</th>
        <th scope="col">threshold</th><th scope="col">radius</th><th scope="col">duty</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const i = plot.voices.findIndex((v) => v.speciesId === r.sp.id);
          const duty = i >= 0 ? sound.duty(i) : 0;
          return `<tr><th scope="row"><em>${r.sp.name}</em></th>
            <td>${kHz(r.sp.carrierHz)}</td>
            <td>${fmt(r.thr)} dB</td>
            <td>${fmt(r.radius)} m</td>
            <td>${fmt(duty * 100)} %</td></tr>`;
        })
        .join("")}</tbody>
    </table>`;
}

/** Numbers that change as you walk. */
function refreshLive() {
  if (!plot) return;
  const sp = state.selected;
  let nearest = null;
  plot.voices.forEach((v, i) => {
    if (v.speciesId !== sp.id) return;
    const d = Math.hypot(v.x - map.listener.x, v.y - map.listener.y);
    if (!nearest || d < nearest.d) nearest = { d, i, v };
  });
  if (!nearest) return;

  const db = sound.receivedDb(nearest.i);
  const thr = threshold(state.ear, nearest.v.carrierHz, nearest.v.carrierHz);
  const margin = db - thr;
  const audible = margin > 0;

  $("live").innerHTML = `
    <div class="live-row"><span>nearest <em>${sp.name}</em></span><strong>${fmt(nearest.d, 1)} m</strong></div>
    <div class="live-row"><span>arriving at you</span><strong>${fmt(db, 1)} dB SPL</strong></div>
    <div class="live-row"><span>threshold — ${state.ear.label.toLowerCase()}</span><strong>${fmt(thr, 1)} dB SPL</strong></div>
    <div class="live-row verdict" data-audible="${audible}">
      <span>${audible ? "audible" : "inaudible"}</span>
      <strong>${margin >= 0 ? "+" : ""}${fmt(margin, 1)} dB</strong>
    </div>
    <p class="live-note">
      Air is eating ${fmt(sound.absorptionDbPerM(nearest.v.carrierHz) * 100, 1)} dB
      per 100 m at ${kHz(nearest.v.carrierHz)}, on top of spreading and leaves.
    </p>`;
}

// ------------------------------------------------------------------ chrome --

function buildControls() {
  $("species-select").innerHTML = SPECIES.map(
    (s) => `<option value="${s.id}">${s.name} — ${kHz(s.carrierHz)}</option>`
  ).join("");
  $("species-select").onchange = (e) =>
    selectSpecies(SPECIES.find((s) => s.id === e.target.value));

  $("ear-select").innerHTML = EARS.map((e) => `<option value="${e.id}">${e.label}</option>`).join("");
  $("ear-select").onchange = (e) => {
    state.ear = EARS.find((x) => x.id === e.target.value);
    $("ear-blurb").innerHTML =
      `<span class="badge badge-${state.ear.from}" title="${provenanceTitle(state.ear.from)}">${state.ear.from}</span> ${state.ear.blurb}`;
    refreshRings();
    renderReach();
    refreshLive();
    map.draw();
  };
  $("ear-blurb").innerHTML =
    `<span class="badge badge-${state.ear.from}" title="${provenanceTitle(state.ear.from)}">${state.ear.from}</span> ${state.ear.blurb}`;

  $("play").onclick = async () => {
    if (sound.state === "playing") await sound.stop();
    else await sound.start();
  };

  // The slider is in dB because the useful range spans three orders of
  // magnitude: an insect 60 m off arrives four decades below full scale.
  bindRange("gain", 36, (v) => sound.setMaster(Math.pow(10, v / 20)));
  bindRange("temp", 24, (v) => {
    sound.setAir({ tempC: v });
    afterAir();
  });
  bindRange("humidity", 80, (v) => {
    sound.setAir({ humidity: v });
    afterAir();
  });
  bindRange("canopy", 0.6, (v) => {
    sound.setAir({ canopy: v });
    afterAir();
  });

  $("detector").onchange = (e) => {
    state.detectorOn = e.target.checked;
    sound.setDetector(state.detectorOn ? state.detectorDiv : 1);
    $("detector-note").textContent = state.detectorOn
      ? `dividing everything above 14 kHz by ${state.detectorDiv} — pitch only; the physics still uses the true frequency`
      : "off — ultrasound is being rendered at its true pitch, where you almost certainly cannot hear it";
  };

  $("plot-seed").onchange = (e) => loadPlot(clampInt(e.target.value, 1, 999999, 1));
  $("plot-next").onclick = () => loadPlot(state.plotSeed + 1);
  $("plot-prev").onclick = () => loadPlot(Math.max(1, state.plotSeed - 1));

  $("locality").innerHTML = `
    <strong>${LOCALITY.bed}</strong><br>${LOCALITY.place}<br>
    <span class="muted">${LOCALITY.age}</span>
    <p class="note">${LOCALITY.climate}</p>`;
}

function afterAir() {
  refreshRings();
  renderReach();
  refreshLive();
  renderAirNote();
  map.draw();
}

/**
 * What the weather is doing to the selected call.
 *
 * Absorption is not monotone in humidity, which is the part of this that
 * surprises people: water vapour catalyses the vibrational relaxation of the
 * air's oxygen and nitrogen, and each relaxation bites hardest when its
 * relaxation frequency sweeps past the signal. So every call has a worst
 * humidity somewhere in the middle of the range, and a saturated night can be
 * kinder to it than a merely damp one. Drag the humidity slider through the
 * figure below and watch the circles swell on both sides of it.
 */
function renderAirNote() {
  if (!plot) return;
  const sp = state.selected;
  const now = sound.absorptionDbPerM(sp.carrierHz) * 1000;
  const worst = sound.worstHumidity(sp.carrierHz);
  const spread = worst.dbPerKm / Math.max(now, 1e-6);
  $("air-note").innerHTML = `
    These are not decoration — every circle on the map is recomputed as you drag.
    Right now the air is costing <em>${sp.name}</em>
    <strong>${fmt(now)} dB per km</strong> at ${kHz(sp.carrierHz)}, on top of
    spreading and leaves. The worst humidity for this call at
    ${fmt(sound.air.tempC)} °C is <strong>${worst.humidity} %</strong>, where it
    would cost ${fmt(worst.dbPerKm)} dB per km — ${spread >= 1.15 ? `${fmt(spread, 1)}× what it is paying now` : "about what it is paying now"}.
    Absorption is not monotone in humidity: water vapour catalyses the
    relaxation of the air's own oxygen and nitrogen, so there is a worst damp in
    the middle and a saturated night is often kinder than a merely humid one.`;
}

function bindRange(id, initial, apply) {
  const el = $(id);
  const out = $(`${id}-out`);
  el.value = initial;
  const run = () => {
    const v = parseFloat(el.value);
    if (out) out.textContent = el.dataset.unit ? `${v}${el.dataset.unit}` : `${v}`;
    apply(v);
  };
  el.addEventListener("input", run);
  run();
}

function onAudioState(s, err) {
  const btn = $("play");
  btn.textContent = s === "playing" ? "◼ stop" : "▶ play";
  btn.dataset.on = s === "playing";
  if (s === "failed") {
    $("status").textContent = `no audio — ${err}. The map and every number on it still work.`;
    $("status").dataset.tone = "bad";
    return;
  }
  if (s === "playing") {
    const ceiling = sound.ceilingHz;
    const over = SPECIES.filter((sp) => sp.carrierHz > ceiling);
    // Selection and every radius are unchanged by the sample rate, but the
    // dossier's chirp figures come from the kernel, which has just been
    // re-initialised at the real rate.
    refreshRings();
    refreshLive();
    $("status").dataset.tone = over.length ? "warn" : "ok";
    $("status").textContent = over.length
      ? `playing at ${fmt(sound.sampleRate / 1000, 1)} kHz — ${over.map((sp) => sp.name).join(", ")} sings above this output’s ${fmt(ceiling / 1000, 1)} kHz ceiling, so it is rendering as silence, exactly as a recording of it would. Switch the detector on to hear it.`
      : `playing at ${fmt(sound.sampleRate / 1000, 1)} kHz — every call on the roster fits under the ${fmt(ceiling / 1000, 1)} kHz ceiling, though your ears may not agree.`;
  }
}

function showTooltip(hit, px, py) {
  const tip = $("tip");
  if (!hit) {
    tip.hidden = true;
    return;
  }
  const sp = SPECIES.find((s) => s.id === hit.voice.speciesId);
  const db = sound.receivedDb(hit.index);
  const d = Math.hypot(hit.voice.x - map.listener.x, hit.voice.y - map.listener.y);
  tip.hidden = false;
  tip.style.left = `${px + 14}px`;
  tip.style.top = `${py + 14}px`;
  tip.innerHTML = `<em>${sp.name}</em><br>${kHz(hit.voice.carrierHz)} · ${fmt(d, 1)} m away<br>
    <span class="muted">${fmt(db, 1)} dB SPL at you</span>`;
}

function onKey(e) {
  const step = e.shiftKey ? 8 : 3;
  const d = { ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1],
              ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key];
  if (!d || e.target.matches("input, select, textarea")) return;
  e.preventDefault();
  const half = PLOT_M / 2;
  const x = Math.max(-half, Math.min(half, map.listener.x + d[0] * step));
  const y = Math.max(-half, Math.min(half, map.listener.y + d[1] * step));
  map.listener = { x, y };
  sound.setListener(x, y);
  refreshLive();
  map.draw();
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
