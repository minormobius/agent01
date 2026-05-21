import { readPhotoMeta } from './exif.js';
import { analyze, symbolicTags } from './astro/analyze.js';
import { renderBeautyCard, exportCardPng, formatStamp } from './card.js';

const state = {
  photos: [],          // { id, file, imageUrl, meta, reading }
  fallbackLocation: null,
  sortKey: 'time',
  group: true,
};

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('empty-state');
const controls = document.getElementById('controls');
const locationBar = document.getElementById('location-bar');
const locInput = document.getElementById('loc-input');
const locDetect = document.getElementById('loc-detect');
const locStatus = document.getElementById('loc-status');
const sortSel = document.getElementById('sort-key');
const groupTog = document.getElementById('group-toggle');
const clearBtn = document.getElementById('clear-btn');
const modal = document.getElementById('card-modal');
const modalBody = document.getElementById('card-modal-body');
const exportBtn = document.getElementById('export-btn');
const shareBtn = document.getElementById('share-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

let activePhotoId = null;

// --- file ingestion ---
function bindFileEvents() {
  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    fileInput.click();
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) handleFiles(files);
  });
}

async function handleFiles(files) {
  emptyState.hidden = true;
  controls.hidden = false;
  locationBar.hidden = false;
  for (const file of files) {
    const id = crypto.randomUUID();
    const imageUrl = URL.createObjectURL(file);
    let meta, reading;
    try {
      meta = await readPhotoMeta(file);
    } catch (err) {
      meta = { date: null, location: null, hasExif: false, camera: '' };
    }
    const effectiveLoc = meta.location || state.fallbackLocation;
    if (meta.date) {
      reading = analyze(meta.date, effectiveLoc);
    }
    state.photos.push({ id, file, imageUrl, meta, reading });
  }
  render();
}

// --- rendering ---
function render() {
  gallery.innerHTML = '';
  if (state.photos.length === 0) {
    emptyState.hidden = false;
    controls.hidden = true;
    locationBar.hidden = true;
    return;
  }
  const sorted = [...state.photos].sort(comparator(state.sortKey));
  if (state.group && state.sortKey !== 'time') {
    const groups = groupBy(sorted, photo => groupKeyFor(photo, state.sortKey));
    for (const [key, photos] of groups) {
      const section = document.createElement('section');
      section.className = 'group-section';
      const header = document.createElement('h2');
      header.className = 'group-header';
      header.innerHTML = `${groupHeaderHtml(key, photos[0], state.sortKey)} <span class="count">${photos.length}</span>`;
      section.appendChild(header);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const p of photos) grid.appendChild(thumbCard(p));
      section.appendChild(grid);
      gallery.appendChild(section);
    }
  } else {
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const p of sorted) grid.appendChild(thumbCard(p));
    gallery.appendChild(grid);
  }
}

function thumbCard(photo) {
  const card = document.createElement('article');
  card.className = 'card';
  if (!photo.reading) card.classList.add('no-exif');
  card.addEventListener('click', () => openModal(photo.id));

  const img = document.createElement('div');
  img.className = 'card-img';
  img.style.backgroundImage = `url(${photo.imageUrl})`;
  card.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  if (photo.reading) {
    const r = photo.reading;
    const dayLine = document.createElement('div');
    dayLine.className = 'row';
    dayLine.innerHTML = `<span><span class="glyph">${r.planetaryDay.glyph}</span>${r.planetaryDay.name}</span>`
      + (r.planetaryHour ? `<span class="tag ${r.planetaryHour.planet.color}">hour ${r.planetaryHour.planet.glyph}</span>` : '');
    meta.appendChild(dayLine);
    const signsLine = document.createElement('div');
    signsLine.className = 'row';
    signsLine.innerHTML = `<span><span class="glyph">${r.sunSign.glyph}</span>${r.sunSign.name}</span>`
      + `<span><span class="glyph">${r.moonSign.glyph}</span>${r.moonSign.name}</span>`;
    meta.appendChild(signsLine);
    const phaseLine = document.createElement('div');
    phaseLine.className = 'row';
    phaseLine.innerHTML = `<span><span class="glyph">${r.moonPhase.glyph}</span>${r.moonPhase.name}</span>`;
    meta.appendChild(phaseLine);
  } else {
    meta.innerHTML = `<div class="row"><span>no EXIF timestamp</span></div>`;
  }
  card.appendChild(meta);
  return card;
}

// --- sorting / grouping ---
function comparator(key) {
  return (a, b) => {
    if (!a.reading && !b.reading) return 0;
    if (!a.reading) return 1;
    if (!b.reading) return -1;
    switch (key) {
      case 'planetaryDay':
        return weekdayOrder(a.meta.date) - weekdayOrder(b.meta.date)
          || a.meta.date - b.meta.date;
      case 'planetaryHour':
        return planetIdx(a.reading.planetaryHour?.planetKey) - planetIdx(b.reading.planetaryHour?.planetKey)
          || a.meta.date - b.meta.date;
      case 'sunSign':
        return a.reading.sunSign.index - b.reading.sunSign.index || a.meta.date - b.meta.date;
      case 'moonSign':
        return a.reading.moonSign.index - b.reading.moonSign.index || a.meta.date - b.meta.date;
      case 'moonPhase':
        return phaseOrder(a.reading.moonPhase.name) - phaseOrder(b.reading.moonPhase.name)
          || a.meta.date - b.meta.date;
      case 'time':
      default:
        return a.meta.date - b.meta.date;
    }
  };
}

function weekdayOrder(date) {
  return date.getUTCDay();
}
function planetIdx(key) {
  return ['sun','moon','mars','mercury','jupiter','venus','saturn'].indexOf(key);
}
function phaseOrder(name) {
  return ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'].indexOf(name);
}

function groupKeyFor(photo, key) {
  if (!photo.reading) return 'unknown';
  switch (key) {
    case 'planetaryDay':  return photo.reading.planetaryDay.name;
    case 'planetaryHour': return photo.reading.planetaryHour?.planet.name || 'unknown';
    case 'sunSign':       return photo.reading.sunSign.name;
    case 'moonSign':      return photo.reading.moonSign.name;
    case 'moonPhase':     return photo.reading.moonPhase.name;
    default:              return '';
  }
}

function groupHeaderHtml(key, samplePhoto, sortKey) {
  if (key === 'unknown') return '<span class="glyph">∅</span> unknown';
  if (!samplePhoto?.reading) return key;
  const r = samplePhoto.reading;
  switch (sortKey) {
    case 'planetaryDay':
      return `<span class="glyph">${r.planetaryDay.glyph}</span>${r.planetaryDay.name}'s day`;
    case 'planetaryHour':
      return r.planetaryHour
        ? `<span class="glyph">${r.planetaryHour.planet.glyph}</span>hour of ${r.planetaryHour.planet.name}`
        : key;
    case 'sunSign':
      return `<span class="glyph">${r.sunSign.glyph}</span>sun in ${r.sunSign.name}`;
    case 'moonSign':
      return `<span class="glyph">${r.moonSign.glyph}</span>moon in ${r.moonSign.name}`;
    case 'moonPhase':
      return `<span class="glyph">${r.moonPhase.glyph}</span>${r.moonPhase.name.toLowerCase()}`;
    default:
      return key;
  }
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

// --- modal / export / share ---
function openModal(id) {
  const photo = state.photos.find(p => p.id === id);
  if (!photo || !photo.reading) return;
  activePhotoId = id;
  modalBody.innerHTML = '';
  modalBody.appendChild(renderBeautyCard(photo));
  modal.showModal();
}

function closeModal() {
  modal.close();
  activePhotoId = null;
}

closeModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

exportBtn.addEventListener('click', async () => {
  const photo = state.photos.find(p => p.id === activePhotoId);
  if (!photo) return;
  exportBtn.disabled = true; exportBtn.textContent = 'rendering…';
  try {
    const blob = await exportCardPng(photo);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrolens-${photo.reading.planetaryHour?.planet.name || 'reading'}-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    exportBtn.disabled = false; exportBtn.textContent = 'export PNG';
  }
});

shareBtn.addEventListener('click', async () => {
  const photo = state.photos.find(p => p.id === activePhotoId);
  if (!photo) return;
  shareBtn.disabled = true; shareBtn.textContent = 'rendering…';
  try {
    const blob = await exportCardPng(photo);
    const file = new File([blob], 'astrolens-card.png', { type: 'image/png' });
    const r = photo.reading;
    const text = [
      r.planetaryHour ? `${r.planetaryHour.planet.glyph} hour of ${r.planetaryHour.planet.name}` : null,
      `${r.planetaryDay.glyph} ${r.planetaryDay.name}'s day`,
      `${r.moonSign.glyph} moon in ${r.moonSign.name}`,
      `${r.moonPhase.glyph} ${r.moonPhase.name.toLowerCase()}`,
    ].filter(Boolean).join(' · ');
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text, title: 'Astrolens' });
    } else if (navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      shareBtn.textContent = 'copied!';
      setTimeout(() => { shareBtn.textContent = 'share'; }, 1500);
      return;
    } else {
      // Fallback: trigger download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'astrolens-card.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (err) {
    console.error(err);
  } finally {
    shareBtn.disabled = false;
    if (shareBtn.textContent === 'rendering…') shareBtn.textContent = 'share';
  }
});

// --- controls ---
sortSel.addEventListener('change', (e) => {
  state.sortKey = e.target.value;
  render();
});
groupTog.addEventListener('change', (e) => {
  state.group = e.target.checked;
  render();
});
clearBtn.addEventListener('click', () => {
  for (const p of state.photos) URL.revokeObjectURL(p.imageUrl);
  state.photos = [];
  render();
});

// --- location handling ---
locInput.addEventListener('change', () => {
  const v = locInput.value.trim();
  const m = v.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) {
    locStatus.textContent = 'expected: lat, lon';
    return;
  }
  state.fallbackLocation = { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  locStatus.textContent = `using ${state.fallbackLocation.lat.toFixed(2)}, ${state.fallbackLocation.lon.toFixed(2)}`;
  reanalyzeAll();
});
locDetect.addEventListener('click', () => {
  if (!navigator.geolocation) {
    locStatus.textContent = 'geolocation unavailable';
    return;
  }
  locStatus.textContent = 'locating…';
  navigator.geolocation.getCurrentPosition((pos) => {
    state.fallbackLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    locInput.value = `${state.fallbackLocation.lat.toFixed(4)}, ${state.fallbackLocation.lon.toFixed(4)}`;
    locStatus.textContent = `using ${state.fallbackLocation.lat.toFixed(2)}, ${state.fallbackLocation.lon.toFixed(2)}`;
    reanalyzeAll();
  }, (err) => {
    locStatus.textContent = `denied: ${err.message}`;
  }, { enableHighAccuracy: false, timeout: 10000 });
});

function reanalyzeAll() {
  for (const p of state.photos) {
    if (!p.meta.date) continue;
    const loc = p.meta.location || state.fallbackLocation;
    p.reading = analyze(p.meta.date, loc);
  }
  render();
}

bindFileEvents();
