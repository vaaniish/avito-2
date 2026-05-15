import { CatalogSuggestionStatus } from "@prisma/client";
import { validationError } from "../../../../common/application-error";

export type CatalogSuggestionClientStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "merged";

export function parseCatalogSuggestionStatus(
  status: unknown,
): CatalogSuggestionStatus | null {
  if (status === "pending") return "PENDING";
  if (status === "auto_approved") return "AUTO_APPROVED";
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "merged") return "MERGED";
  return null;
}

export function requireCatalogSuggestionStatus(
  status: unknown,
): CatalogSuggestionStatus {
  const parsed = parseCatalogSuggestionStatus(status);
  if (!parsed) {
    throw validationError("Invalid catalog suggestion status");
  }
  return parsed;
}

export function toClientCatalogSuggestionStatus(
  status: CatalogSuggestionStatus,
): CatalogSuggestionClientStatus {
  return status.toLowerCase() as CatalogSuggestionClientStatus;
}
