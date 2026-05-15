import {
  conflict,
  forbidden,
  unauthorized,
  validationError,
} from "../../../common/application-error";
import { toClientRole } from "../../../utils/format";
import type { AuthSuccessResult } from "../domain/auth.types";
import type {
  AuthUserRepository,
  PasswordHasher,
  PolicyAcceptanceRepository,
  SessionTokenProvider,
} from "./auth.ports";

const SUPPORT_CONTACT_MESSAGE =
  "Если вы считаете блокировку ошибочной, свяжитесь с поддержкой площадки: support@ecom.ru, 8-800-123-45-67.";

type RequestMeta = {
  requestIp: string | null;
  requestUserAgent: string | null;
};

function toAuthUserView(user: {
  id: number;
  publicId: string;
  role: string;
  email: string;
  name: string;
}) {
  return {
    id: user.id,
    public_id: user.publicId,
    role: toClientRole(user.role),
    email: user.email,
    name: user.name,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  constructor(
    private readonly userRepository: AuthUserRepository,
    private readonly policyRepository: PolicyAcceptanceRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionTokenProvider: SessionTokenProvider,
  ) {}

  async login(input: {
    email?: unknown;
    password?: unknown;
    meta: RequestMeta;
  }): Promise<AuthSuccessResult> {
    const email =
      typeof input.email === "string" ? normalizeEmail(input.email) : "";
    const password = typeof input.password === "string" ? input.password : "";

    if (!email || !password) {
      throw validationError("Email and password are required");
    }

    const user = await this.userRepository.findLoginUserByEmail(email);
    if (!user) {
      throw unauthorized("Неверный email или пароль");
    }

    const passwordMatch = await this.passwordHasher.compare(
      password,
      user.passwordHash,
    );
    if (!passwordMatch) {
      throw unauthorized("Неверный email или пароль");
    }

    if (user.status === "BLOCKED") {
      if (user.blockedUntil && user.blockedUntil.getTime() <= Date.now()) {
        await this.userRepository.activateUser(user.id);
      } else {
        const reason =
          user.blockReason?.trim() ||
          "Аккаунт заблокирован администрацией площадки.";
        const blockPrefix = user.blockedUntil
          ? `Аккаунт временно заблокирован до ${user.blockedUntil.toLocaleString("ru-RU")}.`
          : "Аккаунт заблокирован.";
        throw forbidden(
          `${blockPrefix}\n\nПричина: ${reason}\n\n${SUPPORT_CONTACT_MESSAGE}`,
        );
      }
    }

    await this.tryAcceptCheckoutPolicy(user.id, input.meta);

    return {
      user: toAuthUserView(user),
      sessionToken: this.sessionTokenProvider.sign(user.id),
      profile: {
        wishlist: user.wishlistListingPublicIds.map((id) => ({ id })),
      },
    };
  }

  async signup(input: {
    name?: unknown;
    username?: unknown;
    email?: unknown;
    password?: unknown;
    meta: RequestMeta;
  }): Promise<AuthSuccessResult> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const username =
      typeof input.username === "string" ? input.username.trim() : "";
    const email =
      typeof input.email === "string" ? normalizeEmail(input.email) : "";
    const password = typeof input.password === "string" ? input.password : "";

    if (!name || !email || !password) {
      throw validationError("Name, email and password are required");
    }

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw conflict("Пользователь с таким email уже существует");
    }

    const sequence = await this.userRepository.countBuyers();
    const publicId = `USR-${String(sequence + 1000).padStart(3, "0")}`;
    const passwordHash = await this.passwordHasher.hash(password);
    const user = await this.userRepository.createBuyer({
      publicId,
      email,
      passwordHash,
      name,
      username: username || null,
    });

    await this.tryAcceptCheckoutPolicy(user.id, input.meta);

    return {
      user: toAuthUserView(user),
      sessionToken: this.sessionTokenProvider.sign(user.id),
      profile: {
        wishlist: [],
      },
    };
  }

  async getCurrentUser(input: {
    sessionToken?: string | null;
    meta: RequestMeta;
  }): Promise<{ user: ReturnType<typeof toAuthUserView> }> {
    const userId = input.sessionToken
      ? this.sessionTokenProvider.verify(input.sessionToken)
      : null;

    if (!userId) {
      throw unauthorized("Unauthorized");
    }

    const user = await this.userRepository.findSessionUserById(userId);
    if (!user) {
      throw unauthorized("Unauthorized");
    }

    let activeUser = user;
    if (
      user.status === "BLOCKED" &&
      user.blockedUntil &&
      user.blockedUntil.getTime() <= Date.now()
    ) {
      activeUser = await this.userRepository.refreshActiveSessionUser(user.id);
    }

    await this.tryAcceptCheckoutPolicy(activeUser.id, input.meta);

    return {
      user: toAuthUserView(activeUser),
    };
  }

  private async tryAcceptCheckoutPolicy(
    userId: number,
    meta: RequestMeta,
  ): Promise<void> {
    try {
      await this.policyRepository.acceptCheckoutPolicyForUser({
        userId,
        requestIp: meta.requestIp,
        requestUserAgent: meta.requestUserAgent,
      });
    } catch (error) {
      console.error("Error auto-accepting checkout policy:", error);
    }
  }
}
