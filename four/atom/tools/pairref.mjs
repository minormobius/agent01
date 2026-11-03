/* Our molecules' pairs in a standard large basis by an independent code (PySCF, density-fitted MP2), for the runner:
   the OF₂ check showed the book's grown basis (Dd) equals aug-cc-pVDZ and catches only ~70% of the pair's binding, so
   the field is refitted to aug-cc-pVTZ pairs. Installs PySCF once (pip, user site), then runs tools/pairref.py on the
   placement molpair.mjs cached for k (pairDd-<name>-<k>.json, or pair-…), writing pairTZ-<name>-<k>.json beside it.
     node four/atom/tools/pairref.mjs <OF2> <k> [basis]      default aug-cc-pvtz; our world only
   molff.mjs fit OF2 --plus=TZ then reads them, and liquid.mjs's model of3t runs on that field. */
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
const here = path.dirname(new URL(import.meta.url).pathname), DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-molpair");
const [name, karg, basis = "aug-cc-pvtz"] = process.argv.slice(2), k = +karg, SYMS = { OF2: "O,F,F" };
if (!SYMS[name]) { console.error("our world's molecules only: OF2"); process.exit(1); }
const out = path.join(DIR, `pairTZ-${name}-${k}.json`);
if (!existsSync(out)) {
  const src = [`pairDd-${name}-${k}.json`, `pair-${name}-${k}.json`].map((f) => path.join(DIR, f)).find(existsSync); if (!src) { console.error(`no placement ${k} cached`); process.exit(1); }
  // PySCF once per machine: the first command takes a lock and installs, the others wait for the import to work
  const has = () => { try { execFileSync("python3", ["-c", "import pyscf"], { stdio: "ignore" }); return true; } catch { return false; } };
  if (!has()) { const lock = path.join(os.tmpdir(), "pyscf-install.lock");
    try { mkdirSync(lock); try { execFileSync("python3", ["-m", "pip", "install", "--user", "-q", "pyscf"], { stdio: "inherit" }); } finally { rmSync(lock, { recursive: true, force: true }); } }
    catch (e) { if (e.code !== "EEXIST") throw e; for (let t = 0; t < 240 && !has(); t++) execFileSync("sleep", ["5"]); } }
  execFileSync("python3", ["-I", path.join(here, "pairref.py"), src, out, basis, SYMS[name]], { stdio: "inherit", env: { ...process.env, OMP_NUM_THREADS: "1" } });
}
const r = JSON.parse(readFileSync(out, "utf8")); console.log(`${name} ${k} in ${r.basis}: MP2 ${(r.mp2 * 627.5095).toFixed(3)} kcal/mol, HF ${(r.hf * 627.5095).toFixed(3)}, ${r.n} functions, ${r.ok ? "converged" : "NOT converged"}, ${r.s} s`);
