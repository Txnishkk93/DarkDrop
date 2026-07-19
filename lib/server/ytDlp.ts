import YTDlpWrap from 'yt-dlp-wrap';
import ffmpegStatic from 'ffmpeg-static';
import os from 'os';
import path from 'path';

let ytDlp: YTDlpWrap | null = null;

export function isVercelServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NEXT_RUNTIME);
}

export async function getYtDlpWrap(): Promise<YTDlpWrap> {
  if (ytDlp) return ytDlp;

  if (isVercelServerlessRuntime()) {
    throw new Error('yt-dlp binary execution is not supported in this Vercel serverless deployment. Use an external download backend.');
  }

  const isWin = os.platform() === 'win32';
  const binaryPath = path.join(os.tmpdir(), isWin ? 'yt-dlp.exe' : 'yt-dlp');
  
  try {
    // Check if we already have it
    ytDlp = new YTDlpWrap(binaryPath);
    await ytDlp.execPromise(['--version']);
  } catch {
    // If not, download the latest version
    await YTDlpWrap.downloadFromGithub(binaryPath);
    ytDlp = new YTDlpWrap(binaryPath);
  }

  return ytDlp;
}

export function getFfmpegPath(): string {
  return ffmpegStatic || 'ffmpeg';
}
