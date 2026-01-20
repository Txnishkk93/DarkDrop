import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const app = express();
app.use(cors({
    origin: "http://localhost:8080",
    credentials: true
}));
app.use(bodyParser.json());

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Job cleanup after 1 hour
const JOB_CLEANUP_TIME = 60 * 60 * 1000;

// In-memory progress store
interface Job {
    status: "pending" | "downloading" | "processing" | "completed" | "error";
    progress: number;
    file: string | null;
    error?: string;
    createdAt: number;
}

interface Jobs {
    [key: string]: Job;
}

const jobs: Jobs = {};

interface Format {
    format_id: string;
    quality: string;
    ext: string;
    filesize: number;
    has_audio: boolean;
    has_video: boolean;
    resolution?: string;
}

// Cleanup old jobs periodically
// Cleanup old jobs periodically
setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach((jobId) => {
        const job = jobs[jobId];
        if (!job) return;

        if (now - job.createdAt > JOB_CLEANUP_TIME) {
            if (job.file) {
                const filePath = path.join(DOWNLOAD_DIR, job.file);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            delete jobs[jobId];
        }
    });
}, 10 * 60 * 1000); // ✅ interval closed correctly



    // Run every 10 minutes

    // URL validation
    function isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    app.post("/api/media/info", async (req: Request, res: Response): Promise<any> => {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ success: false, error: "URL required" });
        }

        if (!isValidUrl(url)) {
            return res.status(400).json({ success: false, error: "Invalid URL format" });
        }

        const ytdlp = spawn("yt-dlp", [
            "--dump-json",
            "--no-playlist",
            "--no-warnings",
            url
        ]);

        let data = "";
        let errorData = "";
        let responseSent = false;

        ytdlp.stdout.on("data", (chunk) => data += chunk.toString());
        ytdlp.stderr.on("data", (chunk) => {
            const message = chunk.toString();
            // Only log non-warning errors
            if (!message.includes('WARNING:')) {
                errorData += message;
                console.error("yt-dlp error:", message);
            }
        });

        ytdlp.on("error", (err) => {
            if (!responseSent) {
                responseSent = true;
                console.error("yt-dlp process error:", err);
                res.status(500).json({
                    success: false,
                    error: "Failed to start media info extraction"
                });
            }
        });

        ytdlp.on("close", (code) => {
            if (responseSent) return;
            responseSent = true;

            if (code !== 0) {
                console.error("yt-dlp error output:", errorData);
                return res.status(500).json({
                    success: false,
                    error: errorData || "Failed to fetch media info"
                });
            }

            try {
                const json = JSON.parse(data);

                // Create quality-based video formats (with audio merged)
                const videoFormats: Format[] = [
                    {
                        format_id: "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
                        quality: "4K (2160p)",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "2160p"
                    },
                    {
                        format_id: "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
                        quality: "2K (1440p)",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "1440p"
                    },
                    {
                        format_id: "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
                        quality: "1080p",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "1080p"
                    },
                    {
                        format_id: "bestvideo[height<=720]+bestaudio/best[height<=720]",
                        quality: "720p",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "720p"
                    },
                    {
                        format_id: "bestvideo[height<=480]+bestaudio/best[height<=480]",
                        quality: "480p",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "480p"
                    },
                    {
                        format_id: "bestvideo[height<=360]+bestaudio/best[height<=360]",
                        quality: "360p",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "360p"
                    },
                    {
                        format_id: "bestvideo[height<=240]+bestaudio/best[height<=240]",
                        quality: "240p",
                        ext: "mp4",
                        filesize: 0,
                        has_audio: true,
                        has_video: true,
                        resolution: "240p"
                    }
                ];

                // Audio formats for music downloads
                const audioFormats: Format[] = [
                    {
                        format_id: "bestaudio",
                        quality: "Best Audio",
                        ext: "m4a",
                        filesize: 0,
                        has_audio: true,
                        has_video: false,
                        resolution: "audio"
                    }
                ];

                // Detect available qualities from actual formats
                const availableHeights = new Set<number>();
                (json.formats || []).forEach((f: any) => {
                    if (f.height && f.vcodec !== 'none') {
                        availableHeights.add(f.height);
                    }
                });

                // Filter video formats to only include available qualities
                const filteredVideoFormats = videoFormats.filter(format => {
                    const height = parseInt(format.resolution || "0");
                    // Include if exact match or if any quality >= this height exists
                    return Array.from(availableHeights).some(h => h >= height);
                });

                res.json({
                    success: true,
                    platform: json.extractor,
                    title: json.title,
                    thumbnail: json.thumbnail,
                    duration: json.duration,
                    formats: filteredVideoFormats.length > 0 ? filteredVideoFormats : videoFormats,
                    audio_formats: audioFormats
                });

            } catch (err) {
                console.error("JSON parse error:", err);
                res.status(500).json({
                    success: false,
                    error: "Failed to parse media info"
                });
            }
        });
    });

    app.post("/api/media/download", (req: Request, res: Response): any => {
        const { url, format_id, type, audio_format } = req.body;

        if (!url || !format_id) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        if (!isValidUrl(url)) {
            return res.status(400).json({ success: false, error: "Invalid URL format" });
        }

        if (type && !["video", "audio"].includes(type)) {
            return res.status(400).json({ success: false, error: "Type must be 'video' or 'audio'" });
        }

        const jobId = uuid();
        const outputTemplate = path.join(DOWNLOAD_DIR, `${jobId}.%(ext)s`);

        jobs[jobId] = {
            status: "downloading",
            progress: 0,
            file: null,
            createdAt: Date.now()
        };

        let args: string[];

        if (type === "audio") {
            // Audio-only download with conversion
            // If user selected "bestaudio", extract it; otherwise use the format directly
            const audioFormatArg = audio_format || "mp3";

            args = [
                "-f", format_id,  // Use the selected format (bestaudio, etc.)
                "-x",              // Extract audio
                "--audio-format", audioFormatArg,  // Convert to specified format
                "--audio-quality", "0",  // Best quality
                "-o", outputTemplate,
                "--newline",
                "--no-warnings",
                url
            ];
        } else {
            // Video download with audio
            // For YouTube SABR: merge video+audio or use pre-merged format
            let formatString: string;

            if (format_id === "best" || format_id.includes("+")) {
                // Already a smart format selector
                formatString = format_id;
            } else if (format_id.match(/^\d+$/)) {
                // Numeric format ID - try to merge with best audio
                formatString = `${format_id}+bestaudio/best`;
            } else {
                // Other format selector
                formatString = `${format_id}+bestaudio/best`;
            }

            args = [
                "-f", formatString,
                "--merge-output-format", "mp4",  // Ensure merged output is mp4
                "-o", outputTemplate,
                "--newline",
                "--no-warnings",
                url
            ];
        }

        const ytdlp = spawn("yt-dlp", args);

        ytdlp.stdout.on("data", (data) => {
            const line = data.toString();
            const match = line.match(/(\d+\.\d+)%/);
            if (match && jobs[jobId]) {
                jobs[jobId].progress = parseFloat(match[1]);
            }
        });

        ytdlp.stderr.on("data", (data) => {
            const message = data.toString();
            // Only log non-warning errors
            if (!message.includes('WARNING:')) {
                console.error("yt-dlp stderr:", message);
            }
        });

        ytdlp.on("error", (err) => {
            console.error("yt-dlp process error:", err);
            if (jobs[jobId]) {
                jobs[jobId].status = "error";
                jobs[jobId].error = "Download process failed";
            }
        });

        ytdlp.on("close", (code) => {
            if (!jobs[jobId]) return;

            if (code !== 0) {
                jobs[jobId].status = "error";
                jobs[jobId].error = "Download failed";
                return;
            }

            // Add delay to ensure file is written
            setTimeout(() => {
                try {
                    const files = fs.readdirSync(DOWNLOAD_DIR);
                    const file = files.find((f) => f.startsWith(jobId));

                    if (jobs[jobId]) {
                        jobs[jobId].status = "completed";
                        jobs[jobId].progress = 100;
                        jobs[jobId].file = file || null;

                        if (!file) {
                            jobs[jobId].status = "error";
                            jobs[jobId].error = "File not found after download";
                        }
                    }
                } catch (err) {
                    console.error("Error finding downloaded file:", err);
                    if (jobs[jobId]) {
                        jobs[jobId].status = "error";
                        jobs[jobId].error = "Failed to locate downloaded file";
                    }
                }
            }, 1000);
        });

        res.json({ success: true, job_id: jobId });
    });

    app.get("/api/media/progress/:jobId", (req: Request, res: Response): any => {
        const { jobId } = req.params as { jobId: string };
        const job = jobs[jobId];



        if (!job) {
            return res.status(404).json({ success: false, error: "Job not found" });
        }

        if (job.status === "completed") {
            // Return absolute URL for easier frontend handling
            const fileUrl = `http://localhost:3000/downloads/${job.file}`;
            return res.json({
                success: true,
                status: "completed",
                progress: 100,
                file_url: fileUrl
            });
        }

        if (job.status === "error") {
            return res.json({
                success: false,
                status: "error",
                progress: job.progress,
                error: job.error || "Unknown error"
            });
        }

        res.json({
            success: true,
            status: job.status,
            progress: job.progress
        });
    });

    app.use("/downloads", express.static(DOWNLOAD_DIR));

    app.post("/api/spotify/info", (req: Request, res: Response) => {
        const { spotify_url } = req.body;

        if (!spotify_url) {
            return res.status(400).json({ success: false, error: "Spotify URL required" });
        }

        // Real implementation needs Spotify API
        res.json({
            success: true,
            title: "Sample Song",
            artist: "Sample Artist",
            album: "Sample Album",
            cover: "https://i.scdn.co/image/sample"
        });
    });

    // Health check endpoint
    app.get("/api/health", (req: Request, res: Response) => {
        res.json({ status: "ok", jobs: Object.keys(jobs).length });
    });

    app.listen(3000, () => {
        console.log("Server running on http://localhost:3000");
    });