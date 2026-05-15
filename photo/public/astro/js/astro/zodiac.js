export const SIGNS = [
  { name: 'Aries',       glyph: '♈', ruler: 'mars',    element: 'fire',  modality: 'cardinal' },
  { name: 'Taurus',      glyph: '♉', ruler: 'venus',   element: 'earth', modality: 'fixed' },
  { name: 'Gemini',      glyph: '♊', ruler: 'mercury', element: 'air',   modality: 'mutable' },
  { name: 'Cancer',      glyph: '♋', ruler: 'moon',    element: 'water', modality: 'cardinal' },
  { name: 'Leo',         glyph: '♌', ruler: 'sun',     element: 'fire',  modality: 'fixed' },
  { name: 'Virgo',       glyph: '♍', ruler: 'mercury', element: 'earth', modality: 'mutable' },
  { name: 'Libra',       glyph: '♎', ruler: 'venus',   element: 'air',   modality: 'cardinal' },
  { name: 'Scorpio',     glyph: '♏', ruler: 'mars',    element: 'water', modality: 'fixed' },
  { name: 'Sagittarius', glyph: '♐', ruler: 'jupiter', element: 'fire',  modality: 'mutable' },
  { name: 'Capricorn',   glyph: '♑', ruler: 'saturn',  element: 'earth', modality: 'cardinal' },
  { name: 'Aquarius',    glyph: '♒', ruler: 'saturn',  element: 'air',   modality: 'fixed' },
  { name: 'Pisces',      glyph: '♓', ruler: 'jupiter', element: 'water', modality: 'mutable' },
];

export function signFromLongitude(deg) {
  const idx = Math.floor(((deg % 360) + 360) % 360 / 30);
  const sign = SIGNS[idx];
  const degInSign = ((deg % 30) + 30) % 30;
  return { ...sign, index: idx, degInSign };
}

export const PHASES = [
  { name: 'New Moon',         glyph: '🌑', min: 0,   max: 22.5 },
  { name: 'Waxing Crescent',  glyph: '🌒', min: 22.5, max: 67.5 },
  { name: 'First Quarter',    glyph: '🌓', min: 67.5, max: 112.5 },
  { name: 'Waxing Gibbous',   glyph: '🌔', min: 112.5, max: 157.5 },
  { name: 'Full Moon',        glyph: '🌕', min: 157.5, max: 202.5 },
  { name: 'Waning Gibbous',   glyph: '🌖', min: 202.5, max: 247.5 },
  { name: 'Last Quarter',     glyph: '🌗', min: 247.5, max: 292.5 },
  { name: 'Waning Crescent',  glyph: '🌘', min: 292.5, max: 337.5 },
  { name: 'New Moon',         glyph: '🌑', min: 337.5, max: 360 },
];

export function phaseFromAngle(deg) {
  const a = ((deg % 360) + 360) % 360;
  for (const p of PHASES) {
    if (a >= p.min && a < p.max) return p;
  }
  return PHASES[0];
}
