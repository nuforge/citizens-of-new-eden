/**
 * ESI HTTP client
 * Base URL: https://esi.evetech.net/latest/
 * Handles: auth headers, ETag caching, error-limit tracking
 */

import type { EsiResponse, EsiError } from 'src/types/esi';

const ESI_BASE = 'https://esi.evetech.net/latest';
const DATASOURCE = 'tranquility';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

// Tracks remaining error budget — back off below threshold
let errorLimitRemain = 100;

function parseExpires(headers: Headers): Date | null {
  const raw = headers.get('X-ESI-Expires') ?? headers.get('Expires');
  return raw ? new Date(raw) : null;
}

function updateErrorLimit(headers: Headers): void {
  const remain = headers.get('X-ESI-Error-Limit-Remain');
  if (remain !== null) {
    errorLimitRemain = parseInt(remain, 10);
  }
}

function checkErrorBudget(): void {
  if (errorLimitRemain < 5) {
    throw new Error(`ESI error limit critically low (${errorLimitRemain} remaining). Backing off.`);
  }
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const base = 500 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Retries transient upstream failures (5xx + network errors); permanent 4xx errors bubble through.
async function esiFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init);
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
        const delay = backoffDelayMs(attempt, response.headers.get('Retry-After'));
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt >= MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempt, null)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`ESI ${label} failed after ${MAX_RETRIES + 1} attempts`);
}

export async function esiGet<T>(
  path: string,
  token?: string,
  etag?: string,
): Promise<EsiResponse<T>> {
  checkErrorBudget();

  const url = new URL(`${ESI_BASE}${path}`);
  url.searchParams.set('datasource', DATASOURCE);

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await esiFetch(url.toString(), { headers }, `GET ${path}`);

  updateErrorLimit(response.headers);

  // 304 Not Modified — caller should use cached data
  if (response.status === 304) {
    return {
      data: null as unknown as T,
      etag: etag ?? null,
      expires: parseExpires(response.headers),
    };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: response.statusText }))) as EsiError;
    throw new Error(`ESI ${path} failed (${response.status}): ${body.error}`);
  }

  const data = (await response.json()) as T;
  const newEtag = response.headers.get('ETag');
  const expires = parseExpires(response.headers);

  return { data, etag: newEtag, expires };
}

export async function esiPost<TResponse, TBody>(
  path: string,
  body: TBody,
  token?: string,
): Promise<TResponse> {
  checkErrorBudget();

  const url = new URL(`${ESI_BASE}${path}`);
  url.searchParams.set('datasource', DATASOURCE);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await esiFetch(
    url.toString(),
    { method: 'POST', headers, body: JSON.stringify(body) },
    `POST ${path}`,
  );

  updateErrorLimit(response.headers);

  if (!response.ok) {
    const errBody = (await response
      .json()
      .catch(() => ({ error: response.statusText }))) as EsiError;
    throw new Error(`ESI POST ${path} failed (${response.status}): ${errBody.error}`);
  }

  return response.json() as Promise<TResponse>;
}
