// STAGE 02 — Google Identity Services token client.
// The ONLY file that knows about auth. Nothing outside this file touches a
// token, a scope, or the client id. Any 401 clears the token and surfaces
// sign-in via isSignedIn() → false; never a dead state.

declare global {
  interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID?: string;
  }
  interface Window {
    google?: GoogleNamespace;
  }
}

// Minimal shape of the GIS global we actually use. Declared here rather than
// pulled from @types so that auth knowledge stays inside this file.
interface GoogleNamespace {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GIS_POLL_MS = 50;
const GIS_TIMEOUT_MS = 10_000;
/** Renew a minute early so a request never races the expiry. */
const EXPIRY_MARGIN_MS = 60_000;

let token: string | null = null;
let expiresAt = 0;
let client: TokenClient | null = null;
let inFlight: Promise<string> | null = null;
/** GIS hands every response to the one client callback; route it to the waiter. */
let settle: ((response: TokenResponse) => void) | null = null;

function clear(): void {
  token = null;
  expiresAt = 0;
}

function valid(): boolean {
  return token !== null && Date.now() < expiresAt - EXPIRY_MARGIN_MS;
}

/** The GIS script is loaded by index.html (async); wait for the global. */
function gisReady(): Promise<GoogleNamespace> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
      } else if (Date.now() - started > GIS_TIMEOUT_MS) {
        reject(new Error('Google Identity Services failed to load'));
      } else {
        setTimeout(tick, GIS_POLL_MS);
      }
    };
    setTimeout(tick, GIS_POLL_MS);
  });
}

async function ensureClient(): Promise<TokenClient> {
  if (client) return client;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set — see MANUAL SETUP in the build spec');
  }
  const google = await gisReady();
  client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: (response) => settle?.(response),
    error_callback: (error) =>
      settle?.({ error: error.type ?? 'request_failed', error_description: error.message }),
  });
  return client;
}

/**
 * One token request. `prompt: ''` is the quiet path; omitting prompt lets GIS
 * show consent, which only works from a user gesture.
 */
async function request(prompt: string | undefined): Promise<string> {
  const tokenClient = await ensureClient();
  return new Promise<string>((resolve, reject) => {
    settle = (response) => {
      settle = null;
      if (response.access_token) {
        token = response.access_token;
        expiresAt = Date.now() + Number(response.expires_in ?? 3600) * 1000;
        resolve(response.access_token);
      } else {
        clear();
        reject(new Error(response.error_description ?? response.error ?? 'Authorization failed'));
      }
    };
    tokenClient.requestAccessToken(prompt === undefined ? {} : { prompt });
  });
}

/**
 * Cached token if valid, else quiet renewal. Rejects rather than forcing a
 * popup: a browser blocks one outside a user gesture, so failure surfaces the
 * header's sign-in button instead.
 *
 * `forceRefresh` is how gcal.ts invalidates a token a 401 has proven dead.
 */
export function getToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) clear();
  if (valid() && token !== null) return Promise.resolve(token);
  if (!inFlight) {
    inFlight = request('').finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Interactive consent. Wired to the header's "Sign in with Google" button. */
export function signIn(): void {
  if (inFlight) return;
  inFlight = request(undefined).finally(() => {
    inFlight = null;
  });
  // Rejection is not a dead state: isSignedIn() stays false and the button remains.
  inFlight.catch(() => undefined);
}

/** True when a non-expired token is held in memory. */
export function isSignedIn(): boolean {
  return valid();
}

/**
 * STAGE 05 — Settings' sign-out (added to the spec's export list 2026-08-23).
 * Revokes the grant with Google, not just locally: sign-out that leaves the
 * grant standing would quiet-renew straight back in on the next getToken().
 */
export function signOut(): void {
  const held = token;
  clear();
  if (held) window.google?.accounts?.oauth2?.revoke(held);
}
