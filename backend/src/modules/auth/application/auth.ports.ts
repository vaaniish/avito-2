import type { SessionUser } from "../domain/auth.types";

export type LoginUserRecord = {
  id: number;
  publicId: string;
  role: string;
  status: "ACTIVE" | "BLOCKED";
  blockedUntil: Date | null;
  email: string;
  name: string;
  passwordHash: string;
  blockReason: string | null;
  wishlistListingPublicIds: string[];
};

export type CreateBuyerInput = {
  publicId: string;
  email: string;
  passwordHash: string;
  name: string;
  username: string | null;
};

export type CreatedBuyerRecord = {
  id: number;
  publicId: string;
  role: string;
  email: string;
  name: string;
};

export interface AuthUserRepository {
  findLoginUserByEmail(email: string): Promise<LoginUserRecord | null>;
  activateUser(userId: number): Promise<void>;
  findByEmail(email: string): Promise<{ id: number } | null>;
  countBuyers(): Promise<number>;
  createBuyer(input: CreateBuyerInput): Promise<CreatedBuyerRecord>;
  findSessionUserById(userId: number): Promise<SessionUser | null>;
  refreshActiveSessionUser(userId: number): Promise<SessionUser>;
}

export interface PolicyAcceptanceRepository {
  acceptCheckoutPolicyForUser(input: {
    userId: number;
    requestIp: string | null;
    requestUserAgent: string | null;
  }): Promise<void>;
}

export interface PasswordHasher {
  compare(raw: string, hash: string): Promise<boolean>;
  hash(raw: string): Promise<string>;
}

export interface SessionTokenProvider {
  sign(userId: number): string;
  verify(token: string): number | null;
}
