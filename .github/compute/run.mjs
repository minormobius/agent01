// Runs one group of ATOM⁴ tool commands side by side on a runner, each until it finishes or the deadline, then
// writes each one's log and a status file. Commands are split into words and spawned without a shell (plan.mjs has
// already refused anything but `node four/<part>/tools/<tool>.mjs <plain words>`). The tools keep their caches in
// $TMPDIR and save every few seconds, so a command cut at the deadline loses only its last few seconds, and the next
// run of the same queue resumes it.
//   GROUP='{"name":…,"cmds":[…]}' MINUTES=330 OUT=dir node .github/compute/run.mjs
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const g = JSON.parse(process.env.GROUP), minutes = +process.env.MINUTES, out = process.env.OUT, t0 = Date.now();
mkdirSync(out, { recursive: true });
const runs = g.cmds.map((cmd, i) => new Promise((done) => {
  const [, ...args] = cmd.split(" "), log = createWriteStream(path.join(out, `${i}.log`)), t = Date.now();
  log.write(`$ ${cmd}\n`);
  const p = spawn(process.execPath, ["--max-old-space-size=3500", ...args], { stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.pipe(log, { end: false }); p.stderr.pipe(log, { end: false });
  const cut = setTimeout(() => { log.write(`\n[cut at the deadline, ${minutes} min]\n`); p.kill("SIGTERM"); }, Math.max(0, minutes * 60e3 - (Date.now() - t0)));
  p.on("close", (code, signal) => { clearTimeout(cut); log.end(); done({ cmd, code, signal, cut: signal === "SIGTERM", seconds: Math.round((Date.now() - t) / 1000) }); });
}));
const status = await Promise.all(runs);
writeFileSync(path.join(out, "status.json"), JSON.stringify({ group: g.name, status }, null, 1));
for (const s of status) console.log(`${s.code === 0 ? "ok " : s.cut ? "cut" : "ERR"} ${s.seconds}s ${s.cmd}`);
