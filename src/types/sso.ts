// SSO token response from https://login.eveonline.com/v2/oauth/token
export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token: string;
}

// Decoded EVE SSO JWT payload
export interface EveJwtPayload {
  readonly sub: string; // "CHARACTER:EVE:{character_id}"
  readonly name: string; // character name
  readonly owner: string;
  readonly exp: number;
  readonly iss: string;
  readonly jti: string;
  readonly scp: string | string[]; // granted scopes
}

// Parsed character identity
export interface CharacterIdentity {
  readonly characterId: number;
  readonly characterName: string;
  readonly owner: string;
  readonly expiresAt: number; // Unix ms timestamp
}

// Stored auth session (in-memory only)
export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly character: CharacterIdentity;
}
