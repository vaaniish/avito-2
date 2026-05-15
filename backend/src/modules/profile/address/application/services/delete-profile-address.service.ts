import {
  conflict,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import type { ProfileAddressRepositoryPort } from "../../domain/profile-address.types";

export class DeleteProfileAddressService {
  constructor(private readonly repository: ProfileAddressRepositoryPort) {}

  async execute(input: { id: number; userId: number }) {
    if (!Number.isInteger(input.id)) {
      throw validationError("Invalid address id");
    }

    const existing = await this.repository.findByIdForUser(input);
    if (!existing) {
      throw notFound("Address not found");
    }
    if (existing.is_default) {
      throw validationError("Default address cannot be deleted");
    }

    await this.repository.deleteForUser(input);
    return { success: true };
  }
}
