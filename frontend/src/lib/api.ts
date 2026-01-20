import axios from "axios";

const API_BASE = "https://darkdrop-10.onrender.com";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      throw new Error(error.response.data?.error || "Server error");
    } else if (error.request) {
      throw new Error("No response from server. Check backend status.");
    } else {
      throw new Error(error.message || "Request failed");
    }
  }
);

export interface MediaFormat {
  format_id: string;
  ext: string;
  quality: string;
  filesize?: number;
  format_note?: string;
  has_audio?: boolean;
  has_video?: boolean;
  resolution?: string;
}

export interface MediaInfo {
  success: boolean;
  title: string;
  thumbnail: string;
  duration: number;
  platform: string;
  formats: MediaFormat[];
  audio_formats?: MediaFormat[];
}

export interface SpotifyInfo {
  success: boolean;
  title: string;
  artist: string;
  album: string;
  cover: string;
}

export interface DownloadResponse {
  success: boolean;
  job_id: string;
  error?: string;
}

export interface ProgressResponse {
  success: boolean;
  status: "pending" | "downloading" | "processing" | "completed" | "error";
  progress: number;
  file_url?: string;
  error?: string;
}

/* ================= API FUNCTIONS ================= */

export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  if (!url.trim()) throw new Error("URL is required");

  const response = await api.post("/api/media/info", { url: url.trim() });
  return response.data;
}

export async function fetchSpotifyInfo(spotify_url: string): Promise<SpotifyInfo> {
  if (!spotify_url.trim()) throw new Error("Spotify URL is required");

  const response = await api.post("/api/spotify/info", { spotify_url: spotify_url.trim() });
  return response.data;
}

export async function startDownload(
  url: string,
  format_id: string,
  type: "video" | "audio",
  audio_format?: string
): Promise<DownloadResponse> {
  if (!url || !format_id) throw new Error("URL and format_id required");

  const response = await api.post("/api/media/download", {
    url: url.trim(),
    format_id,
    type,
    audio_format,
  });

  return response.data;
}

export async function getProgress(job_id: string): Promise<ProgressResponse> {
  if (!job_id) throw new Error("Job ID required");

  const response = await api.get(`/api/media/progress/${job_id}`);
  const data = response.data;

  // Convert relative file_url → absolute
  if (data.file_url && !data.file_url.startsWith("http")) {
    data.file_url = `${API_BASE}${data.file_url}`;
  }

  return data;
}

export async function checkHealth(): Promise<{ status: string; jobs: number }> {
  const response = await api.get("/api/health");
  return response.data;
}

/* ================= HELPERS ================= */

export function isSpotifyUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes("spotify.com") || lowerUrl.includes("open.spotify");
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Unknown";

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;

  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;

  return `${bytes} bytes`;
}

export function getDownloadUrl(file_url: string): string {
  if (!file_url) return "";
  if (file_url.startsWith("http")) return file_url;
  return `${API_BASE}${file_url}`;
}

/* ================= PROGRESS POLLER ================= */

export async function pollProgress(
  job_id: string,
  onProgress: (progress: ProgressResponse) => void,
  pollInterval = 1000
): Promise<ProgressResponse> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const progress = await getProgress(job_id);
        onProgress(progress);

        if (progress.status === "completed") {
          clearInterval(interval);
          resolve(progress);
        } 
        else if (progress.status === "error") {
          clearInterval(interval);
          reject(new Error(progress.error || "Download failed"));
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
      }
    }, pollInterval);
  });
}
