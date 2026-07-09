import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '@/lib/server/jobStore';
import { getYtDlpWrap } from '@/lib/server/ytDlp';
import { DOWNLOAD_DIR } from '@/lib/server/downloadDir';

export const maxDuration = 120; // Allow longer execution on Vercel

// Ensure the download directory exists
async function ensureDir() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch(() => {});
}

async function processDownload(jobId: string, url: string, formatId: string) {
  try {
    await ensureDir();
    const ytDlpWrap = await getYtDlpWrap();
    
    const ext = 'mp4';
    const filename = `${jobId}.${ext}`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    const formatStr = formatId ? `${formatId}+bestaudio/best` : 'best';
    const args = ['-f', formatStr, '--merge-output-format', 'mp4', '-o', filePath, url];

    jobStore.updateJob(jobId, { status: 'processing', progress: 0 });

    const process = ytDlpWrap.exec(args);

    process.on('progress', (progress: any) => {
      // yt-dlp-wrap emits progress with a percent property
      jobStore.updateJob(jobId, { progress: progress.percent });
    });

    process.on('error', (error: Error) => {
      jobStore.updateJob(jobId, { status: 'error', error: error.message });
    });

    process.on('close', () => {
      // Check if job wasn't already marked as error
      const currentJob = jobStore.getJob(jobId);
      if (currentJob?.status !== 'error') {
        jobStore.updateJob(jobId, {
          status: 'completed',
          file: filename,
          file_url: `/api/media/file/${jobId}`,
          progress: 100,
        });
      }
    });

    await process;
  } catch (error: any) {
    jobStore.updateJob(jobId, { status: 'error', error: error.message });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, format_id } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const jobId = uuidv4();
    jobStore.createJob(jobId);

    // Run the download process in the background
    // Vercel's waitUntil prevents the function from shutting down immediately
    waitUntil(processDownload(jobId, url, format_id));

    return NextResponse.json({ success: true, job_id: jobId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
