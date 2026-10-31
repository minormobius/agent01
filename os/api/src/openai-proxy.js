const UPSTREAM = 'https://chatgpt.com/backend-api/codex/responses';

// Preserve Codex protocol metadata, but never forward browser cookies or a
// client-supplied account header. Only custody supplies upstream credentials.
function upstreamHeaders(request, token) {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (['content-type', 'content-encoding', 'accept', 'openai-beta', 'session-id', 'thread-id', 'originator', 'user-agent'].includes(key)
        || key.startsWith('x-codex-')) headers.set(key, value);
  }
  headers.set('Authorization', `Bearer ${token.access_token}`);
  if (token.account_id) headers.set('chatgpt-account-id', token.account_id);
  return headers;
}

export async function proxyOpenAIResponses(request, stub, cors, fetcher = fetch) {
  const failure = (error, status = 502) => new Response(JSON.stringify({
    error: { message: `os-api: ${error}`, type: 'os_api_credential' },
  }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
  const getToken = (rejected) => stub.fetch(new Request('https://do/_openai/token', rejected ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejected_access_token: rejected }),
  } : undefined));
  const retry = request.clone();
  try {
    let tokResp = await getToken();
    let token = await tokResp.json();
    if (!tokResp.ok) return failure(token.error || 'credential_unavailable', tokResp.status);
    const send = (body) => fetcher(UPSTREAM, {
      method: 'POST', headers: upstreamHeaders(request, token), body,
      redirect: 'manual',
    });
    let upstream = await send(request.body);
    if (upstream.status === 401) {
      await upstream.body?.cancel();
      tokResp = await getToken(token.access_token);
      token = await tokResp.json();
      if (!tokResp.ok) return failure(token.error || 'credential_unavailable', tokResp.status);
      upstream = await send(retry.body);
    }
    const headers = new Headers(upstream.headers);
    headers.delete('set-cookie');
    headers.set('Cache-Control', 'no-store');
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch { return failure('upstream_unavailable'); }
  finally {
    // A tee branch can wait for its peer, so do not await its cancellation.
    if (retry.body && !retry.body.locked) void retry.body.cancel().catch(() => {});
  }
}
