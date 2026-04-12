/**
 * Mint client — calls the cards-mint Worker to sign cards.
 *
 * Flow:
 * 1. Player opens pack → client picks cards (same as before)
 * 2. Client sends card data to /api/mint with player's DID
 * 3. Worker signs each card with Ed25519, returns signed copies
 * 4. Client stores signed cards in localStorage
 *
 * Cards work without minting (unsigned, local-only). Minting adds
 * a signature that makes them verifiable and tradeable.
 */

const MINT_API =
  localStorage.getItem("mint_api_url") || "https://cards-mint.minomobi.workers.dev";

const STORAGE_KEY = "wiki_cards_collection";

// ── Collection (localStorage) ───────────────────────────────────

function loadCollection() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCollection(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function addToCollection(signedCards) {
  const collection = loadCollection();
  for (const card of signedCards) {
    // Deduplicate by nonce (each mint is unique)
    if (!collection.some((c) => c.nonce === card.nonce)) {
      collection.push(card);
    }
  }
  saveCollection(collection);
  return collection;
}

function getCollection() {
  return loadCollection();
}

// ── Player DID ──────────────────────────────────────────────────

function getPlayerDid() {
  return localStorage.getItem("wiki_cards_did") || null;
}

function setPlayerDid(did) {
  localStorage.setItem("wiki_cards_did", did);
}

// ── Mint API call ───────────────────────────────────────────────

/**
 * Request signed cards from the mint Worker.
 *
 * @param {object[]} cards - Array of { title, category, stats, rarity }
 * @param {string} source - How obtained: "daily_pack", "lucky", "transmute"
 * @returns {Promise<{cards?: object[], error?: string}>}
 */
async function mintCards(cards, source = "daily_pack") {
  const did = getPlayerDid();
  if (!did) {
    return { error: "No player DID set. Enter your Bluesky handle to mint cards." };
  }

  try {
    const res = await fetch(`${MINT_API}/api/mint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ did, cards, source }),
    });

    const data = await res.json();

    if (!res.ok) {
      // 429 = already minted today — return the cached cards
      if (res.status === 429 && data.existingCards) {
        return { cards: data.existingCards, cached: true };
      }
      return { error: data.error || `Mint failed (${res.status})` };
    }

    // Store signed cards
    if (data.cards) {
      addToCollection(data.cards);
    }

    return data;
  } catch (err) {
    return { error: `Mint unavailable: ${err.message}` };
  }
}

// ── Health check ────────────────────────────────────────────────

async function checkMintService() {
  try {
    const res = await fetch(`${MINT_API}/api/health`);
    if (!res.ok) return { available: false };
    return { available: true, ...(await res.json()) };
  } catch {
    return { available: false };
  }
}

// ── DID resolution (handle → DID via public API) ────────────────

async function resolveHandle(handle) {
  // Strip @ prefix if present
  handle = handle.replace(/^@/, "");
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error("Could not resolve handle");
  const { did } = await res.json();
  return did;
}

export {
  mintCards,
  checkMintService,
  getCollection,
  addToCollection,
  getPlayerDid,
  setPlayerDid,
  resolveHandle,
  MINT_API,
};
