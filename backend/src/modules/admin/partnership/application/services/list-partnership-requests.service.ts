import { mapPartnershipRequestItem } from "../../domain/admin-partnership.helpers";
import type { AdminPartnershipRequestRepositoryPort } from "../../domain/admin-partnership.types";

export class ListPartnershipRequestsService {
  constructor(
    private readonly repository: AdminPartnershipRequestRepositoryPort,
  ) {}

  async execute() {
    const requests = await this.repository.listRequests();
    return requests.map(mapPartnershipRequestItem);
  }
}
