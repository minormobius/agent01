/**
 * PDS catalog client for Wiki Cards.
 *
 * Fetches com.minomobi.cards.catalog records from the minomobi PDS.
 * Each record contains all articles for one Wikinatomy bin, with
 * pre-baked extracts and thumbnail URLs — eliminating the need to
 * hit Wikipedia's API at runtime.
 *
 * Falls back gracefully: if PDS is unreachable, the caller uses
 * Wikipedia API as before.
 */

const PUBLIC_API = "https://public.api.bsky.app";
const CATALOG_COLLECTION = "com.minomobi.cards.catalog";
const HANDLE = "minomobi.com";

// Resolved identity cache
let _did = null;
let _pds = null;

async function resolveIdentity() {
  if (_did && _pds) return { did: _did, pds: _pds };

  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(HANDLE)}`
  );
  if (!res.ok) throw new Error("Could not resolve handle");
  const { did } = await res.json();

  // Resolve PDS from DID document
  const plcRes = await fetch(`https://plc.directory/${did}`);
  if (!plcRes.ok) throw new Error("Could not resolve DID");
  const doc = await plcRes.json();
  const svc = doc.service?.find((s) => s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("No PDS endpoint");

  _did = did;
  _pds = svc.serviceEndpoint;
  return { did: _did, pds: _pds };
}

// Article cache: title → {extract, thumbnail}
const _articleCache = new Map();
let _catalogLoaded = false;
let _catalogLoading = false;

/**
 * Load all catalog records from PDS into the cache.
 * Called once on startup; non-blocking.
 */
async function loadCatalog() {
  if (_catalogLoaded || _catalogLoading) return;
  _catalogLoading = true;

  try {
    const { did, pds } = await resolveIdentity();

    // Fetch all catalog records via listRecords (paginated)
    let cursor = null;
    let totalArticles = 0;

    while (true) {
      let url = `${pds}/xrpc/com.atproto.repo.listRecords` +
        `?repo=${encodeURIComponent(did)}` +
        `&collection=${CATALOG_COLLECTION}&limit=100`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const records = data.records || [];

      for (const rec of records) {
        const val = rec.value;
        if (!val?.articles) continue;
        for (const a of val.articles) {
          _articleCache.set(a.title, {
            extract: a.extract || "",
            thumbnail: a.thumbnail || null,
          });
          totalArticles++;
        }
      }

      cursor = data.cursor;
      if (!cursor || records.length === 0) break;
    }

    _catalogLoaded = true;
    console.log(`[PDS] Loaded ${totalArticles} articles from catalog`);
  } catch (err) {
    console.warn("[PDS] Catalog unavailable, will use Wikipedia API:", err.message);
  }

  _catalogLoading = false;
}

/**
 * Look up cached article data from PDS catalog.
 * Returns {extract, thumbnail} or null if not cached.
 */
function getCachedArticle(title) {
  return _articleCache.get(title) || null;
}

/**
 * Check if catalog has been loaded from PDS.
 */
function isCatalogLoaded() {
  return _catalogLoaded;
}

export { loadCatalog, getCachedArticle, isCatalogLoaded };
