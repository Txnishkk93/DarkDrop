export class ExtractorError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  retryAfterMs?: number;

  cause?: unknown;

  constructor(
    message: string,
    options: {
      code: string;
      status?: number;
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "ExtractorError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;
  }
}

export function toExtractorError(error: unknown): ExtractorError {
  if (error instanceof ExtractorError || (error && typeof error === "object" && (error as any).name === "ExtractorError")) {
    return error as ExtractorError;
  }

  return new ExtractorError("The request could not be completed. Please try again later.", {
    code: "internal_error",
    status: 500,
    cause: error,
  });
}

export function errorResponse(error: ExtractorError) {
  const cause = error.cause;
  return {
    ok: false,
    error: error.message,
    code: error.code,
    retryable: error.retryable,
    debugCause: cause instanceof Error ? { message: cause.message, stack: cause.stack, name: cause.name } : cause,
    ...(error.retryAfterMs !== undefined
      ? { retry_after_seconds: Math.ceil(error.retryAfterMs / 1000) }
      : {}),
  };
}
