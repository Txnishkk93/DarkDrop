import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { errorResponse, ExtractorError, toExtractorError } from "@/lib/server/errors";
import { DOWNLOAD_DIR } from "@/lib/server/downloadDir";
import { jobStore } from "@/lib/server/jobStore";
import { fetchBackendFile, hasExternalMediaBackend } from "@/lib/server/mediaBackend";

function errorResponseFor(error: unknown) {
  const safeError = toExtractorError(error);
  return NextResponse.json(errorResponse(safeError), { status: safeError.status });
}

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    if (!jobId || jobId.length > 200) {
      throw new ExtractorError("Invalid download job identifier.", { code: "invalid_job_id", status: 400 });
    }

    if (hasExternalMediaBackend()) {
      const backendResponse = await fetchBackendFile(jobId, request.signal);
      const headers = new Headers();
      for (const name of ["content-type", "content-length", "content-disposition"]) {
        const value = backendResponse.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new NextResponse(backendResponse.body, { status: backendResponse.status, headers });
    }

    const job = jobStore.getJob(jobId);
    if (!job) {
      throw new ExtractorError("This download job expired or could not be found. Start it again.", {
        code: "job_not_found",
        status: 404,
      });
    }
    if (job.status !== "completed" || !job.file) {
      throw new ExtractorError("The download file is not ready yet.", {
        code: "file_not_ready",
        status: 409,
        retryable: job.status === "processing" || job.status === "pending",
      });
    }

    const filename = path.basename(job.file);
    if (filename !== job.file || !filename.startsWith(`${jobId}.`)) {
      throw new ExtractorError("The download file could not be located.", {
        code: "file_missing",
        status: 404,
      });
    }
    const filePath = path.join(DOWNLOAD_DIR, filename);

    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      jobStore.deleteJob(jobId);
      throw new ExtractorError("The download file expired or was removed. Start the download again.", {
        code: "file_missing",
        status: 404,
      });
    }

    const fileStream = createReadStream(filePath);
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        fileStream.on("data", (chunk) => {
          controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
        });
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (error) => {
          jobStore.deleteJob(jobId);
          controller.error(error);
        });
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/octet-stream",
        "Content-Length": stats.size.toString(),
      },
    });
  } catch (error) {
    return errorResponseFor(error);
  }
}
