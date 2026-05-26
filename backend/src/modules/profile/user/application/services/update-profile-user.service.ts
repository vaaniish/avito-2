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
      workEmail?: unknown;
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
    const canManageWorkEmail = user.role === "SELLER";

    if (!canManageWorkEmail && normalized.workEmail !== undefined) {
      throw validationError("Рабочая почта доступна только партнёрам");
    }

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

    const nextWorkEmail = canManageWorkEmail
      ? normalized.workEmail === undefined
        ? undefined
        : normalized.workEmail || null
      : undefined;

    const updated = await this.repository.updateUser({
      userId: input.userId,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      displayName: normalized.displayName,
      email: normalized.email,
      workEmail: nextWorkEmail,
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
        workEmail: updated.role === "SELLER" ? updated.work_email : null,
      },
    };
  }
}
