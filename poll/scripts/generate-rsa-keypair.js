#!/usr/bin/env node
/**
 * Generate an RSA-PSS key pair for blind signature polls (v2).
 *
 * Usage:
 *   node scripts/generate-rsa-keypair.js
 *
 * Output:
 *   - RSA_PRIVATE_KEY_JWK: paste into Cloudflare Worker secret
 *   - RSA_PUBLIC_KEY_JWK: paste into Cloudflare Worker secret
 *
 * The key pair uses RSA-PSS with SHA-384 (matching @cloudflare/blindrsa-ts RSABSSA.SHA384).
 * 2048-bit modulus is the minimum for security; 4096 is safer but slower.
 */

import { webcrypto } from 'node:crypto';

const modulusLength = 2048;

async function main() {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: 'SHA-384',
    },
    true, // extractable
    ['sign', 'verify']
  );

  const privateJWK = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicJWK = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);

  console.log('=== RSA-PSS Key Pair for Blind Signatures ===\n');
  console.log(`Modulus length: ${modulusLength} bits`);
  console.log(`Hash: SHA-384`);
  console.log(`Algorithm: RSA-PSS (RFC 9474 / RSABSSA-SHA384-PSS-Randomized)\n`);

  console.log('--- RSA_PRIVATE_KEY_JWK (Cloudflare Worker secret — KEEP SECRET) ---');
  console.log(JSON.stringify(privateJWK));
  console.log();

  console.log('--- RSA_PUBLIC_KEY_JWK (Cloudflare Worker secret — public, stored per-poll) ---');
  console.log(JSON.stringify(publicJWK));
  console.log();

  console.log('To set as Cloudflare secrets:');
  console.log('  npx wrangler secret put RSA_PRIVATE_KEY_JWK');
  console.log('  npx wrangler secret put RSA_PUBLIC_KEY_JWK');
  console.log('Then paste the JSON when prompted.\n');
}

main().catch(err => {
  console.error('Failed to generate key pair:', err);
  process.exit(1);
});
