import { ExtractorError } from "@/lib/server/errors";
import {
  assertOutsideRateLimitCooldown,
  getRequestTimeoutMs,
  startRateLimitCooldown,
} from "@/lib/server/reliability";

export interface BackendInfoPayload {
  url: string;
}

export interface BackendDownloadPayload {
  url: string;
  format_id?: string;
}

function getBackendBaseUrl(): URL | undefined {
  const raw = process.env.MEDIA_BACKEND_URL || process.env.EXTERNAL_MEDIA_BACKEND_URL;
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExtractorError("The configured media backend URL is invalid.", {
      code: "invalid_backend_configuration",
      status: 500,
    });
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !local) ||
    url.search ||
    url.hash
  ) {
    throw new ExtractorError("Configure the media backend with an HTTPS URL (HTTP is allowed only for localhost).", {
      code: "invalid_backend_configuration",
      status: 500,
    });
  }
  return url;
}

function getBackendUrl(pathname: string): string | undefined {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return undefined;
  return new URL(pathname.replace(/^\//, ""), `${baseUrl.toString().replace(/\/$/, "")}/`).toString();
}

function classifyBackendFailure(status: number, retryAfter?: string | null): ExtractorError {
  const retrySeconds = retryAfter ? Number(retryAfter) : NaN;
  const retryDate = retryAfter ? Date.parse(retryAfter) : NaN;
  const retryAfterMs = Number.isFinite(retrySeconds)
    ? Math.min(Math.max(retrySeconds, 0) * 1000, 5 * 60 * 1000)
    : Number.isFinite(retryDate)
      ? Math.min(Math.max(retryDate - Date.now(), 0), 5 * 60 * 1000)
      : undefined;
  if (status === 429) {
    return new ExtractorError("The media backend is rate-limiting requests. Please wait before trying again.", {
      code: "upstream_rate_limited",
      status: 429,
      retryable: true,
      retryAfterMs,
    });
  }
  if (status === 403) {
    return new ExtractorError("The media backend denied this request.", {
      code: "access_denied",
      status: 403,
    });
  }
  if (status >= 500) {
    return new ExtractorError("The media backend is temporarily unavailable. Please try again later.", {
      code: "backend_unavailable",
      status: 502,
      retryable: true,
      retryAfterMs,
    });
  }
  return new ExtractorError("The media backend could not complete the request.", {
    code: "backend_error",
    status: status >= 400 ? status : 502,
  });
}

async function fetchBackend(
  pathname: string,
  init: RequestInit,
  timeoutMs = getRequestTimeoutMs(),
  requestSignal?: AbortSignal,
): Promise<Response> {
  const backendUrl = getBackendUrl(pathname);
  if (!backendUrl) {
    throw new ExtractorError("No external media backend is configured.", {
      code: "backend_not_configured",
      status: 503,
    });
  }

  assertOutsideRateLimitCooldown(backendUrl);
  try {
    const response = await fetch(backendUrl, {
      ...init,
      redirect: "error",
      signal: requestSignal
        ? AbortSignal.any([requestSignal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw classifyBackendFailure(response.status, response.headers.get("retry-after"));
    return response;
  } catch (error) {
    if (requestSignal?.aborted) throw error;
    if (error instanceof ExtractorError) {
      if (error.status === 429) startRateLimitCooldown(backendUrl, error.retryAfterMs);
      throw error;
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ExtractorError("The media backend request timed out. Please try again.", {
        code: "timeout",
        status: 504,
        retryable: true,
      });
    }
    throw new ExtractorError("The media backend could not be reached. Please try again later.", {
      code: "backend_unavailable",
      status: 502,
      retryable: true,
    });
  }
}

export async function callMediaBackend<T>(
  pathname: string,
  payload?: BackendInfoPayload | BackendDownloadPayload,
  method: "GET" | "POST" = "POST",
  requestSignal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    ...(payload ? {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    } : {}),
  };
  const attempts = method === "POST" && pathname === "/api/info" ? 2 : 1;
  let response: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetchBackend(pathname, init, getRequestTimeoutMs(), requestSignal);
      break;
    } catch (error) {
      if (!(error instanceof ExtractorError) || !error.retryable || error.status === 429 || attempt === attempts - 1) {
        throw error;
      }
      const delay = Math.min(error.retryAfterMs ?? (500 * 2 ** attempt + Math.random() * 300), 3000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  if (!response) {
    throw new ExtractorError("The media backend could not be reached. Please try again later.", {
      code: "backend_unavailable",
      status: 502,
      retryable: true,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ExtractorError("The media backend returned an invalid response.", {
      code: "invalid_backend_response",
      status: 502,
    });
  }
}

export async function fetchBackendFile(jobId: string, requestSignal?: AbortSignal): Promise<Response> {
  return fetchBackend(`/api/media/file/${encodeURIComponent(jobId)}`, { method: "GET" }, 2 * 60 * 1000, requestSignal);
}

export function hasExternalMediaBackend(): boolean {
  return Boolean(process.env.MEDIA_BACKEND_URL || process.env.EXTERNAL_MEDIA_BACKEND_URL);
}
