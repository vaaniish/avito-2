import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthService } from "./application/auth.service";
import { SessionService } from "./application/session.service";
import { createAuthRouter } from "./http/auth.router";
import { BcryptPasswordHasher } from "./infrastructure/bcrypt-password-hasher";
import { PrismaAuthUserRepository } from "./infrastructure/auth-prisma.repository";
import { PrismaPolicyAcceptanceRepository } from "./infrastructure/policy-prisma.repository";
import { JwtSessionTokenProvider } from "./infrastructure/session-token-provider";

export function createAuthModule(prismaClient: PrismaClient) {
  const userRepository = new PrismaAuthUserRepository(prismaClient);
  const policyRepository = new PrismaPolicyAcceptanceRepository(prismaClient);
  const passwordHasher = new BcryptPasswordHasher();
  const sessionTokenProvider = new JwtSessionTokenProvider();

  const authService = new AuthService(
    userRepository,
    policyRepository,
    passwordHasher,
    sessionTokenProvider,
  );
  const sessionService = new SessionService(
    userRepository,
    sessionTokenProvider,
  );

  return {
    authService,
    sessionService,
    router: createAuthRouter({ authService }),
  };
}

const authModule = createAuthModule(prisma);

export const authRouter = authModule.router;
export const authSessionService = authModule.sessionService;
