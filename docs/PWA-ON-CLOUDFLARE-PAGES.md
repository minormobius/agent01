# PWA on Cloudflare Pages with AT Protocol

A recipe for shipping a zero-backend progressive web app that reads and writes to the AT Protocol, deployed as a subdomain on Cloudflare Pages. Tested in production at `bakery.minomobi.com`.

---

## What You Get

- Home-screen installable app (iOS + Android)
- Offline-capable via service worker
- ATProto login with session persistence (sign in once, stays signed in)
- Public reads, authenticated writes — no application server
- Free hosting on Cloudflare Pages global CDN
- Auto-deploy from GitHub on push to `main`

## Stack

| Layer | Tool | Why |
|-------|------|-----|
| Build | Vite 6 | Fast, zero-config, tree-shakes well |
| UI | React 18 | Or whatever — the PWA shell is framework-agnostic |
| Hosting | Cloudflare Pages | Free, global CDN, custom domains, auto-SSL |
| Data | AT Protocol (user's PDS) | User-owned data, no database to run |
| Auth | ATProto app passwords | No OAuth server needed |

## Directory Layout

```
your-app/
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker
│   ├── icon-192.png        # Home screen icon
│   └── icon-512.png        # Splash screen icon
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Your app
│   └── atproto.js          # ATProto client (plain fetch)
├── index.html              # HTML shell with PWA meta tags
├── vite.config.js          # Vite config (minimal)
└── package.json
```

At the repo root (if the app lives in a subdirectory):

```
repo-root/
├── your-app/               # The app directory above
├── wrangler.jsonc           # Points Cloudflare at your-app/dist
└── package.json             # Root build script
```

---

## 1. The HTML Shell

This is the critical file. Every PWA meta tag, the service worker registration, and the safe-area handling lives here.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Your App</title>

    <!-- PWA -->
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#your-color" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Short Name" />
    <link rel="apple-touch-icon" href="/icon-192.png" />

    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        padding: env(safe-area-inset-top) env(safe-area-inset-right)
                 env(safe-area-inset-bottom) env(safe-area-inset-left);
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    </script>
  </body>
</html>
```

### What each piece does

| Tag | Purpose |
|-----|---------|
| `viewport-fit=cover` | Extends content into the notch area on iPhone |
| `manifest.json` | Tells the browser this is installable |
| `theme-color` | Colors the Android status bar and task switcher |
| `apple-mobile-web-app-capable` | Enables iOS home screen mode (hides Safari chrome) |
| `apple-mobile-web-app-status-bar-style` | `black-translucent` = dark status bar, content underneath |
| `apple-mobile-web-app-title` | The name under the icon on iOS home screen |
| `apple-touch-icon` | iOS home screen icon (192px works fine) |
| `env(safe-area-inset-*)` | Prevents content from hiding behind the notch/home indicator |

---

## 2. The Manifest

`public/manifest.json`:

```json
{
  "name": "Your Full App Name",
  "short_name": "AppName",
  "description": "What it does in one line",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#your-bg",
  "theme_color": "#your-color",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Key choices:**
- `display: "standalone"` — runs full-screen, no browser UI. This is what makes it feel like an app.
- `orientation: "portrait"` — lock orientation if your layout assumes it.
- `purpose: "any maskable"` — the icon works as-is and also in Android's adaptive icon circles. Make sure your icon has padding (safe zone is the inner 80%).
- Two icon sizes minimum: 192px (home screen) and 512px (splash screen on Android).

---

## 3. The Service Worker

`public/sw.js`:

```javascript
const CACHE_NAME = 'your-app-v1';

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/icon-192.png',
        '/icon-512.png',
      ])
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: strategy depends on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // IMPORTANT: Don't cache cross-origin requests (API calls to PDS, relay, etc.)
  if (url.hostname !== location.hostname) {
    return; // Let the browser handle it normally
  }

  // HTML navigation: network-first (get fresh content, fall back to cache offline)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets (JS, CSS, images): cache-first with background update
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
      return cached || fetchPromise;
    })
  );
});
```

### Caching strategy explained

```
Request type     │ Strategy         │ Why
─────────────────┼──────────────────┼─────────────────────────────────────
HTML navigation  │ Network-first    │ Always try to get the latest page;
                 │                  │ fall back to cache if offline
─────────────────┼──────────────────┼─────────────────────────────────────
Assets (JS/CSS)  │ Cache-first +    │ Fast loads from cache; network
                 │ background update│ updates the cache for next time
─────────────────┼──────────────────┼─────────────────────────────────────
API calls        │ Bypass (no cache)│ ATProto reads/writes must be live
(cross-origin)   │                  │
```

**Critical detail**: The `hostname !== location.hostname` check is what keeps API calls flowing through. Without it the SW will try to cache ATProto XRPC responses and break everything.

### How updates propagate

When you deploy new code:
1. User opens the app → SW fetches new `index.html` from network (network-first)
2. New HTML references a new JS bundle hash (e.g., `index-DB-A1VH2.js`)
3. Browser fetches the new bundle → SW caches it
4. **Next open**: cached bundle is now the new version → user is updated

This means updates land in ~2 opens. No reinstall needed.

### Bumping the cache version

When you make breaking changes to the SW itself, bump `CACHE_NAME`:
```javascript
const CACHE_NAME = 'your-app-v2'; // was v1
```

The `activate` handler will nuke old caches automatically.

---

## 4. ATProto Client (Zero Dependencies)

You don't need `@atproto/api` or any SDK. Plain `fetch` does everything. Here's the complete client:

### Identity Resolution

```javascript
const PUBLIC_API = "https://public.api.bsky.app";

// Handle → DID
export async function resolveHandle(handle) {
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
  const { did } = await res.json();
  return did;
}

// DID → PDS endpoint
export async function resolvePDS(did) {
  let doc;
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replaceAll(":", "/");
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const svc = doc.service?.find((s) => s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("No PDS endpoint in DID document");
  return svc.serviceEndpoint;
}
```

Three-step resolution: **Handle → DID → PDS**. This is how you find where a user's data lives.

### Authentication

```javascript
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
  return { ...session, pds }; // Stash PDS URL in the session object
}
```

**Key**: We stash `pds` on the session object. The ATProto session response doesn't include it, but you need it for every subsequent write. Store it alongside the tokens.

### Token Refresh

```javascript
export async function refreshSession(session) {
  const res = await fetch(`${session.pds}/xrpc/com.atproto.server.refreshSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.refreshJwt}` },
  });

  if (!res.ok) throw new Error("Session expired");

  const refreshed = await res.json();
  return { ...refreshed, pds: session.pds }; // Carry the PDS URL forward
}
```

### Reading Records (No Auth)

```javascript
export async function listRecords(handleOrDid, collection, limit = 50) {
  let did = handleOrDid;
  if (!did.startsWith("did:") && did.includes(".")) {
    did = await resolveHandle(did);
  }

  const params = `repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&limit=${limit}`;

  // Try public relay first, fall back to PDS
  let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.listRecords?${params}`);
  if (!res.ok) {
    const pds = await resolvePDS(did);
    res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) throw new Error(`Could not list records (${res.status})`);
  }

  const data = await res.json();
  return data.records || [];
}
```

**Public relay vs PDS**: The Bluesky relay (`public.api.bsky.app`) indexes `app.bsky.*` collections but may not index custom lexicons. Always fall back to querying the user's PDS directly. The relay-first approach is faster when it works (cached, geographically distributed).

### Writing Records (Auth Required)

```javascript
export async function createRecord(session, collection, record) {
  const res = await fetch(`${session.pds}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection,
      record,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Write failed (${res.status})`);
  }

  return res.json(); // { uri, cid }
}
```

---

## 5. Session Persistence (The Login-Once Pattern)

This is the piece that makes it feel like an app instead of a website. Users sign in once and stay signed in across app restarts.

```javascript
const SESSION_KEY = "your-app-atproto-session";
const HANDLE_KEY = "your-app-atproto-handle";

// Load/save session from localStorage
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

function saveSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
```

### On App Mount: Silent Token Refresh

```jsx
const [session, setSession] = useState(loadSession);

useEffect(() => {
  const stored = loadSession();
  if (!stored?.refreshJwt) return;

  refreshSession(stored)
    .then((refreshed) => {
      saveSession(refreshed);
      setSession(refreshed);
    })
    .catch(() => {
      // Refresh token expired — clear everything, force re-login
      saveSession(null);
      setSession(null);
    });
}, []);
```

### On Login: Save Session + Handle

```javascript
const handleLogin = async (handle, appPassword) => {
  const session = await createSession(handle, appPassword);
  localStorage.setItem(HANDLE_KEY, handle); // Pre-fill next time
  saveSession(session);
  setSession(session);
};
```

### On Logout: Clear

```javascript
const handleLogout = () => {
  saveSession(null);
  setSession(null);
};
```

### What's stored in localStorage

```
bakery-atproto-session → {
  did: "did:plc:abc123",
  handle: "user.bsky.social",
  accessJwt: "eyJ...",      ← short-lived (minutes), used for API calls
  refreshJwt: "eyJ...",     ← long-lived (months), used to get new accessJwt
  pds: "https://bsky.social" ← their PDS endpoint (we add this)
}

bakery-atproto-handle → "user.bsky.social"  ← convenience, pre-fills login form
```

**Security note**: App passwords are scoped and revocable by the user — they're not the account password. The `refreshJwt` is the sensitive one. `localStorage` is acceptable here because:
1. It's same-origin only
2. The app has no server-side component to leak it to
3. Users can revoke the app password anytime from Bluesky settings

---

## 6. Vite Config

Minimal. Vite handles everything.

```javascript
// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

Vite copies everything in `public/` to `dist/` on build — that's how `sw.js`, `manifest.json`, and the icons end up in the deploy directory without any extra config.

---

## 7. Cloudflare Pages Deployment

### If the app is at the repo root

In Cloudflare Pages dashboard:
- **Build command**: `npm run build`
- **Build output directory**: `dist`

### If the app is in a subdirectory

Use `wrangler.jsonc` at the repo root:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "your-app",
  "compatibility_date": "2026-02-20",
  "assets": {
    "directory": "./your-app/dist"
  }
}
```

Root `package.json` build script:

```json
{
  "scripts": {
    "build": "cd your-app && npm install && npm run build"
  }
}
```

### Custom Subdomain Setup

In Cloudflare dashboard:
1. **DNS > Records**: Add CNAME `yourapp` → `your-project.pages.dev`
2. **Pages > Custom domains**: Add `yourapp.yourdomain.com`
3. SSL is automatic.

---

## 8. Package.json

```json
{
  "name": "your-app",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

**Zero ATProto dependencies.** The client is ~170 lines of `fetch` calls. No SDK, no build plugins, no runtime overhead.

---

## 9. For the Stronglifts Clone: Adaptation Notes

Swap the domain-specific pieces:

| Bakery app | Stronglifts app |
|------------|-----------------|
| `exchange.recipe.recipe` | Your lexicon (e.g., `exchange.fitness.workout`) |
| `calculatorToRecipe()` | `workoutToRecord()` — serialize sets/reps/weight |
| `recipeToCalculator()` | `recordToWorkout()` — parse back to UI state |
| Flour blend calculator UI | 5x5 workout tracker UI |
| `bakery-atproto-session` | `stronglifts-atproto-session` |

Everything else — the service worker, manifest, HTML shell, ATProto client, session persistence, Cloudflare config — is identical. Copy-paste and change the names.

### Lexicon Design Tip

For workout records, something like:

```json
{
  "$type": "exchange.fitness.workout",
  "name": "Workout A",
  "date": "2026-02-22T00:00:00Z",
  "exercises": [
    {
      "name": "Squat",
      "sets": [
        { "reps": 5, "weight": 135, "unit": "lb", "completed": true },
        { "reps": 5, "weight": 135, "unit": "lb", "completed": true },
        { "reps": 5, "weight": 135, "unit": "lb", "completed": true },
        { "reps": 5, "weight": 135, "unit": "lb", "completed": true },
        { "reps": 5, "weight": 135, "unit": "lb", "completed": true }
      ]
    }
  ],
  "program": "stronglifts-5x5",
  "createdAt": "2026-02-22T18:30:00Z"
}
```

Users own their workout history on their PDS. They can switch apps and take their data with them. That's the pitch.

---

## TL;DR Checklist

- [ ] `index.html` with all PWA meta tags + `viewport-fit=cover` + safe area insets
- [ ] `public/manifest.json` with `display: "standalone"`, two icon sizes
- [ ] `public/sw.js` with network-first HTML, cache-first assets, bypass cross-origin
- [ ] `src/atproto.js` — resolveHandle, resolvePDS, createSession, refreshSession, CRUD
- [ ] Session persistence: save to localStorage on login, refresh on mount, clear on logout
- [ ] `vite.config.js` — just the React plugin
- [ ] `wrangler.jsonc` pointing at `dist/`
- [ ] CNAME record + custom domain in Cloudflare Pages
- [ ] Icons: 192px and 512px PNG with safe zone padding

Ship it.
