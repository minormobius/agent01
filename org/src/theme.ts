/**
 * Theme engine — named palettes applied via CSS custom properties.
 * Persists selection to localStorage. All apps inherit automatically
 * since the entire UI is built on var(--*) tokens.
 */

export interface Palette {
  id: string;
  name: string;
  group: "dark" | "light";
  preview: [string, string, string]; // [bg, accent, surface] for swatches
  vars: {
    bg: string;
    surface: string;
    "surface-2": string;
    "surface-3": string;
    border: string;
    text: string;
    "text-dim": string;
    accent: string;
    "accent-hover": string;
    danger: string;
    "danger-hover": string;
    success: string;
    warning: string;
  };
}

// ── Dark palettes ──

const midnight: Palette = {
  id: "midnight",
  name: "Midnight",
  group: "dark",
  preview: ["#0a0a0f", "#6366f1", "#141420"],
  vars: {
    bg: "#0a0a0f",
    surface: "#141420",
    "surface-2": "#1c1c2e",
    "surface-3": "#242438",
    border: "#2a2a3e",
    text: "#e0e0e8",
    "text-dim": "#8888a0",
    accent: "#6366f1",
    "accent-hover": "#818cf8",
    danger: "#ef4444",
    "danger-hover": "#dc2626",
    success: "#22c55e",
    warning: "#f59e0b",
  },
};

const sea: Palette = {
  id: "sea",
  name: "Deep Sea",
  group: "dark",
  preview: ["#0a1628", "#0ea5e9", "#0f2035"],
  vars: {
    bg: "#0a1628",
    surface: "#0f2035",
    "surface-2": "#132a42",
    "surface-3": "#183450",
    border: "#1e3f5e",
    text: "#d4e8f7",
    "text-dim": "#6a9bbe",
    accent: "#0ea5e9",
    "accent-hover": "#38bdf8",
    danger: "#f43f5e",
    "danger-hover": "#e11d48",
    success: "#34d399",
    warning: "#fbbf24",
  },
};

const desert: Palette = {
  id: "desert",
  name: "Desert",
  group: "dark",
  preview: ["#1a1410", "#e2884d", "#231c14"],
  vars: {
    bg: "#1a1410",
    surface: "#231c14",
    "surface-2": "#2e251a",
    "surface-3": "#3a2f22",
    border: "#4a3d2c",
    text: "#e8ddd0",
    "text-dim": "#a08f78",
    accent: "#e2884d",
    "accent-hover": "#f0a06a",
    danger: "#dc4a3a",
    "danger-hover": "#c42a1a",
    success: "#7ab648",
    warning: "#e8b84d",
  },
};

const forest: Palette = {
  id: "forest",
  name: "Forest",
  group: "dark",
  preview: ["#0c1410", "#22c55e", "#131f18"],
  vars: {
    bg: "#0c1410",
    surface: "#131f18",
    "surface-2": "#1a2b22",
    "surface-3": "#22362c",
    border: "#2c4438",
    text: "#d0e8d8",
    "text-dim": "#6e9e7e",
    accent: "#22c55e",
    "accent-hover": "#4ade80",
    danger: "#ef4444",
    "danger-hover": "#dc2626",
    success: "#34d399",
    warning: "#eab308",
  },
};

const aurora: Palette = {
  id: "aurora",
  name: "Aurora",
  group: "dark",
  preview: ["#0e0a18", "#a78bfa", "#18122a"],
  vars: {
    bg: "#0e0a18",
    surface: "#18122a",
    "surface-2": "#221a3a",
    "surface-3": "#2c224a",
    border: "#3a2e5e",
    text: "#e2daf0",
    "text-dim": "#9080b0",
    accent: "#a78bfa",
    "accent-hover": "#c4b5fd",
    danger: "#f43f5e",
    "danger-hover": "#e11d48",
    success: "#34d399",
    warning: "#fbbf24",
  },
};

const ember: Palette = {
  id: "ember",
  name: "Ember",
  group: "dark",
  preview: ["#180a0a", "#ef4444", "#261212"],
  vars: {
    bg: "#180a0a",
    surface: "#261212",
    "surface-2": "#321a1a",
    "surface-3": "#3e2222",
    border: "#502c2c",
    text: "#f0dada",
    "text-dim": "#b07878",
    accent: "#ef4444",
    "accent-hover": "#f87171",
    danger: "#f97316",
    "danger-hover": "#ea580c",
    success: "#4ade80",
    warning: "#fbbf24",
  },
};

const slate: Palette = {
  id: "slate",
  name: "Slate",
  group: "dark",
  preview: ["#111118", "#94a3b8", "#1a1a24"],
  vars: {
    bg: "#111118",
    surface: "#1a1a24",
    "surface-2": "#232330",
    "surface-3": "#2c2c3c",
    border: "#383848",
    text: "#cbd5e1",
    "text-dim": "#64748b",
    accent: "#94a3b8",
    "accent-hover": "#b0bec9",
    danger: "#ef4444",
    "danger-hover": "#dc2626",
    success: "#22c55e",
    warning: "#f59e0b",
  },
};

// ── Light palettes ──

const cloud: Palette = {
  id: "cloud",
  name: "Cloud",
  group: "light",
  preview: ["#f8f9fb", "#4f46e5", "#ffffff"],
  vars: {
    bg: "#f8f9fb",
    surface: "#ffffff",
    "surface-2": "#f1f3f5",
    "surface-3": "#e8eaed",
    border: "#d4d8de",
    text: "#1a1a2e",
    "text-dim": "#64648a",
    accent: "#4f46e5",
    "accent-hover": "#6366f1",
    danger: "#dc2626",
    "danger-hover": "#b91c1c",
    success: "#16a34a",
    warning: "#d97706",
  },
};

const sand: Palette = {
  id: "sand",
  name: "Sand",
  group: "light",
  preview: ["#faf6f0", "#b8762e", "#ffffff"],
  vars: {
    bg: "#faf6f0",
    surface: "#ffffff",
    "surface-2": "#f5f0e6",
    "surface-3": "#ede5d8",
    border: "#d8cfc0",
    text: "#2a2218",
    "text-dim": "#8a7a62",
    accent: "#b8762e",
    "accent-hover": "#d08a3a",
    danger: "#c92a2a",
    "danger-hover": "#a31e1e",
    success: "#2e8b3e",
    warning: "#c08a20",
  },
};

const foam: Palette = {
  id: "foam",
  name: "Seafoam",
  group: "light",
  preview: ["#f0f8f6", "#0d9488", "#ffffff"],
  vars: {
    bg: "#f0f8f6",
    surface: "#ffffff",
    "surface-2": "#e6f4f0",
    "surface-3": "#d6ece6",
    border: "#b8d8ce",
    text: "#14342c",
    "text-dim": "#508878",
    accent: "#0d9488",
    "accent-hover": "#14b8a6",
    danger: "#dc2626",
    "danger-hover": "#b91c1c",
    success: "#16a34a",
    warning: "#d97706",
  },
};

const lavender: Palette = {
  id: "lavender",
  name: "Lavender",
  group: "light",
  preview: ["#f6f4fb", "#7c3aed", "#ffffff"],
  vars: {
    bg: "#f6f4fb",
    surface: "#ffffff",
    "surface-2": "#f0ecf8",
    "surface-3": "#e6e0f2",
    border: "#d0c8e4",
    text: "#1e1a30",
    "text-dim": "#6e60a0",
    accent: "#7c3aed",
    "accent-hover": "#8b5cf6",
    danger: "#dc2626",
    "danger-hover": "#b91c1c",
    success: "#16a34a",
    warning: "#d97706",
  },
};

// ── Registry ──

export const PALETTES: Palette[] = [
  midnight, sea, desert, forest, aurora, ember, slate,
  cloud, sand, foam, lavender,
];

export const DEFAULT_PALETTE = "midnight";
const STORAGE_KEY = "mino-theme";

/** Get the current palette ID from localStorage */
export function getStoredPalette(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** Apply a palette by setting CSS custom properties on :root */
export function applyPalette(paletteId: string): void {
  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
  const root = document.documentElement;

  for (const [key, value] of Object.entries(palette.vars)) {
    root.style.setProperty(`--${key}`, value);
  }

  // Store choice
  try {
    localStorage.setItem(STORAGE_KEY, palette.id);
  } catch {
    // localStorage unavailable
  }
}

/** Initialize theme on page load */
export function initTheme(): void {
  applyPalette(getStoredPalette());
}
