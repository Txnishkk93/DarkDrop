import express, { Request, Response } from 'express';
import cors from 'cors';
import ytdl from '@distube/ytdl-core';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);
const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

// Ensure download folder exists
async function initDownloadFolder() {
  try {
    await fs.mkdir(DOWNLOAD_FOLDER, { recursive: true });
  } catch (error) {
    console.error('Error creating download folder:', error);
  }
}

// Cleanup old files (older than 1 hour)
async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(DOWNLOAD_FOLDER);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(DOWNLOAD_FOLDER, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > 3600000) { // 1 hour
        await fs.unlink(filePath);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Get media info
app.post('/api/info', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Check if YouTube URL
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

      const audioFormats = info.formats
        .filter(f => f.hasAudio && !f.hasVideo)
        .map(f => ({
          format_id: f.itag.toString(),
          ext: f.container || 'mp4',
          quality: f.audioBitrate ? `${f.audioBitrate}kbps` : 'unknown',
          filesize: parseInt(f.contentLength || '0'),
        }))
        .slice(-5);

      res.json({
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[0]?.url || '',
        duration: parseInt(info.videoDetails.lengthSeconds),
        platform: 'YouTube',
        formats,
        audio_formats: audioFormats,
      });
      return;
    }

    // For other platforms, use yt-dlp
    const command = `yt-dlp -j "${url}"`;
    const { stdout } = await execAsync(command);
    const info = JSON.parse(stdout);

    const formats = (info.formats || [])
      .filter((f: any) => f.vcodec !== 'none')
      .map((f: any) => ({
        format_id: f.format_id,
        ext: f.ext || 'mp4',
        quality: f.format_note || f.quality || 'unknown',
        filesize: f.filesize || 0,
      }))
      .slice(-10);

    const audioFormats = (info.formats || [])
      .filter((f: any) => f.acodec !== 'none' && f.vcodec === 'none')
      .map((f: any) => ({
        format_id: f.format_id,
        ext: f.ext || 'mp3',
        quality: f.format_note || 'unknown',
        filesize: f.filesize || 0,
      }))
      .slice(-5);

    res.json({
      title: info.title || 'Unknown',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      platform: info.extractor_key || 'Unknown',
      formats,
      audio_formats: audioFormats,
      // Spotify specific
      artist: info.artist || undefined,
      album: info.album || undefined,
      coverImage: info.thumbnail || undefined,
    });

  } catch (error: any) {
    console.error('Info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download media
app.post('/api/download', async (req: Request, res: Response): Promise<void> => {
  try {
    await cleanupOldFiles();

    const { url, format_id, type = 'video', audio_format = 'mp3' } = req.body;
    
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const fileId = uuidv4();
    const ext = type === 'audio' ? audio_format : 'mp4';
    const filename = `${fileId}.${ext}`;
    const filePath = path.join(DOWNLOAD_FOLDER, filename);

    // YouTube download
    if (ytdl.validateURL(url)) {
      if (type === 'audio') {
        // Download audio only
        const audioStream = ytdl(url, { 
          quality: 'highestaudio',
          filter: 'audioonly' 
        });

        const writeStream = fsSync.createWriteStream(filePath);
        audioStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        // Convert to desired format if needed
        if (audio_format !== 'mp4') {
          const outputPath = filePath.replace('.mp4', `.${audio_format}`);
          await execAsync(`ffmpeg -i "${filePath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`);
          await fs.unlink(filePath);
          res.json({ file_id: fileId, filename: path.basename(outputPath), path: outputPath });
          return;
        }
      } else {
        // Download video
        const format = format_id ? { quality: format_id } : { quality: 'highest' };
        const videoStream = ytdl(url, format);
        const writeStream = fsSync.createWriteStream(filePath);
        
        videoStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
      }

      res.json({ file_id: fileId, filename, path: filePath });
      return;
    }

    // Other platforms using yt-dlp
    let command: string;
    
    if (type === 'audio') {
      command = `yt-dlp -f bestaudio --extract-audio --audio-format ${audio_format} --audio-quality 192K -o "${filePath}" "${url}"`;
    } else {
      const formatStr = format_id ? `-f ${format_id}+bestaudio/best` : `-f best`;
      command = `yt-dlp ${formatStr} -o "${filePath}" "${url}"`;
    }

    await execAsync(command);

    res.json({ file_id: fileId, filename, path: filePath });

  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve downloaded file
app.get('/api/file/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;
    const filePath = path.join(DOWNLOAD_FOLDER, filename);

    await fs.access(filePath);
    res.download(filePath);

  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Health check
app.get('/api/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

// Initialize and start server
async function start() {
  await initDownloadFolder();
  
  app.listen(PORT, () => {
    console.log('🚀 DarkDrop Backend Server Starting...');
    console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
    console.log(`🌐 Server running on http://localhost:${PORT}`);
  });
}

start();