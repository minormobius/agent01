// app.js — the atlas. Wires the geometry, the data, the hierarchy and the
// regionaliser together; every piece of actual machinery lives in /lib.
//
// The one design decision worth stating up front: NOTHING intensive is stored.
// The data files hold stocks — dollars, people, jobs — and every rate you see
// is computed by packages/geohier at the level currently on screen. That is why
// switching from counties to superstates is instant and why the numbers are
// right: a superstate's per-capita income is its income over its population,
// not the average of its counties.

/* global ATLAS_CODEC, ATLAS_PROJ, ATLAS_SCALE, ATLAS_MAP, ATLAS_HIER, ATLAS_REGION, ATLAS_MEASURES, ATLAS_NAMES */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const M = ATLAS_MEASURES;
  const F = ATLAS_SCALE.FORMATS;

  const state = {
    scope: 'us',
    level: 'leaf',
    measure: 'rel_pcpi',
    method: 'jenks',
    classes: 7,
    k: 13,
    pull: 0.5,
    floor: 0.70, cohesion: 0.40, balance: 0.85, wbal: 0,
    theme: 'light',
    region: null,          // Int32Array over the US county ids
    regionNames: [],
    axes: ['rel_pcpi', 'transfer_share', 'dir_share', 'wage_share', 'proprietor_share',
           'gdp_per_job', 'domestic_migration_rate', 'natural_increase_rate',
           'jobs_per_capita', 'gdp_manufacturing_share'],
  };

  const store = {};        // scope → { topo, data, hier, places, adjacency, flows }
  let map = null;

  const jget = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' → ' + r.status); return r.json(); });

  // ------------------------------------------------------------- theme ----

  function readTheme() {
    const saved = (() => { try { return localStorage.getItem('atlas-theme'); } catch (e) { return null; } })();
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(t) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('atlas-theme', t); } catch (e) { /* private window */ }
    if (map) {
      map.theme = t;
      map.background = ATLAS_SCALE.PALETTE[t].surface;
      draw();
    }
  }

  // -------------------------------------------------------------- data ----

  async function loadScope(scope) {
    if (store[scope]) return store[scope];
    $('#loading').classList.remove('done');
    $('#loading').textContent = 'reading the boundary files…';

    const places = store._places || (store._places = await jget('/data/places.json'));

    if (scope === 'us') {
      // The coarse tier first: it is half the bytes and three times cheaper to
      // rasterise, so it is what the first paint uses. The full-detail tier
      // arrives behind it and takes over once the view settles above the LOD
      // zoom — see AtlasMap._pickLod.
      const [geoLo, data, adjacency, flows, resources] = await Promise.all([
        jget('/geo/us-counties-lo.json'), jget('/data/us-counties.json'),
        jget('/geo/adjacency.json'), jget('/data/migration.json'),
        jget('/data/resources.json').catch(() => null),
      ]);
      const topo = ATLAS_CODEC.unpack(geoLo);
      const hier = new ATLAS_HIER.Hierarchy(data, {
        noRollup: M.NO_ROLLUP,
        levels: [
          ATLAS_HIER.level({ id: 'state', label: 'State', of: (id) => id.slice(0, 5),
            name: (k) => (places[k] ? places[k].name : k) }),
          ATLAS_HIER.level({ id: 'region', label: 'Superstate', of: () => null }),
          ATLAS_HIER.level({ id: 'nation', label: 'United States', of: () => 'US', name: () => 'United States' }),
        ],
      });
      store[scope] = { topo, data, hier, places, adjacency, flows: flows.edges, label: 'counties', iso: 'US',
        resources: resources ? resources.values : null, resourceDoc: resources || null };
      upgradeDetail(scope, '/geo/us-counties.json');
    } else if (scope === 'mx') {
      const [geoLo, data] = await Promise.all([jget('/geo/mx-municipios-lo.json'), jget('/data/mx-municipios.json')]);
      const topo = ATLAS_CODEC.unpack(geoLo);
      const adjacency = store._adj || (store._adj = await jget('/geo/adjacency.json'));
      const hier = new ATLAS_HIER.Hierarchy(data, {
        noRollup: M.NO_ROLLUP,
        levels: [
          ATLAS_HIER.level({ id: 'state', label: 'Estado', of: (id) => (places[id] ? places[id].parent : null),
            name: (k) => (places[k] ? places[k].name : k) }),
          ATLAS_HIER.level({ id: 'region', label: 'Superstate', of: () => null }),
          ATLAS_HIER.level({ id: 'nation', label: 'Mexico', of: () => 'MX', name: () => 'Mexico' }),
        ],
      });
      store[scope] = { topo, data, hier, places, adjacency, flows: [], label: 'municipios', iso: 'MX' };
      upgradeDetail(scope, '/geo/mx-municipios.json');
    } else if (scope === 'ca') {
      const [geoLo, data] = await Promise.all([jget('/geo/ca-divisions-lo.json'), jget('/data/ca-divisions.json')]);
      const topo = ATLAS_CODEC.unpack(geoLo);
      const hier = new ATLAS_HIER.Hierarchy(data, {
        noRollup: M.NO_ROLLUP,
        levels: [
          ATLAS_HIER.level({ id: 'state', label: 'Province', of: (id) => (places[id] ? places[id].parent : null),
            name: (k) => (places[k] ? places[k].name : k) }),
          ATLAS_HIER.level({ id: 'nation', label: 'Canada', of: () => 'CA', name: () => 'Canada' }),
        ],
      });
      store[scope] = { topo, data, hier, places, adjacency: {}, flows: [], label: 'census divisions', iso: 'CA' };
      upgradeDetail(scope, '/geo/ca-divisions.json');
    } else {
      const [us, ca] = await Promise.all([loadScope('us'), loadScope('ca')]);
      const mx = await loadScope('mx');
      const [caribGeo, natGeo] = await Promise.all([jget('/geo/carib-districts.json'), jget('/geo/na-nations.json')]);
      store[scope] = {
        us, ca, mx, places,
        carib: ATLAS_CODEC.unpack(caribGeo),
        nations: ATLAS_CODEC.unpack(natGeo),
        label: 'counties, census divisions and island districts',
      };
    }
    return store[scope];
  }

  /**
   * Fetch the full-detail geometry in the background and hand it to the map as
   * the fine half of a LOD pair. Deliberately not awaited: the page is usable
   * on the coarse tier, and this only has to arrive before somebody zooms in.
   *
   * Both tiers come out of the same feature list in build-geo.mjs, so unit
   * index u means the same county in both and the fill array is shared.
   */
  function upgradeDetail(scope, url) {
    jget(url).then((doc) => {
      const S = store[scope];
      if (!S || S.topoHi) return;
      S.topoHi = ATLAS_CODEC.unpack(doc);
      if (S.topoHi.ids.length !== S.topo.ids.length) { S.topoHi = null; return; }
      if (state.scope === scope || (state.scope === 'na' && store.na)) rebuildLayers();
    }).catch(() => { /* the coarse tier is a complete map on its own */ });
  }

  // ------------------------------------------------------- the measure ----

  /** id -> row index for a scope's data file, built once and reused. */
  function dataIndex(S) {
    if (!S._at) {
      S._at = Object.create(null);
      S.data.ids.forEach((id, i) => { S._at[id] = i; });
    }
    return S._at;
  }

  /** Values for the current measure at the current level, plus the ids. */
  function currentValues(scope) {
    const S = store[scope === 'na' ? 'us' : scope];
    const m = M.BY_KEY[state.measure];
    if (!m) return { ids: [], values: [], m: null };
    const level = state.level;
    const r = S.hier.measure(m, level, S.data.current);
    return { ids: r.ids, values: r.values, m, refused: r.refused, level };
  }

  /**
   * Leaf-level fill for a level's values: a county is painted with the value of
   * whatever it belongs to. This is what makes the state and superstate views
   * keep the county borders underneath — you can see the seams the aggregation
   * is papering over, which is the point of having a hierarchy at all.
   */
  function fillIndex(scope) {
    const S = store[scope === 'na' ? 'us' : scope];
    const cur = currentValues(scope);
    const byId = new Map();
    cur.ids.forEach((id, i) => byId.set(id, cur.values[i]));

    const parentOf = (leafId) => {
      if (cur.level === 'leaf') return leafId;
      const lv = S.hier.levels.get(cur.level);
      return lv ? lv.of(leafId) : null;
    };

    // BEA's combined areas: show the pair's rate on both halves rather than a
    // hole, and let the tooltip say why.
    const combined = (S.data && S.data.combined) || {};
    const valueFor = (leafId) => {
      const p = parentOf(leafId);
      let v = p == null ? null : byId.get(p);
      if ((v == null || v === undefined) && cur.level === 'leaf' && combined[leafId]) v = byId.get(combined[leafId]);
      return v === undefined ? null : v;
    };
    return { cur, valueFor, parentOf };
  }

  // ------------------------------------------------------------- render ---

  let scale = null, fills = null;

  function recolour() {
    const S = store[state.scope === 'na' ? 'us' : state.scope];
    const { cur, valueFor } = fillIndex(state.scope);
    const m = cur.m;
    const leafIds = S.topo ? S.topo.ids : S.us.topo.ids;

    const shown = leafIds.map(valueFor);
    // Classify on the level's OWN values. Classifying on the painted counties
    // would weight every class by how many counties a state happens to contain,
    // so Texas's 254 counties would decide where a state map's breaks fall.
    const forBreaks = cur.level === 'leaf' ? shown : cur.values;
    scale = ATLAS_SCALE.makeScale(forBreaks, {
      method: state.method, classes: +state.classes,
      kind: m && m.kind === 'diverging' ? 'diverging' : 'sequential',
      center: m && m.center != null ? m.center : null,
      mode: state.theme,
    });
    fills = shown.map((v) => scale.colorOf(v));
    nationScaleCache.clear();
    state._shown = shown;
    state._valueFor = valueFor;
    state._cur = cur;
    drawLegend(m, cur);
    if (map) map.invalidateColors();
  }

  function draw() { if (map) map.draw(); }

  function drawLegend(m, cur) {
    const lg = $('#legend');
    if (!m) { lg.hidden = true; return; }
    lg.hidden = false;
    $('#lg-title').textContent = m.label;
    const S = store[state.scope === 'na' ? 'us' : state.scope];
    const vin = S.data && S.data.current ? S.data.current[m.num || m.den || m.stock] : null;
    const NOUNS = {
      us: ['counties', 'states'], ca: ['census divisions', 'provinces'],
      mx: ['municipios', 'estados'], na: ['counties, divisions and municipios', 'states and provinces'],
    };
    const nouns = NOUNS[state.scope] || NOUNS.us;
    const lvl = cur.level === 'leaf' ? nouns[0] : cur.level === 'state' ? nouns[1] : 'superstates';
    // Count the units AT THE DISPLAY LEVEL. `scale.n` counts painted counties,
    // which is the right denominator for the classification and the wrong one
    // for the caption — "3,225 superstates" was a real thing this said.
    const nShown = cur.values.filter((v) => v != null).length;
    $('#lg-sub').textContent = `${nShown.toLocaleString()} ${lvl} · ${state.method === 'jenks' ? 'natural breaks' : state.method} · ${vin ? vin : ''}`.trim();
    const fmt = F[m.format] || F.plain;
    $('#lg-ramp').innerHTML = scale.colors.map((c) => `<i style="background:${c}"></i>`).join('');
    const ticks = [scale.breaks[0], scale.breaks[Math.floor(scale.breaks.length / 2)], scale.max];
    $('#lg-ticks').innerHTML = ticks.map((v) => `<span>${fmt(v)}</span>`).join('');
    const nd = state._shown ? state._shown.filter((v) => v == null).length : 0;
    const ndEl = $('#lg-nd');
    // In the continental view the grey is not a gap in one country's data, it
    // is a whole country whose statistical agency does not publish this at all.
    // Saying "no figure published" there would read as a data failure.
    const foreign = state.scope === 'na' && m.nation
      ? ({ US: 'Canada and Mexico', CA: 'the United States and Mexico', MX: 'the United States and Canada' })[m.nation]
      : null;
    ndEl.hidden = nd === 0 && !foreign;
    if (!ndEl.hidden) {
      ndEl.querySelector('i').style.background = scale.palette.nodata;
      ndEl.querySelector('span').textContent = foreign
        ? `${foreign} in grey — no agency publishes this measure there`
        : `${nd.toLocaleString()} with no figure published`;
    }
  }

  // -------------------------------------------------------- superstates ---

  function computeRegions() {
    const S = store[state.scope === 'na' ? 'us' : state.scope];
    if (!S || !S.hier) return;
    const status = $('#region-status');
    status.textContent = 'growing regions…';

    const axes = state.axes.filter((k) => M.BY_KEY[k]);
    if (axes.length < 2) { status.textContent = 'pick at least two axes'; return; }
    const cols = ATLAS_REGION.standardize(axes.map((k) => S.hier.measure(M.BY_KEY[k], 'leaf', S.data.current).values));
    const centroids = {};
    for (const id of S.data.ids) { const p = S.places[id]; if (p && p.lon != null) centroids[id] = [p.lon, p.lat]; }
    const weights = S.data.series['pop:' + S.data.current.pop] || S.data.ids.map(() => 1);

    // The state each county belongs to. This is what "keep states whole" acts
    // on: cohesion prices a cut that falls INSIDE one of these.
    const groups = S.data.ids.map((id) => (S.places[id] ? S.places[id].parent : null));

    // Physical endowments to share out. Absent (Canada, Mexico) the terms
    // simply do not apply — skater drops resources with no values.
    // Water is a FLOOR — no region below `wbal` of its fair share — because as
    // a soft penalty it went backwards. Coast is carried along at minFrac 0 so
    // that it is measured and reported per region without steering anything;
    // every attempt to steer it failed. See packages/geohier/regionalize.js.
    const R = S.resources || {};
    const resources = [
      { name: 'water', minFrac: state.wbal, values: S.data.ids.map((id) => (R[id] && R[id].water_mgd) || 0) },
      { name: 'coast', minFrac: 0, values: S.data.ids.map((id) => (R[id] && R[id].coast_km) || 0) },
    ];
    const haveRes = resources.filter((r) => r.values.some((v) => v > 0));

    const t0 = performance.now();
    const res = ATLAS_REGION.skater({
      ids: S.data.ids, adjacency: S.adjacency, centroids, columns: cols,
      weights, flows: S.flows || [], flowPull: state.pull, k: state.k, minWeightFrac: state.floor,
      groups, cohesion: state.cohesion, balance: state.balance, resources: haveRes,
    });
    state.region = res.region;
    state.regionInfo = res;
    state.regionNames = ATLAS_NAMES.nameRegions(res.region, S.data.ids, centroids, weights);

    const at = Object.create(null);
    S.data.ids.forEach((id, i) => { at[id] = i; });
    S.hier.setLevel('region',
      (id) => { const i = at[id]; return i === undefined ? null : 'R' + res.region[i]; },
      (key) => state.regionNames[+key.slice(1)] || key);

    state.regionScope = state.scope === 'na' ? 'us' : state.scope;
    state.regionCentroids = ATLAS_NAMES.regionCentroids(res.region, S.data.ids, centroids, weights);
    // One member id per region, so a composite projection knows which block to
    // place the label in — a label for Alaska must be drawn in the Alaska inset.
    // Heaviest member per region, so a composite projection knows which block
    // to draw the label in. Tracking the weight directly rather than looking
    // the id back up: the previous version ran indexOf inside this loop, which
    // is 3,225 scans of a 3,225-element array of strings every redraw.
    state.regionAnchorId = [];
    const anchorW = [];
    for (let i = 0; i < S.data.ids.length; i++) {
      const g = res.region[i], w = weights[i] || 0;
      if (anchorW[g] === undefined || w > anchorW[g]) { anchorW[g] = w; state.regionAnchorId[g] = S.data.ids[i]; }
    }

    const ms = Math.round(performance.now() - t0);
    const pops = res.weights.map((w) => w / 1e6);
    const gi = res.groupIntegrity;
    const coastRes = (res.resources || []).find((r) => r.name === 'coast');
    const landlocked = coastRes ? coastRes.byRegion.filter((v) => !v).length : null;
    // Say what was achieved, not what was asked for. These are soft terms in a
    // greedy score and the honest report is the outcome.
    status.innerHTML = `${res.k} regions in ${ms} ms · `
      + `${Math.min(...pops).toFixed(1)}M–${Math.max(...pops).toFixed(1)}M people `
      + `(${(Math.max(...pops) / Math.min(...pops)).toFixed(1)}:1)`
      + (gi ? ` · ${gi.groupsSplit}/${gi.groups} states split, ${(gi.intact * 100).toFixed(0)}% of people kept with their state` : '')
      + (coastRes ? ` · ${coastRes.byRegion.length - landlocked}/${coastRes.byRegion.length} reach the sea` : '')
      + (res.cohesionEase != null && res.cohesionEase < 1 && state.cohesion > 0
          ? ` · states dialled back to ${(state.cohesion * res.cohesionEase).toFixed(2)} to hold the population floor` : '')
      + (res.minWeightFrac < state.floor - 1e-6 ? ` · floor relaxed to ${res.minWeightFrac.toFixed(2)}` : '')
      + ` · ${res.seaLinks.length} sea links`;
  }

  // ------------------------------------------------------------- panel ----

  /** Small helper for the non-leaf id lists, which are short (13 to 53). */
  const idxOf = (ids, key) => ids.indexOf(key);

  function openPanel(leafId) {
    const S = store[state.scope === 'na' ? 'us' : state.scope];
    const place = S.places[leafId];
    if (!place) return;
    const m = M.BY_KEY[state.measure];
    const fmt = F[m.format] || F.plain;

    const rows = [];
    const push = (levelId, label) => {
      const lv = S.hier.levels.get(levelId);
      if (!lv) return;
      const parent = lv.of(leafId);
      if (parent == null) return;
      const r = S.hier.measure(m, levelId, S.data.current);
      const i = idxOf(r.ids, parent);
      rows.push({ label, name: lv.name(parent), value: i >= 0 ? r.values[i] : null, refused: r.refused });
    };

    const leaf = S.hier.measure(m, 'leaf', S.data.current);
    const li = dataIndex(S)[leafId] ?? -1;
    let leafVal = li >= 0 ? leaf.values[li] : null;
    let combinedWith = null;
    if (leafVal == null && S.data.combined && S.data.combined[leafId] && S.data.combined[leafId] !== leafId) {
      const ci = dataIndex(S)[S.data.combined[leafId]] ?? -1;
      if (ci >= 0) { leafVal = leaf.values[ci]; combinedWith = S.places[S.data.combined[leafId]]; }
    }
    rows.push({ label: state.scope === 'ca' ? 'Division' : 'County', name: place.long || place.name, value: leafVal, self: true });
    push('state', state.scope === 'ca' ? 'Province' : 'State');
    if (state.region) push('region', 'Superstate');
    push('nation', 'Nation');

    const finite = rows.map((r) => r.value).filter((v) => v != null);
    const lo = Math.min(0, ...finite), hi = Math.max(...finite, 0) || 1;
    const frac = (v) => (v == null ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1))));

    // rank among the leaves
    const clean = leaf.values.map((v, i) => [v, i]).filter((x) => x[0] != null).sort((a, b) => b[0] - a[0]);
    const rank = clean.findIndex((x) => x[1] === li);

    const stat = (key) => {
      const r = S.hier.measure(M.BY_KEY[key], 'leaf', S.data.current);
      const i = dataIndex(S)[leafId];
      return i === undefined ? null : r.values[i];
    };

    const others = M.MEASURES.filter((x) => x.key !== m.key).map((x) => {
      const v = stat(x.key);
      return `<tr data-measure="${x.key}"><td>${x.label}</td><td class="n">${(F[x.format] || F.plain)(v)}</td></tr>`;
    }).join('');

    $('#panel-body').innerHTML = `
      <h2>${place.long || place.name}</h2>
      <div class="where">${place.iso === 'CA' ? 'Census division' : 'County or equivalent'}
        · ${(S.places[place.parent] || {}).name || place.parent || ''}
        ${place.area_km2 ? ' · ' + place.area_km2.toLocaleString() + ' km²' : ''}</div>

      <h3 style="font-size:13px;margin:0 0 7px">${m.label}</h3>
      <div class="ladder">
        ${rows.map((r) => `
          <div class="lr${r.self ? ' self' : ''}">
            <span class="lv">${r.label}</span>
            <span class="ln" title="${r.name}">${r.name}</span>
            <span class="lval">${r.refused ? '—' : fmt(r.value)}</span>
            <span class="bar"><i style="width:${(frac(r.value) * 100).toFixed(1)}%"></i></span>
          </div>`).join('')}
      </div>
      ${rank >= 0 ? `<div class="hint" style="margin:-8px 0 14px">Ranked ${(rank + 1).toLocaleString()} of ${clean.length.toLocaleString()} on this measure.</div>` : ''}
      ${combinedWith ? `<div class="hint" style="margin:-8px 0 14px;color:var(--warn)">The Bureau of Economic Analysis reports this place together with ${combinedWith.long || combinedWith.name}. The figure shown is for the combined area.</div>` : ''}
      ${rows.some((r) => r.refused) ? `<div class="hint" style="margin:-8px 0 14px">This measure is published as a rate, not as a total, so it cannot be rolled up. A median of medians is not a median.</div>` : ''}

      <h3 style="font-size:13px;margin:18px 0 5px">Everything else here</h3>
      <table class="tbl"><tbody>${others}</tbody></table>
    `;
    $('#panel-body').querySelectorAll('tr[data-measure]').forEach((tr) => {
      tr.addEventListener('click', () => { setMeasure(tr.dataset.measure); openPanel(leafId); });
    });
    $('#panel').classList.add('on');
  }

  function openRegionPanel() {
    const S = store[state.regionScope || 'us'];
    if (!state.region) return;
    const m = M.BY_KEY[state.measure];
    const fmt = F[m.format] || F.plain;
    const r = S.hier.measure(m, 'region', S.data.current);
    const pop = S.hier.rollup('pop:' + S.data.current.pop, 'region');
    const inc = S.hier.rollup('income:' + S.data.current.income, 'region');
    const rows = r.ids.map((id, i) => ({ id, i, name: state.regionNames[+id.slice(1)] || id, v: r.values[i],
      pop: pop.get(id), inc: inc.get(id) }))
      .sort((a, b) => (b.pop || 0) - (a.pop || 0));

    // One pass to find a representative county per region, rather than a
    // linear scan of every id for each of the thirteen rows.
    const swatch = new Map();
    {
      const of = S.hier.levels.get('region').of;
      for (const cid of S.data.ids) {
        const rk = of(cid);
        if (rk != null && !swatch.has(rk)) {
          const idx = S.topo.index[cid];
          if (idx != null) swatch.set(rk, fills ? fills[idx] : 'transparent');
        }
      }
    }
    const colOf = (id) => swatch.get(id) || 'transparent';

    // Water and coastline per region. Reported, never steered: the coast column
    // exists BECAUSE nothing could steer it, so at least the map can say which
    // superstates are landlocked instead of pretending the question was settled.
    const RI = state.regionInfo;
    const byName = (n) => (RI && RI.resources ? RI.resources.find((r) => r.name === n) : null);
    const wRes = byName('water'), cRes = byName('coast');
    const resHead = (wRes ? '<th class="n">Water</th>' : '') + (cRes ? '<th class="n">Coast</th>' : '');
    const resCell = (rid) => {
      const g = +rid.slice(1);
      let out = '';
      if (wRes) {
        const p = pop.get(rid);
        const perCap = p ? (wRes.byRegion[g] / p) * 1e6 : null;   // gal/day/person
        out += `<td class="n" title="${Math.round(wRes.byRegion[g]).toLocaleString()} Mgal/d withdrawn">`
          + (perCap ? Math.round(perCap).toLocaleString() : '—') + '</td>';
      }
      if (cRes) {
        const km = cRes.byRegion[g];
        out += `<td class="n">${km >= 1 ? Math.round(km).toLocaleString() + ' km' : '<span class="landlocked">inland</span>'}</td>`;
      }
      return out;
    };

    $('#panel-body').innerHTML = `
      <h2>Thirteen superstates</h2>
      <div class="where">Grown from ${state.axes.length} econometric axes over the county contiguity graph.
        Names are a separate, editable layer — click one to rename it.</div>
      <table class="tbl">
        <thead><tr><th>Region</th><th class="n">People</th><th class="n">${m.label}</th>${resHead}</tr></thead>
        <tbody>${rows.map((x) => `
          <tr data-region="${x.id}">
            <td><span class="sw" style="background:${colOf(x.id)}"></span><span class="rn" contenteditable="true" data-i="${x.id.slice(1)}">${x.name}</span></td>
            <td class="n">${x.pop ? (x.pop / 1e6).toFixed(1) + 'M' : '—'}</td>
            <td class="n">${fmt(x.v)}</td>${resCell(x.id)}
          </tr>`).join('')}</tbody>
      </table>
      <div class="hint" style="margin-top:12px">
        Axes in play: ${state.axes.map((k) => M.BY_KEY[k].label).join('; ')}.
        ${RI ? `Minimum region size ${RI.minWeightFrac.toFixed(2)} of an equal share.` : ''}
        ${RI && RI.groupIntegrity ? `Keeping states whole is set to ${state.cohesion.toFixed(2)}: ${RI.groupIntegrity.groupsSplit} of ${RI.groupIntegrity.groups} states are split, and ${(RI.groupIntegrity.intact * 100).toFixed(0)}% of people stay in the region most of their state went to.` : ''}
      </div>
      ${wRes ? `<div class="hint">Water is gallons a day withdrawn per person (USGS 2015) — <b>use, not supply</b>. A region fed by an inter-basin canal reads wet.</div>` : ''}
      ${cRes ? `<div class="hint">Coast is ocean frontage; the Great Lakes are not counted. This column is reported and not optimised — a floor on it, an absolute minimum, a penalty for stranding a region and a pull toward the water were all tried, and none moved the number of inland regions without wrecking the population balance. <a href="/method#regions">The working.</a></div>` : ''}
      ${state.regionInfo && state.regionInfo.seaLinks.length ? `<div class="hint">
        ${state.regionInfo.seaLinks.length} bridges were drawn across water so islands and Alaska could join a region at all:
        ${state.regionInfo.seaLinks.slice(0, 4).map((l) => `${(S.places[l.from] || {}).name || l.from} → ${(S.places[l.to] || {}).name || l.to} (${l.km.toLocaleString()} km)`).join('; ')}${state.regionInfo.seaLinks.length > 4 ? ', …' : ''}.
      </div>` : ''}
    `;
    $('#panel-body').querySelectorAll('.rn').forEach((el) => {
      el.addEventListener('blur', () => { state.regionNames[+el.dataset.i] = el.textContent.trim() || state.regionNames[+el.dataset.i]; });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
    $('#panel').classList.add('on');
  }

  // ---------------------------------------------------------- the map -----

  /** Region names, drawn on the map itself in superstate mode. */
  function overlay(ctx, mp) {
    if (state.level !== 'region' || !state.region) return;
    const S = store[state.regionScope || 'us'];
    if (!state.regionCentroids) return;
    const proj = mp.projection;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ink = state.theme === 'dark' ? '#ffffff' : '#0b0b0b';
    const halo = state.theme === 'dark' ? 'rgba(13,13,13,0.82)' : 'rgba(252,252,251,0.86)';
    state.regionCentroids.forEach((c, g) => {
      if (!c) return;
      const nearest = state.regionAnchorId[g];
      const region = proj.composite ? proj.regionOf(nearest || '') : null;
      const p = proj(c[0], c[1], region);
      const x = p[0] * mp.zoom + mp.ox, y = p[1] * mp.zoom + mp.oy;
      if (x < 8 || y < 8 || x > mp.width - 8 || y > mp.height - 8) return;
      const label = state.regionNames[g] || 'Region ' + (g + 1);
      ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
      const w = ctx.measureText(label).width;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.roundRect(x - w / 2 - 6, y - 11, w + 12, 22, 6);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.fillText(label, x, y);
    });
    ctx.restore();
  }

  function buildMap() {
    const canvas = $('#map');
    map = new ATLAS_MAP.AtlasMap(canvas, {
      theme: state.theme,
      meshWorker: '/lib/mesh-worker.js',
      background: ATLAS_SCALE.PALETTE[state.theme].surface,
      onhover: showTip,
      onclick: (hit) => {
        tip.classList.remove('on');
        if (!hit) { $('#panel').classList.remove('on'); return; }
        if (state.level === 'region') openRegionPanel(); else openPanel(hit.id);
      },
    });
    map.overlay = overlay;
    window.addEventListener('resize', () => map.resize());
    $('#zoom-in').onclick = () => { map.zoom = Math.min(60, map.zoom * 1.5); map.ox = map.width / 2 - (map.width / 2 - map.ox) * 1.5; map.oy = map.height / 2 - (map.height / 2 - map.oy) * 1.5; map.draw(); };
    $('#zoom-out').onclick = () => { const f = 1 / 1.5; map.zoom = Math.max(0.6, map.zoom * f); map.ox = map.width / 2 - (map.width / 2 - map.ox) * f; map.oy = map.height / 2 - (map.height / 2 - map.oy) * f; map.draw(); };
    $('#reset').onclick = () => map.fit(currentBBox());
  }

  function currentBBox() {
    if (state.scope === 'ca') return [-141, 41.5, -52, 71];
    if (state.scope === 'mx') return [-118.5, 14.4, -86.7, 32.8];
    if (state.scope === 'na') return [-168, 7, -52, 72];
    return null;                        // albersUsa fits itself
  }

  function projectionFor() {
    if (state.scope === 'us') return ATLAS_PROJ.albersUsa();
    // Equal-area everywhere. The Mexican frame uses parallels through the
    // country rather than continental ones, so Chiapas and Chihuahua stay
    // comparable in area to each other rather than to Nunavut.
    if (state.scope === 'mx') return ATLAS_PROJ.make(ATLAS_PROJ.conicEqualAreaRaw(17.5 * Math.PI / 180, 29.5 * Math.PI / 180), { rotate: 102, center: [0, 23.5], scale: 1600 });
    return ATLAS_PROJ.albersNorthAmerica();
  }

  function rebuildLayers() {
    const proj = projectionFor();
    map.layers = [];
    map.projection = proj;

    const groupOf = (id) => {
      if (state.level === 'region' && state.region && state.regionScope === (state.scope === 'na' ? 'us' : state.scope)) {
        const S = store[state.regionScope];
        const i = dataIndex(S)[id];
        return i === undefined ? 'x' : 'R' + state.region[i];
      }
      if (state.level === 'state') return id.slice(0, 5);
      return id.slice(0, 5);            // county view still shows state lines
    };

    const P = ATLAS_SCALE.PALETTE[state.theme];
    const border = state.theme === 'dark'
      ? { interiorColor: 'rgba(255,255,255,0.13)', groupColor: 'rgba(255,255,255,0.5)', outerColor: 'rgba(255,255,255,0.72)' }
      : { interiorColor: 'rgba(11,11,11,0.12)', groupColor: 'rgba(11,11,11,0.5)', outerColor: 'rgba(11,11,11,0.72)' };

    if (state.scope === 'na') {
      const S = store.na;
      map.addLayer(S.nations, { id: 'nations', kind: 'outline', order: 0,
        stroke: state.theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(11,11,11,0.16)', strokeWidth: 0.8, interactive: false });
      // Each nation is painted from its OWN agency's data on its own scale, so
      // the continental view is three honest maps sharing a frame rather than
      // one map pretending three statistical systems are commensurable.
      for (const [key, order] of [['us', 1], ['ca', 2], ['mx', 3]]) {
        const N = S[key];
        const nScale = nationScale(key);
        map.addLayer(N.topo, {
          id: key, order, borderStyle: border,
          groupOf: key === 'us' ? groupOf : (id) => (S.places[id] ? S.places[id].parent : 'x'),
          fillOf: (unitId) => nScale(unitId),
        });
      }
      map.addLayer(S.carib, { id: 'carib', kind: 'fill', order: 4, groupOf: (id) => id.split(':')[0],
        fillOf: () => P.nodata, borderStyle: border, interactive: false });
    } else {
      const S = store[state.scope];
      addFillLayer(S.topo, state.scope, state.scope === 'us' ? groupOf : (id) => (S.places[id] ? S.places[id].parent : 'x'), border, 1, S.topoHi);
    }

    map.resize();
    map.fit(currentBBox());
  }

  function addFillLayer(topo, id, groupOf, border, order, topoHi) {
    const key = state.level + ':' + (state.regionInfo ? state.regionInfo.cuts.length : 0);
    const mk = (t, suffix, tier) => {
      const L = map.addLayer(t, {
        id: id + suffix, order, groupOf, borderStyle: border,
        fillOf: (unitId, u) => (fills ? fills[u] : '#ccc'),
      });
      L.groupKey = key;
      L.lodGroup = id;
      L.tier = tier;
      return L;
    };
    const lo = mk(topo, '', 'lo');
    if (topoHi) mk(topoHi, ':hi', 'hi');
    return lo;
  }

  /**
   * A colour function for one nation in the continental view: its own measure,
   * its own classification. Cached per redraw so switching measures does not
   * reclassify three countries on every frame.
   */
  const nationScaleCache = new Map();
  function nationScale(key) {
    const cacheKey = key + '|' + state.measure + '|' + state.method + '|' + state.classes + '|' + state.theme + '|' + state.level;
    if (nationScaleCache.has(cacheKey)) return nationScaleCache.get(cacheKey);
    const S = store.na[key];
    const iso = key.toUpperCase();
    const m = M.BY_KEY[state.measure];
    const P = ATLAS_SCALE.PALETTE[state.theme];
    let fn = () => P.nodata;
    if (m && (!m.nation || m.nation === iso)) {
      const level = state.level === 'region' && key !== state.regionScope ? 'leaf' : state.level;
      const r = S.hier.measure(m, level === 'region' && key !== state.regionScope ? 'leaf' : level, S.data.current);
      const byId = new Map();
      r.ids.forEach((id, i) => byId.set(id, r.values[i]));
      const sc = ATLAS_SCALE.makeScale(r.values, {
        method: state.method, classes: +state.classes,
        kind: m.kind === 'diverging' ? 'diverging' : 'sequential',
        center: m.center != null ? m.center : null, mode: state.theme,
      });
      const lv = level === 'leaf' ? null : S.hier.levels.get(level);
      fn = (unitId) => sc.colorOf(byId.get(lv ? lv.of(unitId) : unitId));
    }
    nationScaleCache.set(cacheKey, fn);
    return fn;
  }

  // --------------------------------------------------------------- tip ----

  const tip = $('#tip');
  function showTip(hit, ev) {
    if (!hit || !ev) { tip.classList.remove('on'); return; }
    const S = store[state.scope === 'na' ? 'us' : state.scope];
    const place = S.places[hit.id];
    if (!place) { tip.classList.remove('on'); return; }
    const m = M.BY_KEY[state.measure];
    const fmt = F[m.format] || F.plain;

    let body;
    if (state.level === 'region' && state.region) {
      const i = dataIndex(S)[hit.id];
      const key = i === undefined ? null : 'R' + state.region[i];
      const name = key ? (state.regionNames[+key.slice(1)] || key) : '—';
      const r = S.hier.measure(m, 'region', S.data.current);
      const ri = r.ids.indexOf(key);
      body = `<div class="t-name">${name}</div><div class="t-sub">${place.name} · ${(S.places[place.parent] || {}).name || ''}</div>
              <div class="t-val">${fmt(ri >= 0 ? r.values[ri] : null)}</div><div class="t-rank">${m.label}</div>`;
    } else {
      const v = state._valueFor ? state._valueFor(hit.id) : null;
      const sub = state.level === 'state'
        ? ((S.places[place.parent] || {}).name || '')
        : `${(S.places[place.parent] || {}).name || ''}`;
      body = `<div class="t-name">${place.long || place.name}</div><div class="t-sub">${sub}</div>
              <div class="t-val">${fmt(v)}</div><div class="t-rank">${m.label}</div>`;
      if (v == null) body += `<div class="t-note">No figure published for this ${state.scope === 'ca' ? 'division' : 'county'}.</div>`;
    }
    tip.innerHTML = body;
    tip.classList.add('on');
    const pad = 14;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(ev.clientX + pad, innerWidth - r.width - 8) + 'px';
    tip.style.top = Math.min(ev.clientY + pad, innerHeight - r.height - 8) + 'px';
  }

  // ------------------------------------------------------------- chrome ---

  const isoOf = (scope) => (scope === 'ca' ? 'CA' : scope === 'mx' ? 'MX' : 'US');

  function buildMeasurePicker() {
    // Only offer what the scope's own statistical agency publishes. Offering a
    // U.S. transfer share on a Mexican municipio would draw a grey map and
    // imply the number exists somewhere.
    const iso = isoOf(state.scope);
    const list = M.forNation(iso);
    if (!list.some((m) => m.key === state.measure)) state.measure = list[0].key;
    const groups = [...new Set(list.map((m) => m.group))];

    const sel = $('#measure');
    sel.innerHTML = groups.map((g) =>
      `<optgroup label="${g}">${list.filter((m) => m.group === g)
        .map((m) => `<option value="${m.key}"${m.key === state.measure ? ' selected' : ''}>${m.label}</option>`).join('')}</optgroup>`).join('');
    sel.onchange = () => setMeasure(sel.value);

    const axes = list.filter((m) => m.axis);
    state.axes = state.axes.filter((k) => axes.some((m) => m.key === k));
    if (state.axes.length < 2) state.axes = axes.slice(0, Math.min(8, axes.length)).map((m) => m.key);
    $('#axes').innerHTML = groups.map((g) => {
      const rows = axes.filter((m) => m.group === g);
      return rows.length ? `<div class="grp">${g}</div>` + rows.map((m) =>
        `<label><input type="checkbox" value="${m.key}"${state.axes.includes(m.key) ? ' checked' : ''}><span>${m.label}</span></label>`).join('') : '';
    }).join('');
    $('#axes').onchange = () => {
      state.axes = [...$('#axes').querySelectorAll('input:checked')].map((i) => i.value);
      $('#redraw').disabled = state.axes.length < 2;
    };
  }

  function setMeasure(key) {
    state.measure = key;
    $('#measure').value = key;
    const m = M.BY_KEY[key];
    $('#measure-note').textContent = m.note || '';
    recolour(); draw();
  }

  function seg(id, key, after) {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...el.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      state[key] = b.dataset[key];
      after();
    });
  }

  async function setScope() {
    $('#loading').classList.remove('done');
    await loadScope(state.scope);
    // Canada's measures are published rates, so there are no stocks to grow
    // regions from; the superstate controls are hidden rather than broken.
    const canRegion = state.scope !== 'ca';
    $('#region-controls').style.display = canRegion ? '' : 'none';
    $('#level').querySelector('button[data-level="region"]').style.display = canRegion ? '' : 'none';
    if (!canRegion && state.level === 'region') {
      state.level = 'leaf';
      [...$('#level').querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.level === 'leaf')));
    }
    buildMeasurePicker();
    state.region = null;
    if (state.level === 'region') computeRegions();
    setMeasure(state.measure);            // also refreshes the measure's note
    rebuildLayers();
    $('#loading').classList.add('done');
  }

  function setLevel() {
    if (state.level === 'region' && !state.region) computeRegions();
    recolour();
    rebuildLayers();
    if (state.level === 'region') openRegionPanel();
  }

  // --------------------------------------------------------------- boot ---

  async function boot() {
    applyTheme(readTheme());
    $('#theme').onclick = () => applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    buildMeasurePicker();
    buildMap();

    $('#method').onchange = (e) => { state.method = e.target.value; recolour(); draw(); };
    $('#classes').onchange = (e) => { state.classes = +e.target.value; recolour(); draw(); };
    $('#k').oninput = (e) => { state.k = +e.target.value; $('#k-val').textContent = state.k; };
    $('#pull').oninput = (e) => { state.pull = +e.target.value / 100; $('#pull-val').textContent = state.pull.toFixed(2); };
    $('#floor').oninput = (e) => { state.floor = +e.target.value / 100; $('#floor-val').textContent = state.floor.toFixed(2); };
    for (const [id, key] of [['cohesion', 'cohesion'], ['balance', 'balance'], ['wbal', 'wbal']]) {
      const el = $('#' + id);
      if (!el) continue;
      el.oninput = (e) => { state[key] = +e.target.value / 100; $('#' + id + '-val').textContent = state[key].toFixed(2); };
    }
    $('#redraw').onclick = () => {
      computeRegions();
      if (state.level !== 'region') {
        state.level = 'region';
        [...$('#level').querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.level === 'region')));
      }
      recolour(); rebuildLayers(); openRegionPanel();
    };
    $('#panel-close').onclick = () => $('#panel').classList.remove('on');
    seg('scope', 'scope', setScope);
    seg('level', 'level', setLevel);

    await loadScope('us');
    $('#loading').textContent = 'growing the superstates…';
    computeRegions();
    setMeasure(state.measure);
    rebuildLayers();
    $('#loading').classList.add('done');
    window.__map = map;      // handle for the perf harness and the console
    window.__ready = true;
  }

  boot().catch((e) => {
    console.error(e);
    $('#loading').textContent = 'could not load the atlas: ' + e.message;
    window.__error = String(e);
  });
})();
