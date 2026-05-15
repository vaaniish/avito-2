import { mapPayoutProfileItem } from "../../domain/admin-partnership.helpers";
import type { AdminPayoutRepositoryPort } from "../../domain/admin-partnership.types";

export class ListPayoutProfilesService {
  constructor(private readonly repository: AdminPayoutRepositoryPort) {}

  async execute() {
    const profiles = await this.repository.listProfiles();
    return profiles.map(mapPayoutProfileItem);
  }
}
