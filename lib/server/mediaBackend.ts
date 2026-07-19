import { ExtractorError } from '@/lib/server/youtubeExtractor';

export interface MediaBackendResponse<T> {
  ok?: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

export interface BackendInfoPayload {
  url: string;
}

export interface BackendDownloadPayload {
  url: string;
  format_id?: string;
}

function getBackendBaseUrl(): string | undefined {
  return process.env.MEDIA_BACKEND_URL || process.env.EXTERNAL_MEDIA_BACKEND_URL;
}

function getBackendUrl(pathname: string): string | undefined {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/$/, '')}${pathname}`;
}

export async function callMediaBackend<T>(pathname: string, payload: BackendInfoPayload | BackendDownloadPayload): Promise<T> {
  const backendUrl = getBackendUrl(pathname);
  if (!backendUrl) {
    throw new ExtractorError('No external media backend is configured.', { code: 'backend_not_configured', status: 503 });
  }

  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data ? String(data.error) : 'External media backend request failed.';
    const code = typeof data === 'object' && data && 'code' in data ? String(data.code) : 'backend_error';
    throw new ExtractorError(message, { code, status: response.status, details: data });
  }

  return data as T;
}

export function hasExternalMediaBackend(): boolean {
  return Boolean(getBackendBaseUrl());
}
