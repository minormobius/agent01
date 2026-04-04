/**
 * Encrypted blob layer — client-side encrypt/decrypt for ATProto blobs.
 *
 * Pattern:
 *   plaintext file → AES-256-GCM encrypt with DEK → uploadBlob(ciphertext)
 *   The PDS stores opaque noise. Only holders of the DEK can reconstruct.
 *
 * Large files are chunked into separate blobs, each with its own IV.
 * The chunk refs are stored in order inside the parent sealed record.
 */

import { PdsClient } from "./pds";
import { encrypt, decrypt, toBase64, fromBase64 } from "./crypto";

// 950 KB — under the 1 MB PDS blob limit with room for overhead
const DEFAULT_CHUNK_SIZE = 950 * 1024;

/**
 * Reference to an encrypted blob stored on a PDS.
 * Embedded inside sealed envelope inner records (e.g. Note.attachments).
 */
export interface EncryptedBlobRef {
  /** CID returned by uploadBlob */
  ref: { $link: string };
  /** IV used for this blob's AES-GCM encryption (base64) */
  iv: string;
  /** Original MIME type (not visible to PDS — uploaded as application/octet-stream) */
  mimeType: string;
  /** Original file size in bytes */
  size: number;
  /** Original filename */
  filename?: string;
  /** DID of the PDS that holds this blob */
  ownerDid: string;
}

/**
 * Reference to a large file split across multiple encrypted blobs.
 * Each chunk is an independent EncryptedBlobRef with its own IV.
 */
export interface ChunkedBlobRef {
  /** Ordered chunk refs — reassemble by concatenating decrypted bytes */
  chunks: EncryptedBlobRef[];
  /** Original MIME type */
  mimeType: string;
  /** Original total file size in bytes */
  size: number;
  /** Original filename */
  filename?: string;
}

/**
 * Union type for blob references in records.
 * Single blobs use EncryptedBlobRef, large files use ChunkedBlobRef.
 */
export type VaultBlobRef = EncryptedBlobRef | ChunkedBlobRef;

/** Type guard: is this a chunked (multi-blob) reference? */
export function isChunked(ref: VaultBlobRef): ref is ChunkedBlobRef {
  return "chunks" in ref;
}

// ── Upload ──

/**
 * Encrypt a file and upload it as a single blob.
 * For files under the chunk size limit (~950 KB).
 */
export async function encryptAndUpload(
  pds: PdsClient,
  data: Uint8Array,
  dek: CryptoKey,
  mimeType: string,
  filename?: string,
): Promise<EncryptedBlobRef> {
  const { iv, ciphertext } = await encrypt(data, dek);

  // Upload ciphertext as opaque bytes — PDS sees application/octet-stream
  const blob = await pds.uploadBlob(ciphertext, "application/octet-stream");
  const ownerDid = pds.getSession()!.did;

  return {
    ref: blob.ref,
    iv: toBase64(iv),
    mimeType,
    size: data.byteLength,
    filename,
    ownerDid,
  };
}

/**
 * Encrypt and upload a file, automatically chunking if it exceeds the size limit.
 * Returns a single EncryptedBlobRef for small files, or a ChunkedBlobRef for large ones.
 */
export async function encryptAndUploadAuto(
  pds: PdsClient,
  data: Uint8Array,
  dek: CryptoKey,
  mimeType: string,
  filename?: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<VaultBlobRef> {
  if (data.byteLength <= chunkSize) {
    return encryptAndUpload(pds, data, dek, mimeType, filename);
  }
  return encryptAndUploadChunked(pds, data, dek, mimeType, filename, chunkSize);
}

/**
 * Encrypt and upload a large file in chunks.
 * Each chunk is independently encrypted with its own IV and uploaded as a separate blob.
 */
export async function encryptAndUploadChunked(
  pds: PdsClient,
  data: Uint8Array,
  dek: CryptoKey,
  mimeType: string,
  filename?: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<ChunkedBlobRef> {
  const chunks: EncryptedBlobRef[] = [];
  const totalSize = data.byteLength;

  for (let offset = 0; offset < totalSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const slice = data.slice(offset, end);
    const ref = await encryptAndUpload(pds, slice, dek, "application/octet-stream");
    chunks.push(ref);
  }

  return {
    chunks,
    mimeType,
    size: totalSize,
    filename,
  };
}

// ── Download ──

/**
 * Fetch and decrypt a single encrypted blob.
 */
export async function fetchAndDecrypt(
  pds: PdsClient,
  ref: EncryptedBlobRef,
  dek: CryptoKey,
): Promise<Uint8Array> {
  const ciphertext = await pds.getBlob(ref.ownerDid, ref.ref.$link);
  const iv = fromBase64(ref.iv);
  return decrypt(ciphertext, iv, dek);
}

/**
 * Fetch and decrypt a blob reference (single or chunked).
 * Chunks are fetched sequentially and reassembled.
 */
export async function fetchAndDecryptAuto(
  pds: PdsClient,
  ref: VaultBlobRef,
  dek: CryptoKey,
): Promise<{ data: Uint8Array; mimeType: string; filename?: string }> {
  if (!isChunked(ref)) {
    const data = await fetchAndDecrypt(pds, ref, dek);
    return { data, mimeType: ref.mimeType, filename: ref.filename };
  }

  // Chunked: fetch all chunks and reassemble
  const parts: Uint8Array[] = [];
  for (const chunk of ref.chunks) {
    parts.push(await fetchAndDecrypt(pds, chunk, dek));
  }

  // Concatenate
  const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
  const assembled = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of parts) {
    assembled.set(part, pos);
    pos += part.byteLength;
  }

  return { data: assembled, mimeType: ref.mimeType, filename: ref.filename };
}

// ── Helpers ──

/** Read a File object into a Uint8Array. */
export function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Create an object URL from decrypted blob data for rendering in the browser. */
export function blobToObjectUrl(data: Uint8Array, mimeType: string): string {
  return URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: mimeType }));
}

/** Trigger a browser download from decrypted blob data. */
export function downloadBlob(data: Uint8Array, mimeType: string, filename: string): void {
  const url = blobToObjectUrl(data, mimeType);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format bytes into a human-readable string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
