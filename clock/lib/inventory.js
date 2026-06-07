// ─────────────────────────────────────────────────────────────────────────────
// inventory.js — the drying loft's store. Persists stick GENOMES (curing is
// recomputed live by sticks.js from reapedAt+tends, so we never re-write state).
//
// Two layers, always consistent:
//   • localStorage  — the always-on working store. Works offline / signed-out,
//                     so the loft is fully usable (and testable) with no auth.
//   • PDS (ATProto) — when signed in via the shared auth worker (auth.mino.mobi),
//                     writes are mirrored to com.minomobi.yarrow.stick on the
//                     user's own repo, and pulled on sign-in. Best-effort: every
//                     PDS call is guarded; a failure degrades to local, never loses.
//
// PDS paths can only be verified on the deployed site (the sandbox has no network
// to auth.mino.mobi). The local path is the source of truth and is fully testable.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

export const COLLECTION = 'com.minomobi.yarrow.stick';
const LS_KEY = 'mino.yarrow.loft.v1';
// Request exactly the one collection we write; if the auth worker hasn't declared
// it yet, the server 400s invalid_scope and we fall back so login still works.
const SCOPE = 'atproto repo:' + COLLECTION;
const FALLBACK_SCOPE = 'atproto transition:generic';

const uid = g => `${g.seedStr}:${g.pos}@${g.reapedAt}`;

function genomeToRecord(g){
  return {
    $type: COLLECTION, v: 1,
    seedStr: g.seedStr, pos: g.pos, main: !!g.main,
    lenCm: g.lenCm, diaMm: g.diaMm, straightness0: g.straightness0,
    stiffnessPotential: g.stiffnessPotential, dryRate: g.dryRate,
    warpTendency: g.warpTendency, crackRisk: g.crackRisk, colourPath: g.colourPath,
    nodes: g.nodes, grainSeed: g.grainSeed,
    reapedAt: g.reapedAt, tends: g.tends || [],
    createdAt: new Date(g.reapedAt).toISOString(),
  };
}
function recordToGenome(value, rkey){
  return {
    version: value.v || 1, id: `${value.seedStr}-${value.pos}`,
    parentSeed: +value.seedStr, seedStr: String(value.seedStr), pos: value.pos, main: !!value.main,
    lenCm: value.lenCm, diaMm: value.diaMm, straightness0: value.straightness0,
    stiffnessPotential: value.stiffnessPotential, dryRate: value.dryRate,
    warpTendency: value.warpTendency, crackRisk: value.crackRisk, colourPath: value.colourPath,
    nodes: value.nodes, grainSeed: value.grainSeed,
    reapedAt: value.reapedAt, tends: value.tends || [], _rkey: rkey,
  };
}
const rkeyFromUri = uri => (uri ? String(uri).split('/').pop() : undefined);

export class Loft {
  constructor(){
    this.items = []; this.mode = 'local'; this.user = null;
    this._auth = null; this._subs = new Set(); this._fellBack = false;
  }
  onChange(cb){ this._subs.add(cb); return () => this._subs.delete(cb); }
  _emit(){ for (const cb of this._subs) { try { cb(this.items, this); } catch(e){} } }

  _loadLocal(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e){ return []; } }
  _saveLocal(items){ try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch(e){} }

  async init(){
    this.items = this._loadLocal();
    this._emit();
    try {
      const { AuthClient } = await import('./auth.js');
      this._auth = new AuthClient();
      await this._auth.init();
      const u = this._auth.getUser && this._auth.getUser();
      if (u) { this.user = u; this.mode = 'pds'; await this._pullPds(); }
    } catch(e){ this._auth = null; }   // deployed-site only; local still works
    return this;
  }

  signedIn(){ return this.mode === 'pds' && !!this.user; }
  canSync(){ return !!this._auth; }

  async signIn(handle){
    if (!this._auth) throw new Error('Sign-in needs the deployed site (auth.mino.mobi).');
    const scope = this._fellBack ? FALLBACK_SCOPE : SCOPE;
    try { await this._auth.login(handle, { scope }); }          // redirects away
    catch(e){
      if (/scope/i.test(String(e && e.message || e))) { this._fellBack = true; await this._auth.login(handle, { scope: FALLBACK_SCOPE }); }
      else throw e;
    }
  }
  async signOut(){
    try { await this._auth && this._auth.logout(); } catch(e){}
    this.user = null; this.mode = 'local'; this.items = this._loadLocal(); this._emit();
  }

  async _pullPds(){
    try {
      const res = await this._auth.pds.listRecords(COLLECTION);
      const recs = (res && res.records) || [];
      const byUid = new Map();
      for (const g of this._loadLocal()) byUid.set(uid(g), g);
      for (const r of recs) { const g = recordToGenome(r.value, rkeyFromUri(r.uri)); byUid.set(uid(g), g); }
      this.items = [...byUid.values()];
      this._saveLocal(this.items);
      this._emit();
    } catch(e){ this.mode = 'local'; this.items = this._loadLocal(); this._emit(); }
  }

  // append freshly reaped genomes
  async add(genomes){
    const local = this._loadLocal();
    for (const g of genomes) {
      if (this.signedIn()) {
        try { const res = await this._auth.pds.createRecord(COLLECTION, genomeToRecord(g)); g._rkey = rkeyFromUri(res && res.uri); }
        catch(e){}
      }
      local.push(g);
    }
    this._saveLocal(local); this.items = local; this._emit();
  }

  // persist a mutated genome (e.g. after a tend)
  async update(g){
    const local = this._loadLocal().map(x => uid(x) === uid(g) ? g : x);
    this._saveLocal(local); this.items = local; this._emit();
    if (this.signedIn() && g._rkey) { try { await this._auth.pds.putRecord(COLLECTION, g._rkey, genomeToRecord(g)); } catch(e){} }
  }

  // cull a stick from the loft
  async remove(g){
    const local = this._loadLocal().filter(x => uid(x) !== uid(g));
    this._saveLocal(local); this.items = local; this._emit();
    if (this.signedIn() && g._rkey) { try { await this._auth.pds.deleteRecord(COLLECTION, g._rkey); } catch(e){} }
  }

  static uid = uid;
}
