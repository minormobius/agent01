// PDS write operations — proxied through auth.mino.mobi
// All operations require an active OAuth session (see auth.js)

import { getSession, authFetch } from './auth.js';

const ALBUM_COLLECTION = 'com.minomobi.arena.album';
const IMAGE_COLLECTION = 'com.minomobi.arena.image';

// Upload a blob (image/video) to the user's PDS
export async function uploadBlob(file) {
  if (!getSession()) throw new Error('Not logged in');

  const res = await authFetch('/pds/repo/uploadBlob', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed: ${res.status}`);
  }

  const data = await res.json();
  return data.blob;
}

// Create an image anchor record
export async function createImageRecord(blob, { alt = '', aspectRatio = null } = {}) {
  if (!getSession()) throw new Error('Not logged in');

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
  if (!getSession()) throw new Error('Not logged in');

  rkey = rkey || generateTid();
  const record = {
    $type: ALBUM_COLLECTION,
    name: album.name,
    description: album.description || '',
    images: album.images || [],
    createdAt: album.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return putRecord(ALBUM_COLLECTION, rkey, record);
}

// Generic putRecord
export async function putRecord(collection, rkey, record) {
  if (!getSession()) throw new Error('Not logged in');

  const res = await authFetch('/pds/repo/putRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, rkey, record }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `putRecord failed: ${res.status}`);
  }

  return res.json();
}

// Delete a record
export async function deleteRecord(collection, rkey) {
  if (!getSession()) throw new Error('Not logged in');

  const res = await authFetch('/pds/repo/deleteRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, rkey }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `deleteRecord failed: ${res.status}`);
  }

  return res.json();
}

// List records in a collection (paginated)
export async function listRecords(collection, { limit = 100, cursor = '' } = {}) {
  if (!getSession()) throw new Error('Not logged in');

  const params = new URLSearchParams({ collection, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const res = await authFetch(`/pds/repo/listRecords?${params}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `listRecords failed: ${res.status}`);
  }

  return res.json();
}

// Get a single record
export async function getRecord(collection, rkey) {
  if (!getSession()) throw new Error('Not logged in');

  const params = new URLSearchParams({ collection, rkey });

  const res = await authFetch(`/pds/repo/getRecord?${params}`);

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
function generateTid() {
  const now = BigInt(Date.now()) * 1000n;
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  const tid = (now << 10n) | clockId;
  return tid.toString(36).padStart(13, '0');
}

export { ALBUM_COLLECTION, IMAGE_COLLECTION };
