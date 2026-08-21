// STAGE 02 — Google Identity Services token client.
// The ONLY file that knows about auth. Nothing outside this file touches a
// token. Any 401 clears the token and surfaces sign-in; never a dead state.

const TODO = 'STAGE 02: not implemented';

/** Cached in-memory token if valid, else quiet renewal, else interactive. */
export function getToken(): Promise<string> {
  throw new Error(TODO);
}

/** Interactive consent. Wired to the header's "Sign in with Google" button. */
export function signIn(): void {
  throw new Error(TODO);
}

/** True when a non-expired token is held in memory. */
export function isSignedIn(): boolean {
  throw new Error(TODO);
}
