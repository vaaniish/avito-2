import { validationError } from "../../../../../common/application-error";
import {
  assertProfileUserExists,
  parseProfileUserUpdate,
  validatePasswordChangeInput,
} from "../../domain/profile-user.helpers";
import type { ProfilePasswordHasherGateway } from "../../infrastructure/gateways/profile-password-hasher.gateway";
import type { ProfileUserRepository } from "../../infrastructure/repositories/profile-user.repository";

export class UpdateProfileUserService {
  constructor(
    private readonly repository: ProfileUserRepository,
    private readonly passwordHasher: ProfilePasswordHasherGateway,
  ) {}

  async execute(input: {
    userId: number;
    payload: {
      firstName?: unknown;
      lastName?: unknown;
      displayName?: unknown;
      email?: unknown;
      oldPassword?: unknown;
      newPassword?: unknown;
    };
    toClientRole: (role: string) => "regular" | "partner" | "admin";
  }) {
    const normalized = parseProfileUserUpdate(input.payload);
    validatePasswordChangeInput(normalized);

    const user = assertProfileUserExists(
      await this.repository.loadUserForUpdate(input.userId),
    );

    let nextPasswordHash: string | undefined;
    if (normalized.newPassword) {
      const isOldPasswordValid = await this.passwordHasher.compare(
        normalized.oldPassword,
        user.password,
      );
      if (!isOldPasswordValid) {
        throw validationError("Старый пароль указан неверно");
      }
      nextPasswordHash = await this.passwordHasher.hash(normalized.newPassword);
    }

    const updated = await this.repository.updateUser({
      userId: input.userId,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      displayName: normalized.displayName,
      email: normalized.email,
      password: nextPasswordHash,
    });

    return {
      success: true,
      user: {
        id: updated.id,
        public_id: updated.public_id,
        role: input.toClientRole(updated.role),
        firstName: updated.first_name ?? "",
        lastName: updated.last_name ?? "",
        displayName: updated.display_name ?? updated.name,
        email: updated.email,
      },
    };
  }
}
