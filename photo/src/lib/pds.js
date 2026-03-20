// PDS write operations — upload blobs, manage records
// All operations require an active session (see auth.js)

import { getSession, authFetch } from './auth.js';

const ALBUM_COLLECTION = 'com.minomobi.arena.album';
const IMAGE_COLLECTION = 'com.minomobi.arena.image';

// Upload a blob (image/video) to the user's PDS
// Returns { blob } with the blob ref for use in records
export async function uploadBlob(file) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const res = await authFetch(
    `${session.service}/xrpc/com.atproto.repo.uploadBlob`,
    {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed: ${res.status}`);
  }

  const data = await res.json();
  return data.blob;
}

// Create an image anchor record that keeps the blob alive on PDS
// Returns { uri, cid } of the created record
export async function createImageRecord(blob, { alt = '', aspectRatio = null } = {}) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const rkey = generateTid();
  const record = {
    $type: IMAGE_COLLECTION,
    image: blob,
    alt,
    createdAt: new Date().toISOString(),
  };
  if (aspectRatio) {
    record.aspectRatio = aspectRatio;
  }

  return putRecord(IMAGE_COLLECTION, rkey, record);
}

// Create or update an album record
export async function saveAlbum(album, rkey = null) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  rkey = rkey || generateTid();
  const record = {
    $type: ALBUM_COLLECTION,
    name: album.name,
    description: album.description || '',
    images: album.images || [], // array of { image: blobRef, alt, rkey }
    createdAt: album.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return putRecord(ALBUM_COLLECTION, rkey, record);
}

// Generic putRecord
export async function putRecord(collection, rkey, record) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const res = await authFetch(
    `${session.service}/xrpc/com.atproto.repo.putRecord`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
        record,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `putRecord failed: ${res.status}`);
  }

  return res.json();
}

// Delete a record
export async function deleteRecord(collection, rkey) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const res = await authFetch(
    `${session.service}/xrpc/com.atproto.repo.deleteRecord`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `deleteRecord failed: ${res.status}`);
  }

  return res.json();
}

// List records in a collection (paginated)
export async function listRecords(collection, { limit = 100, cursor = '' } = {}) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const params = new URLSearchParams({
    repo: session.did,
    collection,
    limit: String(limit),
  });
  if (cursor) params.set('cursor', cursor);

  const res = await authFetch(
    `${session.service}/xrpc/com.atproto.repo.listRecords?${params}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `listRecords failed: ${res.status}`);
  }

  return res.json();
}

// Get a single record
export async function getRecord(collection, rkey) {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const params = new URLSearchParams({
    repo: session.did,
    collection,
    rkey,
  });

  const res = await authFetch(
    `${session.service}/xrpc/com.atproto.repo.getRecord?${params}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `getRecord failed: ${res.status}`);
  }

  return res.json();
}

// Load all uploaded images from user's PDS
export async function loadUploadedImages() {
  const all = [];
  let cursor = '';

  while (true) {
    const res = await listRecords(IMAGE_COLLECTION, { limit: 100, cursor });
    for (const rec of res.records || []) {
      all.push({
        uri: rec.uri,
        rkey: rec.uri.split('/').pop(),
        cid: rec.cid,
        value: rec.value,
      });
    }
    cursor = res.cursor;
    if (!cursor) break;
  }

  return all;
}

// Load all albums from user's PDS
export async function loadAlbums() {
  const all = [];
  let cursor = '';

  while (true) {
    const res = await listRecords(ALBUM_COLLECTION, { limit: 100, cursor });
    for (const rec of res.records || []) {
      all.push({
        uri: rec.uri,
        rkey: rec.uri.split('/').pop(),
        cid: rec.cid,
        value: rec.value,
      });
    }
    cursor = res.cursor;
    if (!cursor) break;
  }

  return all;
}

// Generate a TID (timestamp-based ID) for rkeys
// TID = microseconds since Unix epoch, base32-sorted encoding
function generateTid() {
  const now = BigInt(Date.now()) * 1000n; // microseconds
  const clockId = BigInt(Math.floor(Math.random() * 1024)); // 10 random bits
  const tid = (now << 10n) | clockId;
  return tid.toString(36).padStart(13, '0');
}

export { ALBUM_COLLECTION, IMAGE_COLLECTION };
