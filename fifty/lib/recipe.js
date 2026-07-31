// fifty/lib/recipe.js — ingredient parsing and scaling (concept 21).
//
// A recipe card that cannot rescale is a picture of a recipe. Scaling properly
// means parsing "1 1/2 cups (300 g) caster sugar, sifted" into a quantity, a
// unit and a name, multiplying only the quantity, and rendering it back as
// something a human would actually write — "2¼ cups", not "2.25 cups".

const UNICODE_FRACTIONS = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Units we recognise, with their canonical plural handling. Anything not on
// this list is treated as part of the ingredient name, which is the safe
// failure: "2 eggs" scales the 2 and leaves "eggs" alone.
const UNITS = [
  ['g', 'g', 'g'], ['gram', 'gram', 'grams'], ['grams', 'gram', 'grams'],
  ['kg', 'kg', 'kg'], ['kilogram', 'kilogram', 'kilograms'],
  ['mg', 'mg', 'mg'],
  ['oz', 'oz', 'oz'], ['ounce', 'ounce', 'ounces'], ['ounces', 'ounce', 'ounces'],
  ['lb', 'lb', 'lb'], ['lbs', 'lb', 'lb'], ['pound', 'pound', 'pounds'], ['pounds', 'pound', 'pounds'],
  ['ml', 'ml', 'ml'], ['millilitre', 'millilitre', 'millilitres'], ['milliliter', 'milliliter', 'milliliters'],
  ['l', 'l', 'l'], ['litre', 'litre', 'litres'], ['liter', 'liter', 'liters'],
  ['tsp', 'tsp', 'tsp'], ['teaspoon', 'teaspoon', 'teaspoons'], ['teaspoons', 'teaspoon', 'teaspoons'],
  ['tbsp', 'tbsp', 'tbsp'], ['tablespoon', 'tablespoon', 'tablespoons'], ['tablespoons', 'tablespoon', 'tablespoons'],
  ['cup', 'cup', 'cups'], ['cups', 'cup', 'cups'],
  ['pint', 'pint', 'pints'], ['quart', 'quart', 'quarts'], ['gallon', 'gallon', 'gallons'],
  ['clove', 'clove', 'cloves'], ['cloves', 'clove', 'cloves'],
  ['slice', 'slice', 'slices'], ['slices', 'slice', 'slices'],
  ['pinch', 'pinch', 'pinches'], ['handful', 'handful', 'handfuls'],
  ['can', 'can', 'cans'], ['cans', 'can', 'cans'],
  ['sprig', 'sprig', 'sprigs'], ['sprigs', 'sprig', 'sprigs'],
  ['stick', 'stick', 'sticks'], ['sticks', 'stick', 'sticks'],
];
const UNIT_MAP = new Map(UNITS.map(([k, s, p]) => [k, { singular: s, plural: p }]));

/** "1 1/2", "1½", "0.5", "½" → a number. Returns null if there is no quantity. */
export function parseQuantity(text) {
  const s = String(text).trim();
  if (!s) return null;

  // Unicode fraction, possibly with a whole part: "1½" or "½"
  const uni = /^(\d+)?\s*([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/.exec(s);
  if (uni) return (uni[1] ? Number(uni[1]) : 0) + UNICODE_FRACTIONS[uni[2]];

  // "1 1/2" or "3/4"
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const frac = /^(\d+)\s*\/\s*(\d+)/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);

  const dec = /^(\d+(?:\.\d+)?)/.exec(s);
  if (dec) return Number(dec[1]);

  return null;
}

/**
 * Parse one ingredient line into { quantity, unit, name, note, raw }.
 * Anything it cannot parse survives untouched in `name`.
 */
export function parseIngredient(line) {
  const raw = String(line).trim();
  if (!raw) return null;

  // Trailing preparation note after a comma: "caster sugar, sifted"
  let body = raw;
  let note = '';
  const comma = raw.indexOf(',');
  if (comma > 0) { body = raw.slice(0, comma).trim(); note = raw.slice(comma + 1).trim(); }

  // Leading quantity
  const qMatch = /^((?:\d+\s+\d+\s*\/\s*\d+)|(?:\d+\s*\/\s*\d+)|(?:\d+(?:\.\d+)?\s*[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])|(?:\d+(?:\.\d+)?)|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/.exec(body);
  let quantity = null;
  let rest = body;
  if (qMatch) {
    quantity = parseQuantity(qMatch[1]);
    rest = body.slice(qMatch[0].length).trim();

    // Ranges: "2-3 apples" — scale from the low end, keep the span.
    const range = /^[-–—]\s*(\d+(?:\.\d+)?)\s*/.exec(rest);
    if (range) {
      return finish(quantity, Number(range[1]), rest.slice(range[0].length).trim());
    }
  }
  return finish(quantity, null, rest);

  function finish(qty, qtyMax, remainder) {
    let unit = '';
    let name = remainder;
    const first = /^([a-zA-Z]+)\.?\s+/.exec(remainder);
    if (first && UNIT_MAP.has(first[1].toLowerCase())) {
      unit = UNIT_MAP.get(first[1].toLowerCase()).singular;   // canonicalise: "cups" → "cup"
      name = remainder.slice(first[0].length).trim();
    } else {
      // "300g flour" — unit glued to the number, already split off above,
      // so check for a unit-only first token with no trailing space.
      const glued = /^([a-zA-Z]+)$/.exec(remainder.split(/\s+/)[0] || '');
      if (glued && UNIT_MAP.has(glued[1].toLowerCase()) && remainder.split(/\s+/).length > 1) {
        unit = UNIT_MAP.get(glued[1].toLowerCase()).singular;
        name = remainder.split(/\s+/).slice(1).join(' ');
      }
    }
    return { raw, quantity: qty, quantityMax: qtyMax, unit, name: name || remainder, note };
  }
}

const NICE_FRACTIONS = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

/** 2.25 → "2¼", 0.333 → "⅓", 137.4 → "137". Cooks do not measure to 3dp. */
export function formatQuantity(n) {
  if (n == null || Number.isNaN(n)) return '';
  if (n === 0) return '0';

  // Above 10, whole numbers are what anyone would write.
  if (n >= 10) return String(Math.round(n));

  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.04) return String(whole || 0);
  if (frac > 0.96) return String(whole + 1);

  let best = null;
  for (const [value, glyph] of NICE_FRACTIONS) {
    const err = Math.abs(frac - value);
    if (!best || err < best.err) best = { err, glyph, value };
  }
  // Only snap to a fraction if it is genuinely close; otherwise show a decimal.
  // 0.02 is deliberately tight — 2.9 should read "2.9", not "2⅞".
  if (best && best.err < 0.02) return (whole ? String(whole) : '') + best.glyph;
  return String(Math.round(n * 10) / 10);
}

// When a line has no unit the count attaches to the item itself — "1 egg" must
// become "2 eggs" and back again. Regular English only; an irregular noun
// ("2 gooses") is a cosmetic miss, not a wrong measurement, so it is not worth
// a dictionary.
const PLURAL_EXCEPT = new Set(['salt', 'pepper', 'flour', 'sugar', 'water', 'butter',
  'oil', 'milk', 'rice', 'cheese', 'garlic', 'parsley', 'thyme', 'stock', 'wine']);

export function pluralise(word) {
  if (!word || PLURAL_EXCEPT.has(word.toLowerCase())) return word;
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return word + 'es';
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  return word + 's';
}

export function singularise(word) {
  if (!word || PLURAL_EXCEPT.has(word.toLowerCase())) return word;
  if (/ies$/i.test(word)) return word.slice(0, -3) + 'y';
  if (/(?:ches|shes|xes|zes|sses)$/i.test(word)) return word.slice(0, -2);
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Inflect the head noun of an item name to match a count. */
function inflectItem(name, quantity) {
  const parts = String(name).split(/\s+/);
  if (!parts.length) return name;
  const head = parts[parts.length - 1];
  const one = Math.abs(quantity - 1) < 1e-9;
  parts[parts.length - 1] = one ? singularise(head) : pluralise(head);
  return parts.join(' ');
}

/** Pluralise a unit against a quantity. */
export function formatUnit(unit, quantity) {
  if (!unit) return '';
  const u = UNIT_MAP.get(unit);
  if (!u) return unit;
  return quantity != null && Math.abs(quantity - 1) < 1e-9 ? u.singular : u.plural;
}

/** Render a parsed ingredient at a scale factor. */
export function renderIngredient(ing, factor = 1) {
  if (!ing) return '';
  if (ing.quantity == null) return ing.raw;
  const q = ing.quantity * factor;
  const parts = [formatQuantity(q)];
  if (ing.quantityMax != null) parts[0] += `–${formatQuantity(ing.quantityMax * factor)}`;
  const unit = formatUnit(ing.unit, ing.quantityMax != null ? 2 : q);
  if (unit) parts.push(unit);
  // With a unit the unit carries the number ("2 cups flour"); without one the
  // item does ("2 eggs"). A range is always plural.
  parts.push(unit ? ing.name : inflectItem(ing.name, ing.quantityMax != null ? 2 : q));
  const line = parts.filter(Boolean).join(' ');
  return ing.note ? `${line}, ${ing.note}` : line;
}

/** Scale a whole recipe's ingredient list to a new yield. */
export function scale(ingredients, fromServes, toServes) {
  const factor = (Number(toServes) || 1) / (Number(fromServes) || 1);
  return ingredients.map((line) => renderIngredient(parseIngredient(line), factor));
}

// ────────────────────────────────────── record + schema.org output ──

export const RECIPE_COLLECTION = 'com.minomobi.fifty.recipe';

export function toRecord(recipe) {
  return {
    $type: RECIPE_COLLECTION,
    title: recipe.title || '',
    summary: recipe.summary || '',
    serves: Number(recipe.serves) || 1,
    prepMinutes: Number(recipe.prepMinutes) || 0,
    cookMinutes: Number(recipe.cookMinutes) || 0,
    ingredients: (recipe.ingredients || []).filter(Boolean).map((line) => {
      const p = parseIngredient(line);
      return {
        text: p.raw,
        quantity: p.quantity == null ? undefined : p.quantity,
        unit: p.unit || undefined,
        item: p.name,
        prep: p.note || undefined,
      };
    }),
    steps: (recipe.steps || []).filter(Boolean),
    tags: (recipe.tags || []).filter(Boolean),
    source: recipe.source || undefined,
    // Lineage — a recipe is nearly always somebody's adaptation of another.
    adaptedFrom: recipe.adaptedFrom || undefined,
    createdAt: recipe.createdAt || new Date().toISOString(),
  };
}

export function toJsonLd(recipe) {
  const mins = (n) => (n ? `PT${n}M` : undefined);
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title || '',
    description: recipe.summary || '',
    recipeYield: `${recipe.serves} servings`,
    prepTime: mins(Number(recipe.prepMinutes) || 0),
    cookTime: mins(Number(recipe.cookMinutes) || 0),
    recipeIngredient: (recipe.ingredients || []).filter(Boolean),
    recipeInstructions: (recipe.steps || []).filter(Boolean)
      .map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
    keywords: (recipe.tags || []).filter(Boolean).join(', ') || undefined,
  };
}
