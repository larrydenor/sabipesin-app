import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL } from '../config/env';
import { clearTokens, getTokens, saveTokens, TokenPair } from '../auth/tokenStorage';
import { toApiError } from './errors';

// One shared axios instance for the whole app. baseURL comes from config (env),
// never hardcoded at call sites. A 20s timeout keeps the OTP screens from
// spinning forever when the backend or SMS provider is slow.
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the bearer token when we have one. The OTP endpoints are public, so
// this is a no-op for them, but every authenticated call made later (profile,
// discovery, …) gets the header for free.
apiClient.interceptors.request.use(async (config) => {
  const tokens = await getTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// Set by AuthProvider on mount (auth/AuthContext.tsx) so a 401 the refresh
// flow can't recover from can force a clean return to the login screen. This
// module can't import AuthContext's `signOut` directly — it only exists as a
// value inside the provider's React state, not a top-level export — so the
// provider hands it to us instead. Left unset (e.g. before the provider has
// mounted), forceSignOut still clears tokens, it just can't flip app state.
type SignOutHandler = () => Promise<void>;
let signOutHandler: SignOutHandler | null = null;
export function registerSignOutHandler(handler: SignOutHandler | null): void {
  signOutHandler = handler;
}

async function forceSignOut(): Promise<void> {
  await clearTokens();
  if (signOutHandler) {
    await signOutHandler();
  }
}

// Only one refresh call is ever in flight at a time. Several requests can hit
// a 401 around the same moment (e.g. a screen that fires 3 calls at once); if
// each started its own refresh, all but one would be racing against the
// backend's rotation (Chunk 1) and get INVALID_REFRESH_TOKEN. Every 401 that
// arrives while a refresh is already pending awaits this SAME promise instead.
let refreshPromise: Promise<void> | null = null;

// Deliberately a bare `axios.post`, NOT `apiClient` — this instance's own
// interceptors (this file) must never run for the refresh call itself, both
// because it has no access token to attach and because its own 401 must never
// trigger another refresh attempt. Reads the base URL off `apiClient.defaults`
// (rather than importing API_BASE_URL directly) so there's one source of
// truth for it — apiClient is the only thing ever reconfigured to point
// somewhere else (e.g. by a test).
async function performRefresh(): Promise<void> {
  const tokens = await getTokens();
  if (!tokens?.refreshToken) {
    throw new Error('No refresh token stored');
  }
  const { data } = await axios.post<TokenPair>(`${apiClient.defaults.baseURL}/auth/refresh`, {
    refreshToken: tokens.refreshToken,
  });
  await saveTokens(data);
}

function getOrStartRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Axios doesn't type a place to stash retry bookkeeping on a request config,
// so this is our own marker: true once a request has already been retried
// after a refresh, so a 401 on the retry itself doesn't start a second one.
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Normalize every rejection into an ApiError so screens never see raw axios —
// except a genuine 401, which first tries exactly one refresh-and-retry cycle
// before falling back to that same normalization.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && config) {
      if (config._retried) {
        // The retry itself came back 401 — the freshly-issued token was
        // rejected too. Don't chase this further.
        await forceSignOut();
        return Promise.reject(toApiError(error));
      }

      config._retried = true;
      try {
        // Storage now holds the new pair; the request interceptor above picks
        // the new access token up on this retry, so there's nothing to set
        // on `config` here.
        await getOrStartRefresh();
        return apiClient.request(config);
      } catch {
        await forceSignOut();
        return Promise.reject(toApiError(error));
      }
    }

    return Promise.reject(toApiError(error));
  },
);
