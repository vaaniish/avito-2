import type {
  AdminComplaintsRepositoryPort,
  ComplaintListResponseDto,
} from "../admin-complaints.types";
import {
  normalizeComplaintFilters,
  parseComplaintPriorityFilter,
  parseComplaintSortBy,
  parseComplaintSortOrder,
  parsePageQuery,
  parsePageSizeQuery,
  sortComplaints,
} from "../admin-complaints.service";

export class ListComplaintsService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
  ) {}

  async execute(query: Record<string, unknown>): Promise<ComplaintListResponseDto> {
    const page = parsePageQuery(query.page);
    const pageSize = parsePageSizeQuery(query.pageSize);
    const priorities = parseComplaintPriorityFilter(query.priority);
    const sortBy = parseComplaintSortBy(query.sortBy);
    const sortOrder = parseComplaintSortOrder(query.sortOrder);
    const filters = normalizeComplaintFilters(query);

    let complaints = await this.repository.listComplaints(filters);
    if (priorities.length > 0) {
      complaints = complaints.filter((item) => priorities.includes(item.priority));
    }

    const sorted = sortComplaints(complaints, sortBy, sortOrder);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = totalPages === 0 ? 0 : (safePage - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);

    const moderators = Array.from(
      new Map(
        complaints
          .filter((item) => item.checkedBy)
          .map((item) => [item.checkedBy?.id ?? "", item.checkedBy]),
      ).values(),
    ).filter((item): item is { id: string; name: string; email: string } => Boolean(item));

    return {
      items,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
      filters: {
        status: (filters.statuses ?? []).map((status) => status.toLowerCase()),
        priority: priorities,
        moderator: filters.moderatorPublicId ?? null,
        from: filters.from ?? null,
        to: filters.to ?? null,
        q: filters.query ?? "",
      },
      options: {
        moderators,
      },
    };
  }
}
