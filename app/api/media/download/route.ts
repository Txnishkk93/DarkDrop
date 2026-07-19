import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '@/lib/server/jobStore';
import { getYtDlpWrap, isVercelServerlessRuntime } from '@/lib/server/ytDlp';
import { DOWNLOAD_DIR } from '@/lib/server/downloadDir';
import { callMediaBackend, hasExternalMediaBackend } from '@/lib/server/mediaBackend';

export const maxDuration = 120; // Allow longer execution on Vercel

// Ensure the download directory exists
async function ensureDir() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch(() => {});
}

async function runDownloadAttempt(
  ytDlpWrap: Awaited<ReturnType<typeof getYtDlpWrap>>,
  jobId: string,
  args: string[],
) {
  const process = ytDlpWrap.exec(args);

  return await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (!settled) {
        settled = true;
        callback();
      }
    };

    process.on('progress', (progress: any) => {
      if (typeof progress?.percent === 'number') {
        jobStore.updateJob(jobId, { progress: progress.percent });
      }
    });

    process.on('error', (error: Error) => {
      finish(() => reject(error));
    });

    process.on('close', (code: number | null) => {
      if (code === 0) {
        finish(() => resolve());
      } else {
        finish(() => reject(new Error(`Download failed with exit code ${code ?? 'unknown'}`)));
      }
    });
  });
}

async function processDownload(jobId: string, url: string, formatId: string) {
  try {
    await ensureDir();
    const ytDlpWrap = await getYtDlpWrap();

    const ext = 'mp4';
    const filename = `${jobId}.${ext}`;
    const filePath = path.join(DOWNLOAD_DIR, filename);
    const formatStr = formatId ? `${formatId}+bestaudio/best` : 'best';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const strategies = [
      {
        label: 'web',
        args: [
          '-f',
          formatStr,
          '--merge-output-format',
          'mp4',
          '--user-agent',
          userAgent,
          '--extractor-args',
          'youtube:player_client=web,web_embedded',
          '--add-header',
          'Referer: https://www.youtube.com/',
          '--add-header',
          'Origin: https://www.youtube.com',
          '--add-header',
          'Accept-Language: en-US,en;q=0.9',
          '--no-warnings',
          '-o',
          filePath,
          url,
        ],
      },
      {
        label: 'android',
        args: [
          '-f',
          formatStr,
          '--merge-output-format',
          'mp4',
          '--user-agent',
          userAgent,
          '--extractor-args',
          'youtube:player_client=android',
          '--add-header',
          'Referer: https://www.youtube.com/',
          '--add-header',
          'Origin: https://www.youtube.com',
          '--add-header',
          'Accept-Language: en-US,en;q=0.9',
          '--no-warnings',
          '-o',
          filePath,
          url,
        ],
      },
      {
        label: 'ios',
        args: [
          '-f',
          formatStr,
          '--merge-output-format',
          'mp4',
          '--user-agent',
          userAgent,
          '--extractor-args',
          'youtube:player_client=ios',
          '--add-header',
          'Referer: https://www.youtube.com/',
          '--add-header',
          'Origin: https://www.youtube.com',
          '--add-header',
          'Accept-Language: en-US,en;q=0.9',
          '--no-warnings',
          '-o',
          filePath,
          url,
        ],
      },
    ];

    jobStore.updateJob(jobId, { status: 'processing', progress: 0 });

    let lastError: Error | undefined;

    for (const strategy of strategies) {
      try {
        await fs.rm(filePath, { force: true }).catch(() => {});
        await runDownloadAttempt(ytDlpWrap, jobId, strategy.args);

        jobStore.updateJob(jobId, {
          status: 'completed',
          file: filename,
          file_url: `/api/media/file/${jobId}`,
          progress: 100,
        });
        return;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (strategy.label !== 'ios') {
          jobStore.updateJob(jobId, {
            status: 'processing',
            progress: 0,
            error: `${strategy.label} attempt failed: ${lastError.message}`,
          });
        } else {
          jobStore.updateJob(jobId, { status: 'error', error: lastError.message });
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Download failed');
  } catch (error: any) {
    const message = error?.message || 'Download failed';
    jobStore.updateJob(jobId, { status: 'error', error: message });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, format_id } = body as { url?: string; format_id?: string };

    console.info('[download-route] request', {
      route: 'download',
      runtime: process.env.NEXT_RUNTIME || 'node',
      url: typeof url === 'string' ? url : undefined,
      format_id,
    });

    if (!url) {
      return NextResponse.json({ ok: false, error: 'URL is required', code: 'invalid_url' }, { status: 400 });
    }

    if (hasExternalMediaBackend()) {
      try {
        const backendResponse = await callMediaBackend<{ ok: boolean; success?: boolean; job_id?: string; error?: string; code?: string }>(
          '/api/media/download',
          { url, format_id },
        );

        if (!backendResponse?.ok && !backendResponse?.success) {
          throw new Error(backendResponse?.error || 'External backend rejected the download request.');
        }

        return NextResponse.json({
          success: true,
          job_id: backendResponse.job_id,
        });
      } catch (backendError) {
        console.warn('[download-route] external backend failed', {
          route: 'download',
          runtime: process.env.NEXT_RUNTIME || 'node',
          error: backendError instanceof Error ? backendError.message : backendError,
        });
        return NextResponse.json({
          ok: false,
          error: 'The configured media backend could not complete the request. Please try again later or reconfigure the backend.',
          code: 'backend_unavailable',
        }, { status: 502 });
      }
    }

    if (isVercelServerlessRuntime()) {
      return NextResponse.json({
        ok: false,
        error: 'Download execution is not supported from this Vercel serverless deployment. Configure an external downloader service.',
        code: 'unsupported_runtime',
      }, { status: 503 });
    }

    const jobId = uuidv4();
    jobStore.createJob(jobId);

    // Run the download process in the background
    // Vercel's waitUntil prevents the function from shutting down immediately
    waitUntil(processDownload(jobId, url, format_id ?? ''));

    return NextResponse.json({ success: true, job_id: jobId });
  } catch (error: any) {
    console.error('[download-route] failed', {
      route: 'download',
      runtime: process.env.NEXT_RUNTIME || 'node',
      error: error?.message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: error.message, code: 'download_failed' }, { status: 500 });
  }
}
