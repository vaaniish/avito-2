import type {
  AdminComplaintsRepositoryPort,
  ComplaintDto,
} from "../admin-complaints.types";

export class GetComplaintsLegacyService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
  ) {}

  async execute(): Promise<ComplaintDto[]> {
    return this.repository.findLegacyComplaints();
  }
}
