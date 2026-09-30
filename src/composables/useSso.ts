/**
 * Composable for EVE SSO OAuth2 PKCE login / logout / callback handling.
 *
 * Usage:
 *   const { login, logout } = useSso()
 *   login()   → redirects browser to EVE SSO
 *   logout()  → clears session
 *
 *   On the callback page:
 *   const { handleCallback } = useSso()
 *   await handleCallback(code, state)
 */

import { useAuthStore } from 'src/stores/auth';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  extractCharacterIdentity,
} from 'src/services/sso';

const CLIENT_ID = import.meta.env.VITE_EVE_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_EVE_REDIRECT_URI as string;

const SCOPES = [
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-assets.read_assets.v1',
  'esi-wallet.read_character_wallet.v1',
];

const SESSION_KEY_VERIFIER = 'eve_sso_pkce_verifier';
const SESSION_KEY_STATE = 'eve_sso_state';

export interface UseSsoReturn {
  login: () => Promise<void>;
  logout: () => void;
  handleCallback: (code: string, returnedState: string) => Promise<void>;
  scheduleTokenRefresh: () => void;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function useSso(): UseSsoReturn {
  const authStore = useAuthStore();

  // Re-arm refresh timer after page reload if session was restored from storage.
  if (authStore.isAuthenticated && refreshTimer === null) {
    scheduleTokenRefresh();
  }

  async function login(): Promise<void> {
    if (!CLIENT_ID) {
      throw new Error('VITE_EVE_CLIENT_ID is not set. Create a .env file from .env.example.');
    }
    if (!REDIRECT_URI) {
      throw new Error('VITE_EVE_REDIRECT_URI is not set. Create a .env file from .env.example.');
    }

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    sessionStorage.setItem(SESSION_KEY_VERIFIER, verifier);
    sessionStorage.setItem(SESSION_KEY_STATE, state);

    const url = buildAuthUrl({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: SCOPES,
      state,
      codeChallenge: challenge,
    });

    window.location.href = url;
  }

  function logout(): void {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    sessionStorage.removeItem(SESSION_KEY_VERIFIER);
    sessionStorage.removeItem(SESSION_KEY_STATE);
    authStore.clearSession();
  }

  async function handleCallback(code: string, returnedState: string): Promise<void> {
    const storedState = sessionStorage.getItem(SESSION_KEY_STATE);
    const verifier = sessionStorage.getItem(SESSION_KEY_VERIFIER);

    sessionStorage.removeItem(SESSION_KEY_STATE);
    sessionStorage.removeItem(SESSION_KEY_VERIFIER);

    if (!storedState || storedState !== returnedState) {
      throw new Error('OAuth state mismatch — possible CSRF attack. Login aborted.');
    }
    if (!verifier) {
      throw new Error('Missing PKCE verifier. Please try logging in again.');
    }

    const tokens = await exchangeCodeForTokens(code, verifier, CLIENT_ID, REDIRECT_URI);
    const character = extractCharacterIdentity(tokens.access_token);

    authStore.setSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      character,
    });

    scheduleTokenRefresh();
  }

  function scheduleTokenRefresh(): void {
    const character = authStore.character;
    if (!character) return;

    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
    }

    // Refresh 60s before token expires
    const msUntilRefresh = character.expiresAt - Date.now() - 60_000;
    const delay = Math.max(msUntilRefresh, 10_000); // at least 10s

    refreshTimer = setTimeout(() => {
      const doRefresh = async (): Promise<void> => {
        const refreshToken = authStore.getRefreshToken();
        if (!refreshToken) return;
        const tokens = await refreshAccessToken(refreshToken, CLIENT_ID);
        const updated = extractCharacterIdentity(tokens.access_token);
        authStore.updateTokens(tokens.access_token, tokens.refresh_token, updated.expiresAt);
        scheduleTokenRefresh(); // reschedule for the new token
      };
      doRefresh().catch((err: unknown) => {
        console.error('Token refresh failed, logging out:', err);
        logout();
      });
    }, delay);
  }

  return { login, logout, handleCallback, scheduleTokenRefresh };
}
