# hoop story — test plan

Three layers: **automated** (runs in the sandbox), **post-deploy smoke** (the live site — things the
sandbox can't reach: real PDS, OAuth, the browser), and **the save lane** (auth + cross-device). The
guiding invariant: *every ATProto/auth path is additive and guarded — with no network and no login the
story tab still works fully (bundled pool + localStorage).* So the first question for any failure is
"did it fall back correctly?"

## 1. Automated (sandbox — run before every push)

```bash
node hoop/test/story.selftest.mjs          # engine: keystone, dispatch, inventory, dialogue, validator, snapshot (48)
node hoop/test/story-atproto.selftest.mjs  # bridge: pool⇄records, save⇄record, loadOwnSave, repo-sourced engine (13)
node hoop/test/sprite.selftest.mjs         # sprite kernel + role override (25)
for t in hoop/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done   # whole suite must be green
node hoop/scripts/seed-story-pool.mjs --dry   # seeder builds 23 records without creds
# v3 module parses (it's browser code; parse-only):
awk '/<script type="module">/{f=1;next} /<\/script>/{f=0} f' hoop/v3/index.html > /tmp/v3.mjs && node --check /tmp/v3.mjs
```

Covered automatically: the keystone (crystallize→recall on a stable `feature_key`), tier+`requires`
gating, dispatch variety/no-repeat, the role→tag bridge, inventory/equip/derive-stats, gated dialogue
with effects, the dialogue validator catching real defects, snapshot↔restore, and the full ATProto
mapping (content⇄record, save⇄record, own-repo read) over a mock PDS.

## 2. Post-deploy smoke (live — `https://hoop.mino.mobi/v3/`)

**Pool sourced from ATProto (no DB):**
- [ ] Open `/v3/`. Click a resident → **story** tab. A lore/item/dialogue appears → the engine ran.
- [ ] DevTools ▸ Network: a `listRecords?...collection=com.minomobi.hoop.story.content` request to
      `chalciporus...host.bsky.network` returns 23 records. That's the pool, live from morphyx's repo.
- [ ] Verify the source of truth directly (no app needed):
      ```
      curl 'https://chalciporus.us-west.host.bsky.network/xrpc/com.atproto.repo.listRecords?repo=did:plc:yivyyp54vddf7qf2lpsikhe4&collection=com.minomobi.hoop.story.content&limit=30' | jq '.records|length'   # → 23
      ```
- [ ] **Fallback:** temporarily set `STORY_SERVICE.did=''` (or block the host) → story tab still works
      from bundled `pool.json`. No console errors, no broken tab.

**The story tab itself:**
- [ ] **Crystallize/recall:** open a resident's story, note the NPC/line + `⌂ gid#ord`. Close, reopen
      the *same* resident → identical content (recall), not a new roll.
- [ ] **Determinism:** the `⌂` chamber id is `gx|gy|gz#n` and is stable across reloads for that resident.
- [ ] **Role→tag bridge:** a `heal` resident → a heal-flavoured figure (the Medic); `govern` → the
      Keeper; a role with no tagged NPC → still gets *a* figure (graceful fallback), never a crash.
- [ ] **Dialogue:** click gated choices; standing changes; a choice that grants an item shows
      "✦ received …". The Keeper's "I need to get below" only appears after standing ≥ 1.
- [ ] **Forum tab** still shows the social web (who they know, click to hop). Both tabs on one figure.

**Persistence (anonymous, localStorage):**
- [ ] Crystallize a few residents, advance a dialogue. Reload → same residents recall, standing kept.
- [ ] `⟲ reset` in the story tab → reload → fresh (no crystallizations). `localStorage['hoop.story.v1:local']`
      is gone.

## 3. The save lane (auth → your own repo)

**Sign in:**
- [ ] Top-right shows "sign in to save your story". Click → enter a Bluesky handle → OAuth consent →
      redirect back to `/v3/`. Pill now shows "@handle — story saved to your repo".
- [ ] (Consent screen currently asks broad `transition:generic` — see the TODO; tightening to
      `repo:com.minomobi.hoop.story.save` needs that NSID added to `workers/auth` scope.ts + redeploy.)

**Durable, cross-device:**
- [ ] Signed in, crystallize residents + advance a dialogue. Wait ~4 s (debounced) or close the tab.
- [ ] Verify the save landed in YOUR repo (replace `<did>`/`<pds>`):
      ```
      curl 'https://<pds>/xrpc/com.atproto.repo.getRecord?repo=<did>&collection=com.minomobi.hoop.story.save&rkey=7' | jq '.value.updatedAt, (.value.stateJson|fromjson|.placements|length)'
      ```
- [ ] **Reload** → state restored *from the repo* (not just localStorage): same crystallizations, standing.
- [ ] **Cross-device:** open `/v3/` in another browser/profile, sign in as the same handle → your story
      is there (SSO cookie or fresh login both work; the save is read from your repo).
- [ ] **Batching:** rapidly click many choices → DevTools shows **one** `putRecord` after you stop
      (~4 s), not one per click. (The "never a record per footstep" rule.)

**Identity transitions:**
- [ ] Anonymous play (localStorage) → sign in → you switch to your repo save (anon progress is a separate
      `:local` namespace; expected, by design).
- [ ] **Sign out** → pill reverts; you're back on the anonymous `:local` store.
- [ ] **Nuke when signed in:** `⟲ reset` deletes the repo save record too (best-effort `deleteRecord`);
      reload → fresh, and `getRecord …rkey=7` → 404.

## 4. Failure / edge cases (must degrade, never break)

| Inject | Expected |
|---|---|
| morphyx repo empty / host down | falls back to bundled `pool.json`; story tab works |
| not signed in | localStorage-only; no auth calls; no errors |
| `putSave` 403 (scope/justified) | caught + ignored; localStorage still holds state; surfaced only in console |
| localStorage full / private mode | snapshot stays in-memory; no throw |
| OAuth redirect fails / cancelled | stays anonymous; `showErr` on a thrown login, otherwise silent |

## 5. What still needs a real environment to prove

The OAuth round-trip, the live `putRecord` to a player's repo, and the consent-scope behaviour **cannot
be exercised from the sandbox** (no secrets, no browser, no network writes) — verify them on deploy via
§3. The pool lane (§2) *is* verifiable now: the 23 content records are live on morphyx (confirmed via
the public `listRecords` endpoint).
