/**
 * Unified OAuth scope for all mino.mobi sites.
 *
 * ATProto OAuth forbids prefix wildcards (`repo:com.minomobi.*` is illegal) —
 * only exact NSIDs or the blanket `repo:*` are allowed, and `repo:*` is just
 * `transition:generic` by another name. So a single scope that "works for every
 * site but isn't transition:generic" has to enumerate every collection any site
 * writes. This file is that enumeration — the union of a full repo-wide audit of
 * createRecord / putRecord / deleteRecord / uploadBlob call sites.
 *
 * THE MODEL (per-site narrow + incremental). A login should request only the
 * collections THAT site writes, so the Bluesky consent screen lists a short,
 * legible set — a 50-line enumerated union reads as scarier than transition:generic,
 * which defeats the point of enumerating. Sites pass their own scope to
 * `login(handle, { scope })`; cross-site writes escalate JUST-IN-TIME via the client
 * lib's `ensureScope()` (re-consent for the union of held + needed), so the shared
 * .mino.mobi session ACCUMULATES scope as you actually use sites instead of asking
 * for everything up front. hoop is the first site on the narrow model.
 *
 * Two derived strings:
 *   UNIFIED_SCOPE  — the enumerated union. BACK-COMPAT FALLBACK only: it's what a
 *                    `login()` with no `scope` still mints (so un-migrated sites keep
 *                    working), and it's the long consent screen we're moving away
 *                    from. New/updated sites should pass a narrow scope instead.
 *   METADATA_SCOPE — the CEILING declared in client-metadata.json: UNIFIED_SCOPE
 *                    plus transition:generic, which a few grandfathered sites
 *                    (fluoddity, mmo) still request explicitly. The auth server only
 *                    grants what the metadata declares, so the ceiling must remain a
 *                    superset of every scope any site can ask for — narrow per-site
 *                    requests are always a subset of this, so the ceiling is unchanged
 *                    by the narrow-scope move. Keep every collection listed here.
 *
 * When a new site ships a new lexicon, add its collection here and redeploy the auth
 * worker — that keeps the ceiling a superset so the site can request it (narrowly).
 */

// Every collection (NSID) written across the repo. Keep alphabetical within
// each namespace group so diffs are legible when a site adds a lexicon.
const WRITE_COLLECTIONS = [
  // answers
  'com.minomobi.answers',
  // airchat
  'com.minomobi.airchat.voice',
  // photo (ATProto Arena)
  'com.minomobi.arena.album',
  'com.minomobi.arena.image',
  // org / calendar
  'com.minomobi.cal.event',
  // cards
  'com.minomobi.cards.catalog',
  // crm / org (cleartext contact/deal/expense types, written inside sealed)
  'com.minomobi.crm.contact',
  'com.minomobi.crm.deal',
  'com.minomobi.crm.expense',
  // fluoddity
  'com.minomobi.fluoddity.expedition',
  'com.minomobi.fluoddity.organism',
  'com.minomobi.fluoddity.rubric',
  // hoop (collaborative design space for the infinite game)
  'com.minomobi.hoop.place',
  'com.minomobi.hoop.message',
  'com.minomobi.hoop.story.save',
  // story.content: the SHARED authored spine lives in the service repo, but a
  // player's live-generated personal side-quests (lane:'sidequest') are frozen
  // to THEIR OWN repo as story.content records — so a signed-in player needs
  // write on this collection too (the shared spine is written by the service key).
  'com.minomobi.hoop.story.content',
  // story.rumor: a write-only outbox in the player's OWN repo — rumors they spread, which
  // the engine tails off the firehose and may answer with a verdict or new content.
  'com.minomobi.hoop.story.rumor',
  // ecdysium (sci-fi horror roguelike at aub.mino.mobi) — single autosave,
  // one record per player (rkey 'self') holding the serialized run snapshot.
  'com.minomobi.ecdysium.save',
  // io (atproto tracker portal)
  'com.minomobi.io.ticket',
  // labglass
  'com.minomobi.labglass.cell',
  'com.minomobi.labglass.notebook',
  // mappa (shared procedural worlds)
  'com.minomobi.mappa.world',
  // mmopaint (poll sub-room)
  'com.minomobi.mmopaint.stroke',
  // music
  'com.minomobi.music.composition',
  // sprite — portable NPC sprite sets (mega.mino.mobi/sprite)
  'com.minomobi.sprite.set',
  // poll
  'com.minomobi.poll.ballot',
  'com.minomobi.poll.def',
  'com.minomobi.poll.tally',
  // org (project management)
  'com.minomobi.pm.project',
  'com.minomobi.pm.schedule',
  'com.minomobi.pm.task',
  'com.minomobi.pm.team',
  // crm / org (encrypted vault — the sealed envelope plus its inner types)
  'com.minomobi.vault.approval',
  'com.minomobi.vault.config',
  'com.minomobi.vault.contact',
  'com.minomobi.vault.decision',
  'com.minomobi.vault.encryptionKey',
  'com.minomobi.vault.keyring',
  'com.minomobi.vault.membership',
  'com.minomobi.vault.note',
  'com.minomobi.vault.notification',
  'com.minomobi.vault.notificationDismissal',
  'com.minomobi.vault.notificationPrefs',
  'com.minomobi.vault.org',
  'com.minomobi.vault.orgBookmark',
  'com.minomobi.vault.orgRelationship',
  'com.minomobi.vault.proposal',
  'com.minomobi.vault.sealed',
  'com.minomobi.vault.sheet',
  'com.minomobi.vault.template',
  'com.minomobi.vault.todo',
  'com.minomobi.vault.wrappedIdentity',
  'com.minomobi.vault.workflowRule',
  // wave
  'com.minomobi.wave.channel',
  'com.minomobi.wave.op',
  'com.minomobi.wave.thread',
  // wiki
  'com.minomobi.wiki.note',
  // yarrow — the drying loft (g.mino.mobi/sticks) saves cured stick genomes
  'com.minomobi.yarrow.stick',
  // bakery
  'exchange.recipe.recipe',
  // poll + wave post to Bluesky proper
  'app.bsky.feed.post',
  // feedgen (b.mino.mobi/feedgen) — the feed definition record + the published feed generator
  'com.minomobi.feedgen.def',
  'app.bsky.feed.generator',
];

// Blob MIME patterns uploaded across the repo (photo: image, poll/mmo: png,
// airchat: audio, org: encrypted octet-stream, wave: video).
const BLOB_TYPES = [
  'image/*',
  'video/*',
  'audio/*',
  'application/octet-stream',
];

// RPC scopes. getServiceAuth mints the short-lived service JWT for Bluesky
// video uploads. Declared without an `aud` param to match the previously
// working production metadata.
const RPC_SCOPES = [
  'com.atproto.server.getServiceAuth',
];

const repoTokens = WRITE_COLLECTIONS.map((c) => `repo:${c}`);
const blobTokens = BLOB_TYPES.map((m) => `blob:${m}`);
const rpcTokens = RPC_SCOPES.map((m) => `rpc:${m}`);

/** Default scope a login mints. Enumerated union — never transition:generic. */
export const UNIFIED_SCOPE = ['atproto', ...repoTokens, ...blobTokens, ...rpcTokens].join(' ');

/**
 * Ceiling declared in client-metadata.json. UNIFIED_SCOPE plus transition:generic
 * for the grandfathered sites (fluoddity, mmo) that still request it explicitly.
 */
export const METADATA_SCOPE = ['atproto', 'transition:generic', ...repoTokens, ...blobTokens, ...rpcTokens].join(' ');
