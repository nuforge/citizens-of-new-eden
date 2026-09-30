/**
 * PKCE utilities for EVE SSO OAuth2
 * Reference: https://login.eveonline.com/v2/oauth/authorize
 */

const SSO_AUTHORIZE_URL = "https://login.eveonline.com/v2/oauth/authorize";
const SSO_TOKEN_URL = "https://login.eveonline.com/v2/oauth/token";

import type {
  TokenResponse,
  EveJwtPayload,
  CharacterIdentity
} from "@/types/sso";

// --- PKCE helpers ---

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

// --- Auth URL builder ---

export interface SsoAuthParams {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: string[];
  readonly state: string;
  readonly codeChallenge: string;
}

export function buildAuthUrl(params: SsoAuthParams): string {
  const url = new URL(SSO_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// --- Token exchange ---

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri
  });

  const response = await fetch(SSO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SSO token exchange failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<TokenResponse>;
}

// --- Token refresh ---

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  });

  const response = await fetch(SSO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SSO token refresh failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<TokenResponse>;
}

// --- JWT parsing (no signature verify in SPA — token arrived directly from EVE) ---

export function parseJwt(token: string): EveJwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  const payload = parts[1];
  if (!payload) {
    throw new Error("Missing JWT payload");
  }
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  return JSON.parse(decoded) as EveJwtPayload;
}

// --- Extract character identity from JWT ---

export function extractCharacterIdentity(token: string): CharacterIdentity {
  const payload = parseJwt(token);
  // sub format: "CHARACTER:EVE:{characterId}"
  const parts = payload.sub.split(":");
  const characterId = parseInt(parts[2] ?? "", 10);
  if (isNaN(characterId)) {
    throw new Error(`Unexpected JWT sub format: ${payload.sub}`);
  }
  return {
    characterId,
    characterName: payload.name,
    owner: payload.owner,
    expiresAt: payload.exp * 1000 // convert to ms
  };
}
