#!/usr/bin/env node
/* hoop-director — the GLOBAL lane's live shell. Folds the firehose of player story saves into the
   cross-player "world pulse" and writes it to morphyx as com.minomobi.hoop.story.pulse (rkey 'self').

   Pure logic is in hoop/story/director.js (node-tested). This is the only impure part: a windowed
   Jetstream replay (resume from the pulse's stored cursor), each com.minomobi.hoop.story.save record
   folded latest-wins per DID, then one putRecord. Rebuildable from cursor 0 — no source-of-truth DB.

   Runs where the morphyx app password lives (the cron Action or a laptop). Reads MORPHYX_HANDLE +
   MORPHYX_PASSWORD. Flags: --dry (fold + print, no write) · --window=SECONDS (default 40).

   NOTE: schedule: only fires from the default branch (GitHub), so the cron is dormant until this
   lands on main; use workflow_dispatch to run it meanwhile.
*/
import { resolveHandle, resolvePds, PdsClient } from '../packages/atproto/pds.js';
import { SAVE_NSID } from '../hoop/story/atproto.js';
import { emptyPulse, foldSave, summarize, pulseToRecord, recordToPulse, PULSE_NSID } from '../hoop/story/director.js';

const DRY = process.argv.includes('--dry');
const windowArg = process.argv.find((a) => a.startsWith('--window='));
const WINDOW_MS = (windowArg ? +windowArg.split('=')[1] : 40) * 1000;
// jetstream2.us-east is a DEAD node — it accepts the connection and advances the cursor but delivers
// zero commits, so the pulse silently folds nobody's saves. Default to a live node (jetstream1.us-east;
// us-west also works). Override with JETSTREAM_URL if this one goes dark too.
const JETSTREAM = process.env.JETSTREAM_URL || 'wss://jetstream1.us-east.bsky.network/subscribe';

const handle = process.env.MORPHYX_HANDLE, password = process.env.MORPHYX_PASSWORD;
if (!handle || !password) { console.error('Set MORPHYX_HANDLE + MORPHYX_PASSWORD.'); process.exit(1); }

const did = await resolveHandle(handle);
const pds = await resolvePds(did);
const client = new PdsClient(pds);
await client.login(handle, password);
console.log(`director: ${handle} (${did}) @ ${pds}`);

// resume from the stored cursor
const prev = await client.getRecord(PULSE_NSID, 'self').catch(() => null);
const pulse = prev && prev.value ? recordToPulse(prev.value) : emptyPulse();
console.log(`resume: ${Object.keys(pulse.players).length} players, cursor ${pulse.cursor || '(start)'}`);

// windowed Jetstream replay
const params = new URLSearchParams({ wantedCollections: SAVE_NSID });
if (pulse.cursor) params.set('cursor', pulse.cursor);
const ws = new WebSocket(`${JETSTREAM}?${params}`);
let folded = 0, lastCursor = pulse.cursor;

await new Promise((resolve) => {
  const done = () => { try { ws.close(); } catch (e) {} resolve(); };
  const timer = setTimeout(done, WINDOW_MS);
  ws.onerror = (e) => { console.error('jetstream error:', e && e.message || e); clearTimeout(timer); done(); };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.time_us) lastCursor = String(m.time_us);
    const c = m.commit;
    if (!c || c.collection !== SAVE_NSID || (c.operation !== 'create' && c.operation !== 'update')) return;
    const stateJson = c.record && c.record.stateJson;
    if (!stateJson) return;
    try { foldSave(pulse, m.did, JSON.parse(stateJson)); folded++; } catch (e) { /* skip bad save */ }
  };
});

pulse.cursor = lastCursor || pulse.cursor;
const sum = summarize(pulse);
console.log(`folded ${folded} save events this window → ${sum.travellers} travellers, ${sum.totalMet} crystallizations`);
console.log('  top content:', sum.topContent.map(([id, n]) => `${id}×${n}`).join(' ') || '(none)');

if (DRY) { console.log('\n--dry: nothing written.'); process.exit(0); }
await client.putRecord(PULSE_NSID, 'self', pulseToRecord(pulse));
console.log(`✓ wrote pulse (cursor ${pulse.cursor})`);
