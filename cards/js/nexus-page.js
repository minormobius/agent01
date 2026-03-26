// ── Nexus page — knowledge graph battle game ────────────────
import { showCardPreview } from "./shared.js";
import { initNexus } from "./nexus.js";

// Make preview available globally for nexus internals
window._showCardPreview = showCardPreview;

initNexus();
