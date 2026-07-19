import { NextResponse } from 'next/server';
import { extractMediaInfo, ExtractorError } from '@/lib/server/youtubeExtractor';
import { callMediaBackend, hasExternalMediaBackend } from '@/lib/server/mediaBackend';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url } = body as { url?: string };

    console.info('[info-route] request', {
      route: 'info',
      runtime: process.env.NEXT_RUNTIME || 'node',
      url: typeof url === 'string' ? url : undefined,
    });

    try {
      if (hasExternalMediaBackend()) {
        const backendInfo = await callMediaBackend<{
          ok: boolean;
          title?: string;
          thumbnail?: string;
          duration?: number;
          platform?: string;
          formats?: Array<{ format_id: string; ext: string; quality: string; filesize?: number }>;
          error?: string;
          code?: string;
          details?: unknown;
        }>(
          '/api/info',
          { url: url ?? '' },
        );

        if (!backendInfo?.ok) {
          throw new ExtractorError(backendInfo?.error || 'External backend returned an error.', { code: backendInfo?.code || 'backend_error', status: 502, details: backendInfo?.details });
        }

        return NextResponse.json({
          ok: true,
          title: backendInfo.title || 'Unknown',
          thumbnail: backendInfo.thumbnail || '',
          duration: backendInfo.duration || 0,
          platform: backendInfo.platform || 'Unknown',
          formats: backendInfo.formats || [],
        });
      }
    } catch (backendError) {
      console.warn('[info-route] external backend failed, falling back to local extractor', {
        route: 'info',
        runtime: process.env.NEXT_RUNTIME || 'node',
        error: backendError instanceof Error ? backendError.message : backendError,
      });
    }

    const info = await extractMediaInfo(url ?? '');

    return NextResponse.json({
      ok: true,
      ...info,
    });
  } catch (error) {
    const extractorError = error instanceof ExtractorError ? error : undefined;
    const status = extractorError?.status ?? 500;
    const message = extractorError?.message || 'Media info extraction failed.';
    const details = extractorError?.details;

    console.error('[info-route] failed', {
      route: 'info',
      runtime: process.env.NEXT_RUNTIME || 'node',
      code: extractorError?.code || 'unknown_error',
      status,
      message,
      details,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json({
      ok: false,
      error: message,
      code: extractorError?.code || 'unknown_error',
      details: details ?? null,
    }, { status });
  }
}
