// Node selftest for unit/lib/units.js — run before touching the engine/data:
//   node unit/lib/units.selftest.mjs
import U from './units.js';

let fail = 0;
const approx = (got, want, label, tol = 1e-6) => {
  const rel = Math.abs(got - want) / (Math.abs(want) || 1);
  if (!(rel <= tol)) { console.error(`✗ ${label}: got ${got}, want ${want} (rel ${rel.toExponential(2)})`); fail++; }
};
const eq = (got, want, label) => { if (got !== want) { console.error(`✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } };

// length
approx(U.convert('length', 'meter', 'foot', 1), 3.280839895, 'm→ft');
approx(U.convert('length', 'mile', 'kilometer', 1), 1.609344, 'mi→km');
approx(U.convert('length', 'inch', 'centimeter', 1), 2.54, 'in→cm');
approx(U.convert('length', 'light-year', 'meter', 1), 9460730472580800, 'ly→m', 1e-9);

// mass
approx(U.convert('mass', 'pound', 'kilogram', 1), 0.45359237, 'lb→kg');
approx(U.convert('mass', 'kilogram', 'pound', 1), 2.2046226218, 'kg→lb');
approx(U.convert('mass', 'stone', 'pound', 1), 14, 'stone→lb');

// temperature (affine)
approx(U.convert('temperature', 'celsius', 'fahrenheit', 100), 212, 'C→F 100');
approx(U.convert('temperature', 'celsius', 'fahrenheit', 0), 32, 'C→F 0');
approx(U.convert('temperature', 'fahrenheit', 'celsius', 98.6), 37, 'F→C body');
approx(U.convert('temperature', 'celsius', 'kelvin', 0), 273.15, 'C→K');
approx(U.convert('temperature', 'kelvin', 'celsius', 0), -273.15, 'K→C abs zero');
approx(U.convert('temperature', 'celsius', 'rankine', 0), 491.67, 'C→R');

// volume
approx(U.convert('volume', 'us-gallon', 'liter', 1), 3.785411784, 'galUS→L');
approx(U.convert('volume', 'liter', 'us-cup', 1), 4.226752838, 'L→cup');
approx(U.convert('volume', 'us-tablespoon', 'us-teaspoon', 1), 3, 'tbsp→tsp');

// speed
approx(U.convert('speed', 'kilometer-hour', 'mile-hour', 100), 62.13711922, 'km/h→mph');
approx(U.convert('speed', 'knot', 'kilometer-hour', 1), 1.852, 'kn→km/h');

// pressure
approx(U.convert('pressure', 'atmosphere', 'pascal', 1), 101325, 'atm→Pa');
approx(U.convert('pressure', 'bar', 'psi', 1), 14.503773773, 'bar→psi');

// energy
approx(U.convert('energy', 'kilowatt-hour', 'joule', 1), 3.6e6, 'kWh→J');
approx(U.convert('energy', 'kilocalorie', 'joule', 1), 4184, 'kcal→J');

// data (decimal vs binary)
approx(U.convert('data', 'kibibyte', 'byte', 1), 1024, 'KiB→B');
approx(U.convert('data', 'megabyte', 'byte', 1), 1e6, 'MB→B');
approx(U.convert('data', 'byte', 'bit', 1), 8, 'B→bit');

// angle
approx(U.convert('angle', 'degree', 'radian', 180), Math.PI, 'deg→rad');
approx(U.convert('angle', 'turn', 'degree', 1), 360, 'turn→deg');

// fuel economy (non-affine)
approx(U.convert('fuel', 'mpg-us', 'l-100km', 30), 7.84049, 'mpg→L/100km', 1e-4);
approx(U.convert('fuel', 'l-100km', 'mpg-us', 7.84049), 30, 'L/100km→mpg', 1e-4);
approx(U.convert('fuel', 'km-l', 'mpg-us', 10), 23.5215, 'km/L→mpg', 1e-4);

// spectrum returns one entry per unit
const spec = U.spectrum('length', 'meter', 1);
eq(spec.length, U.category('length').units.length, 'spectrum length');
approx(spec.find(s => s.unit.id === 'foot').value, 3.280839895, 'spectrum foot');

// formatting
eq(U.format(0), '0', 'fmt 0');
eq(U.format(1000), '1,000', 'fmt grouping');
eq(U.format(3.280839895), '3.2808399', 'fmt sigfigs');
eq(U.format(Infinity), '∞', 'fmt inf');

if (fail) { console.error(`\n${fail} check(s) failed`); process.exit(1); }
console.log('✓ unit/lib/units.js — all checks passed');
