import { mapKycRequestItem } from "../../domain/admin-partnership.helpers";
import type { AdminKycRepositoryPort } from "../../domain/admin-partnership.types";

export class ListKycRequestsService {
  constructor(private readonly repository: AdminKycRepositoryPort) {}

  async execute() {
    const requests = await this.repository.listRequests();
    return requests.map(mapKycRequestItem);
  }
}
