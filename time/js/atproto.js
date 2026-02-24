/**
 * ATProto client for reading WhiteWind blog entries.
 * Adapted from bakery/src/atproto.js — plain fetch, no SDK.
 */

const PUBLIC_API = "https://public.api.bsky.app";
const COLLECTION = "com.whtwnd.blog.entry";

// --- Identity resolution ---

async function resolveHandle(handle) {
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
  const { did } = await res.json();
  return did;
}

async function resolvePDS(did) {
  let doc;
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID document: ${did}`);
    doc = await res.json();
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replaceAll(":", "/");
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve DID document: ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const svc = doc.service?.find((s) => s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("No PDS endpoint found in DID document");
  return svc.serviceEndpoint;
}

// Cache resolved identity to avoid repeated lookups
const _identityCache = {};

async function resolveIdentity(handle) {
  if (_identityCache[handle]) return _identityCache[handle];
  const did = await resolveHandle(handle);
  const pds = await resolvePDS(did);
  _identityCache[handle] = { did, pds };
  return { did, pds };
}

// --- Reading entries (no auth needed) ---

async function listEntries(handle, { limit = 50, cursor } = {}) {
  const { did, pds } = await resolveIdentity(handle);

  let params = `repo=${encodeURIComponent(did)}&collection=${COLLECTION}&limit=${limit}&reverse=true`;
  if (cursor) params += `&cursor=${encodeURIComponent(cursor)}`;

  // Try public API first, fall back to PDS (relay may not index whtwnd records)
  let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.listRecords?${params}`);
  if (!res.ok) {
    res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) throw new Error(`Could not list entries (${res.status})`);
  }

  const data = await res.json();
  return { records: data.records || [], cursor: data.cursor };
}

async function getEntry(handle, rkey) {
  const { did, pds } = await resolveIdentity(handle);
  const params = `repo=${encodeURIComponent(did)}&collection=${COLLECTION}&rkey=${encodeURIComponent(rkey)}`;

  let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) {
    res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) throw new Error(`Entry not found (${res.status})`);
  }

  return res.json();
}

// Extract rkey from an AT URI
function rkeyFromUri(uri) {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

// Format a datetime string for display
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Extract first paragraph from markdown as a summary
function extractLead(markdown, maxLen = 300) {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings, blank lines, metadata
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;
    // Found a paragraph
    const text = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // strip link syntax
    return text.length > maxLen ? text.slice(0, maxLen) + "\u2026" : text;
  }
  return "";
}
