#!/usr/bin/env node
import { readSession } from './lib/read.mjs';
import { reduce } from './lib/reduce.mjs';

for (const path of process.argv.slice(2)) console.log(JSON.stringify(reduce(readSession(path))));
