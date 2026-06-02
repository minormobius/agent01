// Basket Star — mounts the shared organism engine with the basket body plan.
// All the heavy lifting (WebGPU, brain, trail, flow, UI) lives in ../lib/;
// the body plan + params live in ./organism.js.
import { mountOrganism } from '../lib/engine.js';
import { organism } from './organism.js';

mountOrganism(organism);
