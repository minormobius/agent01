// One refresh owner per DID. All credential operations share this queue,
// including replacement and deletion while an OAuth request is in flight.
const KEY = 'openai:cred';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function expiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(payload)).exp;
    return Number.isFinite(exp) && exp > 0 && exp <= 8640000000000 ? exp : null;
  } catch { return null; }
}

export function credentialStatus(cred) {
  if (!cred?.refresh) return { stored: false };
  const exp = expiry(cred.access);
  return {
    stored: true, accountId: cred.accountId || null,
    accessExpiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    accessExpired: exp ? exp <= Date.now() / 1000 : null,
    lastRefresh: cred.lastRefresh ? new Date(cred.lastRefresh).toISOString() : null,
    loginRequired: !!(cred.refreshPending || cred.loginRequired),
    error: cred.loginRequired || (cred.refreshPending ? 'refresh_uncertain' : null),
  };
}

const validToken = (value) => typeof value === 'string' && value.length > 0
  && value.length <= 32768 && !/[\s\x00-\x1f\x7f]/.test(value);

export class OpenAICredentialStore {
  constructor(storage, fetcher = fetch) {
    this.storage = storage;
    this.fetcher = fetcher;
    this.queue = Promise.resolve();
  }

  handle(request, op) {
    const result = this.queue.then(() => this.run(request, op));
    this.queue = result.catch(() => {});
    return result.catch(() => json({ error: 'credential_storage_failed' }, 503));
  }

  async run(request, op) {
    if (op === 'put') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'bad_json' }, 400);
      const access = body.access_token ?? body.tokens?.access_token ?? '';
      const refresh = body.refresh_token ?? body.tokens?.refresh_token;
      const accountId = body.account_id ?? body.tokens?.account_id ?? '';
      if (!validToken(refresh) || (access !== '' && !validToken(access))
          || typeof accountId !== 'string' || accountId.length > 256 || /[\r\n]/.test(accountId)) {
        return json({ error: 'invalid_credential' }, 400);
      }
      const cred = { access, refresh, accountId, lastRefresh: null };
      await this.storage.put(KEY, cred);
      return json({ ok: true, ...credentialStatus(cred) });
    }
    if (op === 'delete') {
      await this.storage.delete(KEY);
      return json({ ok: true, stored: false });
    }
    const cred = await this.storage.get(KEY);
    if (op === 'status') return json(credentialStatus(cred));
    if (op !== 'token') return json({ error: 'unknown_op' }, 404);
    if (!cred?.refresh) return json({ error: 'no_credential' }, 503);
    if (cred.refreshPending || cred.loginRequired) {
      return json({ error: cred.loginRequired || 'refresh_uncertain', loginRequired: true }, 503);
    }
    let rejectedAccess;
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body || !validToken(body.rejected_access_token)) return json({ error: 'bad_json' }, 400);
        rejectedAccess = body.rejected_access_token;
      }
      catch { return json({ error: 'bad_json' }, 400); }
    }
    const exp = expiry(cred.access);
    const forced = rejectedAccess && rejectedAccess === cred.access;
    if (!forced && cred.access && exp && exp - Date.now() / 1000 >= 300) {
      return json({ access_token: cred.access, account_id: cred.accountId, refreshed: false });
    }

    // Persist BEFORE contacting OAuth. If this instance dies after rotation,
    // the next instance refuses to replay the old single-use refresh token.
    await this.storage.put(KEY, { ...cred, refreshPending: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let resp, tok;
    try {
      resp = await this.fetcher('https://auth.openai.com/oauth/token', {
        method: 'POST', signal: controller.signal, redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: cred.refresh, client_id: CLIENT_ID }),
      });
      tok = await resp.json().catch(() => null);
    } catch {
      return json({ error: 'refresh_uncertain', loginRequired: true }, 503);
    } finally { clearTimeout(timeout); }
    if (!resp.ok) {
      const code = typeof tok?.error === 'string' ? tok.error : tok?.error?.code;
      const fatal = resp.status === 400 || resp.status === 401 || resp.status === 403
        || ['invalid_grant', 'refresh_token_reused', 'refresh_token_expired', 'refresh_token_invalidated'].includes(code);
      await this.storage.put(KEY, { ...cred, loginRequired: fatal ? 'login_required' : null });
      return json({ error: fatal ? 'login_required' : 'refresh_failed', loginRequired: fatal, status: resp.status }, fatal ? 503 : 502);
    }
    if (!validToken(tok?.access_token) || !validToken(tok?.refresh_token)) {
      return json({ error: 'refresh_uncertain', loginRequired: true }, 503);
    }
    const next = { access: tok.access_token, refresh: tok.refresh_token,
      accountId: cred.accountId, lastRefresh: Date.now() };
    await this.storage.put(KEY, next);
    return json({ access_token: next.access, account_id: next.accountId, refreshed: true });
  }
}
