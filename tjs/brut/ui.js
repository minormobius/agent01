// tjs/brut/ui.js — the control panel BOTH sites wear.
//
// /brut/ and /brut/plan/ are two different sites over one generator, and the
// fastest way for two sites to disagree about a seed is for each to write its
// own form. So the panel, the URL sync and the cross-link all live here: change
// a slider on either page and the other page's permalink is already correct.

import {
  TYPOLOGIES, TYPOLOGY_IDS, MODULES, MODULE_IDS, FLOOR_SYSTEMS, FLOOR_IDS,
  LATERAL_SYSTEMS, LATERAL_IDS, floorSystem, resolveParams, paramsToQuery, deriveParams, rollSeed,
} from './arch.js';

const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  return e;
};

export function readURL() {
  return resolveParams(location.search);
}

// Write the canonical permalink without touching history — the address bar is
// the save file, so it has to be right after every keystroke, but a slider drag
// must not fill the back button with fifty states.
export function writeURL(p) {
  const q = '?' + paramsToQuery(p);
  if (location.search !== q) history.replaceState(null, '', q + location.hash);
  return q;
}

export function siblingHref(p, path) {
  return path + '?' + paramsToQuery(p);
}

/* Build the panel. `onChange(params, why)` fires on every committed edit. */
export function buildPanel(root, params, onChange, opts = {}) {
  let p = params;
  const rerender = (why) => { writeURL(p); onChange(p, why); paint(); };
  const setSeed = (seed, typology) => { p = resolveParams({ s: seed, t: typology || undefined }); rerender('seed'); };

  const seedInput = h('input', { type: 'text', id: 'seedInput', spellcheck: 'false', value: p.seed });
  seedInput.addEventListener('change', () => setSeed(seedInput.value.trim() || 'brut'));
  seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') seedInput.blur(); });

  const typeSel = h('select', {}, TYPOLOGY_IDS.map((t) => h('option', { value: t, ...(t === p.typology ? { selected: '' } : {}) }, TYPOLOGIES[t].label)));
  typeSel.addEventListener('change', () => setSeed(p.seed, typeSel.value));

  const blurb = h('p', { class: 'blurb' });
  // THE PARTI GETS ITS OWN BLOCK, above the numbers. Everything else in this
  // panel is a dimension; this is the reason the dimensions came out that way,
  // and a building whose idea is not stated reads as an accident.
  const partiBox = h('div', { class: 'parti' });
  // The lifts get their own block for the same reason the parti does: how many
  // shafts a building has is not a dimension anybody can read off the model,
  // and it is the number that decides whether the plan works.
  const liftBox = h('div', { class: 'lifts' });
  // The planting gets a block too, and for the same reason: what a planted
  // terrace WEIGHS is the number that decides whether it can be there, and it
  // is not a dimension anybody can read off the model.
  const greenBox = h('div', { class: 'lifts green' });
  const stats = h('div', { class: 'stats' });
  const rhythmRow = h('div', { class: 'rhythm' });
  const systems = h('div', { class: 'systems' });
  const sliders = h('div', { class: 'sliders' });
  const toggles = h('div', { class: 'toggles' });

  const linkBtn = h('button', { class: 'ghost', title: 'copy this building’s permalink' }, 'copy link');
  linkBtn.addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?' + paramsToQuery(p);
    try { await navigator.clipboard.writeText(url); linkBtn.textContent = 'copied'; }
    catch { linkBtn.textContent = url.length > 40 ? 'select the address bar' : url; }
    setTimeout(() => { linkBtn.textContent = 'copy link'; }, 1600);
  });

  // THE ROLL, COUPLED TO THE SOLVER. A bare roll lands a building the engineer
  // will reject about two thirds of the time, which made half of every session
  // a slot machine. With `must stand up` on, the roll is a search: it rolls,
  // solves, reads the GOVERNING check, and walks the repair ladder that check
  // names — so what comes back is a building that verifies.
  //
  // It stays a toggle rather than becoming the only behaviour, because a
  // building that fails is half the value of having a solver at all. Watching
  // core wall shear go red as you add storeys is the thing worth seeing.
  const workCb = h('input', { type: 'checkbox', checked: '' });
  const rollNote = h('p', { class: 'blurb rollnote' });
  const rollBtn = h('button', { class: 'primary', title: 'the only unseeded roll on the whole surface' }, 'roll');
  rollBtn.addEventListener('click', () => {
    if (!workCb.checked || !opts.rollWorkable) {
      rollNote.textContent = '';
      seedInput.value = rollSeed();
      setSeed(seedInput.value);
      return;
    }
    // the search is a few hundred solves' worth of arithmetic on the main
    // thread, so paint the label before starting rather than after
    rollBtn.disabled = true;
    rollBtn.textContent = 'solving…';
    setTimeout(() => {
      let res = null;
      try { res = opts.rollWorkable(rollSeed()); } catch (e) { rollNote.textContent = String(e && e.message || e); }
      rollBtn.disabled = false;
      rollBtn.textContent = 'roll';
      if (!res) return;
      // NOT setSeed — a repaired building is its parameters, not its seed's own
      // reading of them, and re-deriving from the seed would throw away the
      // repair that made it stand up
      p = res.params;
      seedInput.value = p.seed;
      typeSel.value = p.typology;
      rerender('roll');
      paintRoll(res);
    }, 0);
  });

  function paintRoll(res) {
    rollNote.textContent = '';
    const hz = res.hazard || {};
    const where = `${HAZARD[hz.seismicScenario] || hz.seismicScenario || '?'} · ${HAZARD[hz.windScenario] || hz.windScenario || '?'}`;
    if (!res.pass) {
      rollNote.className = 'blurb rollnote bad';
      rollNote.textContent = `no workable building in ${res.tried} tries against ${where}. ` +
        `The closest still fails ${(res.governing && (res.governing.name || res.governing.label)) || 'a check'} ` +
        `at ${res.worst}× — shown as it is, rather than pretended past.`;
      return;
    }
    rollNote.className = 'blurb rollnote';
    const edits = res.edits && res.edits.length
      ? ` The seed's own building did not stand up, so ${res.edits.map((e) => `${LABEL[e.key] || e.key} went ${e.from} → ${e.to}`).join(' and ')}.`
      : ' The seed’s own building stood up unaltered.';
    rollNote.textContent = `workable against ${where} — ${res.tried} ` +
      `${res.tried === 1 ? 'try' : 'tries'}, worst check at ${res.worst}×.${edits} ` +
      `Change the hazard and this can go red again: that is the point, not a bug.`;
  }

  const HAZARD = {
    high: 'an M7 quake', moderate: 'a moderate quake', low: 'a mild quake', none: 'no quake',
    cat3: 'a category 3 hurricane', cat5: 'a category 5 hurricane',
    gale: 'a gale', calm: 'calm air', storm: 'a storm',
  };

  const LABEL = {
    levels: 'storeys', bay: 'the bay', bx: 'bays across', bz: 'bays deep',
    floorH: 'floor to floor', floor: 'the floor system', lateral: 'the lateral system',
    massing: 'the massing', shape: 'the plate', tmd: 'the damper',
  };

  const resetBtn = h('button', { class: 'ghost', title: 'back to what the seed itself says' }, 'reset');
  resetBtn.addEventListener('click', () => setSeed(p.seed, p.typology));

  const cross = h('a', { class: 'cross', href: siblingHref(p, opts.siblingPath || '../') }, opts.siblingLabel || 'the other view');

  root.appendChild(h('div', { class: 'grp seedgrp' }, [
    h('label', { class: 'k' }, 'seed'), seedInput, rollBtn,
  ]));
  if (opts.rollWorkable) {
    root.appendChild(h('label', { class: 'tog rolltog', title: 'roll until the solver says yes' },
      [workCb, 'must stand up']));
    root.appendChild(rollNote);
  }
  root.appendChild(h('div', { class: 'grp' }, [h('label', { class: 'k' }, 'type'), typeSel]));
  root.appendChild(blurb);
  root.appendChild(partiBox);
  root.appendChild(liftBox);
  root.appendChild(greenBox);
  root.appendChild(cross);
  root.appendChild(stats);
  root.appendChild(h('div', { class: 'sec' }, 'facade rhythm'));
  root.appendChild(rhythmRow);
  root.appendChild(h('div', { class: 'sec' }, 'the structure'));
  root.appendChild(systems);
  root.appendChild(h('div', { class: 'sec' }, 'the frame'));
  root.appendChild(sliders);
  root.appendChild(toggles);
  root.appendChild(h('div', { class: 'grp btns' }, [linkBtn, resetBtn]));

  // — sliders ————————————————————————————————————————————————
  const SPECS = [
    { key: 'levels', label: 'storeys', min: 1, max: 30, step: 1, fmt: (v) => v },
    { key: 'bay', label: 'structural bay', min: 4.2, max: 11, step: 0.1, fmt: (v) => v.toFixed(1) + ' m' },
    { key: 'bx', label: 'bays across', min: 3, max: 20, step: 1, fmt: (v) => v },
    { key: 'bz', label: 'bays deep', min: 2, max: 18, step: 1, fmt: (v) => v },
    { key: 'floorH', label: 'floor to floor', min: 2.6, max: 30, step: 0.1, fmt: (v) => v.toFixed(1) + ' m' },
    { key: 'corridorW', label: 'corridor', min: 1.8, max: 4.2, step: 0.1, fmt: (v) => v.toFixed(1) + ' m' },
    { key: 'towers', label: 'service towers', min: 0, max: 2, step: 1, fmt: (v) => v },
    { key: 'green', label: 'substrate', min: 0, max: 2, step: 0.1, fmt: (v) => (v === 0 ? 'none' : '×' + v.toFixed(1)) },
  ];
  const slid = {};
  for (const s of SPECS) {
    const val = h('span', { class: 'v' });
    const inp = h('input', { type: 'range', min: s.min, max: s.max, step: s.step });
    inp.addEventListener('input', () => { p = { ...p, [s.key]: Number(inp.value) }; val.textContent = s.fmt(Number(inp.value)); rerenderLight(); });
    inp.addEventListener('change', () => rerender('slider'));
    slid[s.key] = { inp, val, s };
    sliders.appendChild(h('div', { class: 'slider' }, [h('label', {}, s.label), inp, val]));
  }
  let raf = 0;
  const rerenderLight = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; writeURL(p); onChange(p, 'drag'); }); };

  // — toggles ————————————————————————————————————————————————
  const TOG = [
    ['symmetric', 'symmetric elevation'],
    ['pilotis', 'raised on pilotis'],
    ['plant', 'roof plant'],
  ];
  const tog = {};
  for (const [key, lab] of TOG) {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { p = { ...p, [key]: cb.checked }; rerender('toggle'); });
    tog[key] = cb;
    toggles.appendChild(h('label', { class: 'tog' }, [cb, lab]));
  }
  const massSel = h('select', {});
  massSel.addEventListener('change', () => { p = { ...p, massing: massSel.value }; rerender('massing'); });
  const shapeSel = h('select', {});
  shapeSel.addEventListener('change', () => { p = { ...p, shape: shapeSel.value }; rerender('shape'); });
  toggles.appendChild(h('div', { class: 'grp' }, [h('label', { class: 'k' }, 'massing'), massSel]));
  toggles.appendChild(h('div', { class: 'grp' }, [h('label', { class: 'k' }, 'plate'), shapeSel]));

  // The floor system and the lateral system are the two decisions that change
  // the most: the floor is most of the weight, the lateral system is most of
  // the stiffness. They sit above the geometry sliders for that reason.
  const floorSel = h('select', {});
  floorSel.addEventListener('change', () => { p = resolveParams({ ...toQ(p), fl: floorSel.value }); rerender('floor'); });
  const latSel = h('select', {});
  latSel.addEventListener('change', () => { p = { ...p, lateral: latSel.value }; rerender('lateral'); });
  const tmdCb = h('input', { type: 'checkbox' });
  tmdCb.addEventListener('change', () => { p = { ...p, tmd: tmdCb.checked }; rerender('tmd'); });
  const floorNote = h('p', { class: 'blurb sysnote' });
  const latNote = h('p', { class: 'blurb sysnote' });
  systems.appendChild(h('div', { class: 'grp' }, [h('label', { class: 'k' }, 'floor'), floorSel]));
  systems.appendChild(floorNote);
  systems.appendChild(h('div', { class: 'grp' }, [h('label', { class: 'k' }, 'lateral'), latSel]));
  systems.appendChild(latNote);
  systems.appendChild(h('label', { class: 'tog' }, [tmdCb, 'tuned mass damper']));

  // changing the floor changes the depth, which changes the storey height it
  // needs — so re-derive through the codec rather than patching one field
  const toQ = (q) => {
    const out = {};
    for (const kv of paramsToQuery(q).split('&')) { const i = kv.indexOf('='); out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
    return out;
  };

  function paint() {
    const T = TYPOLOGIES[p.typology];
    seedInput.value = p.seed;
    typeSel.value = p.typology;
    blurb.textContent = T.blurb;
    cross.href = siblingHref(p, opts.siblingPath || '../');
    const sacred = p.typology === 'cathedral';

    for (const [k, o] of Object.entries(slid)) {
      o.inp.value = p[k];
      o.val.textContent = o.s.fmt(p[k]);
      o.inp.parentElement.style.display = (sacred && (k === 'levels' || k === 'corridorW')) ? 'none' : '';
    }
    for (const [k, cb] of Object.entries(tog)) cb.checked = !!p[k];

    fill(floorSel, FLOOR_IDS, p.floor, (id) => FLOOR_SYSTEMS[id].label);
    fill(latSel, LATERAL_IDS, p.lateral, (id) => LATERAL_SYSTEMS[id].label);
    tmdCb.checked = !!p.tmd;
    const fsNow = floorSystem(p);
    floorNote.textContent = `${fsNow.depth.toFixed(2)} m deep · ${(fsNow.weight / 1e3).toFixed(1)} kPa · spans to ${fsNow.maxSpan} m · ${fsNow.clear.toFixed(2)} m clear. ${fsNow.note}`;
    latNote.textContent = LATERAL_SYSTEMS[p.lateral].note;

    const massOpts = sacred ? ['basilica'] : ['slab', 'setback', 'inverted', 'ziggurat', 'stagger'];
    const shapeOpts = sacred ? ['basilica'] : ['bar', 'L', 'T', 'cross', 'court'];
    fill(massSel, massOpts, p.massing);
    fill(shapeSel, shapeOpts, p.shape);

    // the rhythm cell, editable letter by letter — the single most legible thing
    // about the elevation, so it gets to be a first-class control
    rhythmRow.textContent = '';
    p.rhythm.forEach((m, i) => {
      const sel = h('select', { class: 'mod' }, MODULE_IDS.map((id) => h('option', { value: id, ...(id === m ? { selected: '' } : {}) }, MODULES[id].label)));
      sel.title = MODULES[m].note;
      sel.addEventListener('change', () => {
        const next = p.rhythm.slice(); next[i] = sel.value;
        p = { ...p, rhythm: next }; rerender('rhythm');
      });
      rhythmRow.appendChild(sel);
    });
    const minus = h('button', { class: 'ghost tiny', title: 'shorten the repeat' }, '−');
    minus.addEventListener('click', () => { if (p.rhythm.length > 1) { p = { ...p, rhythm: p.rhythm.slice(0, -1) }; rerender('rhythm'); } });
    const plus = h('button', { class: 'ghost tiny', title: 'lengthen the repeat' }, '+');
    plus.addEventListener('click', () => { if (p.rhythm.length < 8) { p = { ...p, rhythm: p.rhythm.concat([p.rhythm[0]]) }; rerender('rhythm'); } });
    rhythmRow.appendChild(minus); rhythmRow.appendChild(plus);
  }

  function fill(sel, opts2, cur, labelFor) {
    sel.textContent = '';
    for (const o of opts2) sel.appendChild(h('option', { value: o, ...(o === cur ? { selected: '' } : {}) }, labelFor ? labelFor(o) : o));
    sel.value = cur;
  }

  paint();
  return {
    get params() { return p; },
    setStats(rows) {
      stats.textContent = '';
      for (const [k, v] of rows) stats.appendChild(h('div', { class: 'stat' }, [h('b', {}, String(v)), h('span', {}, k)]));
    },
    // `parti` is the building's own parti object; `features` the ceremonial
    // stairs it asked for, already laid out — so the panel quotes what was
    // BUILT rather than what was intended, and a stair that did not fit shows
    // up as a stair that is not listed.
    setParti(parti, features = []) {
      partiBox.textContent = '';
      if (!parti || !parti.memes || !parti.memes.length) {
        partiBox.appendChild(h('p', { class: 'blurb pnote' },
          'no parti — the ordinary case, and most buildings are it: a plan arranged for its own convenience and nothing declared.'));
        return;
      }
      partiBox.appendChild(h('div', { class: 'sec' }, 'the parti'));
      partiBox.appendChild(h('p', { class: 'pname' }, parti.note));
      for (const n of (parti.notes || [])) partiBox.appendChild(h('p', { class: 'blurb pnote' }, n));
      const seen = new Set();
      for (const f of features) {
        const key = `${f.type}:${f.meme}:${f.fromLevel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        partiBox.appendChild(h('p', { class: 'blurb pstair' },
          `${f.label || f.type} — ${f.featureNote || ''}`.trim().replace(/ —\s*$/, '')));
      }
    },
    // The lift group, quoted from the building rather than recomputed — so a
    // group the plate refused shows up as refused rather than as a plan.
    setLifts(g) {
      liftBox.textContent = '';
      if (!g || !g.needed) {
        if (g && g.reason) {
          liftBox.appendChild(h('div', { class: 'sec' }, 'the lifts'));
          liftBox.appendChild(h('p', { class: 'blurb pnote' }, `none — ${g.reason}.`));
        }
        return;
      }
      liftBox.appendChild(h('div', { class: 'sec' }, 'the lifts'));
      const zone = g.zones > 1 ? ` in ${g.zones} zones` : '';
      liftBox.appendChild(h('p', { class: 'pname' },
        `${g.built} × ${g.car.kg} kg at ${g.speed} m/s${zone}`));
      liftBox.appendChild(h('div', { class: 'ltab' }, [
        h('div', { class: 'stat' }, [h('b', {}, `${g.interval.toFixed(0)} s`), h('span', {}, 'interval')]),
        h('div', { class: 'stat' }, [h('b', {}, `${g.pctPop.toFixed(1)} %`), h('span', {}, 'in 5 min')]),
        h('div', { class: 'stat' }, [h('b', {}, `${Math.round(g.population)}`), h('span', {}, 'people')]),
      ]));
      liftBox.appendChild(h('p', { class: 'blurb pnote' },
        `${g.car.persons} rated, ${g.P} sized · round trip ${g.trip.rtt.toFixed(0)} s over ${g.trip.S.toFixed(1)} expected stops, reversing at floor ${g.trip.H.toFixed(1)}. ${g.criteria.note}`));
      for (const q of (g.parti || [])) {
        liftBox.appendChild(h('p', { class: 'blurb pstair' }, q.note));
      }
      const bad = (g.checks || []).filter((c) => !c.pass);
      for (const c of bad) {
        liftBox.appendChild(h('p', { class: 'blurb lfail' }, `${c.label}: ${c.value} — ${c.note}`));
      }
    },
    // `stats` is the planting schedule; `loads` says how much of it the frame
    // actually carries, which is the whole distinction between a roof garden
    // and a grove standing on the ground.
    setPlanting(planters, stats, loads) {
      greenBox.textContent = '';
      if (!stats || !stats.plants) {
        greenBox.appendChild(h('div', { class: 'sec' }, 'the planting'));
        greenBox.appendChild(h('p', { class: 'blurb pnote' },
          'nothing growing on this one — the substrate slider is at zero, or the massing left nowhere open to the sky.'));
        return;
      }
      greenBox.appendChild(h('div', { class: 'sec' }, 'the planting'));
      greenBox.appendChild(h('p', { class: 'pname' },
        `${stats.plants} plants over ${Math.round(stats.area)} m²`));
      greenBox.appendChild(h('div', { class: 'ltab' }, [
        h('div', { class: 'stat' }, [h('b', {}, `${Math.round(stats.substrate)} m³`), h('span', {}, 'substrate')]),
        h('div', { class: 'stat' }, [h('b', {}, `${Math.round(loads.carried)} t`), h('span', {}, 'carried')]),
        h('div', { class: 'stat' }, [h('b', {}, `${Math.round(loads.onGrade)} t`), h('span', {}, 'on grade')]),
      ]));
      greenBox.appendChild(h('p', { class: 'blurb pnote' },
        `Saturated, and carried for the life of the building — a metre of substrate is 16 kPa where an office floor carries 2.4, ` +
        `which is why planting is the load case that SIZES a slab rather than a finish applied to one. ` +
        `The ${Math.round(loads.onGrade)} t at grade is on the ground and costs the frame nothing.`));
      const byKind = new Map();
      for (const q of (planters || [])) {
        const e = byKind.get(q.label) || { label: q.label, n: 0, area: 0, depth: q.depth, note: q.note };
        e.n++; e.area += q.area;
        byKind.set(q.label, e);
      }
      for (const e of byKind.values()) {
        greenBox.appendChild(h('p', { class: 'blurb pstair' },
          `${e.label} — ${Math.round(e.area)} m² at ${Math.round(e.depth * 1000)} mm. ${e.note}`));
      }
      greenBox.appendChild(h('p', { class: 'blurb pnote' },
        stats.species.map((q) => `${q.count} × ${q.label}`).join(' · ')));
    },
    reload(next) { p = next; paint(); },
  };
}

export const PANEL_CSS = `
.panel .grp{display:flex;align-items:center;gap:8px;margin:8px 0}
.panel .k{flex:0 0 58px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft)}
.panel input[type=text]{flex:1 1 auto;min-width:0;background:#05050a;border:1px solid var(--line);color:var(--ink);
  border-radius:8px;padding:7px 9px;font:13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.panel input[type=text]:focus{outline:none;border-color:var(--accent)}
.panel select{flex:1 1 auto;min-width:0;background:#05050a;border:1px solid var(--line);color:var(--ink);
  border-radius:8px;padding:6px 7px;font:12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.panel select:focus{outline:none;border-color:var(--accent)}
.panel button{background:#12121c;border:1px solid var(--line);color:var(--ink);border-radius:8px;
  padding:6px 11px;font-size:12px;cursor:pointer;flex:0 0 auto}
.panel button:hover{border-color:var(--accent);color:var(--accent)}
.panel button.primary{background:var(--accent);border-color:var(--accent);color:#04121a;font-weight:700}
.panel button.primary:hover{filter:brightness(1.1);color:#04121a}
.panel button.tiny{padding:4px 8px;font-size:12px;line-height:1}
.panel .blurb{margin:6px 0 10px;font-size:11.5px;line-height:1.5;color:var(--soft)}
.panel .parti{margin:2px 0 10px;padding:8px 10px;border:1px solid var(--line);border-left:2px solid var(--accent);
  border-radius:0 8px 8px 0;background:#08080f}
.panel .parti .sec{margin:0 0 4px}
.panel .pname{margin:0 0 6px;font-size:13px;letter-spacing:.01em;color:var(--ink)}
.panel .parti .pnote{margin:0 0 6px}
.panel .parti .pnote:last-child{margin-bottom:0}
.panel .parti .pstair{margin:6px 0 0;padding-left:9px;border-left:1px solid var(--line);color:var(--accent);opacity:.85}
.panel .lifts{margin:0 0 10px;padding:8px 10px;border:1px solid var(--line);border-left:2px solid var(--accent);
  border-radius:0 8px 8px 0;background:#08080f}
.panel .lifts .sec{margin:0 0 4px}
.panel .lifts .pnote{margin:6px 0 0}
.panel .lifts .pstair{margin:6px 0 0;padding-left:9px;border-left:1px solid var(--line);color:var(--accent);opacity:.85}
.panel .ltab{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0 0}
.panel .lfail{margin:6px 0 0;padding-left:9px;border-left:2px solid #e2564a;color:#e2564a;opacity:.9}
.panel .rolltog{margin:2px 0 0}
.panel .rollnote{margin:6px 0 10px;padding-left:9px;border-left:2px solid var(--accent);opacity:.9}
.panel .rollnote:empty{display:none}
.panel .rollnote.bad{border-left-color:#e2564a;color:#e2564a}
.panel .cross{display:block;margin:0 0 12px;font-size:12px;color:var(--accent);text-decoration:none;
  border:1px dashed var(--accent);border-radius:8px;padding:7px 9px;text-align:center}
.panel .cross:hover{background:#39d6c81a}
.panel .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 4px}
.panel .stat{background:#0c0c14;border:1px solid var(--line);border-radius:8px;padding:6px 7px}
.panel .stat b{display:block;font-size:13px;font-variant-numeric:tabular-nums}
.panel .stat span{display:block;font-size:9.5px;color:var(--soft);letter-spacing:.04em;text-transform:uppercase}
.panel .sec{margin:14px 0 6px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);
  border-top:1px solid var(--line);padding-top:9px}
.panel .sysnote{margin:2px 0 10px;font-size:10.5px;line-height:1.45}
.panel .rhythm{display:flex;flex-wrap:wrap;gap:5px}
.panel .rhythm select.mod{flex:0 1 auto;width:auto;font-size:11px;padding:4px 5px}
.panel .slider{display:flex;align-items:center;gap:8px;margin:7px 0}
.panel .slider label{flex:0 0 92px;font-size:11px;color:var(--soft)}
.panel .slider .v{flex:0 0 52px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink)}
.panel input[type=range]{-webkit-appearance:none;appearance:none;flex:1 1 auto;min-width:0;height:4px;border-radius:3px;background:#26263a;outline:none}
.panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:var(--accent);cursor:pointer}
.panel input[type=range]::-moz-range-thumb{width:13px;height:13px;border:none;border-radius:50%;background:var(--accent);cursor:pointer}
.panel .toggles{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.panel .tog{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink);cursor:pointer}
.panel .btns{margin-top:12px;gap:6px}
`;

/* ─────────────────────── the mobile bottom sheet ────────────────────────── */
//
// On a phone there is no room for three floating panels beside a 3D view, and
// there is no hover to reveal them. What works is the pattern every map and
// music app has converged on: ONE sheet along the bottom edge, peeking by
// default so the content owns the screen, dragged up when you want to work,
// dragged down when you want to look.
//
// The panels are not duplicated for mobile — they are MOVED. Above the
// breakpoint they sit where they always did; below it the same DOM nodes are
// re-parented into the sheet, so there is exactly one seed input, one hazard
// select and one set of event handlers in the document at any time. Duplicating
// them is how a control ends up disagreeing with itself.

const SHEET_STATES = ['peek', 'open', 'full'];

export function mountSheet(panes, opts = {}) {
  const mq = window.matchMedia(opts.query || '(max-width: 760px)');
  const el = document.createElement('div');
  el.id = 'sheet';
  el.className = 'sheet';
  el.dataset.state = 'peek';
  el.innerHTML =
    '<div class="grab"><span class="bar"></span><div class="sum"></div></div>' +
    '<div class="tabs"></div><div class="body"></div>';
  document.body.appendChild(el);

  const grab = el.querySelector('.grab');
  const tabsEl = el.querySelector('.tabs');
  const bodyEl = el.querySelector('.body');
  const sumEl = el.querySelector('.sum');
  // where each pane lives when the sheet is not in use, so it can go home
  const home = panes.map((q) => ({ pane: q, parent: q.el.parentNode, next: q.el.nextSibling }));
  let active = panes[0].id;

  for (const q of panes) {
    q.el.classList.add('sheet-pane');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.pane = q.id;
    btn.textContent = q.label;
    btn.addEventListener('click', () => { show(q.id); if (el.dataset.state === 'peek') setState('open'); });
    tabsEl.appendChild(btn);
  }

  function show(id) {
    active = id;
    for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.pane === id);
    if (!mq.matches) return;
    bodyEl.textContent = '';
    const q = panes.find((x) => x.id === id);
    if (q) bodyEl.appendChild(q.el);
  }

  function setState(s) {
    el.dataset.state = s;
    document.body.classList.toggle('sheet-open', s !== 'peek');
    if (opts.onResize) requestAnimationFrame(opts.onResize);
  }

  // tap the handle to cycle peek → open → full → peek; drag it to aim
  let dragY = null, dragFrom = null, moved = 0;
  grab.addEventListener('pointerdown', (e) => {
    dragY = e.clientY; dragFrom = el.dataset.state; moved = 0;
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (dragY == null) return;
    moved = dragY - e.clientY;                    // up is positive
    el.style.setProperty('--drag', Math.max(-140, Math.min(240, moved)) + 'px');
  });
  const endDrag = () => {
    if (dragY == null) return;
    el.style.removeProperty('--drag');
    const i = SHEET_STATES.indexOf(dragFrom);
    if (moved > 45) setState(SHEET_STATES[Math.min(2, i + 1)]);
    else if (moved < -45) setState(SHEET_STATES[Math.max(0, i - 1)]);
    else setState(SHEET_STATES[(i + 1) % 3]);     // a tap cycles
    dragY = null;
  };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  function apply() {
    if (mq.matches) {
      show(active);
      document.body.classList.add('mobile');
    } else {
      // put every pane back exactly where it came from
      for (const q of home) {
        if (q.parent) q.parent.insertBefore(q.pane.el, q.next && q.next.parentNode === q.parent ? q.next : null);
      }
      bodyEl.textContent = '';
      document.body.classList.remove('mobile', 'sheet-open');
    }
    if (opts.onResize) requestAnimationFrame(opts.onResize);
  }
  mq.addEventListener('change', apply);
  apply();

  return {
    get mobile() { return mq.matches; },
    setSummary(html) { sumEl.innerHTML = html; },
    show, setState,
  };
}

export const SHEET_CSS = `
.sheet{display:none}
body.mobile .sheet{
  display:flex;flex-direction:column;position:fixed;left:0;right:0;bottom:0;z-index:40;
  background:var(--panel);border-top:1px solid var(--line);
  border-radius:16px 16px 0 0;backdrop-filter:blur(12px);
  box-shadow:0 -10px 40px #0009;
  height:calc(var(--h,56px) + var(--drag,0px));
  transition:height .18s cubic-bezier(.2,.8,.3,1);
  padding-bottom:env(safe-area-inset-bottom,0px);
}
body.mobile .sheet[data-state=peek]{--h:74px}
body.mobile .sheet[data-state=open]{--h:46vh}
body.mobile .sheet[data-state=full]{--h:86vh}
.sheet .grab{flex:0 0 auto;padding:8px 14px 6px;cursor:grab;touch-action:none;user-select:none}
.sheet .grab .bar{display:block;width:38px;height:4px;border-radius:3px;background:#4a4a60;margin:0 auto 6px}
.sheet .sum{font-size:11.5px;color:var(--soft);text-align:center;line-height:1.35;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sheet .sum b{color:var(--ink)}
.sheet .tabs{flex:0 0 auto;display:flex;gap:5px;padding:2px 12px 8px;overflow-x:auto}
.sheet .tabs button{flex:1 1 auto;background:#12121c;border:1px solid var(--line);color:var(--soft);
  border-radius:8px;padding:7px 6px;font-size:12px;cursor:pointer;white-space:nowrap}
.sheet .tabs button.on{border-color:var(--accent);color:var(--accent)}
.sheet .body{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 13px 16px}
body.mobile .sheet[data-state=peek] .tabs,
body.mobile .sheet[data-state=peek] .body{display:none}
/* Only ONE pane lives in the sheet at a time; the others stay parked in the
   document, and the page's own mobile rules have already stripped them of the
   position:fixed that was keeping them off-screen. So they must be hidden
   explicitly, or they lay out in normal flow behind the canvas — which showed
   up as a column of stray status dots floating over the model. */
body.mobile .sheet-pane{display:none!important}
body.mobile .sheet .body > .sheet-pane{display:block!important}
/* the panes lose their floating-panel chrome once they are inside the sheet */
body.mobile .sheet .body > *{position:static!important;width:auto!important;max-width:none!important;
  max-height:none!important;border:0!important;background:none!important;box-shadow:none!important;
  padding:0!important;backdrop-filter:none!important;border-radius:0!important;bottom:auto!important;
  right:auto!important;top:auto!important;left:auto!important;overflow:visible!important;display:block!important}
`;
