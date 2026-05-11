export function logAppDebug(
  scope: "session" | "route-sync" | "catalog" | "view",
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[app:${scope}] ${event}`, payload ?? {});
}
