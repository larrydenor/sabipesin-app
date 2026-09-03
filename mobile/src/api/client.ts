import axios, { AxiosInstance } from 'axios';

import { API_BASE_URL } from '../config/env';
import { getTokens } from '../auth/tokenStorage';
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

// Normalize every rejection into an ApiError so screens never see raw axios.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiError(error)),
);
