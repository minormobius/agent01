// jog/app.js — the page: geocoding, the map, and drawing what solver.js finds.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const M_PER = { km: 1000, mi: 1609.344 };
  const COLORS = ['#0f766e', '#7c3aed', '#db2777', '#2563eb', '#ca8a04', '#059669', '#dc2626', '#0891b2', '#9333ea', '#65a30d', '#c2410c', '#4f46e5'];

  // ------------------------------------------------------------------ map --
  const map = L.map('map', { zoomControl: true }).setView([40.7128, -74.006], 13);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  let home = null;        // { lat, lon, label }
  let homeMarker = null;
  const layer = L.layerGroup().addTo(map), markers = L.layerGroup().addTo(map);
  let loops = [], selected = -1;

  function setHome(lat, lon, label) {
    home = { lat, lon, label };
    if (homeMarker) homeMarker.remove();
    homeMarker = L.marker([lat, lon], { icon: L.divIcon({ className: 'home', iconSize: [16, 16] }), keyboard: false, zIndexOffset: 1000 }).addTo(map);
    if (label != null) $('q').value = label;
  }

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    setHome(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    run();
  });

  $('locate').onclick = () => {
    if (!navigator.geolocation) return status('This browser has no location access.', true);
    status('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setHome(p.coords.latitude, p.coords.longitude, 'My location'); map.setView([home.lat, home.lon], 15); run(); },
      () => status('Location was refused — type an address instead.', true),
      { enableHighAccuracy: true, timeout: 10000 });
  };

  // -------------------------------------------------------------- geocode --
  async function geocode(q) {
    const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return { lat: +m[1], lon: +m[2], label: q.trim() };
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
    if (!r.ok) throw new Error(`The address lookup answered ${r.status}.`);
    const j = await r.json();
    if (!j.length) throw new Error('Couldn’t find that address. Try adding the town, or tap the map.');
    return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name };
  }

  // --------------------------------------------------------------- solver --
  let worker = null, jobId = 0;
  function getWorker() {
    if (!worker) worker = new Worker('solver.js');
    return worker;
  }

  function status(msg, err) {
    $('status').textContent = msg || '';
    $('status').classList.toggle('err', !!err);
  }
  function busy(on, frac) {
    $('state').classList.toggle('busy', on);
    $('go').disabled = on;
    if (frac != null) document.querySelector('.bar i').style.width = (frac * 100).toFixed(0) + '%';
  }

  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!home || q !== home.label) {
      busy(true, 0); status('Looking up the address…');
      try {
        const h = await geocode(q);
        setHome(h.lat, h.lon, null);
        home.label = q;
      } catch (err) { busy(false); return status(err.message, true); }
    }
    run();
  });

  function run() {
    if (!home) return;
    // 25 km is the ceiling: past it the street download around a city outgrows
    // what the public Overpass servers will hand one browser.
    const unit = $('unit').value, d = Math.max(0.5, Math.min(25 * M_PER.km / M_PER[unit], +$('dist').value || 5));
    const target = d * M_PER[unit];
    const tol = +$('tol').value, trails = $('trails').checked;
    saveHash();
    const id = ++jobId;
    layer.clearLayers(); markers.clearLayers(); $('results').innerHTML = ''; loops = []; selected = -1;
    map.setView([home.lat, home.lon], zoomFor(target));
    busy(true, 0); status('Starting…');
    const w = getWorker();
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.id !== jobId) return;
      if (m.stage === 'error') { busy(false); return status(m.error, true); }
      if (m.stage === 'solve' && m.progress != null) {
        busy(true, m.progress);
        if (m.note) status(m.note);
        else status(`Searching… ${m.count} loop${m.count === 1 ? '' : 's'} so far`);
        return;
      }
      if (m.note) { status(m.note); return; }
      if (m.stage === 'done') { busy(false); show(m.result, target, unit, tol); }
    };
    w.onerror = (e) => { busy(false); status('The route finder crashed: ' + (e.message || 'unknown error'), true); };
    w.postMessage({ id, lat: home.lat, lon: home.lon, target, tol, trails });
  }

  function zoomFor(target) { return target < 3000 ? 15 : target < 7000 ? 14 : target < 15000 ? 13 : 12; }

  // ---------------------------------------------------------------- draw --
  const fmt = (m, unit) => (m / M_PER[unit]).toFixed(2) + ' ' + unit;

  function offBy(len, target, unit) {
    const d = (len - target) / M_PER[unit];
    return Math.abs(d) < 0.005 ? 'on target' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} ${unit} from target`;
  }

  function show(res, target, unit, tol) {
    if (res.error) return status(res.error, true);
    loops = res.loops;
    if (!loops.length) return status('No loops found. Try a longer distance, a looser tolerance, or a start nearer some streets.', true);
    const near = res.start.snapped > 60 ? ` Starting from the nearest path, ${Math.round(res.start.snapped)} m away.` : '';
    status(res.approximate
      ? `Nothing landed within ±${tol * 100}% — here are the closest.${near}`
      : `${loops.length} distinct loop${loops.length === 1 ? '' : 's'} from ${res.tried} tried.${near}`, res.approximate);
    const ol = $('results');
    loops.forEach((l, i) => {
      l.color = COLORS[i % COLORS.length];
      l.line = L.polyline(l.coords, { color: l.color, weight: 3, opacity: 0.35 }).addTo(layer);
      l.line.on('click', (e) => { L.DomEvent.stopPropagation(e); select(i); });
      const li = document.createElement('li');
      li.className = 'loop'; li.tabIndex = 0;
      const tags = [];
      if (l.offroad > 0.4) tags.push(`${Math.round(l.offroad * 100)}% paths`);
      if (l.overlap > 0.02) tags.push(`${Math.round(l.overlap * 100)}% retraced`); else tags.push('no retracing');
      tags.push(l.round > 0.55 ? 'round' : l.round > 0.3 ? 'loop' : 'long & thin');
      tags.push('heads ' + compass(l.coords));
      li.innerHTML = `${thumb(l)}<div><div class="d">${fmt(l.len, unit)}</div>
        <div class="m">${offBy(l.len, target, unit)}</div>
        <div class="tags">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div></div>
        <button class="gpx" type="button" title="Download as GPX">GPX</button>`;
      li.onclick = () => select(i);
      li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } };
      li.querySelector('.gpx').onclick = (e) => { e.stopPropagation(); gpx(l, unit, i); };
      ol.appendChild(li);
      l.li = li;
    });
    select(0, unit);
  }

  function select(i, unitArg) {
    const unit = unitArg || $('unit').value;
    selected = i;
    markers.clearLayers();
    loops.forEach((l, j) => {
      l.line.setStyle(j === i ? { weight: 6, opacity: 0.95 } : { weight: 3, opacity: 0.3 });
      l.li.classList.toggle('on', j === i);
    });
    const l = loops[i];
    l.line.bringToFront();
    // A marker at each whole km/mi, numbered — doubles as the direction of travel.
    const step = M_PER[unit];
    let acc = 0, next = step, n = 1;
    for (let k = 1; k < l.coords.length; k++) {
      const a = l.coords[k - 1], b = l.coords[k];
      const seg = map.distance(a, b);
      while (acc + seg >= next && next < l.len - step * 0.25) {
        const t = (next - acc) / seg;
        L.marker([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], {
          icon: L.divIcon({ className: 'km', html: String(n), iconSize: [20, 20] }), interactive: false, keyboard: false,
        }).addTo(markers);
        next += step; n++;
      }
      acc += seg;
    }
    map.fitBounds(l.line.getBounds(), { padding: [30, 30], maxZoom: 16 });
  }

  function thumb(l) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const k = Math.cos(l.coords[0][0] * Math.PI / 180);
    const pts = l.coords.map(([la, lo]) => [lo * k, -la]);
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const s = 48 / Math.max(x1 - x0, y1 - y0, 1e-9);
    const ox = (56 - (x1 - x0) * s) / 2, oy = (56 - (y1 - y0) * s) / 2;
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - x0) * s).toFixed(1)} ${(oy + (y - y0) * s).toFixed(1)}`).join('');
    const [hx, hy] = pts[0];
    return `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="${d}" fill="none" stroke="${l.color}" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="${(ox + (hx - x0) * s).toFixed(1)}" cy="${(oy + (hy - y0) * s).toFixed(1)}" r="3.5" fill="var(--hot)"/></svg>`;
  }

  // Which way the loop goes, by where its far half sits from home.
  function compass(c) {
    let la = 0, lo = 0;
    for (const p of c) { la += p[0]; lo += p[1]; }
    la = la / c.length - c[0][0]; lo = (lo / c.length - c[0][1]) * Math.cos(c[0][0] * Math.PI / 180);
    const deg = (Math.atan2(lo, la) * 180 / Math.PI + 360) % 360;
    return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(deg / 45) % 8];
  }

  function gpx(l, unit, i) {
    const name = `jog loop ${i + 1} — ${fmt(l.len, unit)}`;
    const esc = (s) => s.replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="jog.mino.mobi" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(name)}</name></metadata>
<trk><name>${esc(name)}</name><trkseg>
${l.coords.map(([a, b]) => `<trkpt lat="${a}" lon="${b}"/>`).join('\n')}
</trkseg></trk>
</gpx>`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `jog-${(l.len / M_PER[unit]).toFixed(1)}${unit}-${i + 1}.gpx` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------- permalink --
  // #q=<address>&d=5&u=km  — or #at=lat,lon&d=…  so a search can be shared.
  function saveHash() {
    const p = new URLSearchParams();
    if (home.label && !/^My location$/.test(home.label)) p.set('q', home.label); else p.set('at', `${home.lat.toFixed(5)},${home.lon.toFixed(5)}`);
    p.set('d', $('dist').value); p.set('u', $('unit').value);
    if ($('tol').value !== '0.1') p.set('tol', $('tol').value);
    if ($('trails').checked) p.set('trails', '1');
    history.replaceState(null, '', '#' + p.toString());
  }
  function loadHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('d')) $('dist').value = p.get('d');
    if (p.get('u') && M_PER[p.get('u')]) $('unit').value = p.get('u');
    if (p.get('tol')) $('tol').value = p.get('tol');
    if (p.get('trails')) $('trails').checked = true;
    if (p.get('q')) { $('q').value = p.get('q'); $('f').requestSubmit(); }
    else if (p.get('at')) {
      const [a, b] = p.get('at').split(',').map(Number);
      if (isFinite(a) && isFinite(b)) { setHome(a, b, `${a}, ${b}`); run(); }
    } else if ((navigator.language || '').endsWith('-US')) $('unit').value = 'mi';
  }
  loadHash();
})();
