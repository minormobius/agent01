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

export async function login(handle) {
  return client.login(handle);
}

export function logout() {
  return client.logout();
}

export async function authFetch(path, options = {}) {
  return client.request(path, options);
}
