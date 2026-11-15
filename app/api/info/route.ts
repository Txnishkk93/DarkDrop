import { NextResponse } from "next/server";
import { errorResponse, ExtractorError, toExtractorError } from "@/lib/server/errors";
import { callMediaBackend, hasExternalMediaBackend } from "@/lib/server/mediaBackend";
import { getCachedMetadata, normalizeAndValidateMediaUrl, runBoundedExtraction } from "@/lib/server/reliability";
import { extractMediaInfo, type ExtractedMediaInfo } from "@/lib/server/youtubeExtractor";

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
    if (typeof url !== "string" || !url.trim()) {
      throw new ExtractorError("A media URL is required.", { code: "invalid_url", status: 400 });
    }
    const normalizedUrl = await normalizeAndValidateMediaUrl(url);

    if (hasExternalMediaBackend()) {
      const backendInfo = await runBoundedExtraction(() => callMediaBackend<{
        ok: boolean;
        title?: string;
        thumbnail?: string;
        duration?: number;
        platform?: string;
        formats?: ExtractedMediaInfo["formats"];
        code?: string;
      }>("/api/info", { url: normalizedUrl }, "POST", request.signal, request.url));

      if (!backendInfo || backendInfo.ok !== true) {
        throw new ExtractorError("The media backend could not retrieve information for this URL.", {
          code: backendInfo?.code || "backend_error",
          status: 502,
        });
      }

      return NextResponse.json({
        ok: true,
        title: backendInfo.title || "Unknown",
        thumbnail: backendInfo.thumbnail || "",
        duration: backendInfo.duration || 0,
        platform: backendInfo.platform || "Unknown",
        formats: backendInfo.formats || [],
      });
    }

    const info = await getCachedMetadata(normalizedUrl, () => extractMediaInfo(normalizedUrl));
    return NextResponse.json({ ok: true, ...info });
  } catch (error) {
    return responseForError(error);
  }
}
