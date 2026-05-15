export function getRequestMetaFromExpressLike(req: {
  header: (name: string) => string | undefined;
  ip?: string;
}) {
  const forwarded = req.header("x-forwarded-for")?.trim();
  const ipAddress = forwarded
    ? forwarded.split(",")[0]?.trim() ?? null
    : req.ip?.trim() || null;

  return {
    ipAddress,
    userAgent: req.header("user-agent")?.trim() || null,
  };
}
