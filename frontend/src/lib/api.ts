import axios from "axios";

const API_BASE = "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 second timeout
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      throw new Error(error.response.data?.error || "Server error");
    } else if (error.request) {
      // Request made but no response
      throw new Error("No response from server. Check if backend is running.");
    } else {
      // Error in request setup
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

/**
 * Fetch media information from URL
 */
export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  if (!url || !url.trim()) {
    throw new Error("URL is required");
  }
  
  const response = await api.post("/media/info", { url: url.trim() });
  return response.data;
}

/**
 * Fetch Spotify track information
 */
export async function fetchSpotifyInfo(spotify_url: string): Promise<SpotifyInfo> {
  if (!spotify_url || !spotify_url.trim()) {
    throw new Error("Spotify URL is required");
  }
  
  const response = await api.post("/spotify/info", { spotify_url: spotify_url.trim() });
  return response.data;
}

/**
 * Start a download job
 */
export async function startDownload(
  url: string,
  format_id: string,
  type: "video" | "audio",
  audio_format?: string
): Promise<DownloadResponse> {
  if (!url || !format_id) {
    throw new Error("URL and format_id are required");
  }
  
  const response = await api.post("/media/download", {
    url: url.trim(),
    format_id,
    type,
    audio_format,
  });
  return response.data;
}

/**
 * Get download progress for a job
 */
export async function getProgress(job_id: string): Promise<ProgressResponse> {
  if (!job_id) {
    throw new Error("Job ID is required");
  }
  
  const response = await api.get(`/media/progress/${job_id}`);
  const data = response.data;
  
  // Convert relative file_url to absolute backend URL
  if (data.file_url && !data.file_url.startsWith('http')) {
    data.file_url = `${API_BASE.replace('/api', '')}${data.file_url}`;
  }
  
  return data;
}

/**
 * Check server health
 */
export async function checkHealth(): Promise<{ status: string; jobs: number }> {
  const response = await api.get("/health");
  return response.data;
}

/**
 * Check if URL is a Spotify URL
 */
export function isSpotifyUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes("spotify.com") || lowerUrl.includes("open.spotify");
}

/**
 * Validate if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Format seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format bytes to human-readable size
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Unknown";
  
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  
  return `${bytes} bytes`;
}

/**
 * Get the full download URL for a file
 */
export function getDownloadUrl(file_url: string): string {
  if (!file_url) return "";
  
  // If already absolute URL, return as-is
  if (file_url.startsWith('http')) {
    return file_url;
  }
  
  // Convert relative URL to absolute backend URL
  const baseUrl = API_BASE.replace('/api', '');
  return `${baseUrl}${file_url}`;
}
export async function pollProgress(
  job_id: string,
  onProgress: (progress: ProgressResponse) => void,
  pollInterval: number = 1000
): Promise<ProgressResponse> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const progress = await getProgress(job_id);
        onProgress(progress);

        if (progress.status === "completed") {
          clearInterval(interval);
          resolve(progress);
        } else if (progress.status === "error") {
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