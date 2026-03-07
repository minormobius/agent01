#!/usr/bin/env node
/**
 * Generate all ATPolls key pairs.
 *
 * Usage:
 *   node scripts/generate-rsa-keypair.js          # generates both RSA + OAuth keys
 *   node scripts/generate-rsa-keypair.js --rsa     # RSA blind signature keys only
 *   node scripts/generate-rsa-keypair.js --oauth   # OAuth client keys only
 *
 * Output:
 *   - RSA_PRIVATE_KEY_JWK / RSA_PUBLIC_KEY_JWK: blind signatures (RSA-PSS SHA-384)
 *   - OAUTH_SIGNING_PRIVATE_KEY_JWK / OAUTH_SIGNING_PUBLIC_KEY_JWK: OAuth client auth (ES256)
 *
 * These are different algorithms — RSA-PSS for blind credentials, ECDSA P-256 for OAuth.
 * Both are needed for a production deployment.
 */

import { webcrypto } from 'node:crypto';

const modulusLength = 2048;
const rsaOnly = process.argv.includes('--rsa');
const oauthOnly = process.argv.includes('--oauth');
const generateBoth = !rsaOnly && !oauthOnly;

async function generateRSAKeys() {
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

async function generateOAuthKeys() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const privateJWK = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicJWK = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);

  // Compute JWK thumbprint for kid
  const canonical = JSON.stringify({ crv: publicJWK.crv, kty: publicJWK.kty, x: publicJWK.x, y: publicJWK.y });
  const hash = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const kid = Buffer.from(hash).toString('base64url');
  publicJWK.kid = kid;
  privateJWK.kid = kid;

  console.log('=== OAuth Client Key Pair (ES256, private_key_jwt) ===\n');

  console.log('--- OAUTH_SIGNING_PRIVATE_KEY_JWK (Cloudflare Worker secret — KEEP SECRET) ---');
  console.log(JSON.stringify(privateJWK));
  console.log();

  console.log('--- OAUTH_SIGNING_PUBLIC_KEY_JWK (Cloudflare Worker secret + client-metadata.json jwks) ---');
  console.log(JSON.stringify(publicJWK));
  console.log();

  console.log('Add the public key to client-metadata.json:');
  console.log(JSON.stringify({ jwks: { keys: [publicJWK] } }, null, 2));
  console.log();

  console.log('To set as Cloudflare secrets:');
  console.log('  npx wrangler secret put OAUTH_SIGNING_PRIVATE_KEY_JWK');
  console.log('  npx wrangler secret put OAUTH_SIGNING_PUBLIC_KEY_JWK');
  console.log('Then paste the JSON when prompted.\n');
}

async function main() {
  if (generateBoth || rsaOnly) {
    await generateRSAKeys();
  }
  if (generateBoth || oauthOnly) {
    await generateOAuthKeys();
  }
  if (generateBoth) {
    console.log('=== Summary: 5 secrets to set ===');
    console.log('  npx wrangler secret put RSA_PRIVATE_KEY_JWK');
    console.log('  npx wrangler secret put RSA_PUBLIC_KEY_JWK');
    console.log('  npx wrangler secret put OAUTH_SIGNING_PRIVATE_KEY_JWK');
    console.log('  npx wrangler secret put OAUTH_SIGNING_PUBLIC_KEY_JWK');
    console.log('  npx wrangler secret put OAUTH_CLIENT_ID');
    console.log('    (value: https://poll.mino.mobi/client-metadata.json)\n');
  }
}

main().catch(err => {
  console.error('Failed to generate keys:', err);
  process.exit(1);
});
