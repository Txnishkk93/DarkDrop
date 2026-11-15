import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { errorResponse, ExtractorError, toExtractorError } from "@/lib/server/errors";
import { DOWNLOAD_DIR } from "@/lib/server/downloadDir";
import { jobStore } from "@/lib/server/jobStore";
import { callMediaBackend, hasExternalMediaBackend } from "@/lib/server/mediaBackend";
import {
  assertOutsideRateLimitCooldown,
  getMaxConcurrentDownloads,
  getRequestTimeoutMs,
  normalizeAndValidateMediaUrl,
  startRateLimitCooldown,
} from "@/lib/server/reliability";
import { getYtDlpWrap, isVercelServerlessRuntime } from "@/lib/server/ytDlp";

export const maxDuration = 120;

function classifyDownloadError(error: unknown): ExtractorError {
  if (error instanceof ExtractorError) return error;
  const message = error instanceof Error ? error.message : "";
  const lower = message.toLowerCase();
  const status = error && typeof error === "object" ? Number(Reflect.get(error, "statusCode")) : 0;

  if (status === 429 || lower.includes("http error 429") || lower.includes("too many requests")) {
    return new ExtractorError("The source is rate-limiting downloads. Please wait before trying again.", {
      code: "upstream_rate_limited",
      status: 429,
      retryable: true,
    });
  }
  if (status === 403 || lower.includes("http error 403") || lower.includes("forbidden")) {
    return new ExtractorError("The source denied this download. It may be restricted or inaccessible from this service.", {
      code: "access_denied",
      status: 403,
    });
  }
  if (status === 404 || lower.includes("video unavailable") || lower.includes("private video") || lower.includes("not available")) {
    return new ExtractorError("This media is unavailable or cannot be accessed.", {
      code: "content_unavailable",
      status: 404,
    });
  }
  if (status >= 500 && status <= 599 || lower.includes("http error 5")) {
    return new ExtractorError("The source is temporarily unavailable. Please try again later.", {
      code: "upstream_failure",
      status: 502,
      retryable: true,
    });
  }
  if (
    error instanceof Error && error.name === "TimeoutError" ||
    /timed? ?out|timeout|econnreset|econnrefused|eai_again|socket hang up/i.test(lower)
  ) {
    return new ExtractorError("The download timed out or could not connect. Please try again.", {
      code: "network_error",
      status: 504,
      retryable: true,
    });
  }
  return new ExtractorError("The download could not be completed. Confirm the media is public and try again.", {
    code: "download_failed",
    status: 502,
  });
}

async function runDownloadAttempt(
  ytDlpWrap: Awaited<ReturnType<typeof getYtDlpWrap>>,
  jobId: string,
  args: string[],
) {
  const signal = AbortSignal.timeout(Math.max(getRequestTimeoutMs(), 2 * 60 * 1000));
  const process = ytDlpWrap.exec(args, undefined, signal);

  return await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (!settled) {
        settled = true;
        callback();
      }
    };

    process.on("progress", (progress) => {
      if (typeof progress?.percent === "number") {
        jobStore.updateJob(jobId, { progress: progress.percent });
      }
    });
    process.on("error", (error) => finish(() => reject(error)));
    process.on("close", (code) => {
      if (code === 0) finish(resolve);
      else if (signal.aborted) finish(() => reject(new Error("Download timed out.")));
      else finish(() => reject(new Error(`Downloader exited with code ${code ?? "unknown"}.`)));
    });
  });
}

async function processDownload(jobId: string, url: string, formatId: string) {
  let filePath: string | undefined;
  try {
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    const ytDlpWrap = await getYtDlpWrap();
    const filename = `${jobId}.mp4`;
    filePath = path.join(DOWNLOAD_DIR, filename);

    // The generic option selects the best video and audio streams; explicit formats stay unchanged.
    const args = [
      "--no-playlist",
      "--socket-timeout",
      String(Math.ceil(getRequestTimeoutMs() / 1000)),
      "--retries",
      "0",
      "--fragment-retries",
      "0",
      "-f",
      formatId === "best" ? "bestvideo+bestaudio/best" : formatId,
      "--merge-output-format",
      "mp4",
      "--no-warnings",
      "-o",
      filePath,
      url,
    ];

    jobStore.updateJob(jobId, { status: "processing", progress: 0 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await runDownloadAttempt(ytDlpWrap, jobId, args);
        const stats = await fs.stat(filePath);
        if (!stats.isFile() || stats.size === 0) {
          throw new ExtractorError("The downloader did not produce a usable media file.", {
            code: "download_failed",
            status: 502,
          });
        }
        jobStore.updateJob(jobId, {
          status: "completed",
          file: filename,
          file_url: `/api/media/file/${jobId}`,
          progress: 100,
        });
        return;
      } catch (error) {
        const classified = classifyDownloadError(error);
        if (classified.status === 429) startRateLimitCooldown(url);
        if (!classified.retryable || classified.status === 429 || attempt === 1) throw classified;

        await fs.rm(filePath, { force: true });
        const delay = Math.min(500 * 2 ** attempt + Math.random() * 300, 3000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    if (filePath) {
      await fs.rm(filePath, { force: true }).catch(() => {
        console.error("[download-route] failed download artifact cleanup failed");
      });
    }
    const classified = classifyDownloadError(error);
    jobStore.updateJob(jobId, {
      status: "error",
      error: classified.message,
      errorCode: classified.code,
      retryable: classified.retryable,
    });
  }
}

function responseForError(error: unknown) {
  const safeError = toExtractorError(error);
  const headers = safeError.retryAfterMs
    ? { "Retry-After": String(Math.ceil(safeError.retryAfterMs / 1000)) }
    : undefined;
  return NextResponse.json(errorResponse(safeError), { status: safeError.status, headers });
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ExtractorError("Request body must be valid JSON.", { code: "invalid_request", status: 400 });
    }

    const url = body && typeof body === "object" ? Reflect.get(body, "url") : undefined;
    const formatId = body && typeof body === "object" ? Reflect.get(body, "format_id") : undefined;
    if (typeof url !== "string" || !url.trim()) {
      throw new ExtractorError("A media URL is required.", { code: "invalid_url", status: 400 });
    }
    if (typeof formatId !== "string" || !/^[A-Za-z0-9_.+-]{1,100}$/.test(formatId)) {
      throw new ExtractorError("Select a valid media format.", { code: "invalid_format", status: 400 });
    }

    const normalizedUrl = await normalizeAndValidateMediaUrl(url);
    assertOutsideRateLimitCooldown(normalizedUrl);

    if (hasExternalMediaBackend()) {
      const backendResponse = await callMediaBackend<{
        ok?: boolean;
        success?: boolean;
        job_id?: string;
        code?: string;
      }>("/api/media/download", { url: normalizedUrl, format_id: formatId }, "POST", request.signal, request.url);

      if ((!backendResponse?.ok && !backendResponse?.success) ||
          typeof backendResponse.job_id !== "string" ||
          !backendResponse.job_id ||
          backendResponse.job_id.length > 200) {
        throw new ExtractorError("The media backend could not start this download.", {
          code: backendResponse?.code || "backend_error",
          status: 502,
        });
      }
      return NextResponse.json({ success: true, job_id: backendResponse.job_id });
    }

    if (isVercelServerlessRuntime()) {
      throw new ExtractorError(
        "Local downloads require a persistent Node.js worker. Configure an external media backend for serverless deployments.",
        { code: "unsupported_runtime", status: 503 },
      );
    }

    const requestKey = createHash("sha256").update(`${normalizedUrl}\n${formatId}`).digest("hex");
    const result = jobStore.createOrGetActiveJob(uuidv4(), requestKey, getMaxConcurrentDownloads());
    if (!result) {
      throw new ExtractorError("Download capacity is currently full. Please try again shortly.", {
        code: "service_busy",
        status: 503,
        retryable: true,
        retryAfterMs: 5000,
      });
    }

    if (!result.duplicate) {
      waitUntil(processDownload(result.job.id, normalizedUrl, formatId));
    }

    return NextResponse.json({ success: true, job_id: result.job.id, duplicate: result.duplicate });
  } catch (error) {
    return responseForError(error);
  }
}
