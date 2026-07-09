import axios from "axios";

const API_BASE = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 180000,
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
}

export interface MediaInfo {
  title: string;
  thumbnail: string;
  duration: number;
  platform: string;
  formats: MediaFormat[];
  audio_formats?: MediaFormat[];
  // Spotify specific
  artist?: string;
  album?: string;
  coverImage?: string;
}

export interface DownloadResponse {
  file_id: string;
  filename: string;
  path: string;
}

/* ================= API FUNCTIONS ================= */

export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  if (!url.trim()) throw new Error("URL is required");

  const response = await api.post("/api/info", { url: url.trim() });
  return response.data;
}

export async function fetchSpotifyInfo(spotify_url: string): Promise<MediaInfo> {
  if (!spotify_url.trim()) throw new Error("Spotify URL is required");

  const response = await api.post("/api/info", { url: spotify_url.trim() });
  return response.data;
}

export async function startDownload(
  url: string,
  format_id: string,
  type: "video" | "audio",
  audio_format?: string
): Promise<DownloadResponse> {
  if (!url.trim()) throw new Error("URL is required");
  
  console.log('[api] Starting download:', { url, format_id, type, audio_format });
  
  const response = await api.post("/api/download", {
    url: url.trim(),
    format_id,
    type,
    audio_format: audio_format || "mp3"
  });
  
  console.log('[api] Download response:', response.data);
  
  return response.data;
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await api.get("/api/health");
  return response.data;
}

export function getDownloadUrl(filename: string): string {
  if (!filename) return "";
  return `${API_BASE}/api/file/${filename}`;
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