// people.mjs — load and validate the team file.
import { readFileSync } from 'node:fs';

export function loadPeople(path) {
  const people = JSON.parse(readFileSync(path, 'utf8'));
  for (const p of people) {
    if (!p.name || !['nurse', 'aide'].includes(p.role)) throw new Error(`bad person: ${JSON.stringify(p)}`);
    p.fte = Number(p.fte ?? 1);
    p.leave = new Set(p.leave || []);
  }
  return people;
}
