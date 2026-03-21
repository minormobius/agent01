# Wave — Blob Architecture Plan

Status: planned (not yet implemented in v1 — text-only MVP first)

## Problem

ATProto PDSes track blob references for garbage collection. If you upload a blob
and the reference is buried inside encrypted ciphertext, the PDS can't see it and
will GC the blob after some time.

## Solution: Dual Reference

Every `wave.op` record that carries attachments puts blob refs in **two places**:

1. **Inside `ciphertext`** (encrypted): the full context — original filename,
   actual MIME type, decryption IV, which part of the message the blob belongs to.
2. **In `attachments[]`** (cleartext): the raw `BlobRef` objects so the PDS
   can track them for GC. These are at the record's top level.

### Metadata Leak

An observer can see:
- "This op has N attachments of M bytes each"
- The CID of each encrypted blob

They **cannot** see:
- What the attachments are (the blobs are encrypted before upload)
- Original filenames or MIME types
- Which message the blob belongs to (that's inside ciphertext)

This is an acceptable trade-off. ATProto wasn't built for encrypted blobs,
so we work with the GC constraint rather than fight it.

## Blob Lifecycle

```
1. User picks a file
2. Client generates a random IV
3. Client encrypts the file bytes with the tier DEK (AES-256-GCM)
4. Client uploads the encrypted bytes to their PDS via com.atproto.repo.uploadBlob
   → PDS sees opaque binary, stores it, returns a BlobRef (CID + size + mimeType)
5. Client builds the wave.op record:
   - attachments: [blobRef]                    ← cleartext, for PDS GC
   - ciphertext: encrypt({                     ← encrypted payload
       text: "check this out",
       blobs: [{
         ref: blobRef,                         ← same ref, but with context
         originalName: "photo.jpg",
         originalType: "image/jpeg",
         iv: "<blob-specific IV>",             ← for decrypting the blob
       }]
     })
6. Client writes the wave.op record to their PDS
```

## Fetch & Decrypt

```
1. Recipient gets the wave.op (via Jetstream or catch-up scan)
2. Decrypt the ciphertext with the tier DEK
3. Find blob entries in the decrypted payload
4. For each blob:
   a. Fetch encrypted bytes from author's PDS via com.atproto.sync.getBlob
      (needs author DID + blob CID)
   b. Decrypt with the blob-specific IV + same tier DEK
   c. Render with originalType and originalName
```

## Record Schema (with blobs)

```typescript
interface WaveOp {
  $type: "com.minomobi.wave.op";
  threadUri: string;
  parentOps?: string[];
  opType: "message" | "doc_edit" | "reaction";
  keyringRkey: string;
  iv: string;                    // base64
  ciphertext: string;            // base64, encrypted payload
  attachments?: BlobRef[];       // cleartext blob refs for PDS GC
  createdAt: string;
}

// Inside ciphertext (after decryption):
interface MessagePayload {
  text?: string;
  blobs?: BlobAttachment[];
}

interface BlobAttachment {
  ref: BlobRef;                  // ATProto blob reference (CID)
  originalName: string;
  originalType: string;          // MIME type
  iv: string;                    // base64, blob-specific encryption IV
  size: number;                  // original (pre-encryption) size
}
```

## Why Not R2 / External Storage?

- Adds infrastructure (Worker + R2 bucket + auth)
- Breaks the "zero backend" property
- PDS blobs work fine — we just need the dual-reference pattern
- The user already pays for PDS storage (5GB on bsky.social)

## Future Considerations

- **Blob size limits**: bsky.social allows ~1MB blobs. For larger files, consider
  chunking into multiple blobs or using an external service.
- **Inline images**: Small images (<50KB) could be base64-encoded directly in the
  ciphertext instead of using blobs. Simpler, no GC concern, but increases record size.
- **Blob key rotation**: When a tier DEK rotates, existing blobs are still encrypted
  with the old DEK. The old keyring epoch DEK must be retained for decryption.
  New blobs use the new DEK. Same pattern as sealed records.
