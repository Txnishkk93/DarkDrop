import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { getYtDlpWrap } from '@/lib/server/ytDlp';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
      // Primary method: yt-dlp
      const ytDlp = await getYtDlpWrap();
      const stdout = await ytDlp.execPromise(['-j', '--no-playlist', '--no-warnings', url]);
      const info = JSON.parse(stdout);

      // Extract formats and deduplicate by resolution
      const formatMap = new Map();
      const rawFormats = info.formats || [];

      for (const f of rawFormats) {
        if (f.vcodec !== 'none' && f.acodec !== 'none') {
          let height = f.height;
          if (!height && typeof f.format_note === 'string' && f.format_note.includes('p')) {
            const parsed = parseInt(f.format_note);
            if (!isNaN(parsed)) height = parsed;
          }

          const resolutionLabel = height ? `${height}p` : f.format_note || f.resolution || 'unknown';
          const filesize = f.filesize || f.filesize_approx || 0;

          const existing = formatMap.get(resolutionLabel);
          if (!existing || filesize > (existing.filesize || 0)) {
            formatMap.set(resolutionLabel, {
              format_id: f.format_id,
              ext: f.ext || 'mp4',
              quality: resolutionLabel,
              filesize,
            });
          }
        }
      }

      // Convert map to array and sort by height descending if possible
      const formats = Array.from(formatMap.values()).sort((a, b) => {
        const aHeight = parseInt(a.quality) || 0;
        const bHeight = parseInt(b.quality) || 0;
        return bHeight - aHeight; // Descending
      });

      return NextResponse.json({
        title: info.title || 'Unknown',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        platform: info.extractor_key || 'Unknown',
        formats,
      });

    } catch (ytError) {
      console.warn('yt-dlp failed, falling back to ytdl-core', ytError);
      
      // Fallback: ytdl-core (for YouTube only)
      if (ytdl.validateURL(url)) {
        const info = await ytdl.getInfo(url);
        
        const formats = info.formats
          .filter(f => f.hasVideo && f.hasAudio)
          .map(f => ({
            format_id: f.itag.toString(),
            ext: f.container || 'mp4',
            quality: f.qualityLabel || 'unknown',
            filesize: parseInt(f.contentLength || '0'),
          }))
          .slice(-10);

        return NextResponse.json({
          title: info.videoDetails.title,
          thumbnail: info.videoDetails.thumbnails[0]?.url || '',
          duration: parseInt(info.videoDetails.lengthSeconds),
          platform: 'YouTube',
          formats,
        });
      }
      
      throw ytError; // Rethrow if not a valid YT URL or fallback fails
    }
  } catch (error: any) {
    console.error('Info error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
