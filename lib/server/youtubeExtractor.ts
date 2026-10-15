import ytdl from '@distube/ytdl-core';
import { getYouTubeRestrictionMessage, isYouTubeExtractionDisabled } from '@/lib/server/extractionPolicy';
import { ExtractorError } from '@/lib/server/errors';
import { getRequestTimeoutMs } from '@/lib/server/reliability';

export { ExtractorError } from '@/lib/server/errors';

export interface ExtractedMediaInfo {
  title: string;
  thumbnail: string;
  duration: number;
  platform: string;
  formats: Array<{
    format_id: string;
    ext: string;
    quality: string;
    filesize?: number;
  }>;
}

function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
    return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname);
  } catch {
    return false;
  }
}

function normalizeFormats(info: Awaited<ReturnType<typeof ytdl.getInfo>>): ExtractedMediaInfo['formats'] {
  const formatMap = new Map<string, ExtractedMediaInfo['formats'][number]>();
  const rawFormats = info.formats || [];

  for (const format of rawFormats) {
    if (format.hasVideo && format.hasAudio) {
      let height = format.height;
      const formatNote = (format as { format_note?: string }).format_note;
      if (!height && typeof formatNote === 'string' && formatNote.includes('p')) {
        const parsed = Number.parseInt(formatNote, 10);
        if (!Number.isNaN(parsed)) {
          height = parsed;
        }
      }

      const resolutionLabel = height ? `${height}p` : formatNote || (format as { resolution?: string }).resolution || 'unknown';
      const filesize = (format as { filesize?: number; filesize_approx?: number }).filesize || (format as { filesize?: number; filesize_approx?: number }).filesize_approx || 0;
      const existing = formatMap.get(resolutionLabel);

      if (!existing || filesize > (existing.filesize || 0)) {
        formatMap.set(resolutionLabel, {
          format_id: (format as { format_id?: string }).format_id || 'unknown',
          ext: (format as { ext?: string }).ext || 'mp4',
          quality: resolutionLabel,
          filesize,
        });
      }
    }
  }

  return Array.from(formatMap.values()).sort((a, b) => {
    const aHeight = Number.parseInt(a.quality, 10) || 0;
    const bHeight = Number.parseInt(b.quality, 10) || 0;
    return bHeight - aHeight;
  });
}

function getProperty(obj: unknown, key: string): unknown {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const res = getProperty(error, 'response');
  const headers = (getProperty(error, 'headers') ?? (res ? getProperty(res, 'headers') : undefined)) as any;
  const raw = headers && (typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after']);
  if (typeof raw !== 'string') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5 * 60 * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(date - Date.now(), 0), 5 * 60 * 1000);
}

function classifyExtractionError(error: unknown): ExtractorError {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  const res = getProperty(error, 'response');
  const status = error && typeof error === 'object'
    ? Number(getProperty(error, 'statusCode') ?? getProperty(error, 'status') ?? (res ? getProperty(res, 'status') : undefined)) || 0
    : 0;
  const code = error && typeof error === 'object' ? String(getProperty(error, 'code') ?? '') : '';
  const retryAfter = getRetryAfterMs(error);

  if (status === 429 || lower.includes('too many requests') || lower.includes('rate limit')) {
    return new ExtractorError('The source is rate-limiting requests. Please wait before trying again.', {
      code: 'upstream_rate_limited',
      status: 429,
      retryable: true,
      retryAfterMs: retryAfter,
    });
  }
  if (status === 403 || lower.includes('sign in to confirm') || lower.includes('request was blocked')) {
    return new ExtractorError('The source denied this request. It may be restricted or inaccessible from this service.', {
      code: 'access_denied',
      status: 403,
    });
  }
  if (lower.includes('age restricted') || lower.includes('sign in to view')) {
    return new ExtractorError('This video is age-restricted or requires account verification.', {
      code: 'access_denied',
      status: 403,
    });
  }
  if (
    status === 404 ||
    lower.includes('video unavailable') ||
    lower.includes('private video') ||
    lower.includes('not found') ||
    lower.includes('failed to find any playable formats') ||
    lower.includes('no playable format')
  ) {
    return new ExtractorError('This media is unavailable or cannot be accessed.', {
      code: 'content_unavailable',
      status: 404,
    });
  }
  if (status >= 500 && status <= 599) {
    return new ExtractorError('The source is temporarily unavailable. Please try again later.', {
      code: 'upstream_failure',
      status: 502,
      retryable: true,
    });
  }
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    lower.includes('socket hang up')
  ) {
    return new ExtractorError('The source request timed out or could not connect. Please try again.', {
      code: 'network_error',
      status: 504,
      retryable: true,
    });
  }
  return new ExtractorError('Media information could not be retrieved. Confirm the URL is public and try again.', {
    code: 'extraction_failed',
    status: 502,
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractMediaInfo(url: string): Promise<ExtractedMediaInfo> {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    throw new ExtractorError('URL is required.', { code: 'invalid_url', status: 400 });
  }

  if (!isValidHttpUrl(trimmedUrl)) {
    throw new ExtractorError('Please provide a valid http(s) URL.', { code: 'invalid_url', status: 400 });
  }

  if (!isYouTubeUrl(trimmedUrl)) {
    throw new ExtractorError('Only YouTube URLs are supported by this deployment.', { code: 'unsupported_host', status: 400 });
  }

  if (isYouTubeExtractionDisabled()) {
    throw new ExtractorError(getYouTubeRestrictionMessage(), { code: 'youtube_extraction_disabled', status: 403 });
  }

  let lastError: ExtractorError | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const info = await ytdl.getInfo(trimmedUrl, {
        requestOptions: { timeout: getRequestTimeoutMs() },
      });

      return {
        title: info.videoDetails?.title || 'Unknown',
        thumbnail: info.videoDetails?.thumbnails?.[0]?.url || '',
        duration: Number(info.videoDetails?.lengthSeconds || 0),
        platform: 'YouTube',
        formats: normalizeFormats(info),
      };
    } catch (error) {
      lastError = classifyExtractionError(error);
      if (!lastError.retryable || lastError.status === 429 || attempt === 1) throw lastError;
      const delay = Math.min(500 * 2 ** attempt + Math.random() * 300, 3000);
      await wait(delay);
    }
  }

  throw lastError ?? new ExtractorError('Media information could not be retrieved.', {
    code: 'extraction_failed',
    status: 502,
  });
}
