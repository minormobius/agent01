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
  const res = await fetch(`https://plc.directory/${did}`);
  if (!res.ok) throw new Error(`Could not resolve DID document: ${did}`);
  const doc = await res.json();
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

  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?` +
      `repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`
  );

  if (!res.ok) throw new Error(`Recipe not found (${res.status})`);
  return res.json();
}

export async function listRecipes(handleOrDid, limit = 50) {
  let repo = handleOrDid;
  // If it looks like a handle (has a dot, no "did:" prefix), resolve it
  if (!repo.startsWith("did:") && repo.includes(".")) {
    repo = await resolveHandle(repo);
  }

  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.repo.listRecords?` +
      `repo=${encodeURIComponent(repo)}&collection=exchange.recipe.recipe&limit=${limit}`
  );

  if (!res.ok) throw new Error(`Could not list recipes (${res.status})`);
  const data = await res.json();
  return data.records || [];
}
