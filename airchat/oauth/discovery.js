// airchat oauth/discovery.js — resolve PDS → authorization server.
// Port of poll's discovery.ts.

export async function fetchProtectedResourceMeta(pdsUrl) {
  const url = `${pdsUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`oauth-protected-resource fetch failed (${res.status}) at ${url}`);
  return res.json();
}

export async function fetchAuthServerMeta(authServerUrl) {
  const url = `${authServerUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`oauth-authorization-server fetch failed (${res.status}) at ${url}`);
  return res.json();
}

export async function discoverAuthServer(pdsUrl) {
  const resourceMeta = await fetchProtectedResourceMeta(pdsUrl);
  const authServerUrl = (resourceMeta.authorization_servers || [])[0];
  if (!authServerUrl) throw new Error('PDS did not advertise any authorization servers');
  const metadata = await fetchAuthServerMeta(authServerUrl);
  return { authServerUrl, metadata };
}
