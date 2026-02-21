/**
 * ATProto client for recipe publishing and reading.
 * Uses plain fetch — no SDK dependencies needed.
 * Works from static pages (Cloudflare Pages, etc.)
 */

const PUBLIC_API = "https://public.api.bsky.app";

// --- Identity resolution ---

export async function resolveHandle(handle) {
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
  const { did } = await res.json();
  return did;
}

export async function resolvePDS(did) {
  let doc;
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID document: ${did}`);
    doc = await res.json();
  } else if (did.startsWith("did:web:")) {
    // did:web:example.com → https://example.com/.well-known/did.json
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

// --- Authentication (app password) ---

export async function createSession(handle, appPassword) {
  const did = await resolveHandle(handle);
  const pds = await resolvePDS(did);

  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Authentication failed (${res.status})`);
  }

  const session = await res.json();
  return { ...session, pds };
}

// --- Recipe CRUD ---

export async function publishRecipe(session, record) {
  const res = await fetch(
    `${session.pds}/xrpc/com.atproto.repo.createRecord`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "exchange.recipe.recipe",
        record,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Publish failed (${res.status})`);
  }

  return res.json();
}

export async function deleteRecipe(session, rkey) {
  const res = await fetch(
    `${session.pds}/xrpc/com.atproto.repo.deleteRecord`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "exchange.recipe.recipe",
        rkey,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Delete failed (${res.status})`);
  }
}

// --- Reading recipes (no auth needed) ---

export async function fetchRecipe(atUri) {
  // at://did:plc:abc/exchange.recipe.recipe/rkey
  const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid AT URI: ${atUri}`);
  const [, repo, collection, rkey] = match;

  const params = `repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
  let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?${params}`);

  if (!res.ok) {
    // Fall back to PDS directly
    const did = repo.startsWith("did:") ? repo : await resolveHandle(repo);
    const pds = await resolvePDS(did);
    res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) throw new Error(`Recipe not found (${res.status})`);
  }

  return res.json();
}

export async function listRecipes(handleOrDid, limit = 50) {
  let did = handleOrDid;
  // If it looks like a handle (has a dot, no "did:" prefix), resolve it
  if (!did.startsWith("did:") && did.includes(".")) {
    did = await resolveHandle(did);
  }

  // Try the public API first (Bluesky relay), fall back to PDS directly
  // The relay may not index exchange.recipe.recipe records
  const params = `repo=${encodeURIComponent(did)}&collection=exchange.recipe.recipe&limit=${limit}`;
  let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.listRecords?${params}`);

  if (!res.ok) {
    // Fall back: resolve PDS and query it directly
    const pds = await resolvePDS(did);
    res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) throw new Error(`Could not list recipes (${res.status})`);
  }

  const data = await res.json();
  return data.records || [];
}
