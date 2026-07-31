import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { forbidden, unauthorized } from "../../../common/application-error";
import { getSessionTtlMs } from "../../../lib/session-cookie";
import type {
  AuthSessionRepository,
  AuthUserRepository,
  SessionContextUser,
} from "./auth.ports";

const REVOKED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PRUNE_INTERVAL_MS = 60_000;

export type AuthSessionContext = {
  sessionId: string;
  userId: number;
  csrfToken: string;
  expiresAt: Date;
  user: SessionContextUser;
};

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export class SessionService {
  private lastPruneAt = 0;
  private prunePromise: Promise<void> | null = null;

  constructor(
    private readonly userRepository: AuthUserRepository,
    private readonly sessionRepository: AuthSessionRepository,
  ) {}

  async create(userId: number, rememberMe: boolean): Promise<{
    token: string;
    csrfToken: string;
    expiresAt: Date;
  }> {
    const now = new Date();
    const token = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(now.getTime() + getSessionTtlMs(rememberMe));
    await this.pruneIfDue(now);
    await this.sessionRepository.create({
      userId,
      tokenHash: hashSessionToken(token),
      csrfToken,
      expiresAt,
    });
    return { token, csrfToken, expiresAt };
  }

  private async pruneIfDue(now: Date): Promise<void> {
    const configured = Number(process.env.AUTH_SESSION_PRUNE_INTERVAL_MS ?? DEFAULT_PRUNE_INTERVAL_MS);
    const intervalMs = Number.isInteger(configured) && configured >= 1_000 && configured <= 24 * 60 * 60 * 1000
      ? configured
      : DEFAULT_PRUNE_INTERVAL_MS;
    if (now.getTime() - this.lastPruneAt < intervalMs) return;
    if (!this.prunePromise) {
      this.prunePromise = this.sessionRepository.prune(
        now,
        new Date(now.getTime() - REVOKED_RETENTION_MS),
      ).then(() => {
        this.lastPruneAt = now.getTime();
      }).finally(() => {
        this.prunePromise = null;
      });
    }
    await this.prunePromise;
  }

  async getContext(token: string | null): Promise<AuthSessionContext | null> {
    if (!token) return null;
    const session = await this.sessionRepository.findActiveByTokenHash(
      hashSessionToken(token),
      new Date(),
    );
    if (!session) return null;

    let user = session.user;
    if (
      user.status === "BLOCKED" &&
      user.blockedUntil &&
      user.blockedUntil.getTime() <= Date.now()
    ) {
      user = await this.userRepository.refreshActiveSessionUser(user.id);
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      user,
    };
  }

  async requireRoles(token: string | null, roles: string[]): Promise<AuthSessionContext> {
    const session = await this.getContext(token);
    if (!session) throw unauthorized("Unauthorized");
    if (!roles.includes(session.user.role)) throw forbidden("Forbidden");
    if (session.user.status === "BLOCKED") {
      const message = session.user.blockedUntil
        ? `User is temporarily blocked until ${session.user.blockedUntil.toISOString()}`
        : "User is blocked";
      throw forbidden(message);
    }
    return session;
  }

  isCsrfTokenValid(context: AuthSessionContext, provided: string | null): boolean {
    return Boolean(provided && constantTimeEqual(context.csrfToken, provided));
  }

  async revokeCurrent(token: string | null): Promise<void> {
    if (!token) return;
    await this.sessionRepository.revokeByTokenHash(hashSessionToken(token), new Date());
  }

  async revokeAll(userId: number): Promise<void> {
    await this.sessionRepository.revokeAllByUserId(userId, new Date());
  }

  async revokeOthers(userId: number, currentSessionId: string): Promise<void> {
    await this.sessionRepository.revokeOthersByUserId(
      userId,
      currentSessionId,
      new Date(),
    );
  }
}
