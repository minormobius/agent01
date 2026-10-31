import { Sim } from './des.mjs';
const s = new Sim(); let ok = 0; s.schedule(1, () => ok++); s.run(); process.exit(ok === 1 ? 0 : 1);
