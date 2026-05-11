import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog, notifyError } from "../../../shared/ui/notifications";
import {
  fetchComplaintDetail,
  fetchComplaintSellerSummary,
  fetchComplaintStats,
  fetchComplaints,
  fetchRelatedListingComplaints,
  updateComplaintStatus,
} from "./complaints.api";
import type {
  ComplaintDetail,
  ComplaintListResponse,
  ComplaintStatsResponse,
  ComplaintStatusFilter,
  ComplaintSortBy,
  DetailTab,
  FiltersState,
  RelatedListingComplaint,
  SellerSummaryResponse,
  StatusAction,
} from "./complaints.types";
import {
  defaultComplaintFilters,
  defaultListFilters,
  defaultListOptions,
  defaultListSort,
  defaultPagination,
  getComplaintDecisionLocked,
  makeIdempotencyKey,
} from "./complaints.utils";

export function useComplaintsPage() {
  const [filters, setFilters] = useState<FiltersState>(defaultComplaintFilters);
  const [stats, setStats] = useState<ComplaintStatsResponse>({
    total: 0,
    new: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [listData, setListData] = useState<ComplaintListResponse>({
    items: [],
    pagination: defaultPagination,
    sort: defaultListSort,
    filters: defaultListFilters,
    options: defaultListOptions,
  });
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintDetail | null>(null);
  const [relatedListingComplaints, setRelatedListingComplaints] = useState<RelatedListingComplaint[]>(
    [],
  );
  const [sellerSummary, setSellerSummary] = useState<SellerSummaryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [moderatorComment, setModeratorComment] = useState("");
  const [isActionLoading, setIsActionLoading] = useState<StatusAction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const listQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.search.trim()) params.set("q", filters.search.trim());
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
    params.set("sortBy", filters.sortBy);
    params.set("sortOrder", filters.sortOrder);
    return params.toString();
  }, [filters]);

  const statsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("q", filters.search.trim());
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    return params.toString();
  }, [filters.from, filters.search, filters.to]);

  const loadComplaints = useCallback(async () => {
    const response = await fetchComplaints(listQueryString);
    setListData(response);

    setSelectedComplaintId((previous) => {
      if (response.items.length === 0) {
        setIsDetailOpen(false);
        return null;
      }
      if (previous && response.items.some((item) => item.id === previous)) {
        return previous;
      }
      return response.items[0].id;
    });
  }, [listQueryString]);

  const loadStats = useCallback(async () => {
    const response = await fetchComplaintStats(statsQueryString);
    setStats(response);
  }, [statsQueryString]);

  const loadComplaintDetails = useCallback(async (complaintId: string) => {
    const [detail, related, seller] = await Promise.all([
      fetchComplaintDetail(complaintId),
      fetchRelatedListingComplaints(complaintId),
      fetchComplaintSellerSummary(complaintId),
    ]);

    setSelectedComplaint(detail);
    setRelatedListingComplaints(related.items);
    setSellerSummary(seller);
    setModeratorComment(detail.actionTaken ?? "");
  }, []);

  useEffect(() => {
    Promise.all([loadComplaints(), loadStats()]).catch((error) => {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить жалобы");
    });
  }, [loadComplaints, loadStats]);

  useEffect(() => {
    if (!selectedComplaintId) {
      setSelectedComplaint(null);
      setRelatedListingComplaints([]);
      setSellerSummary(null);
      return;
    }

    loadComplaintDetails(selectedComplaintId).catch((error) => {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить детали жалобы");
    });
  }, [loadComplaintDetails, selectedComplaintId]);

  useEffect(() => {
    if (!isDetailOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailOpen]);

  const setStatusFilter = (status: ComplaintStatusFilter) => {
    setFilters((previous) => ({ ...previous, status, page: 1 }));
  };

  const setSearch = (search: string) => {
    setFilters((previous) => ({ ...previous, search, page: 1 }));
  };

  const setFromDate = (from: string) => {
    setFilters((previous) => ({ ...previous, from, page: 1 }));
  };

  const setToDate = (to: string) => {
    setFilters((previous) => ({ ...previous, to, page: 1 }));
  };

  const toggleSort = (sortBy: ComplaintSortBy) => {
    setFilters((previous) => {
      if (previous.sortBy === sortBy) {
        return {
          ...previous,
          sortOrder: previous.sortOrder === "desc" ? "asc" : "desc",
          page: 1,
        };
      }

      return {
        ...previous,
        sortBy,
        sortOrder: "desc",
        page: 1,
      };
    });
  };

  const goToPreviousPage = () => {
    setFilters((previous) => ({
      ...previous,
      page: Math.max(1, previous.page - 1),
    }));
  };

  const goToNextPage = () => {
    setFilters((previous) => ({
      ...previous,
      page: previous.page + 1,
    }));
  };

  const openDetail = (complaintId: string) => {
    setSelectedComplaintId(complaintId);
    setActiveTab("overview");
    setIsDetailOpen(true);
  };

  const closeDetail = () => {
    setIsDetailOpen(false);
  };

  const selectRelatedComplaint = (complaintId: string) => {
    setSelectedComplaintId(complaintId);
    setActiveTab("overview");
  };

  const handleUpdateStatus = async (nextStatus: StatusAction) => {
    if (!selectedComplaint || isActionLoading || getComplaintDecisionLocked(selectedComplaint.status)) {
      return;
    }

    const confirmationMessage =
      nextStatus === "approved"
        ? "Подтвердить нарушение? Это необратимое действие."
        : "Отклонить жалобу?";

    const isConfirmed = await confirmDialog({
      title: "Подтвердите действие",
      description: confirmationMessage,
      confirmLabel: "Подтвердить",
      cancelLabel: "Отмена",
      confirmTone: nextStatus === "approved" ? "danger" : "default",
    });

    if (!isConfirmed) return;

    setIsActionLoading(nextStatus);
    try {
      await updateComplaintStatus({
        complaintId: selectedComplaint.id,
        status: nextStatus,
        actionTaken: moderatorComment.trim() || null,
        idempotencyKey: makeIdempotencyKey(selectedComplaint.id, nextStatus),
      });

      await Promise.all([
        loadComplaints(),
        loadStats(),
        loadComplaintDetails(selectedComplaint.id),
      ]);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось обновить жалобу");
    } finally {
      setIsActionLoading(null);
    }
  };

  return {
    filters,
    stats,
    listData,
    selectedComplaintId,
    selectedComplaint,
    relatedListingComplaints,
    sellerSummary,
    activeTab,
    moderatorComment,
    isActionLoading,
    isDetailOpen,
    setActiveTab,
    setModeratorComment,
    setStatusFilter,
    setSearch,
    setFromDate,
    setToDate,
    toggleSort,
    goToPreviousPage,
    goToNextPage,
    openDetail,
    closeDetail,
    selectRelatedComplaint,
    updateStatus: handleUpdateStatus,
  };
}
