// Edge-safe session helpers, shared by middleware.js (Web Crypto) and lib/auth.js (jsonwebtoken).

// The public demo must never sign with the fallback (anyone could forge a session). The live app keeps
// it only until Render's SESSION_SECRET is confirmed set (ahrom-labs/docs/owner-todo.md); then drop it.
export function jwtSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.DEMO_MODE === '1') throw new Error('SESSION_SECRET is not set');
  return 'fallback-secret';
}

const enc = new TextEncoder();
const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// True when the cookie is an HS256 token signed with our secret and not expired. The middleware uses
// it so a stale or foreign cookie means "signed out" (sign-in redirect / 401), not a null user
// crashing a route handler.
export async function validSession(token) {
  try {
    const [header, payload, sig] = token.split('.');
    const key = await crypto.subtle.importKey('raw', enc.encode(jwtSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', key, b64url(sig), enc.encode(`${header}.${payload}`)))) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(b64url(payload)));
    return !exp || exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
