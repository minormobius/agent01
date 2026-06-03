// Syllis ramosa — mounts the shared organism engine with the branching-worm
// body plan. Engine + brain + trail + flow live in ../lib/; body plan in ./organism.js.
import { mountOrganism } from '../lib/engine.js';
import { organism } from './organism.js';

mountOrganism(organism);
