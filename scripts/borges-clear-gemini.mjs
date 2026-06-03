#!/usr/bin/env node
/* borges-clear-gemini — delete the live (model-rendered) borges records from the
   morphyx service repo, so the book can be re-rolled against the current engine.
   Keeps the hand-authored exemplar (model "hand-authored", tale № 1); deletes
   every com.minomobi.borges.{telling,banter} record whose model is anything else
   (i.e. the Gemini renders). Idempotent — a re-run after a clean sweep is a no-op.

   Runs where the morphyx app password lives: the GitHub Action
   (clear-borges.yml) or a laptop. Reads MORPHYX_HANDLE + MORPHYX_PASSWORD from
   the environment. Pass --dry to list what would be deleted without deleting.

   Usage:
     MORPHYX_HANDLE=morphyxmino.bsky.social MORPHYX_PASSWORD=xxxx \
       node scripts/borges-clear-gemini.mjs            # deletes
     node scripts/borges-clear-gemini.mjs --dry        # no creds needed? (still needs login to list)

   Re-roll note: a push touching this file re-fires the clear so the book can be
   rolled fresh against the current engine (e.g. after the burial-mound gate).
*/
import { resolveHandle, resolvePds, PdsClient } from "../packages/atproto/pds.js";

const COLLECTIONS = ["com.minomobi.borges.telling", "com.minomobi.borges.banter"];
const KEEP_MODEL = "hand-authored";
const DRY = process.argv.includes("--dry");

(async () => {
  const handle = process.env.MORPHYX_HANDLE, password = process.env.MORPHYX_PASSWORD;
  if (!handle || !password) throw new Error("set MORPHYX_HANDLE and MORPHYX_PASSWORD (app password) in the environment");
  const did = await resolveHandle(handle);
  const pds = await resolvePds(did);
  console.log("identity: " + handle + " → " + did + " @ " + pds);
  const client = new PdsClient(pds);
  await client.login(handle, password);

  let deleted = 0, kept = 0;
  for (const collection of COLLECTIONS) {
    let cursor;
    do {
      const page = await client.listRecords(collection, 100, cursor);
      cursor = page.cursor;
      for (const rec of (page.records || [])) {
        const rkey = rec.uri.split("/").pop();
        const model = rec.value && rec.value.model;
        if (model === KEEP_MODEL) { kept++; console.log("· keep   " + collection + "/" + rkey + " (" + model + ")"); continue; }
        if (DRY) { console.log("[dry] would delete " + collection + "/" + rkey + " (" + model + ")"); deleted++; continue; }
        await client.deleteRecord(collection, rkey);
        console.log("✗ delete " + collection + "/" + rkey + " (" + model + ")");
        deleted++;
      }
    } while (cursor);
  }
  console.log("\n" + (DRY ? "[dry] would delete " : "deleted ") + deleted + " record(s), kept " + kept + " hand-authored.");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
