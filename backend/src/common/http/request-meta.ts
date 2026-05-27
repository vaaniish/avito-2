export function getRequestMetaFromExpressLike(req: {
  header: (name: string) => string | undefined;
  ip?: string;
}) {
  const ipAddress = getRequestIpFromExpressLike(req);

  return {
    ipAddress,
    userAgent: req.header("user-agent")?.trim() || null,
  };
}

export function normalizeRequestIp(value: string | undefined | null): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.startsWith("::ffff:")) {
    return normalized.slice("::ffff:".length) || null;
  }
  return normalized;
}

export function getRequestIpFromExpressLike(req: {
  header: (name: string) => string | undefined;
  ip?: string;
}): string | null {
  const forwarded = req.header("x-forwarded-for")?.trim();
  if (forwarded) {
    return normalizeRequestIp(forwarded.split(",")[0] ?? null);
  }

  return normalizeRequestIp(req.ip);
}
