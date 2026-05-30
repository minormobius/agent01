// Shared sign-in chip for the fluoddity surfaces. Mount it into any element and
// it renders sign-in / @handle / sign-out, wired to the shared AuthClient. The
// session lives in origin-scoped localStorage, so signing in on one surface
// carries to all the others (landing, gallery, selection, arena, …) for free.
//
//   import { mountAuthChip, auth } from './authchip.js';   // adjust relative path
//   mountAuthChip(document.getElementById('auth'));
//
// `auth` is the singleton AuthClient — reuse it for PDS calls if a surface needs
// to write (auth.pds.createRecord, etc.).
import { AuthClient } from './auth.js';

export const auth = new AuthClient();

let _styled = false;
function injectStyles() {
  if (_styled) return; _styled = true;
  const s = document.createElement('style');
  s.textContent = `
.authchip { display: inline-flex; align-items: center; gap: 8px; font-family: var(--mono, ui-monospace, monospace); white-space: nowrap; }
.authchip .authbtn { font: inherit; font-size: 12px; cursor: pointer; color: #04110e; background: var(--accent, #38e1c0); border: 0; border-radius: 7px; padding: 6px 11px; font-weight: 600; }
.authchip .authbtn[data-act=out] { color: var(--muted, #8b909c); background: transparent; border: 1px solid var(--rule, #23272f); font-weight: 400; }
.authchip .authbtn[data-act=out]:hover { color: var(--accent, #38e1c0); border-color: var(--accent, #38e1c0); }
.authchip .authwho { font-size: 12px; color: var(--accent, #38e1c0); max-width: 18ch; overflow: hidden; text-overflow: ellipsis; }
.authchip .authbusy { font-size: 11px; color: var(--muted, #8b909c); }`;
  document.head.appendChild(s);
}

let _mounted = false; // init the client once, even if mounted in several spots

export function mountAuthChip(el) {
  if (!el) return auth;
  injectStyles();
  el.classList.add('authchip');

  function render(user) {
    if (user) {
      el.innerHTML = `<span class="authwho" title="${user.did || ''}">@${user.handle || 'signed in'}</span><button class="authbtn" data-act="out">sign out</button>`;
    } else {
      el.innerHTML = `<button class="authbtn" data-act="in">sign in</button>`;
    }
    const inb = el.querySelector('[data-act=in]');
    const outb = el.querySelector('[data-act=out]');
    if (inb) inb.addEventListener('click', doLogin);
    if (outb) outb.addEventListener('click', () => auth.logout());
  }

  async function doLogin() {
    const handle = prompt('Sign in with your Bluesky handle (e.g. alice.bsky.social):');
    if (!handle) return;
    el.innerHTML = `<span class="authbusy">redirecting…</span>`;
    try { await auth.login(handle.trim()); }
    catch (e) { alert('Sign-in failed: ' + (e.message || e)); render(auth.getUser()); }
  }

  auth.onAuthChange(render);
  render(auth.getUser());
  if (!_mounted) { _mounted = true; auth.init(); } // validates session / picks up the OAuth redirect token
  return auth;
}
