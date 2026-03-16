// Google OAuth — popup-based sign-in for Gemini API access
// Uses Google Identity Services (implicit grant) to get an access token
// No API key needed — user authenticates with their Google account

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/generative-language';

const STORAGE_KEY = 'os:google-token';

// Load the Google Identity Services script once
let gsiLoaded = null;
function loadGSI() {
  if (gsiLoaded) return gsiLoaded;
  gsiLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gsiLoaded;
}

// Initiate OAuth popup — returns { access_token, expires_at }
export async function signInWithGoogle() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID not configured');
  }

  await loadGSI();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const token = {
          access_token: response.access_token,
          expires_at: Date.now() + (response.expires_in * 1000),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
        resolve(token);
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Google sign-in cancelled'));
      },
    });

    client.requestAccessToken();
  });
}

// Get stored token if still valid (with 60s buffer)
export function getGoogleToken() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const token = JSON.parse(stored);
    if (token.expires_at < Date.now() + 60_000) return null;
    return token;
  } catch {
    return null;
  }
}

// Clear stored token
export function clearGoogleToken() {
  localStorage.removeItem(STORAGE_KEY);
}

// Check if client ID is configured
export function isGoogleConfigured() {
  return !!GOOGLE_CLIENT_ID;
}
