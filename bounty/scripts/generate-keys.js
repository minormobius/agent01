#!/usr/bin/env node
/**
 * Generate RSA-PSS key pairs for rep minting.
 * One key pair per denomination (1, 5, 10, 25 rep).
 * Like coins — each denomination has its own signing key.
 *
 * Usage:
 *   node scripts/generate-keys.js
 *
 * Output: JSON object with all denomination key pairs.
 * Set as Cloudflare Worker secret: MINT_KEYS_JSON
 */

import { webcrypto } from 'node:crypto';

const DENOMINATIONS = [1, 5, 10, 25];
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
  console.log('=== Bounty Board Mint Keys ===\n');
  console.log(`Algorithm: RSA-PSS SHA-384 (RFC 9474 / RSABSSA-SHA384-PSS-Randomized)`);
  console.log(`Modulus: ${MODULUS_LENGTH} bits`);
  console.log(`Denominations: ${DENOMINATIONS.join(', ')} rep\n`);

  const keys = {};
  for (const denom of DENOMINATIONS) {
    const { privateJWK, publicJWK } = await generateKeyPair();
    keys[denom] = { privateJWK, publicJWK };
    console.log(`Generated ${denom}-rep key pair`);
  }

  console.log('\n--- MINT_KEYS_JSON (Cloudflare Worker secret — KEEP SECRET) ---');
  console.log(JSON.stringify(keys));

  console.log('\n--- Public keys (for client verification) ---');
  const publicKeys = {};
  for (const denom of DENOMINATIONS) {
    publicKeys[denom] = keys[denom].publicJWK;
  }
  console.log(JSON.stringify(publicKeys, null, 2));

  console.log('\nTo set as Cloudflare secret:');
  console.log('  npx wrangler secret put MINT_KEYS_JSON');
  console.log('Then paste the full JSON when prompted.\n');
}

main().catch(err => {
  console.error('Failed to generate keys:', err);
  process.exit(1);
});
