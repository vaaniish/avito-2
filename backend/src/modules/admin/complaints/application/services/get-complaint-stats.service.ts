import type {
  AdminComplaintsRepositoryPort,
  ComplaintStatsDto,
} from "../admin-complaints.types";
import {
  normalizeComplaintFilters,
  parseComplaintPriorityFilter,
} from "../admin-complaints.service";

export class GetComplaintStatsService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
  ) {}

  async execute(query: Record<string, unknown>): Promise<ComplaintStatsDto> {
    const filters = normalizeComplaintFilters(query);
    const priorities = parseComplaintPriorityFilter(query.priority);

    let complaints = await this.repository.listComplaints(filters);
    if (priorities.length > 0) {
      complaints = complaints.filter((item) => priorities.includes(item.priority));
    }

    return {
      total: complaints.length,
      new: complaints.filter((item) => item.status === "new").length,
      pending: complaints.filter((item) => item.status === "pending").length,
      approved: complaints.filter((item) => item.status === "approved").length,
      rejected: complaints.filter((item) => item.status === "rejected").length,
      highPriority: complaints.filter((item) => item.priority === "high").length,
      mediumPriority: complaints.filter((item) => item.priority === "medium").length,
      lowPriority: complaints.filter((item) => item.priority === "low").length,
    };
  }
}
