import ytdl from '@distube/ytdl-core';
import { getYouTubeRestrictionMessage, isYouTubeExtractionDisabled } from '@/lib/server/extractionPolicy';

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

export class ExtractorError extends Error {
  code: string;
  status: number;
  details?: unknown;
  cause?: unknown;

  constructor(message: string, options: { code: string; status?: number; details?: unknown; cause?: unknown } = { code: 'extraction_failed' }) {
    super(message);
    this.name = 'ExtractorError';
    this.code = options.code;
    this.status = options.status ?? 500;
    this.details = options.details;
    this.cause = options.cause;
  }
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

function buildRequestHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.youtube.com/',
    Origin: 'https://www.youtube.com',
  };
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

function classifyExtractionError(error: unknown, fallbackMessage: string): { code: string; status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error || fallbackMessage);
  const lower = message.toLowerCase();

  if (lower.includes('sign in to confirm') || lower.includes('bot') || lower.includes('robot')) {
    return {
      code: 'bot_blocked',
      status: 429,
      message: 'YouTube blocked this request from the current hosting environment. Try again later or use a different backend.',
    };
  }

  if (lower.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      code: 'upstream_rate_limited',
      status: 429,
      message: 'YouTube is rate-limiting requests from this environment.',
    };
  }

  if (lower.includes('404') || lower.includes('not found') || lower.includes('unavailable')) {
    return {
      code: 'content_unavailable',
      status: 404,
      message: 'The requested content could not be found or is unavailable.',
    };
  }

  if (lower.includes('timed out') || lower.includes('econnreset') || lower.includes('socket hang up')) {
    return {
      code: 'timeout',
      status: 504,
      message: 'The upstream request timed out.',
    };
  }

  return {
    code: 'extraction_failed',
    status: 500,
    message: fallbackMessage,
  };
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

  try {
    const info = await ytdl.getInfo(trimmedUrl, {
      requestOptions: {
        headers: buildRequestHeaders(),
      },
    });

    return {
      title: info.videoDetails?.title || 'Unknown',
      thumbnail: info.videoDetails?.thumbnails?.[0]?.url || '',
      duration: Number(info.videoDetails?.lengthSeconds || 0),
      platform: 'YouTube',
      formats: normalizeFormats(info),
    };
  } catch (error) {
    const fallbackMessage = error instanceof Error ? error.message : 'Media info extraction failed.';
    const classification = classifyExtractionError(error, fallbackMessage);
    throw new ExtractorError(classification.message, {
      code: classification.code,
      status: classification.status,
      cause: error,
    });
  }
}
