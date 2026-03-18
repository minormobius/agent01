#!/usr/bin/env node
/**
 * Generate RSA-PSS key pairs for trophy signing.
 * One key pair per trophy tier (bronze, silver, gold).
 *
 * Usage:
 *   node scripts/generate-keys.js
 *
 * Output: JSON object with all three tier key pairs.
 * Set as a single Cloudflare Worker secret: TROPHY_KEYS_JSON
 */

import { webcrypto } from 'node:crypto';

const TIERS = ['bronze', 'silver', 'gold'];
const MODULUS_LENGTH = 2048;

async function generateKeyPair() {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: MODULUS_LENGTH,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-384',
    },
    true,
    ['sign', 'verify']
  );

  const privateJWK = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicJWK = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);

  return { privateJWK, publicJWK };
}

async function main() {
  console.log('=== Bounty Board Trophy Keys ===\n');
  console.log(`Algorithm: RSA-PSS SHA-384 (RFC 9474 / RSABSSA-SHA384-PSS-Randomized)`);
  console.log(`Modulus: ${MODULUS_LENGTH} bits`);
  console.log(`Tiers: ${TIERS.join(', ')}\n`);

  const keys = {};
  for (const tier of TIERS) {
    const { privateJWK, publicJWK } = await generateKeyPair();
    keys[tier] = { privateJWK, publicJWK };
    console.log(`Generated ${tier} key pair`);
  }

  console.log('\n--- TROPHY_KEYS_JSON (Cloudflare Worker secret — KEEP SECRET) ---');
  console.log(JSON.stringify(keys));

  console.log('\n--- Public keys (for client verification) ---');
  const publicKeys = {};
  for (const tier of TIERS) {
    publicKeys[tier] = keys[tier].publicJWK;
  }
  console.log(JSON.stringify(publicKeys, null, 2));

  console.log('\nTo set as Cloudflare secret:');
  console.log('  npx wrangler secret put TROPHY_KEYS_JSON');
  console.log('Then paste the full JSON when prompted.\n');
}

main().catch(err => {
  console.error('Failed to generate keys:', err);
  process.exit(1);
});
