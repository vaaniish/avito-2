import type { PrismaClient } from "@prisma/client";
import type {
  AuthUserRepository,
  CreateBuyerInput,
  CreatedBuyerRecord,
  LoginUserRecord,
} from "../application/auth.ports";
import type { SessionUser } from "../domain/auth.types";

export class PrismaAuthUserRepository implements AuthUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findLoginUserByEmail(email: string): Promise<LoginUserRecord | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { email },
      select: {
        id: true,
        public_id: true,
        role: true,
        status: true,
        blocked_until: true,
        email: true,
        name: true,
        password: true,
        block_reason: true,
        wishlist_items: {
          select: {
            listing: {
              select: {
                public_id: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      publicId: user.public_id,
      role: user.role,
      status: user.status,
      blockedUntil: user.blocked_until,
      email: user.email,
      name: user.name,
      passwordHash: user.password,
      blockReason: user.block_reason,
      wishlistListingPublicIds: user.wishlist_items.map(
        (item) => item.listing.public_id,
      ),
    };
  }

  async activateUser(userId: number): Promise<void> {
    await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        status: "ACTIVE",
        block_reason: null,
        blocked_until: null,
      },
    });
  }

  async findByEmail(email: string): Promise<{ id: number } | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { email },
      select: { id: true },
    });
    return user;
  }

  async countBuyers(): Promise<number> {
    return this.prisma.appUser.count({
      where: {
        role: "BUYER",
      },
    });
  }

  async createBuyer(input: CreateBuyerInput): Promise<CreatedBuyerRecord> {
    const user = await this.prisma.appUser.create({
      data: {
        public_id: input.publicId,
        role: "BUYER",
        status: "ACTIVE",
        email: input.email,
        password: input.passwordHash,
        name: input.name,
        display_name: input.name,
        username: input.username,
      },
      select: {
        id: true,
        public_id: true,
        role: true,
        email: true,
        name: true,
      },
    });

    return {
      id: user.id,
      publicId: user.public_id,
      role: user.role,
      email: user.email,
      name: user.name,
    };
  }

  async findSessionUserById(userId: number): Promise<SessionUser | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
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

    return {
      id: user.id,
      publicId: user.public_id,
      role: user.role,
      status: user.status,
      blockedUntil: user.blocked_until,
      email: user.email,
      name: user.name,
    };
  }

  async refreshActiveSessionUser(userId: number): Promise<SessionUser> {
    const user = await this.prisma.appUser.update({
      where: { id: userId },
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

    return {
      id: user.id,
      publicId: user.public_id,
      role: user.role,
      status: user.status,
      blockedUntil: user.blocked_until,
      email: user.email,
      name: user.name,
    };
  }
}
