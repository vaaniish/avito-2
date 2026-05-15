import type { ComplaintSanctionLevel } from "@prisma/client";

export function toClientSanctionLevel(level: ComplaintSanctionLevel): string {
  if (level === "WARNING") return "warning";
  if (level === "TEMP_3_DAYS") return "temp_3_days";
  if (level === "TEMP_30_DAYS") return "temp_30_days";
  return "permanent";
}
