/**
 * Palettes.
 *
 * Light and dark are two points, not a spectrum. Every colour the UI uses comes
 * from the nine tokens below, so a palette is a small data object rather than a
 * stylesheet — adding one is adding an entry here, and nothing else.
 *
 * `auto` is not a palette; it follows the OS and resolves to `midnight` or
 * `paper`. It is the default, because a phone that is in dark mode at night
 * should not be handed a white screen on first load.
 *
 * Contrast was checked, not eyeballed: every palette clears WCAG AA (4.5:1) for
 * `text` on `bg` and `text` on `panel`, and 3:1 for `muted` and `accent` on
 * `bg`. theme.selftest.mjs recomputes the ratios and fails the build if a new
 * palette does not clear them.
 */

/** @typedef {{bg,panel,line,lineSoft,text,muted,accent,live,dead}} Palette */

export const PALETTES = {
  midnight: { label: 'Midnight', dark: true,
    bg: '#0b0d12', panel: '#11141c', line: '#1e2330', lineSoft: '#171b25',
    text: '#e6eaf1', muted: '#8590a8', accent: '#5c95ff', live: '#3ddc84', dead: '#ff6b7f' },

  paper: { label: 'Paper', dark: false,
    bg: '#fbfaf8', panel: '#ffffff', line: '#e2e0da', lineSoft: '#eeece7',
    text: '#1b1e24', muted: '#5f6672', accent: '#1d5fd6', live: '#0f7a43', dead: '#c0293f' },

  sepia: { label: 'Sepia', dark: false,
    bg: '#f5edda', panel: '#fdf8ec', line: '#ddd0b4', lineSoft: '#eae0c8',
    text: '#33291b', muted: '#6b5c46', accent: '#9a4c1a', live: '#3f6b34', dead: '#a8332b' },

  forest: { label: 'Forest', dark: true,
    bg: '#0a1310', panel: '#0f1a16', line: '#1d2f27', lineSoft: '#16241e',
    text: '#dfeae1', muted: '#7e9689', accent: '#4ade80', live: '#4ade80', dead: '#ff7a6b' },

  plum: { label: 'Plum', dark: true,
    bg: '#120f1a', panel: '#191426', line: '#2a2140', lineSoft: '#201933',
    text: '#e9e3f4', muted: '#948aae', accent: '#c084fc', live: '#5ee0a0', dead: '#ff7196' },

  ember: { label: 'Ember', dark: true,
    bg: '#140f0c', panel: '#1c1512', line: '#33251d', lineSoft: '#261c17',
    text: '#f0e6de', muted: '#a08d7e', accent: '#ff9448', live: '#5fcf85', dead: '#ff6b6b' },

  mono: { label: 'High contrast', dark: true,
    bg: '#000000', panel: '#0c0c0c', line: '#3a3a3a', lineSoft: '#242424',
    text: '#ffffff', muted: '#c2c2c2', accent: '#ffd400', live: '#4dff88', dead: '#ff5c5c' },
};

export const DEFAULT = 'auto';
const STORAGE = 'bsky:palette';

/** Which concrete palette `auto` means right now. */
function systemPalette() {
  const dark = typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'midnight' : 'paper';
}

/** @returns {string} the stored choice — may be 'auto' */
export function stored() {
  try { return localStorage.getItem(STORAGE) || DEFAULT; } catch { return DEFAULT; }
}

/** @returns {string} the palette actually in force */
export function resolved(name = stored()) {
  return name === 'auto' || !PALETTES[name] ? systemPalette() : name;
}

/**
 * Paint a palette onto the document. Writes the CSS custom properties the
 * stylesheet reads, plus `color-scheme` (so form controls and scrollbars match)
 * and the `theme-color` meta (so a phone's status bar does).
 *
 * @param {string} [name] a key of PALETTES, or 'auto'
 */
export function apply(name = stored()) {
  const key = resolved(name);
  const p = PALETTES[key];
  if (!p) return;
  const root = document.documentElement;
  root.style.setProperty('--bg', p.bg);
  root.style.setProperty('--panel', p.panel);
  root.style.setProperty('--line', p.line);
  root.style.setProperty('--line-soft', p.lineSoft);
  root.style.setProperty('--text', p.text);
  root.style.setProperty('--muted', p.muted);
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--live', p.live);
  root.style.setProperty('--dead', p.dead);
  root.style.colorScheme = p.dark ? 'dark' : 'light';
  root.dataset.palette = key;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.bg);
}

/** @param {string} name */
export function set(name) {
  try { localStorage.setItem(STORAGE, name); } catch { /* not fatal */ }
  apply(name);
}

/**
 * Repaint when the OS flips, but only while the choice is `auto` — an explicit
 * pick must survive the system changing under it.
 */
export function watchSystem() {
  if (typeof matchMedia !== 'function') return;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (stored() === 'auto') apply('auto'); };
  mq.addEventListener?.('change', onChange);
}
