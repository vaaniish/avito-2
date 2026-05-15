import type { Response } from "express";
import {
  ApplicationError,
  isApplicationError,
} from "../application-error";

function getStatusCode(error: ApplicationError): number {
  switch (error.code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "VALIDATION_ERROR":
      return 400;
    case "PRECONDITION_FAILED":
      return 412;
    case "EXTERNAL_SERVICE_ERROR":
      return 502;
    default:
      return 500;
  }
}

export function sendApplicationError(res: Response, error: unknown): void {
  if (isApplicationError(error)) {
    const details =
      error.details && typeof error.details === "object" ? error.details : {};
    res.status(getStatusCode(error)).json({
      error: error.message,
      ...details,
    });
    return;
  }

  console.error("Unexpected HTTP error:", error);
  res.status(500).json({ error: "Internal server error" });
}
