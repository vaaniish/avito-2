import { ComplaintDetailModal } from "./complaints.modals";
import {
  ComplaintsListSection,
  ComplaintsStatsSection,
  ComplaintsToolbarSection,
} from "./complaints.sections";
import { useComplaintsPage } from "./complaints.hooks";

export function ComplaintsPage() {
  const {
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
    updateStatus,
  } = useComplaintsPage();

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Жалобы</h1>
        <p className="dashboard-subtitle">
          Очередь кейсов: сначала новые, затем подтверждение или отклонение.
        </p>
      </div>

      <ComplaintsStatsSection
        total={stats.total}
        next={stats.new}
        approved={stats.approved}
        rejected={stats.rejected}
      />

      <ComplaintsToolbarSection
        filters={filters}
        onSearchChange={setSearch}
        onStatusChange={setStatusFilter}
        onFromChange={setFromDate}
        onToChange={setToDate}
        onToggleSort={toggleSort}
      />

      <ComplaintsListSection
        items={listData.items}
        selectedComplaintId={selectedComplaintId}
        pagination={listData.pagination}
        onOpenDetail={openDetail}
        onPreviousPage={goToPreviousPage}
        onNextPage={goToNextPage}
      />

      <ComplaintDetailModal
        isOpen={isDetailOpen}
        complaint={selectedComplaint}
        relatedListingComplaints={relatedListingComplaints}
        sellerSummary={sellerSummary}
        activeTab={activeTab}
        moderatorComment={moderatorComment}
        isActionLoading={isActionLoading}
        onClose={closeDetail}
        onTabChange={setActiveTab}
        onCommentChange={setModeratorComment}
        onSelectRelatedComplaint={selectRelatedComplaint}
        onUpdateStatus={(status) => {
          void updateStatus(status);
        }}
      />
    </div>
  );
}
