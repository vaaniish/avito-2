import { randomBytes } from "node:crypto";

function normalizePrefix(prefix: string): string {
  return prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeRandomToken(length: number): string {
  const normalizedLength = Math.max(8, Math.floor(length));
  return randomBytes(Math.ceil(normalizedLength / 2))
    .toString("hex")
    .slice(0, normalizedLength)
    .toUpperCase();
}

export function makeOpaquePublicId(prefix: string, tokenLength = 16): string {
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) {
    throw new Error("Public id prefix is required");
  }

  return `${normalizedPrefix}-${makeRandomToken(tokenLength)}`;
}

export function makeAuditPublicId(): string {
  return makeOpaquePublicId("AUD", 20);
}
