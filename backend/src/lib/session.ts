import { type Request } from "express";
import { prisma } from "./prisma";

type SessionUser = {
  id: number;
  public_id: string;
  role: string;
  email: string;
  name: string;
};

function parseUserId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const fromHeader = parseUserId(req.header("x-user-id") ?? undefined);
  const fromQuery = parseUserId(
    typeof req.query.user_id === "string" ? req.query.user_id : undefined,
  );
  const resolvedId = fromHeader ?? fromQuery ?? 1;

  const user = await prisma.appUser.findUnique({
    where: { id: resolvedId },
    select: {
      id: true,
      public_id: true,
      role: true,
      email: true,
      name: true,
    },
  });

  return user ?? null;
}

export async function requireRole(
  req: Request,
  role: string,
): Promise<{ ok: true; user: SessionUser } | { ok: false; message: string; status: number }> {
  const user = await getSessionUser(req);
  if (!user) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (user.role !== role) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, user };
}

export async function requireAnyRole(
  req: Request,
  roles: string[],
): Promise<{ ok: true; user: SessionUser } | { ok: false; message: string; status: number }> {
  const user = await getSessionUser(req);
  if (!user) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (!roles.includes(user.role)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, user };
}
