#!/usr/bin/env node
import { loadPeople } from './lib/people.mjs';
import { makeRota } from './lib/assign.mjs';

const [file, start, n] = process.argv.slice(2);
try {
  console.log(JSON.stringify(makeRota(loadPeople(file), start, Number(n))));
} catch (e) {
  console.error(`rota: ${e.message}`);
  process.exit(1);
}
