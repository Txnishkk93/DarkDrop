import YTDlpWrap from 'yt-dlp-wrap';
import ffmpegStatic from 'ffmpeg-static';
import os from 'os';
import path from 'path';

let ytDlp: YTDlpWrap | null = null;

export async function getYtDlpWrap(): Promise<YTDlpWrap> {
  if (ytDlp) return ytDlp;

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
