import { mapUserAddressToDto } from "../../domain/profile-address.helpers";
import type { ProfileAddressRepositoryPort } from "../../domain/profile-address.types";

export class ListProfileAddressesService {
  constructor(private readonly repository: ProfileAddressRepositoryPort) {}

  async execute(userId: number) {
    const addresses = await this.repository.listByUserId(userId);
    return addresses.map(mapUserAddressToDto);
  }
}
