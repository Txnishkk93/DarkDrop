import { NextResponse } from 'next/server';
import { errorResponse, ExtractorError, toExtractorError } from '@/lib/server/errors';
import { callMediaBackend, hasExternalMediaBackend } from '@/lib/server/mediaBackend';
import { jobStore } from '@/lib/server/jobStore';

function safeDownloadError(code?: string) {
  switch (code) {
    case 'upstream_rate_limited':
      return 'The source is rate-limiting downloads. Please wait before trying again.';
    case 'access_denied':
      return 'The source denied this download. It may be restricted or inaccessible from this service.';
    case 'content_unavailable':
      return 'This media is unavailable or cannot be accessed.';
    case 'network_error':
    case 'timeout':
      return 'The download timed out or could not connect. Please try again.';
    case 'upstream_failure':
    case 'backend_unavailable':
      return 'The download service is temporarily unavailable. Please try again later.';
    default:
      return 'The download could not be completed. Confirm the media is public and try again.';
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    if (!jobId || jobId.length > 200) {
      throw new ExtractorError('Invalid download job identifier.', { code: 'invalid_job_id', status: 400 });
    }

    if (hasExternalMediaBackend()) {
      const backendJob = await callMediaBackend<{
        status?: string;
        progress?: number;
        error?: string;
        errorCode?: string;
        code?: string;
        retryable?: boolean;
        file_url?: string;
      }>(`/api/media/progress/${encodeURIComponent(jobId)}`, undefined, 'GET', request.signal);

      const status = ['pending', 'processing', 'completed', 'error'].includes(backendJob.status || '')
        ? backendJob.status!
        : 'processing';
      const code = backendJob.errorCode || backendJob.code;
      return NextResponse.json({
        status,
        progress: typeof backendJob.progress === 'number' ? backendJob.progress : 0,
        ...(backendJob.error ? {
          error: safeDownloadError(code),
          code: code || 'download_failed',
          retryable: Boolean(backendJob.retryable),
        } : {}),
        ...(status === 'completed' ? { file_url: `/api/media/file/${encodeURIComponent(jobId)}` } : {}),
      });
    }

    const job = jobStore.getJob(jobId);

    if (!job) {
      throw new ExtractorError('This download job expired or could not be found. Start it again.', {
        code: 'job_not_found',
        status: 404,
      });
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress ?? 0,
      ...(job.file_url ? { file_url: job.file_url } : {}),
      ...(job.error ? {
        error: job.error,
        code: job.errorCode || 'download_failed',
        retryable: job.retryable ?? false,
      } : {}),
      createdAt: job.createdAt,
    });
  } catch (error) {
    const safeError = toExtractorError(error);
    return NextResponse.json(errorResponse(safeError), { status: safeError.status });
  }
}
