// assign.mjs — who works when.
import { days } from './calendar.mjs';

export function makeRota(people, start, n) {
  const rota = {};
  const team = [...people].sort((a, b) => a.name.localeCompare(b.name));
  for (const day of days(start, n)) {
    const free = team.filter((p) => !p.leave.has(day));
    const nurse = free.find((p) => p.role === 'nurse');
    if (!nurse) throw new Error(`no nurse available on ${day}`);
    const other = free.find((p) => p !== nurse);
    if (!other) throw new Error(`nobody to pair with ${nurse.name} on ${day}`);
    rota[day] = [nurse.name, other.name];
  }
  return rota;
}
