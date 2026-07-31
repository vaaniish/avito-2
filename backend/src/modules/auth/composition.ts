import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthService } from "./application/auth.service";
import { SessionService } from "./application/session.service";
import { createAuthRouter } from "./http/auth.router";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher";
import { PrismaAuthSessionRepository } from "./infrastructure/auth-session-prisma.repository";
import { PrismaAuthUserRepository } from "./infrastructure/auth-prisma.repository";
import { PrismaPolicyAcceptanceRepository } from "./infrastructure/policy-prisma.repository";

export function createAuthModule(prismaClient: PrismaClient) {
  const userRepository = new PrismaAuthUserRepository(prismaClient);
  const policyRepository = new PrismaPolicyAcceptanceRepository(prismaClient);
  const sessionRepository = new PrismaAuthSessionRepository(prismaClient);
  const passwordHasher = new BcryptPasswordHasher();

  const authService = new AuthService(
    userRepository,
    policyRepository,
    passwordHasher,
  );
  const sessionService = new SessionService(
    userRepository,
    sessionRepository,
  );

  return {
    authService,
    sessionService,
    router: createAuthRouter({ authService, sessionService }),
  };
}

const authModule = createAuthModule(prisma);

export const authRouter = authModule.router;
export const authSessionService = authModule.sessionService;
