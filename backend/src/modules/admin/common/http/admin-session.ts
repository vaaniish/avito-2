import type { Request, Response } from "express";
import { getRequestIpFromExpressLike } from "../../../../common/http/request-meta";
import { requireRole } from "../../../../lib/session";

const ROLE_ADMIN = "ADMIN";

export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<{ ok: true; user: { id: number } } | { ok: false }> {
  const session = await requireRole(req, ROLE_ADMIN);
  if (!session.ok) {
    res.status(session.status).json({ error: session.message });
    return { ok: false };
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
    },
  };
}

export function getRequestIp(req: Request): string | null {
  return getRequestIpFromExpressLike(req);
}
