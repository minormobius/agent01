/* The ionic model's independent check, for the runner: periodic DFT (PySCF; PBE, GTH pseudopotentials, DZVP) on a
   known compound's candidate structures (tools/crystalref-<compound>.json: our corundum and θ-alumina as measured, and
   the ionic search's lowest minimum), each cell reduced to its primitive one and scaled isotropically by <scale>.
   Installs PySCF once (pip, user site, locked), then runs tools/crystalref.py.
     node four/atom/tools/crystalref.mjs Al2O3 <corundum|theta|impostor|poly6> <scale> [threads]   → $TMPDIR/atom4-ionic/dft-…json
   (threads: OpenMP threads, default 1; give a 20-atom cell a runner of its own and 4)
     node four/atom/tools/crystalref.mjs Al2O3 table                                 each structure's lowest E(scale) */
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
const here = path.dirname(new URL(import.meta.url).pathname), DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-ionic"); mkdirSync(DIR, { recursive: true });
const [cmp, name, sarg, targ] = process.argv.slice(2), src = path.join(here, `crystalref-${cmp}.json`);
if (!existsSync(src)) { console.error(`no ${src}`); process.exit(1); }
if (name === "table") {
  const rows = readdirSync(DIR).filter((f) => f.startsWith(`dft-${cmp}-`)).map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8"))), best = {};
  for (const r of rows) if (r.converged && (!best[r.name] || r.perFormula_eV < best[r.name].perFormula_eV)) best[r.name] = r;
  const ref = best.corundum?.perFormula_eV;
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name) || a.scale - b.scale)) console.log(`${r.name.padEnd(9)} ×${r.scale.toFixed(2)}: ${r.perFormula_eV.toFixed(3)} eV/formula${ref != null ? ` (${(r.perFormula_eV - ref >= 0 ? "+" : "") + (r.perFormula_eV - ref).toFixed(3)} vs corundum's best)` : ""}, k ${r.kmesh.join("×")}, ${r.converged ? "" : "NOT converged, "}${r.seconds.toFixed(0)} s`);
  process.exit(0);
}
const scale = +sarg, out = path.join(DIR, `dft-${cmp}-${name}-${scale.toFixed(3)}.json`);
if (!existsSync(out)) {
  const has = () => { try { execFileSync("python3", ["-c", "import pyscf"], { stdio: "ignore" }); return true; } catch { return false; } };
  if (!has()) { const lock = path.join(os.tmpdir(), "pyscf-install.lock");
    try { mkdirSync(lock); try { execFileSync("python3", ["-m", "pip", "install", "--user", "-q", "pyscf"], { stdio: "inherit" }); } finally { rmSync(lock, { recursive: true, force: true }); } }
    catch (e) { if (e.code !== "EEXIST") throw e; for (let t = 0; t < 240 && !has(); t++) execFileSync("sleep", ["5"]); } }
  // not -I: that drops the user site-packages PySCF was installed into (our own script, run from the temp dir)
  execFileSync("python3", [path.join(here, "crystalref.py"), src, name, String(scale), out], { stdio: "inherit", cwd: os.tmpdir(), env: { ...process.env, OMP_NUM_THREADS: String(+targ || 1) } });
}
const r = JSON.parse(readFileSync(out, "utf8")); console.log(`${cmp} ${name} ×${scale}: ${r.perFormula_eV.toFixed(4)} eV per formula, ${r.converged ? "converged" : "NOT converged"}`);
