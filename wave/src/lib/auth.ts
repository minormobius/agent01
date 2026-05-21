// OAuth via the shared auth worker at auth.mino.mobi.
// Thin wrapper around packages/oauth-client/auth.js — owns a singleton
// AuthClient and re-exports the function-shaped API wave has always used.

// @ts-expect-error — shared client is plain JS, no .d.ts
import { AuthClient } from '../../../packages/oauth-client/auth.js';

const client = new AuthClient();

export interface AuthUser {
  did: string;
  handle: string;
}

export async function authInit(): Promise<AuthUser | null> {
  return (await client.init()) as AuthUser | null;
}

export async function authLogin(handle: string): Promise<void> {
  return client.login(handle);
}

export function authLogout(): void {
  client.logout();
}

export async function authFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return client.request(path, opts);
}
