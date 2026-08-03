export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "PAYLOAD_TOO_LARGE";

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  PAYLOAD_TOO_LARGE: 413,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  toResponse(requestId: string): Response {
    return Response.json(
      {
        error: {
          code: this.code,
          message: this.message,
          requestId,
          ...(this.field ? { field: this.field } : {}),
        },
      },
      { status: HTTP_STATUS[this.code] },
    );
  }
}

export function notFound(entity: string): AppError {
  return new AppError("NOT_FOUND", `${entity} not found`);
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", message);
}

export function validationError(message: string, field?: string): AppError {
  return new AppError("VALIDATION_ERROR", message, field);
}

export function unauthorized(): AppError {
  return new AppError("UNAUTHORIZED", "Authentication required");
}