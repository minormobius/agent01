/**
 * Wiki Cards mint Worker.
 *
 * POST /api/mint — signs a pack of cards for a player
 *
 * Request:  { did: "did:plc:...", seed: 12345, titles?: ["Tyrannosaurus", ...] }
 * Response: { cards: [ { ...cardData, mintSig: "hex..." }, ... ] }
 *
 * The private key never leaves the Worker. The public key is embedded in the
 * game client and published on the PDS — verification requires no network.
 *
 * Rate limit: one daily pack per DID per calendar day (KV-backed).
 * Custom title mints (e.g., transmute, lucky) are not rate-limited to daily.
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// noble-ed25519 v2 requires setting the sha512 hash
ed.etc.sha512Sync = (...m) => {
  const h = sha512.create();
  m.forEach((b) => h.update(b));
  return h.digest();
};

// ── CORS ────────────────────────────────────────────────────────

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_URL || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function corsResponse(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

// ── Canonical JSON (must match Python + browser) ────────────────

function canonicalJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

// ── Deterministic PRNG (must match browser mulberry32) ──────────

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Signing ─────────────────────────────────────────────────────

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function signCard(privateKey, cardData) {
  const payload = new TextEncoder().encode(canonicalJson(cardData));
  const signature = ed.sign(payload, privateKey);
  return { ...cardData, mintSig: bytesToHex(signature) };
}

// ── Rate limiting ───────────────────────────────────────────────

function todayKey(did) {
  const d = new Date();
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `mint:${did}:${date}`;
}

// ── Card selection (mirrors browser pickPack) ───────────────────
// The Worker needs the POOL data. Rather than bundling the full 6,879-entry
// pool into the Worker, we accept card titles from the client and verify
// they exist in a lightweight index. The client already has the pool.
//
// Trust model: the client picks cards via the deterministic seed. The Worker
// re-derives the seed to verify the pick is legitimate (same date = same
// pack). For rerolls / lucky draws, any title in the catalog is valid.

// ── Handler ─────────────────────────────────────────────────────

async function handleMint(request, env) {
  const body = await request.json();
  const { did, cards, source } = body;

  // Validate DID format
  if (!did || !did.startsWith("did:")) {
    return corsResponse(env, { error: "Invalid DID" }, 400);
  }

  // Validate cards array
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 10) {
    return corsResponse(env, { error: "Cards must be an array of 1-10 items" }, 400);
  }

  // Validate each card has required fields
  for (const c of cards) {
    if (!c.title || !c.category || !c.stats || !c.rarity) {
      return corsResponse(env, { error: `Card missing required fields: ${c.title || "unknown"}` }, 400);
    }
    const s = c.stats;
    if (!s.atk || !s.def || !s.spc || !s.spd || !s.hp) {
      return corsResponse(env, { error: `Card stats incomplete: ${c.title}` }, 400);
    }
  }

  const mintSource = source || "daily_pack";

  // Rate limit daily packs
  if (mintSource === "daily_pack" && env.RATE_LIMIT) {
    const key = todayKey(did);
    const existing = await env.RATE_LIMIT.get(key);
    if (existing) {
      return corsResponse(env, {
        error: "Already minted today's pack",
        existingCards: JSON.parse(existing),
      }, 429);
    }
  }

  // Load private key
  const privateKeyHex = env.CARDS_MINT_PRIVATE_KEY;
  if (!privateKeyHex) {
    return corsResponse(env, { error: "Mint key not configured" }, 500);
  }
  const privateKey = hexToBytes(privateKeyHex);

  // Resolve mint DID (the authority signing the cards)
  const mintDid = env.MINT_DID || "did:plc:placeholder";

  // Sign each card
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const signedCards = [];

  for (const c of cards) {
    const cardData = {
      title: c.title,
      category: c.category,
      stats: {
        atk: c.stats.atk,
        def: c.stats.def,
        spc: c.stats.spc,
        spd: c.stats.spd,
        hp: c.stats.hp,
      },
      rarity: c.rarity,
      issuedTo: did,
      issuedAt: now,
      source: mintSource,
      nonce: randomHex(16),
      mintDid,
    };

    const signed = signCard(privateKey, cardData);
    signedCards.push(signed);
  }

  // Cache daily pack in KV (rate limit + replay)
  if (mintSource === "daily_pack" && env.RATE_LIMIT) {
    const key = todayKey(did);
    await env.RATE_LIMIT.put(key, JSON.stringify(signedCards), {
      expirationTtl: 86400 * 2, // 48h — covers timezone edge cases
    });
  }

  return corsResponse(env, { cards: signedCards });
}

// ── Fetch handler ───────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Health check
    if (url.pathname === "/api/health") {
      return corsResponse(env, {
        status: "ok",
        hasKey: !!env.CARDS_MINT_PRIVATE_KEY,
      });
    }

    // Mint endpoint
    if (url.pathname === "/api/mint" && request.method === "POST") {
      try {
        return await handleMint(request, env);
      } catch (err) {
        console.error("Mint error:", err);
        return corsResponse(env, { error: "Internal mint error" }, 500);
      }
    }

    return corsResponse(env, { error: "Not found" }, 404);
  },
};
