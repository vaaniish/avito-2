import type { PolicyScope } from "@prisma/client";

export type NormalizedPolicyScope = PolicyScope;

export function normalizePolicyScope(
  value: unknown,
): NormalizedPolicyScope | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "checkout") return "CHECKOUT";
  if (raw === "partnership") return "PARTNERSHIP";
  return null;
}

export function toClientPolicyScope(
  scope: PolicyScope,
): "checkout" | "partnership" {
  return scope === "CHECKOUT" ? "checkout" : "partnership";
}
