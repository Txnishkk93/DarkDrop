import axios from "axios";

const API_BASE = "";

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
}

export interface ProgressResponse {
  success?: boolean;
  status: string;
  progress: number;
  file_url?: string;
  error?: string;
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

export async function startDownload(
  url: string,
  format_id: string
): Promise<{ success: boolean; job_id?: string; error?: string }> {
  if (!url.trim()) throw new Error("URL is required");
  
  console.log('[api] Starting download:', { url, format_id });
  
  const response = await api.post("/api/media/download", {
    url: url.trim(),
    format_id
  });
  
  console.log('[api] Download response:', response.data);
  
  return response.data;
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await api.get("/api/health");
  return response.data;
}

export function getDownloadUrl(jobId: string): string {
  if (!jobId) return "";
  return `${API_BASE}/api/media/file/${jobId}`;
}

/* ================= HELPERS ================= */

export async function downloadFileToDisk(fileUrl: string): Promise<void> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const disposition = response.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || "download";
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
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