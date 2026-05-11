import { createPortal } from "react-dom";
import { CheckCircle, CircleX, ExternalLink } from "lucide-react";
import { AppModal } from "../../../shared/ui/app-modal";
import { ScoreExplanation } from "../../../shared/ui/ScoreExplanation";
import type {
  ComplaintDetail,
  DetailTab,
  RelatedListingComplaint,
  SellerSummaryResponse,
  StatusAction,
} from "./complaints.types";
import {
  buildComplaintListingHref,
  buildComplaintQueueRows,
  buildComplaintRiskRows,
  complaintDetailTabs,
  complaintQueueNotes,
  complaintRiskNotes,
  formatDateTime,
  getComplaintDecisionLocked,
  getComplaintTypeLabel,
  getSellerSummaryView,
  getStatusClass,
  getStatusLabel,
} from "./complaints.utils";

export function ComplaintDetailModal({
  isOpen,
  complaint,
  relatedListingComplaints,
  sellerSummary,
  activeTab,
  moderatorComment,
  isActionLoading,
  onClose,
  onTabChange,
  onCommentChange,
  onSelectRelatedComplaint,
  onUpdateStatus,
}: {
  isOpen: boolean;
  complaint: ComplaintDetail | null;
  relatedListingComplaints: RelatedListingComplaint[];
  sellerSummary: SellerSummaryResponse | null;
  activeTab: DetailTab;
  moderatorComment: string;
  isActionLoading: StatusAction | null;
  onClose: () => void;
  onTabChange: (tab: DetailTab) => void;
  onCommentChange: (value: string) => void;
  onSelectRelatedComplaint: (complaintId: string) => void;
  onUpdateStatus: (status: StatusAction) => void;
}) {
  if (!isOpen || typeof document === "undefined") return null;

  const isComplaintDecisionLocked = getComplaintDecisionLocked(complaint?.status);
  const {
    sellerApprovalRate,
    sellerStatusValue,
    sellerBlockedUntilValue,
    sellerBlockReasonValue,
    hasSellerRestrictions,
  } = getSellerSummaryView(sellerSummary, complaint);

  return createPortal(
    <AppModal
      open={isOpen}
      onClose={onClose}
      size="lg"
      bodyClassName="app-modal__body--wide complaint-review-modal"
      footerClassName="complaint-review-modal__footer"
      footer={
        complaint ? (
          <div className="w-full">
            <div className="text-xs font-medium text-slate-500">Комментарий модератора</div>
            <textarea
              className="field-control mt-2 min-h-[88px] rounded-xl border-slate-200 bg-slate-50/40 focus:bg-white"
              rows={3}
              placeholder={
                isComplaintDecisionLocked
                  ? "Жалоба закрыта, редактирование недоступно"
                  : "Добавьте комментарий к решению"
              }
              value={moderatorComment}
              onChange={(event) => onCommentChange(event.target.value)}
              disabled={isComplaintDecisionLocked}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onUpdateStatus("rejected")}
                className={
                  isComplaintDecisionLocked
                    ? "flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-slate-300 bg-slate-100 py-2 text-sm text-slate-400"
                    : "btn-success-soft flex w-full items-center justify-center gap-1 py-2 text-sm"
                }
                disabled={isActionLoading !== null || isComplaintDecisionLocked}
              >
                <CircleX className="h-4 w-4" /> Отклонить
              </button>
              <button
                onClick={() => onUpdateStatus("approved")}
                className={
                  isComplaintDecisionLocked
                    ? "flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-slate-300 bg-slate-100 py-2 text-sm text-slate-400"
                    : "btn-danger-soft flex w-full items-center justify-center gap-1 py-2 text-sm"
                }
                disabled={isActionLoading !== null || isComplaintDecisionLocked}
              >
                <CheckCircle className="h-4 w-4" /> Подтвердить
              </button>
            </div>
            {isComplaintDecisionLocked ? (
              <div className="mt-2 text-xs text-amber-700">
                Жалоба зафиксирована со статусом «{complaint ? getStatusLabel(complaint.status) : ""}».
                Изменение решения недоступно.
              </div>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {!complaint ? (
        <div className="p-8 text-center text-sm text-slate-500">Загрузка деталей жалобы...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-start gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{complaint.id}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                  <span className="truncate">{complaint.listingTitle}</span>
                  <span className="shrink-0 text-slate-400">·</span>
                  <a
                    href={buildComplaintListingHref(complaint.listingId, complaint.listingUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-[rgb(38,83,141)] hover:underline"
                  >
                    Открыть объявление <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2.5 py-1 font-medium ${getStatusClass(complaint.status)}`}>
                {getStatusLabel(complaint.status)}
              </span>
              <ScoreExplanation
                label="Риск"
                value={complaint.riskScore}
                title="Как рассчитан риск жалобы"
                formula="riskScore = round(rawScore / 70 * 100)"
                rows={buildComplaintRiskRows(complaint)}
                notes={complaintRiskNotes(complaint)}
                tone={complaint.riskScore >= 60 ? "warning" : "neutral"}
              />
              <ScoreExplanation
                label="Балл очереди"
                value={complaint.queueScore}
                title="Как рассчитан балл очереди"
                formula="queueScore = riskScore + ageBoost + repeatBoost + listingBoost"
                rows={buildComplaintQueueRows(complaint)}
                notes={complaintQueueNotes(complaint)}
                tone={complaint.queueScore >= 50 ? "warning" : "neutral"}
              />
            </div>

            <div className="dashboard-chip-row mt-4">
              {complaintDetailTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`dashboard-chip ${activeTab === tab.id ? "dashboard-chip--active" : ""}`}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            {activeTab === "overview" ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Суть жалобы
                  </div>
                  <div className="mt-2 text-sm text-slate-800">
                    Тип: {getComplaintTypeLabel(complaint.complaintType)}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                    {complaint.description || "Описание не указано."}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Связанные жалобы по объявлению
                    </div>
                    <div className="text-xs text-slate-400">{relatedListingComplaints.length}</div>
                  </div>
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {relatedListingComplaints.map((relatedItem) => (
                      <button
                        key={relatedItem.id}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                          relatedItem.isCurrent
                            ? "border-[rgb(38,83,141)] bg-blue-50/50 text-[rgb(25,58,101)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        onClick={() => onSelectRelatedComplaint(relatedItem.id)}
                      >
                        {relatedItem.id} · {getComplaintTypeLabel(relatedItem.complaintType)} ·{" "}
                        {relatedItem.reporterName}
                      </button>
                    ))}
                    {relatedListingComplaints.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        Нет связанных жалоб
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "sanctions" ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Заявитель
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{complaint.reporterName}</div>
                  <div className="text-xs text-slate-600">{complaint.reporterEmail}</div>
                  <div className="mt-3 text-xs text-slate-500">
                    Жалоба создана: {formatDateTime(complaint.createdAt)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Продавец
                  </div>
                  <div className="mt-2 font-semibold text-slate-900">
                    {sellerSummary
                      ? `${sellerSummary.seller.name} (${sellerSummary.seller.email})`
                      : `${complaint.sellerName} (${complaint.sellerEmail})`}
                  </div>
                  {sellerSummary ? (
                    <>
                      <div className="mt-1 text-slate-700">
                        Жалобы: {sellerSummary.complaints.total} · Подтверждено:{" "}
                        {sellerSummary.complaints.approved} · Отклонено: {sellerSummary.complaints.rejected}
                      </div>
                      <div className="text-slate-700">
                        Кейсы (уникальные объявления): {sellerSummary.cases.total} · Подтверждено:{" "}
                        {sellerSummary.cases.approved} · Отклонено: {sellerSummary.cases.rejected}
                      </div>
                      <div className="text-slate-700">
                        Доля подтвержденных (по кейсам): {sellerApprovalRate}%
                      </div>
                      {sellerSummary.activeSanctionsCount > 0 ? (
                        <div className="text-slate-700">
                          Активные санкции: {sellerSummary.activeSanctionsCount}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-1 text-slate-700">Статистика по продавцу недоступна.</div>
                  )}
                  {hasSellerRestrictions ? (
                    <div className="mt-2 border-t border-slate-200 pt-2 text-slate-700">
                      <div>
                        Статус продавца: {sellerStatusValue === "blocked" ? "заблокирован" : "активен"}
                      </div>
                      {sellerBlockedUntilValue ? (
                        <div>Блокировка до: {formatDateTime(sellerBlockedUntilValue)}</div>
                      ) : null}
                      {sellerBlockReasonValue ? <div>Причина: {sellerBlockReasonValue}</div> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </AppModal>,
    document.body,
  );
}
