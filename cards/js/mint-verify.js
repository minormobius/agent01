/**
 * Wiki Cards — mint signature verification.
 *
 * Verifies that a card was minted by minomobi using Ed25519 signatures.
 * No network calls required — the public key is embedded here and also
 * available from the PDS (com.minomobi.cards.mintkey) and git repo
 * (cards/mint-public-key.json) as fallback sources.
 *
 * Uses the noble-ed25519 library (< 6KB, audited, zero dependencies):
 *   https://github.com/paulmillr/noble-ed25519
 *
 * Verification is the same operation regardless of who holds the card
 * or where the card lives. The signature covers the card data + issuedTo +
 * nonce, so a card signed for one player cannot be claimed by another.
 */

// ── Public key ──────────────────────────────────────────────────
//
// REPLACE THIS after running: python3 scripts/generate-mint-keypair.py
// The script prints the hex string to paste here.
//
const MINT_PUBLIC_KEY_HEX =
  "651feccc82efebbee502383852fd91d75920e4bac960ed02c343d755684da58a";

// ── Canonical JSON ──────────────────────────────────────────────

/**
 * Produce deterministic JSON identical to Python's
 * json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
 *
 * Rules: sorted keys, no whitespace, no trailing commas.
 */
function canonicalJson(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]));
  return "{" + pairs.join(",") + "}";
}

// ── Ed25519 verification (noble-ed25519) ────────────────────────

let _ed25519 = null;

/**
 * Load the Ed25519 library. Supports:
 * - ES module import (bundler / modern browser)
 * - Script tag (global noble_ed25519)
 * - Dynamic import as last resort
 */
async function getEd25519() {
  if (_ed25519) return _ed25519;

  // Check for global (script tag include)
  if (typeof noble_ed25519 !== "undefined") {
    _ed25519 = noble_ed25519;
    return _ed25519;
  }

  // Dynamic import (works in modern browsers and Node 14+)
  try {
    _ed25519 = await import("@noble/ed25519");
    return _ed25519;
  } catch {
    // Try CDN as last resort
    try {
      _ed25519 = await import(
        "https://esm.sh/@noble/ed25519@2.1.0"
      );
      return _ed25519;
    } catch {
      throw new Error(
        "Ed25519 library not available. Include @noble/ed25519 via npm or script tag."
      );
    }
  }
}

// ── Hex helpers ─────────────────────────────────────────────────

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ── Verification ────────────────────────────────────────────────

/**
 * Verify a card's mint signature.
 *
 * @param {object} card - The full card record (with mintSig)
 * @param {string} [publicKeyHex] - Override public key (default: embedded)
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function verifyCard(card, publicKeyHex) {
  const pubHex = publicKeyHex || MINT_PUBLIC_KEY_HEX;

  if (pubHex === "0000000000000000000000000000000000000000000000000000000000000000") {
    return { valid: false, error: "Mint public key not configured" };
  }

  if (!card.mintSig) {
    return { valid: false, error: "Card has no mintSig field" };
  }

  try {
    const ed = await getEd25519();

    // Reconstruct the signed payload: everything except mintSig
    const payload = { ...card };
    delete payload.mintSig;
    // Also strip ATProto metadata that isn't part of the signed content
    delete payload["$type"];

    const message = new TextEncoder().encode(canonicalJson(payload));
    const signature = hexToBytes(card.mintSig);
    const publicKey = hexToBytes(pubHex);

    const valid = await ed.verifyAsync(signature, message, publicKey);
    return { valid };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Verify a card's ownership: valid mint sig + either original owner
 * or valid transfer chain ending at the claimed holder.
 *
 * @param {object} card - The card record
 * @param {string} holderDid - DID of the claimed current holder
 * @param {object[]} transfers - Array of transfer records for this card (ordered by transferredAt)
 * @param {string} [publicKeyHex] - Override mint public key
 * @returns {Promise<{valid: boolean, owner: string, error?: string}>}
 */
async function verifyOwnership(card, holderDid, transfers, publicKeyHex) {
  // Step 1: verify the mint signature
  const mintResult = await verifyCard(card, publicKeyHex);
  if (!mintResult.valid) {
    return { valid: false, owner: null, error: `Mint sig invalid: ${mintResult.error}` };
  }

  // Step 2: if no transfers, original owner must match
  if (!transfers || transfers.length === 0) {
    if (card.issuedTo === holderDid) {
      return { valid: true, owner: holderDid };
    }
    return { valid: false, owner: card.issuedTo, error: "No transfer chain — holder is not issuedTo" };
  }

  // Step 3: walk the transfer chain
  let currentOwner = card.issuedTo;
  for (const tx of transfers) {
    if (tx.fromDid !== currentOwner) {
      return {
        valid: false,
        owner: currentOwner,
        error: `Transfer chain broken: expected from=${currentOwner}, got from=${tx.fromDid}`,
      };
    }
    // Transfer is authorized by existing on the sender's PDS
    // (ATProto repo signing = sender's authorization)
    currentOwner = tx.toDid;
  }

  if (currentOwner === holderDid) {
    return { valid: true, owner: holderDid };
  }
  return {
    valid: false,
    owner: currentOwner,
    error: `Transfer chain ends at ${currentOwner}, not ${holderDid}`,
  };
}

/**
 * Fetch the mint public key from the PDS (fallback if embedded key is stale).
 *
 * @param {string} mintDid - DID of the mint authority
 * @returns {Promise<string>} Hex-encoded public key
 */
async function fetchMintPublicKey(mintDid) {
  // Resolve PDS
  const plcRes = await fetch(`https://plc.directory/${mintDid}`);
  if (!plcRes.ok) throw new Error("Could not resolve mint DID");
  const doc = await plcRes.json();
  const svc = doc.service?.find((s) => s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("No PDS endpoint for mint DID");

  // Fetch mintkey record
  const url =
    `${svc.serviceEndpoint}/xrpc/com.atproto.repo.getRecord` +
    `?repo=${encodeURIComponent(mintDid)}` +
    `&collection=com.minomobi.cards.mintkey` +
    `&rkey=current`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Mint key record not found on PDS");
  const { value } = await res.json();
  return value.publicKeyHex;
}

export {
  verifyCard,
  verifyOwnership,
  fetchMintPublicKey,
  canonicalJson,
  MINT_PUBLIC_KEY_HEX,
};
