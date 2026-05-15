export type ApplicationErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "PRECONDITION_FAILED"
  | "EXTERNAL_SERVICE_ERROR";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details?: unknown;

  constructor(code: ApplicationErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.details = details;
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function unauthorized(message = "Unauthorized"): ApplicationError {
  return new ApplicationError("UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): ApplicationError {
  return new ApplicationError("FORBIDDEN", message);
}

export function notFound(message = "Not found"): ApplicationError {
  return new ApplicationError("NOT_FOUND", message);
}

export function conflict(message: string, details?: unknown): ApplicationError {
  return new ApplicationError("CONFLICT", message, details);
}

export function validationError(
  message: string,
  details?: unknown,
): ApplicationError {
  return new ApplicationError("VALIDATION_ERROR", message, details);
}

export function preconditionFailed(
  message: string,
  details?: unknown,
): ApplicationError {
  return new ApplicationError("PRECONDITION_FAILED", message, details);
}

export function externalServiceError(
  message: string,
  details?: unknown,
): ApplicationError {
  return new ApplicationError("EXTERNAL_SERVICE_ERROR", message, details);
}
