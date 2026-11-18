import { bls12_381 as bls } from './node_modules/@noble/curves/bls12-381.js';
import { sha256 } from './node_modules/@noble/hashes/sha256.js';
const C='52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const PK='83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a';
const DST='BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_';
const hex=b=>Buffer.from(b).toString('hex');
for (const r of process.argv.slice(2).map(Number)) {
  const b=await (await fetch(`https://api.drand.sh/${C}/public/${r}`)).json();
  const m=new Uint8Array(8); new DataView(m.buffer).setBigUint64(0,BigInt(r));
  const H=bls.G1.hashToCurve(sha256(m),{DST});
  const sig=bls.G1.ProjectivePoint.fromHex(b.signature);
  const pk=bls.G2.ProjectivePoint.fromHex(PK);
  const ok=bls.fields.Fp12.eql(bls.pairing(sig,bls.G2.ProjectivePoint.BASE), bls.pairing(H,pk));
  const rnd=hex(sha256(Buffer.from(b.signature,'hex')))===b.randomness;
  // tamper test: same signature, next round's message must fail
  const m2=new Uint8Array(8); new DataView(m2.buffer).setBigUint64(0,BigInt(r+1));
  const bad=bls.fields.Fp12.eql(bls.pairing(sig,bls.G2.ProjectivePoint.BASE), bls.pairing(bls.G1.hashToCurve(sha256(m2),{DST}),pk));
  console.log(r,'sig',ok,'rand=sha256(sig)',rnd,'wrong-round-rejected',!bad);
}
