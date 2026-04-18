/**
 * ATProto OAuth authorization server discovery.
 * Resolves a user's PDS URL to an authorization server.
 * Extracted from poll/apps/api/src/oauth/discovery.ts.
 */

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  dpop_signing_alg_values_supported?: string[];
  require_pushed_authorization_requests?: boolean;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
}

export async function fetchProtectedResourceMeta(pdsUrl: string): Promise<ProtectedResourceMetadata> {
  const url = `${pdsUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch protected resource metadata from ${url}: ${res.status}`);
  }
  return res.json() as Promise<ProtectedResourceMetadata>;
}

export async function fetchAuthServerMeta(authServerUrl: string): Promise<AuthServerMetadata> {
  const url = `${authServerUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch auth server metadata from ${url}: ${res.status}`);
  }
  return res.json() as Promise<AuthServerMetadata>;
}

export async function discoverAuthServer(pdsUrl: string): Promise<{
  authServerUrl: string;
  metadata: AuthServerMetadata;
}> {
  const resourceMeta = await fetchProtectedResourceMeta(pdsUrl);
  if (!resourceMeta.authorization_servers?.length) {
    throw new Error('PDS did not advertise any authorization servers');
  }
  const authServerUrl = resourceMeta.authorization_servers[0];
  const metadata = await fetchAuthServerMeta(authServerUrl);
  return { authServerUrl, metadata };
}
