// uni — shared pure helpers for the Unicode browser. No deps, no DOM.
// Used verbatim by the browser pages (as an ES module) and the node selftest
// (uni/lib/uni.selftest.mjs). Everything here is a pure function of a codepoint
// integer, so it needs no data files: encodings, escapes, and the algorithmic
// names for the giant CJK / Hangul / Tangut ranges are all computed.
//
// Also attaches to globalThis so a plain `<script>` include exposes `UNI`.

const UNI = {};

// ── hex helpers ──
UNI.hex = (cp, pad = 4) => cp.toString(16).toUpperCase().padStart(pad, '0');
UNI.uPlus = (cp) => 'U+' + UNI.hex(cp);

// ── general category long names ──
UNI.CATEGORIES = {
  Lu: 'Uppercase Letter', Ll: 'Lowercase Letter', Lt: 'Titlecase Letter',
  Lm: 'Modifier Letter', Lo: 'Other Letter',
  Mn: 'Nonspacing Mark', Mc: 'Spacing Mark', Me: 'Enclosing Mark',
  Nd: 'Decimal Number', Nl: 'Letter Number', No: 'Other Number',
  Pc: 'Connector Punctuation', Pd: 'Dash Punctuation', Ps: 'Open Punctuation',
  Pe: 'Close Punctuation', Pi: 'Initial Punctuation', Pf: 'Final Punctuation',
  Po: 'Other Punctuation',
  Sm: 'Math Symbol', Sc: 'Currency Symbol', Sk: 'Modifier Symbol', So: 'Other Symbol',
  Zs: 'Space Separator', Zl: 'Line Separator', Zp: 'Paragraph Separator',
  Cc: 'Control', Cf: 'Format', Cs: 'Surrogate', Co: 'Private Use', Cn: 'Unassigned',
};
UNI.categoryName = (gc) => UNI.CATEGORIES[gc] || gc || 'Unassigned';

// ── planes ──
UNI.PLANES = {
  0: 'Basic Multilingual Plane', 1: 'Supplementary Multilingual Plane',
  2: 'Supplementary Ideographic Plane', 3: 'Tertiary Ideographic Plane',
  14: 'Supplementary Special-purpose Plane',
  15: 'Supplementary Private Use Area-A', 16: 'Supplementary Private Use Area-B',
};
UNI.planeOf = (cp) => cp >> 16;
UNI.planeName = (cp) => UNI.PLANES[cp >> 16] || `Plane ${cp >> 16}`;

// ── algorithmic Hangul-syllable naming (Unicode §3.12) ──
const HANGUL_L = ['G','GG','N','D','DD','R','M','B','BB','S','SS','','J','JJ','C','K','T','P','H'];
const HANGUL_V = ['A','AE','YA','YAE','EO','E','YEO','YE','O','WA','WAE','OE','YO','U','WEO','WE','WI','YU','EU','YI','I'];
const HANGUL_T = ['','G','GG','GS','N','NJ','NH','D','L','LG','LM','LB','LS','LT','LP','LH','M','B','BS','S','SS','NG','J','C','K','T','P','H'];
function hangulSyllableName(cp) {
  const S = cp - 0xAC00;
  if (S < 0 || S >= 11172) return null;
  const L = Math.floor(S / 588), V = Math.floor((S % 588) / 28), T = S % 28;
  return 'HANGUL SYLLABLE ' + HANGUL_L[L] + HANGUL_V[V] + HANGUL_T[T];
}
UNI.hangulSyllableName = hangulSyllableName;

// Algorithmic name for a codepoint given its block's kind (set in blocks.json).
// Returns null if the block isn't algorithmic (→ look the char up in the block file).
UNI.algorithmicName = (cp, kind) => {
  switch (kind) {
    case 'cjk':     return 'CJK UNIFIED IDEOGRAPH-' + UNI.hex(cp);
    case 'tangut':  return 'TANGUT IDEOGRAPH-' + UNI.hex(cp);
    case 'khitan':  return 'KHITAN SMALL SCRIPT CHARACTER-' + UNI.hex(cp);
    case 'nushu':   return 'NUSHU CHARACTER-' + UNI.hex(cp);
    case 'hangul':  return hangulSyllableName(cp);
    case 'pua':     return '<private-use-' + UNI.hex(cp) + '>';
    case 'surrogate': return '<surrogate-' + UNI.hex(cp) + '>';
    default: return null;
  }
};

// ── encodings (all pure functions of the codepoint int) ──
UNI.utf8Bytes = (cp) => {
  if (cp <= 0x7f) return [cp];
  if (cp <= 0x7ff) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp <= 0xffff) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
};
UNI.utf16Units = (cp) => {
  if (cp <= 0xffff) return [cp];
  const c = cp - 0x10000;
  return [0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff)];
};
const byteHex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
const unitHex = (u) => u.toString(16).toUpperCase().padStart(4, '0');

UNI.encodings = (cp) => {
  const u8 = UNI.utf8Bytes(cp);
  const u16 = UNI.utf16Units(cp);
  return {
    codepoint: cp,
    uPlus: UNI.uPlus(cp),
    decimal: String(cp),
    utf8: u8.map(byteHex).join(' '),
    utf16: u16.map(unitHex).join(' '),
    utf32: cp.toString(16).toUpperCase().padStart(8, '0'),
    htmlDec: `&#${cp};`,
    htmlHex: `&#x${UNI.hex(cp)};`,
    cssEscape: '\\' + UNI.hex(cp, 6),
    jsEscape: cp <= 0xffff ? '\\u' + unitHex(cp) : u16.map(u => '\\u' + unitHex(u)).join(''),
    jsEs6: '\\u{' + UNI.hex(cp) + '}',
    pyEscape: cp <= 0xffff ? '\\u' + unitHex(cp) : '\\U' + cp.toString(16).toUpperCase().padStart(8, '0'),
    urlEncoded: u8.map(b => '%' + byteHex(b)).join(''),
  };
};

// Should this codepoint get a rendered glyph, or is it non-printing?
UNI.isPrintable = (gc) => !(gc === 'Cc' || gc === 'Cf' || gc === 'Cs' || gc === 'Zl' || gc === 'Zp' || gc === 'Cn');

// Safe glyph for a codepoint (surrogates can't be String.fromCodePoint'd meaningfully)
UNI.glyph = (cp) => {
  if (cp >= 0xd800 && cp <= 0xdfff) return '';
  try { return String.fromCodePoint(cp); } catch { return ''; }
};

UNI.slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// node/CommonJS + browser globals
if (typeof globalThis !== 'undefined') globalThis.UNI = UNI;
export default UNI;
export const {
  hex, uPlus, categoryName, planeName, planeOf, algorithmicName,
  utf8Bytes, utf16Units, encodings, isPrintable, glyph, slugify, CATEGORIES, PLANES,
} = UNI;
export { hangulSyllableName };
