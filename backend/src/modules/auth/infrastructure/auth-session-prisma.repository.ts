import type { PrismaClient } from "@prisma/client";
import type {
  AuthSessionRecord,
  AuthSessionRepository,
  CreateAuthSessionInput,
} from "../application/auth.ports";

const SESSION_USER_SELECT = {
  id: true,
  public_id: true,
  role: true,
  status: true,
  blocked_until: true,
  email: true,
  name: true,
} as const;

export class PrismaAuthSessionRepository implements AuthSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuthSessionInput): Promise<{ id: string }> {
    return this.prisma.authSession.create({
      data: {
        user_id: input.userId,
        token_hash: input.tokenHash,
        csrf_token: input.csrfToken,
        expires_at: input.expiresAt,
      },
      select: { id: true },
    });
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionRecord | null> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { gt: now },
      },
      select: {
        id: true,
        user_id: true,
        csrf_token: true,
        expires_at: true,
        user: { select: SESSION_USER_SELECT },
      },
    });
    if (!session) return null;
    return {
      id: session.id,
      userId: session.user_id,
      csrfToken: session.csrf_token,
      expiresAt: session.expires_at,
      user: {
        id: session.user.id,
        publicId: session.user.public_id,
        role: session.user.role,
        status: session.user.status,
        blockedUntil: session.user.blocked_until,
        email: session.user.email,
        name: session.user.name,
      },
    };
  }

  async revokeByTokenHash(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { token_hash: tokenHash, revoked_at: null },
      data: { revoked_at: now },
    });
  }

  async revokeAllByUserId(userId: number, now: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: now },
    });
  }

  async revokeOthersByUserId(
    userId: number,
    currentSessionId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        user_id: userId,
        id: { not: currentSessionId },
        revoked_at: null,
      },
      data: { revoked_at: now },
    });
  }

  async prune(now: Date, revokedBefore: Date): Promise<void> {
    await this.prisma.authSession.deleteMany({
      where: {
        OR: [
          { expires_at: { lte: now } },
          { revoked_at: { not: null, lte: revokedBefore } },
        ],
      },
    });
  }
}
