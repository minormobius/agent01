// unit — the conversion engine + unit data. No deps, no DOM. Pure functions.
// Used by the browser pages (ES module) and the node selftest (units.selftest.mjs),
// and attaches to globalThis so a plain <script> exposes `UNITS`.
//
// Model: every unit converts to its category's BASE unit by an affine map
//   base = value * factor + offset      (offset defaults to 0)
//   value = (base - offset) / factor
// Non-affine units (fuel economy) instead provide toBase/fromBase functions.
// convert(from, to, v) = fromBase(to, toBase(from, v)).
//
// Factors are exact where a definition exists (e.g. inch = 0.0254 m exactly).

const U = {};

// helper to build a linear unit
const u = (id, name, symbol, factor, offset = 0) => ({ id, name, symbol, factor, offset });
// non-linear unit (fuel economy): toBase/fromBase over the category base
const uf = (id, name, symbol, toBase, fromBase) => ({ id, name, symbol, toBase, fromBase });

U.CATEGORIES = [
  { id: 'length', name: 'Length', icon: '📏', base: 'meter', units: [
    u('kilometer', 'Kilometer', 'km', 1000),
    u('meter', 'Meter', 'm', 1),
    u('decimeter', 'Decimeter', 'dm', 0.1),
    u('centimeter', 'Centimeter', 'cm', 0.01),
    u('millimeter', 'Millimeter', 'mm', 0.001),
    u('micrometer', 'Micrometer', 'µm', 1e-6),
    u('nanometer', 'Nanometer', 'nm', 1e-9),
    u('angstrom', 'Ångström', 'Å', 1e-10),
    u('mile', 'Mile', 'mi', 1609.344),
    u('yard', 'Yard', 'yd', 0.9144),
    u('foot', 'Foot', 'ft', 0.3048),
    u('inch', 'Inch', 'in', 0.0254),
    u('nautical-mile', 'Nautical mile', 'nmi', 1852),
    u('furlong', 'Furlong', 'fur', 201.168),
    u('chain', 'Chain', 'ch', 20.1168),
    u('rod', 'Rod', 'rod', 5.0292),
    u('fathom', 'Fathom', 'ftm', 1.8288),
    u('hand', 'Hand', 'hh', 0.1016),
    u('thou', 'Thou / mil', 'thou', 0.0000254),
    u('astronomical-unit', 'Astronomical unit', 'AU', 149597870700),
    u('light-year', 'Light-year', 'ly', 9460730472580800),
    u('parsec', 'Parsec', 'pc', 3.0856775814913673e16),
  ]},
  { id: 'mass', name: 'Mass / Weight', icon: '⚖️', base: 'kilogram', units: [
    u('tonne', 'Tonne (metric ton)', 't', 1000),
    u('kilogram', 'Kilogram', 'kg', 1),
    u('gram', 'Gram', 'g', 0.001),
    u('milligram', 'Milligram', 'mg', 1e-6),
    u('microgram', 'Microgram', 'µg', 1e-9),
    u('pound', 'Pound', 'lb', 0.45359237),
    u('ounce', 'Ounce', 'oz', 0.028349523125),
    u('stone', 'Stone', 'st', 6.35029318),
    u('us-ton', 'US ton (short)', 'ton', 907.18474),
    u('long-ton', 'Long ton (UK)', 'long ton', 1016.0469088),
    u('carat', 'Carat', 'ct', 0.0002),
    u('grain', 'Grain', 'gr', 0.00006479891),
    u('troy-ounce', 'Troy ounce', 'ozt', 0.0311034768),
    u('pennyweight', 'Pennyweight', 'dwt', 0.00155517384),
    u('dram', 'Dram', 'dr', 0.0017718451953125),
    u('slug', 'Slug', 'slug', 14.593902937),
  ]},
  { id: 'temperature', name: 'Temperature', icon: '🌡️', base: 'kelvin', units: [
    u('celsius', 'Celsius', '°C', 1, 273.15),
    u('fahrenheit', 'Fahrenheit', '°F', 5 / 9, 273.15 - 32 * 5 / 9),
    u('kelvin', 'Kelvin', 'K', 1, 0),
    u('rankine', 'Rankine', '°R', 5 / 9, 0),
    u('reaumur', 'Réaumur', '°Ré', 1.25, 273.15),
  ]},
  { id: 'area', name: 'Area', icon: '⬛', base: 'square meter', units: [
    u('square-kilometer', 'Square kilometer', 'km²', 1e6),
    u('hectare', 'Hectare', 'ha', 10000),
    u('are', 'Are', 'a', 100),
    u('square-meter', 'Square meter', 'm²', 1),
    u('square-centimeter', 'Square centimeter', 'cm²', 1e-4),
    u('square-millimeter', 'Square millimeter', 'mm²', 1e-6),
    u('square-mile', 'Square mile', 'mi²', 2589988.110336),
    u('acre', 'Acre', 'ac', 4046.8564224),
    u('square-yard', 'Square yard', 'yd²', 0.83612736),
    u('square-foot', 'Square foot', 'ft²', 0.09290304),
    u('square-inch', 'Square inch', 'in²', 0.00064516),
  ]},
  { id: 'volume', name: 'Volume', icon: '🧪', base: 'cubic meter', units: [
    u('cubic-meter', 'Cubic meter', 'm³', 1),
    u('liter', 'Liter', 'L', 0.001),
    u('milliliter', 'Milliliter', 'mL', 1e-6),
    u('cubic-centimeter', 'Cubic centimeter', 'cm³', 1e-6),
    u('cubic-foot', 'Cubic foot', 'ft³', 0.028316846592),
    u('cubic-inch', 'Cubic inch', 'in³', 1.6387064e-5),
    u('us-gallon', 'US gallon', 'gal', 0.003785411784),
    u('us-quart', 'US quart', 'qt', 0.000946352946),
    u('us-pint', 'US pint', 'pt', 0.000473176473),
    u('us-cup', 'US cup', 'cup', 0.0002365882365),
    u('us-fluid-ounce', 'US fluid ounce', 'fl oz', 2.95735295625e-5),
    u('us-tablespoon', 'US tablespoon', 'tbsp', 1.478676478125e-5),
    u('us-teaspoon', 'US teaspoon', 'tsp', 4.92892159375e-6),
    u('imperial-gallon', 'Imperial gallon', 'gal (UK)', 0.00454609),
    u('imperial-pint', 'Imperial pint', 'pt (UK)', 0.00056826125),
    u('imperial-fluid-ounce', 'Imperial fluid ounce', 'fl oz (UK)', 2.84130625e-5),
    u('oil-barrel', 'Oil barrel', 'bbl', 0.158987294928),
  ]},
  { id: 'time', name: 'Time', icon: '⏱️', base: 'second', units: [
    u('nanosecond', 'Nanosecond', 'ns', 1e-9),
    u('microsecond', 'Microsecond', 'µs', 1e-6),
    u('millisecond', 'Millisecond', 'ms', 1e-3),
    u('second', 'Second', 's', 1),
    u('minute', 'Minute', 'min', 60),
    u('hour', 'Hour', 'h', 3600),
    u('day', 'Day', 'd', 86400),
    u('week', 'Week', 'wk', 604800),
    u('fortnight', 'Fortnight', 'fn', 1209600),
    u('month', 'Month (avg)', 'mo', 2629746),
    u('year', 'Year (Julian)', 'yr', 31557600),
    u('decade', 'Decade', 'dec', 315576000),
    u('century', 'Century', 'c', 3155760000),
  ]},
  { id: 'speed', name: 'Speed', icon: '🚀', base: 'meter/second', units: [
    u('meter-second', 'Meter/second', 'm/s', 1),
    u('kilometer-hour', 'Kilometer/hour', 'km/h', 1 / 3.6),
    u('mile-hour', 'Mile/hour', 'mph', 0.44704),
    u('foot-second', 'Foot/second', 'ft/s', 0.3048),
    u('knot', 'Knot', 'kn', 0.5144444444444445),
    u('mach', 'Mach (sea level)', 'Ma', 340.29),
  ]},
  { id: 'pressure', name: 'Pressure', icon: '🎈', base: 'pascal', units: [
    u('pascal', 'Pascal', 'Pa', 1),
    u('kilopascal', 'Kilopascal', 'kPa', 1000),
    u('megapascal', 'Megapascal', 'MPa', 1e6),
    u('hectopascal', 'Hectopascal', 'hPa', 100),
    u('bar', 'Bar', 'bar', 1e5),
    u('millibar', 'Millibar', 'mbar', 100),
    u('atmosphere', 'Atmosphere', 'atm', 101325),
    u('psi', 'Pound/inch² (psi)', 'psi', 6894.757293168361),
    u('torr', 'Torr', 'Torr', 101325 / 760),
    u('mmhg', 'Millimeter of mercury', 'mmHg', 133.322387415),
    u('inhg', 'Inch of mercury', 'inHg', 3386.389),
    u('kgf-cm2', 'Kilogram-force/cm²', 'kgf/cm²', 98066.5),
  ]},
  { id: 'energy', name: 'Energy', icon: '⚡', base: 'joule', units: [
    u('joule', 'Joule', 'J', 1),
    u('kilojoule', 'Kilojoule', 'kJ', 1000),
    u('megajoule', 'Megajoule', 'MJ', 1e6),
    u('calorie', 'Calorie', 'cal', 4.184),
    u('kilocalorie', 'Kilocalorie (food)', 'kcal', 4184),
    u('watt-hour', 'Watt-hour', 'Wh', 3600),
    u('kilowatt-hour', 'Kilowatt-hour', 'kWh', 3.6e6),
    u('btu', 'British thermal unit', 'BTU', 1055.05585262),
    u('therm', 'Therm', 'thm', 105480400),
    u('foot-pound', 'Foot-pound', 'ft·lb', 1.3558179483314004),
    u('electronvolt', 'Electronvolt', 'eV', 1.602176634e-19),
    u('erg', 'Erg', 'erg', 1e-7),
    u('ton-tnt', 'Ton of TNT', 'tTNT', 4.184e9),
  ]},
  { id: 'power', name: 'Power', icon: '💡', base: 'watt', units: [
    u('watt', 'Watt', 'W', 1),
    u('kilowatt', 'Kilowatt', 'kW', 1000),
    u('megawatt', 'Megawatt', 'MW', 1e6),
    u('milliwatt', 'Milliwatt', 'mW', 1e-3),
    u('horsepower', 'Horsepower (mechanical)', 'hp', 745.6998715822702),
    u('horsepower-metric', 'Horsepower (metric)', 'PS', 735.49875),
    u('btu-hour', 'BTU/hour', 'BTU/h', 0.2930710701722222),
    u('foot-pound-second', 'Foot-pound/second', 'ft·lb/s', 1.3558179483314004),
  ]},
  { id: 'data', name: 'Digital storage', icon: '💾', base: 'byte', units: [
    u('bit', 'Bit', 'b', 0.125),
    u('byte', 'Byte', 'B', 1),
    u('kilobit', 'Kilobit', 'kb', 125),
    u('kilobyte', 'Kilobyte', 'kB', 1000),
    u('kibibyte', 'Kibibyte', 'KiB', 1024),
    u('megabit', 'Megabit', 'Mb', 125000),
    u('megabyte', 'Megabyte', 'MB', 1e6),
    u('mebibyte', 'Mebibyte', 'MiB', 1048576),
    u('gigabit', 'Gigabit', 'Gb', 1.25e8),
    u('gigabyte', 'Gigabyte', 'GB', 1e9),
    u('gibibyte', 'Gibibyte', 'GiB', 1073741824),
    u('terabyte', 'Terabyte', 'TB', 1e12),
    u('tebibyte', 'Tebibyte', 'TiB', 1.099511627776e12),
    u('petabyte', 'Petabyte', 'PB', 1e15),
    u('pebibyte', 'Pebibyte', 'PiB', 1.125899906842624e15),
  ]},
  { id: 'angle', name: 'Angle', icon: '📐', base: 'radian', units: [
    u('radian', 'Radian', 'rad', 1),
    u('milliradian', 'Milliradian', 'mrad', 0.001),
    u('degree', 'Degree', '°', Math.PI / 180),
    u('gradian', 'Gradian', 'grad', Math.PI / 200),
    u('arcminute', 'Arcminute', '′', Math.PI / 10800),
    u('arcsecond', 'Arcsecond', '″', Math.PI / 648000),
    u('turn', 'Turn / revolution', 'turn', 2 * Math.PI),
  ]},
  { id: 'frequency', name: 'Frequency', icon: '📡', base: 'hertz', units: [
    u('hertz', 'Hertz', 'Hz', 1),
    u('kilohertz', 'Kilohertz', 'kHz', 1000),
    u('megahertz', 'Megahertz', 'MHz', 1e6),
    u('gigahertz', 'Gigahertz', 'GHz', 1e9),
    u('terahertz', 'Terahertz', 'THz', 1e12),
    u('rpm', 'Revolutions/minute', 'rpm', 1 / 60),
  ]},
  { id: 'force', name: 'Force', icon: '🥊', base: 'newton', units: [
    u('newton', 'Newton', 'N', 1),
    u('kilonewton', 'Kilonewton', 'kN', 1000),
    u('dyne', 'Dyne', 'dyn', 1e-5),
    u('pound-force', 'Pound-force', 'lbf', 4.4482216152605),
    u('ounce-force', 'Ounce-force', 'ozf', 0.278013850953781),
    u('kilogram-force', 'Kilogram-force', 'kgf', 9.80665),
    u('poundal', 'Poundal', 'pdl', 0.138254954376),
  ]},
  // Non-affine: base is km/L; L/100km is reciprocal so it uses fns.
  { id: 'fuel', name: 'Fuel economy', icon: '⛽', base: 'kilometer/liter', units: [
    u('km-l', 'Kilometer/liter', 'km/L', 1),
    u('mpg-us', 'Miles/gallon (US)', 'mpg', 0.4251437074976),
    u('mpg-uk', 'Miles/gallon (UK)', 'mpg (UK)', 0.3540061899559),
    uf('l-100km', 'Liters/100 km', 'L/100km', v => (v > 0 ? 100 / v : Infinity), b => (b > 0 ? 100 / b : Infinity)),
    uf('mpg-us-inv', 'Gallons(US)/100 mi', 'gal/100mi', v => (v > 0 ? 100 / (v / 0.4251437074976) : Infinity), b => (b > 0 ? 100 / (b / 0.4251437074976) : Infinity)),
  ]},
];

// lookup maps
U.byId = {};
U.unitById = {};
for (const c of U.CATEGORIES) {
  U.byId[c.id] = c;
  U.unitById[c.id] = {};
  for (const un of c.units) U.unitById[c.id][un.id] = un;
}

U.category = (id) => U.byId[id] || null;
U.unit = (catId, unitId) => (U.unitById[catId] || {})[unitId] || null;

const toBase = (un, v) => (un.toBase ? un.toBase(v) : v * un.factor + (un.offset || 0));
const fromBase = (un, b) => (un.fromBase ? un.fromBase(b) : (b - (un.offset || 0)) / un.factor);
U.toBase = toBase;
U.fromBase = fromBase;

// convert a value from one unit to another (same category)
U.convert = (catId, fromId, toId, value) => {
  const c = U.byId[catId]; if (!c) return NaN;
  const f = U.unitById[catId][fromId], t = U.unitById[catId][toId];
  if (!f || !t) return NaN;
  return fromBase(t, toBase(f, value));
};

// convert `value` of `fromId` into EVERY unit in the category → [{unit, value}]
U.spectrum = (catId, fromId, value) => {
  const c = U.byId[catId]; if (!c) return [];
  const f = U.unitById[catId][fromId]; if (!f) return [];
  const base = toBase(f, value);
  return c.units.map(un => ({ unit: un, value: fromBase(un, base) }));
};

// ── number formatting for display ──
// Compact but faithful: thousands-grouped for human ranges, exponential for the
// extremes, ~sig significant digits, trailing zeros trimmed.
U.format = (x, sig = 8) => {
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '−∞';
  if (Number.isNaN(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-4) {
    return x.toExponential(Math.min(sig, 12) - 1).replace(/\.?0+e/, 'e').replace('e', ' × 10^').replace('^-', '^−').replace('^+', '^');
  }
  let s = x.toPrecision(sig);
  if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
  // thousands separators on the integer part
  const neg = s[0] === '-'; if (neg) s = s.slice(1);
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '−' : '') + grouped + (frac ? '.' + frac : '');
};

// full-precision string for copy (no grouping, no rounding artifacts beyond JS)
U.formatFull = (x) => {
  if (!Number.isFinite(x)) return String(x);
  return String(x);
};

U.slugOk = (s) => /^[a-z0-9-]+$/.test(s);

if (typeof globalThis !== 'undefined') globalThis.UNITS = U;
export default U;
