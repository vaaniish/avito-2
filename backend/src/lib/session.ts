import { type Request } from "express";
import { authSessionService } from "../modules/auth/composition";

type SessionUser = {
  id: number;
  public_id: string;
  role: string;
  status: "ACTIVE" | "BLOCKED";
  blocked_until: Date | null;
  email: string;
  name: string;
};

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const user = await authSessionService.getSessionUserFromAuthorization(
    req.header("authorization") ?? undefined,
  );
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    public_id: user.publicId,
    role: user.role,
    status: user.status,
    blocked_until: user.blockedUntil,
    email: user.email,
    name: user.name,
  };
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
