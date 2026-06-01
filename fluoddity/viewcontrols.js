// Shared view controls for every fluoddity surface: a trail⇄particle display
// toggle + a reset button, in one consistent cluster.
//
// The engine renders in one of two modes: 'trail' (the diffusing vector field,
// the default look) or 'particles' (aphid91's raw-brain point render). This
// mounts a small control wired to whatever engine(s) a surface is currently
// driving, persists the chosen view across every surface (one localStorage key,
// shared with the playground), and exposes a reset hook the surface defines.
//
//   import { mountViewControls, getViewMode } from './viewcontrols.js';   // adjust path
//   mountViewControls(document.getElementById('dock'), {
//     engines: () => engine,            // the active engine, or an array, or null
//     onReset: () => reroll(),          // what "reset" means here
//     onModeChange: (m) => renderAll(), // OPTIONAL: re-render for snapshot surfaces
//     toggle: true,                     // set false to show reset only (e.g. torus/3D)
//     resetLabel: '↻ reset',
//   });
//
// For live render-loop surfaces, just set engines() — the loop's next render()
// picks up displayMode for free. For snapshot/blit surfaces, also pass
// onModeChange to re-blit the current frames. Engines created LATER (e.g. a
// second engine on level change) should set `engine.displayMode = getViewMode()`
// at construction so they start in the chosen view.

const MODE_KEY = 'fluoddity_display_mode';

export function getViewMode() {
  try { return localStorage.getItem(MODE_KEY) === 'particles' ? 'particles' : 'trail'; }
  catch { return 'trail'; }
}
function setStored(m) { try { localStorage.setItem(MODE_KEY, m); } catch { /* no-op */ } }

let _styled = false;
function injectStyles() {
  if (_styled) return; _styled = true;
  const s = document.createElement('style');
  s.textContent = `
.fviewctl { display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono, ui-monospace, monospace); white-space: nowrap; }
.fviewctl button { font: inherit; font-size: 12px; cursor: pointer; color: var(--fg, #e7e9ee); background: var(--panel, #0e1014); border: 1px solid var(--rule, #23272f); border-radius: 8px; padding: 7px 11px; white-space: nowrap; }
.fviewctl button:hover { border-color: var(--accent, #38e1c0); color: var(--accent, #38e1c0); }
.fviewctl button.fvc-on { color: #04110e; background: var(--accent, #38e1c0); border-color: var(--accent, #38e1c0); font-weight: 600; }`;
  document.head.appendChild(s);
}

/**
 * @param {Element} container - where to append the control cluster
 * @param {object} opts - { engines, onReset, onModeChange, toggle, resetLabel }
 * @returns {{ setMode, getMode, apply }|null}
 */
export function mountViewControls(container, opts = {}) {
  if (!container) return null;
  injectStyles();
  const engines = opts.engines || (() => null);
  const onReset = opts.onReset || (() => {});
  const onModeChange = opts.onModeChange || null;
  const showToggle = opts.toggle !== false;
  let mode = getViewMode();

  const wrap = document.createElement('span');
  wrap.className = 'fviewctl';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = opts.resetLabel || '↻ reset';
  resetBtn.title = 'reset this field';
  if (showToggle) wrap.appendChild(toggleBtn);
  wrap.appendChild(resetBtn);
  container.appendChild(wrap);

  function engineList() {
    let e = engines();
    if (!e) return [];
    return Array.isArray(e) ? e.filter(Boolean) : [e];
  }
  function paint() {
    toggleBtn.textContent = mode === 'particles' ? '✦ particles' : '◴ trail';
    toggleBtn.classList.toggle('fvc-on', mode === 'particles');
    toggleBtn.title = 'view: ' + mode + ' — switch to ' + (mode === 'particles' ? 'trail' : 'particles');
  }
  function applyEngines() {
    for (const e of engineList()) { try { e.displayMode = mode; } catch { /* no-op */ } }
  }
  // On a user toggle: set the engines AND re-render snapshot surfaces. On mount we
  // only set the engines (onModeChange would re-render before a grid exists).
  function setMode(m, fire = true) {
    mode = (m === 'particles') ? 'particles' : 'trail';
    setStored(mode); paint(); applyEngines();
    if (fire && onModeChange) { try { onModeChange(mode); } catch { /* no-op */ } }
  }

  if (showToggle) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); setMode(mode === 'particles' ? 'trail' : 'particles'); });
  resetBtn.addEventListener('click', (e) => { e.stopPropagation(); try { onReset(); } catch { /* no-op */ } });

  paint();
  applyEngines();   // push the persisted mode onto whatever engine exists at mount time (no re-render)
  return { setMode, getMode: () => mode, apply: applyEngines };
}
