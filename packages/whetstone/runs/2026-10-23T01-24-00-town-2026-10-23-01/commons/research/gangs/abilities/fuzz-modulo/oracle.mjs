export function abilitiesOracle(rec, rootRules) {
  const reasons = [];
  const abilities = rec && rec.abilities;
  if (abilities === undefined) return reasons;
  if (!Array.isArray(abilities)) {
    reasons.push('abilities must be an array');
    return reasons;
  }

  const r = (rootRules && rootRules.rules && rootRules.rules.abilities) || {};
  const atStart = validInt(r.atStart, 0, 8, 1);
  const max = validInt(r.max, 0, 16, 4);
  const limit = Math.min(atStart, max, 8);

  if (abilities.length > limit) {
    reasons.push(`too many abilities: ${abilities.length} > ${limit}`);
  }

  const seen = new Set();
  const enc = new TextEncoder();
  const visible = /[\p{L}\p{N}\p{P}\p{S}]/u;
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  const graphemeCount = (s) => [...segmenter.segment(s)].length;

  abilities.forEach((ab, i) => {
    if (!ab || typeof ab !== 'object') {
      reasons.push(`ability[${i}] must be an object`);
      return;
    }
    checkText(ab.name, `ability[${i}].name`, 64, 640);
    checkText(ab.text, `ability[${i}].text`, 300, 3000);

    if (typeof ab.name === 'string') {
      const folded = ab.name
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase().toLowerCase()
        .normalize('NFKC');
      if (seen.has(folded)) {
        reasons.push(`ability[${i}].name is a duplicate name`);
      } else {
        seen.add(folded);
      }
    }
  });

  function checkText(val, label, maxGraph, maxBytes) {
    if (typeof val !== 'string') {
      reasons.push(`${label} must be a string`);
      return;
    }
    if (!visible.test(val)) {
      reasons.push(`${label} must contain a visible character`);
    }
    if (graphemeCount(val) > maxGraph) {
      reasons.push(`${label} exceeds ${maxGraph} graphemes`);
    }
    if (enc.encode(val).length > maxBytes) {
      reasons.push(`${label} exceeds ${maxBytes} bytes`);
    }
  }

  return reasons;
}

function validInt(v, lo, hi, def) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
    return def;
  }
  return v;
}
