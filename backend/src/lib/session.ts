import { type Request } from "express";
import { prisma } from "./prisma";
import { verifySessionToken } from "./session-token";

type SessionUser = {
  id: number;
  public_id: string;
  role: string;
  status: "ACTIVE" | "BLOCKED";
  blocked_until: Date | null;
  email: string;
  name: string;
};

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const normalized = authorization.trim();
  if (!normalized) return null;
  const parts = normalized.split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  const token = parts[1]?.trim();
  return token || null;
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const bearerToken = parseBearerToken(req.header("authorization") ?? undefined);
  const resolvedId = bearerToken ? verifySessionToken(bearerToken) : null;

  if (!resolvedId) {
    return null;
  }

  const user = await prisma.appUser.findUnique({
    where: { id: resolvedId },
    select: {
      id: true,
      public_id: true,
      role: true,
      status: true,
      blocked_until: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    return null;
  }

  if (
    user.status === "BLOCKED" &&
    user.blocked_until &&
    user.blocked_until.getTime() <= Date.now()
  ) {
    const unblocked = await prisma.appUser.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        block_reason: null,
        blocked_until: null,
      },
      select: {
        id: true,
        public_id: true,
        role: true,
        status: true,
        blocked_until: true,
        email: true,
        name: true,
      },
    });
    return unblocked;
  }

  return user;
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

  if (user.status === "BLOCKED") {
    const message = user.blocked_until
      ? `User is temporarily blocked until ${user.blocked_until.toISOString()}`
      : "User is blocked";
    return { ok: false, status: 403, message };
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

  if (user.status === "BLOCKED") {
    const message = user.blocked_until
      ? `User is temporarily blocked until ${user.blocked_until.toISOString()}`
      : "User is blocked";
    return { ok: false, status: 403, message };
  }

  return { ok: true, user };
}
