/* ATOM⁴'s table as the site shows it: js/table.js (the bake: every open subshell given Hund spins) with the
   term-corrected entries of js/terms.js laid over it, so the pages agree with paper 1's main table. HUNDSPIN is the
   bake itself (the paper's supplement S1). Import the table from here, not from table.js. */
import { TABLE as BAKE, RPLOT, SHELL_COUNTERFACTUAL } from "./table.js";
import { TERMS } from "./terms.js";
export { RPLOT, SHELL_COUNTERFACTUAL };
export const HUNDSPIN = BAKE;
export const TABLE = { ...BAKE, 4: BAKE[4].map((el) => (TERMS[el.Z] ? { ...el, ...TERMS[el.Z] } : el)) };
