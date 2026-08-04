// ATProto authentication via the shared OAuth worker at auth.mino.mobi.
// Thin wrapper around packages/oauth-client/auth.js — owns a singleton
// AuthClient and re-exports the function-shaped API photo has always used.

import { AuthClient } from '../../../packages/oauth-client/auth.js';

const client = new AuthClient();

export function getSession() {
  return client.getUser();
}

export function isLoggedIn() {
  return client.isLoggedIn();
}

export function getToken() {
  return client.getToken();
}

export async function init() {
  return client.init();
}

/**
 * @param {string} handle
 * @param {object} [opts] `{ scope, returnTo }` — PASS A SCOPE. Omitting it
 *   falls back to the union of every collection every mino.mobi site writes,
 *   which is a consent screen listing forty lexicons to upload a photograph.
 *   `lib/arena.js` exports the two this surface actually needs.
 */
export async function login(handle, opts) {
  return client.login(handle, opts);
}

/** Does the session already cover these scope tokens? */
export function hasScope(required) {
  return client.hasScope(required);
}

/** Ask for more scope, just in time. Redirects; call it from a user gesture. */
export async function ensureScope(required, opts) {
  return client.ensureScope(required, opts);
}

export function logout() {
  return client.logout();
}

export async function authFetch(path, options = {}) {
  return client.request(path, options);
}
