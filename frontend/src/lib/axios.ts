import axios from 'axios';

// The API authenticates with an HttpOnly session cookie, so every request must
// send credentials. Authentication is never read from JS — there is no token in
// localStorage/sessionStorage.
const instance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// In-memory CSRF token. When the frontend and API are on different domains
// (e.g. separate Vercel deployments) the browser won't let JS read the API's
// CSRF cookie, so we fetch the token from the API and keep it here instead.
let csrfToken: string | null = null;

/** Store (or clear) the CSRF token for subsequent state-changing requests. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Fetch the current session's CSRF token from the API and remember it. */
export async function refreshCsrfToken(): Promise<void> {
  try {
    const res = await instance.get('/api/v1/auth/csrf');
    csrfToken = res.data?.csrf_token ?? null;
  } catch {
    csrfToken = null;
  }
}

/** Read a non-HttpOnly cookie by name (the CSRF token cookie). */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Attach the CSRF token to every state-changing request. Prefer the in-memory
// token (works cross-domain); fall back to the cookie for a same-site setup
// (e.g. local dev, where the cookie is readable). The server rejects any unsafe
// request whose header doesn't match the session's token.
instance.interceptors.request.use(
  (config) => {
    const method = (config.method || 'get').toLowerCase();
    if (UNSAFE_METHODS.has(method)) {
      const csrf = csrfToken || readCookie(CSRF_COOKIE_NAME);
      if (csrf) {
        config.headers[CSRF_HEADER_NAME] = csrf;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// A 401 on any authenticated call means the session is no longer valid
// (expired/logged out server-side). Send the user to login — but never for the
// auth endpoints themselves (a bad login is not a session expiry) or when
// already on an auth page, which would loop.
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      const url: string = error.config?.url || '';
      const isAuthCall = url.includes('/api/v1/auth/');
      const onAuthPage = window.location.pathname.startsWith('/auth');
      if (!isAuthCall && !onAuthPage) {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export default instance;
