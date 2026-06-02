#!/usr/bin/env node
/* seed-borges-tellings — write hand-authored / frozen borges records to the
   service PDS: com.minomobi.borges.telling (the telling) and
   com.minomobi.borges.banter (the lead-in scene), both keyed rkey = page number.
   Currently seeds the gold-standard exemplar (tale № 1) and its banter. Runs
   where the app password lives — the GitHub Action (workflow: seed-borges.yml)
   or a laptop.

   Identity: resolves the handle to its DID and PDS at runtime, so it follows a
   PDS migration. Reads MORPHYX_HANDLE + MORPHYX_PASSWORD (an app password) from
   the environment. Pass --dry to build and print the record without writing.

   Usage:
     MORPHYX_HANDLE=morphyxmino.bsky.social MORPHYX_PASSWORD=xxxx \
       node scripts/seed-borges-tellings.mjs            # writes
     node scripts/seed-borges-tellings.mjs --dry        # no write, no creds needed
*/
import { readFileSync } from "fs";
import vm from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { resolveHandle, resolvePds, PdsClient } from "../packages/atproto/pds.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TELLING = "com.minomobi.borges.telling";
const BANTER = "com.minomobi.borges.banter";
const DRY = process.argv.includes("--dry");

// ── load the borges engine + exemplar (browser IIFEs that attach to globalThis) ──
function loadBorges() {
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ["js/prng.js", "js/tellers.js", "js/lexicon.js", "js/generate.js", "js/frame.js", "js/exemplar.js"]) {
    vm.runInContext(readFileSync(join(ROOT, "borges", f), "utf8"), ctx, { filename: f });
  }
  return ctx.BORGES;
}

function recordFromExemplar(ex) {
  return {
    $type: TELLING,
    n: ex.n,
    teller: ex.teller || "",
    title: ex.title || "",
    frame: ex.frame || "",
    movements: (ex.movements || []).map((m) => ({ title: String(m.title || ""), body: String(m.body || "") })),
    model: ex.model || "hand-authored",
    createdAt: ex.createdAt || new Date().toISOString(),
  };
}

function recordFromBanter(ex) {
  return {
    $type: BANTER,
    n: ex.n,
    phase: ex.phase || "",
    pair: (ex.pair || []).map(String),
    lines: (ex.lines || []).map((l) => ({ speaker: String(l.speaker || ""), line: String(l.line || "") })),
    model: ex.model || "hand-authored",
    createdAt: ex.createdAt || new Date().toISOString(),
  };
}

(async () => {
  const B = loadBorges();
  if (!B || !B.exemplar) throw new Error("could not load BORGES.exemplar");
  // each entry: [collection, record]. Extend with more frozen tellings/banters here.
  const records = [[TELLING, recordFromExemplar(B.exemplar)]];
  if (B.exemplarBanter) records.push([BANTER, recordFromBanter(B.exemplarBanter)]);

  if (DRY) {
    for (const [col, rec] of records) console.log("[dry] would put " + col + " rkey=" + rec.n + ":\n" + JSON.stringify(rec, null, 2));
    console.log("\n[dry] " + records.length + " record(s); no write performed.");
    return;
  }

  const handle = process.env.MORPHYX_HANDLE, password = process.env.MORPHYX_PASSWORD;
  if (!handle || !password) throw new Error("set MORPHYX_HANDLE and MORPHYX_PASSWORD (app password) in the environment");
  // the repo's shared atproto client — resolve identity, login, putRecord
  const did = await resolveHandle(handle);
  const pds = await resolvePds(did);
  console.log("identity: " + handle + " → " + did + " @ " + pds);
  const client = new PdsClient(pds);
  await client.login(handle, password);
  for (const [col, rec] of records) {
    const res = await client.putRecord(col, String(rec.n), rec);
    console.log("✓ put " + col + " rkey=" + rec.n + " → " + res.uri);
  }
  console.log("done: " + records.length + " record(s) written to " + handle + "'s repo.");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
