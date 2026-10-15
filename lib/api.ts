import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 180000,
});

export class ApiError extends Error {
  code: string;
  status?: number;
  retryable: boolean;

  constructor(message: string, options: { code?: string; status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code || "request_failed";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

function apiErrorFromPayload(payload: unknown, status?: number): ApiError {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return new ApiError(
    typeof data.error === "string" ? data.error : "The request could not be completed.",
    {
      code: typeof data.code === "string" ? data.code : "request_failed",
      status,
      retryable: data.retryable === true,
    },
  );
}

function normalizeApiError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data;
    if (error.response) return apiErrorFromPayload(payload, error.response.status);
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return new ApiError("The request timed out. Please try again.", {
        code: "timeout",
        retryable: true,
      });
    }
    return new ApiError("The server could not be reached. Check your connection and try again.", {
      code: "network_error",
      retryable: true,
    });
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Request failed");
}

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    throw normalizeApiError(error);
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
  code?: string;
  errorCode?: string;
  retryable?: boolean;
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
  if (!response.data?.ok) {
    throw apiErrorFromPayload(response.data);
  }

  return response.data as MediaInfo;
}

export async function startDownload(
  url: string,
  format_id: string
): Promise<{ success: boolean; job_id?: string; error?: string }> {
  if (!url.trim()) throw new Error("URL is required");
  
  const response = await api.post("/api/media/download", {
    url: url.trim(),
    format_id
  });
  if (!response.data?.success) throw apiErrorFromPayload(response.data);
  return response.data;
}

export async function getDownloadProgress(jobId: string): Promise<ProgressResponse> {
  const response = await api.get(`/api/media/progress/${encodeURIComponent(jobId)}`);
  return response.data as ProgressResponse;
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
    let failure: ApiError = new ApiError("The download file could not be retrieved. Start the download again.", {
      code: "file_download_failed",
      status: response.status,
      retryable: response.status >= 500,
    });
    try {
      failure = apiErrorFromPayload(await response.json(), response.status);
    } catch {
      throw failure;
    }
    throw failure;
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