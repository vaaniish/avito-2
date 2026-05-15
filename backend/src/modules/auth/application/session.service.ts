import {
  forbidden,
  unauthorized,
} from "../../../common/application-error";
import type { SessionUser } from "../domain/auth.types";
import type {
  AuthUserRepository,
  SessionTokenProvider,
} from "./auth.ports";

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

export class SessionService {
  constructor(
    private readonly userRepository: AuthUserRepository,
    private readonly sessionTokenProvider: SessionTokenProvider,
  ) {}

  async getSessionUserFromAuthorization(
    authorization: string | undefined,
  ): Promise<SessionUser | null> {
    const token = parseBearerToken(authorization);
    const userId = token ? this.sessionTokenProvider.verify(token) : null;

    if (!userId) {
      return null;
    }

    const user = await this.userRepository.findSessionUserById(userId);
    if (!user) {
      return null;
    }

    if (
      user.status === "BLOCKED" &&
      user.blockedUntil &&
      user.blockedUntil.getTime() <= Date.now()
    ) {
      return this.userRepository.refreshActiveSessionUser(user.id);
    }

    return user;
  }

  async requireRoles(
    authorization: string | undefined,
    roles: string[],
  ): Promise<SessionUser> {
    const user = await this.getSessionUserFromAuthorization(authorization);
    if (!user) {
      throw unauthorized("Unauthorized");
    }

    if (!roles.includes(user.role)) {
      throw forbidden("Forbidden");
    }

    if (user.status === "BLOCKED") {
      const message = user.blockedUntil
        ? `User is temporarily blocked until ${user.blockedUntil.toISOString()}`
        : "User is blocked";
      throw forbidden(message);
    }

    return user;
  }
}
