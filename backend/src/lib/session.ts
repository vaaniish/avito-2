import { type Request } from "express";
import { authSessionService } from "../modules/auth/composition";
import type { AuthSessionContext } from "../modules/auth/application/session.service";
import { readSessionCookie } from "./session-cookie";

type SessionUser = {
  id: number;
  public_id: string;
  role: string;
  status: "ACTIVE" | "BLOCKED";
  blocked_until: Date | null;
  email: string;
  name: string;
};

const requestSessionCache = new WeakMap<Request, Promise<AuthSessionContext | null>>();

export function getAuthSessionContext(req: Request): Promise<AuthSessionContext | null> {
  const cached = requestSessionCache.get(req);
  if (cached) return cached;
  const pending = authSessionService.getContext(readSessionCookie(req));
  requestSessionCache.set(req, pending);
  return pending;
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const session = await getAuthSessionContext(req);
  if (!session) return null;
  const { user } = session;
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

async function requireRoles(
  req: Request,
  roles: string[],
): Promise<{ ok: true; user: SessionUser } | { ok: false; message: string; status: number }> {
  const user = await getSessionUser(req);
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };
  if (!roles.includes(user.role)) return { ok: false, status: 403, message: "Forbidden" };
  if (user.status === "BLOCKED") {
    const message = user.blocked_until
      ? `User is temporarily blocked until ${user.blocked_until.toISOString()}`
      : "User is blocked";
    return { ok: false, status: 403, message };
  }
  return { ok: true, user };
}

export function requireRole(req: Request, role: string) {
  return requireRoles(req, [role]);
}

export function requireAnyRole(req: Request, roles: string[]) {
  return requireRoles(req, roles);
}
