import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, XCircle } from "lucide-react";
import { AppModal } from "../../ui/app-modal";
import { notifyInfo } from "../../ui/notifications";
import { REVIEW_TABS } from "./sellers.constants";
import { DetailLinkList, DetailRow, DetailSection } from "./SellerDetailPrimitives";
import { SellerStatusBadge } from "./SellerStatusBadge";
import type { PartnershipRequest, ReviewAction, ReviewTab } from "./sellers.types";
import {
  categoryRiskLabel,
  joinList,
  legalTypeLabel,
  recommendationLabel,
  requestInn,
  requestTitle,
} from "./sellers.utils";

export function SellerReviewModal({
  request,
  onClose,
  onAction,
  busy,
}: {
  request: PartnershipRequest;
  onClose: () => void;
  onAction: (action: ReviewAction, note: string) => void;
  busy: boolean;
}) {
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState("");
  const [activeTab, setActiveTab] = useState<ReviewTab>("business");
  const [actionsOpen, setActionsOpen] = useState(false);
  const profile = request.onboardingProfile;
  const evaluation = request.evaluation;
  const requiresNote = action === "needs_more_info" || action === "rejected" || (action === "approved" && !profile?.payoutVerified);
  const noteLabel = action === "approved" ? "Причина override для полного одобрения" : "Комментарий модератора";

  useEffect(() => {
    setAction(null);
    setNote("");
    setActiveTab("business");
    setActionsOpen(false);
  }, [request.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const submitAction = () => {
    if (!action) return;
    if (requiresNote && note.trim().length < 3) {
      notifyInfo("Укажите комментарий модератора.");
      return;
    }
    onAction(action, note.trim());
  };

  const reviewActions: Array<{ value: ReviewAction; label: string; className: string }> = [
    { value: "approved_limited", label: "Ограниченно", className: "btn-success-soft" },
    { value: "approved", label: "Одобрить", className: "btn-success-soft" },
    { value: "needs_more_info", label: "Документы", className: "btn-secondary" },
    { value: "rejected", label: "Отклонить", className: "btn-danger-soft" },
  ];

  const reviewActionControls = (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {reviewActions.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setAction(item.value)}
            className={`${item.className} px-3 py-2 text-xs sm:text-sm ${action === item.value ? "ring-2 ring-[rgb(38,83,141)]" : ""}`}
            disabled={busy}
          >
            {item.label}
          </button>
        ))}
      </div>

      {action && (
        <div className="mt-3 space-y-2">
          {requiresNote && (
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="field-control bg-white text-sm"
              placeholder={noteLabel}
            />
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => { setAction(null); setNote(""); }} disabled={busy}>
              Отмена
            </button>
            <button type="button" className="btn-primary px-3 py-2 text-sm disabled:opacity-50" onClick={submitAction} disabled={busy}>
              {busy ? "Сохраняем..." : "Применить"}
            </button>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(
    <AppModal
      open
      onClose={onClose}
      size="lg"
      bodyClassName="app-modal__body--wide"
      footer={
        <>
          <div className="hidden w-full sm:block">{reviewActionControls}</div>
          <div className="w-full sm:hidden">
            <button
              type="button"
              className="btn-secondary w-full px-3 py-2 text-sm"
              onClick={() => setActionsOpen((value) => !value)}
            >
              {actionsOpen ? "Скрыть действия" : "Действия модератора"}
            </button>
            {actionsOpen && <div className="mt-3">{reviewActionControls}</div>}
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{request.id}</span>
            <SellerStatusBadge status={request.status} />
          </div>
          <h2 className="break-words text-lg font-semibold text-slate-950 sm:text-xl">{requestTitle(request)}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">Score: {evaluation?.totalScore ?? "-"}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{recommendationLabel(evaluation?.recommendation)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">ИНН: {requestInn(request)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">Тип: {legalTypeLabel(profile?.legalType || request.sellerType)}</span>
          </div>
          <div className="mt-3 -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <div className="flex min-w-max gap-2">
              {REVIEW_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
                    activeTab === tab.value
                      ? "border-[rgb(38,83,141)] bg-[rgb(38,83,141)] text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {activeTab === "business" && profile && (
            <>
              <DetailSection title="Бизнес / DaData">
                <DetailRow label="Тип продавца" value={legalTypeLabel(profile.legalType)} />
                <DetailRow label="ИНН" value={profile.inn} />
                <DetailRow label={profile.legalType === "IP" ? "ОГРНИП" : "ОГРН"} value={profile.ogrn} />
                <DetailRow label="КПП" value={profile.kpp} />
                <DetailRow label="Юр. название" value={profile.legalName} />
                <DetailRow label="Статус регистрации" value={profile.registrationStatus} />
                <DetailRow label="Юр. адрес" value={profile.registeredAddress} />
                <DetailRow label="Налоговый регион" value={profile.taxRegion} />
                <DetailRow label="DaData lookup" value={profile.legalLookupVerified} />
                <DetailRow label="Сайт / основной профиль" value={profile.websiteUrl} />
                <DetailLinkList label="Публичные профили" urls={profile.publicProfileUrls} />
                <DetailRow label="Регион" value={profile.region} />
                <DetailRow label="Город" value={profile.city} />
              </DetailSection>

              <DetailSection title="Заявка">
                <DetailRow label="Заявитель" value={`${request.applicant.name} (${request.applicant.email})`} />
                <DetailRow label="Создано" value={new Date(request.createdAt).toLocaleString("ru-RU")} />
                <DetailRow label="Проверил" value={request.reviewedBy ? `${request.reviewedBy.name} (${request.reviewedBy.email})` : "Не указано"} />
                <DetailRow label="Комментарий / причина" value={request.rejectionReason || request.adminNote} />
              </DetailSection>
            </>
          )}

          {activeTab === "contacts" && profile && (
            <DetailSection title="Контакты и полномочия">
              <DetailRow label="ФИО" value={profile.representativeFullName} />
              <DetailRow label="Роль" value={profile.representativeRole} />
              <DetailRow label="Телефон" value={profile.representativePhone} />
              <DetailRow label="Email" value={profile.representativeEmail} />
              <DetailRow label="Бизнес email" value={profile.businessEmail} />
              <DetailRow label="Основание полномочий" value={profile.authorityType} />
              <DetailRow label="Доверенность / документ" value={profile.authorityDocument} />
              <DetailRow label="Метод домена" value={profile.domainOwnershipMethod} />
              <DetailRow label="Представитель подтверждён" value={profile.representativeVerified} />
              <DetailRow label="Email подтверждён" value={profile.emailVerified} />
              <DetailRow label="Домен подтверждён" value={profile.domainVerified} />
            </DetailSection>
          )}

          {activeTab === "sales" && profile && (
            <DetailSection title="Продажи">
              <DetailRow label="Чем занимается партнёр" value={profile.businessRole} />
              <DetailRow label="Категории" value={joinList(profile.categories)} />
              <DetailRow label="Модель доставки" value={profile.fulfillmentModel} />
              <DetailRow label="Адрес возврата" value={profile.returnAddress} />
              <DetailRow label="Телефон поддержки" value={profile.supportPhone} />
              <DetailRow label="Email поддержки" value={profile.supportEmail} />
              <DetailRow label="Часы поддержки" value={profile.serviceHours} />
              <DetailRow label="Мощность в месяц" value={profile.monthlyCapacity} />
              <DetailRow label="Лимит объявлений" value={profile.listingLimit} />
              <DetailRow label="Разрешённые категории" value={joinList(profile.allowedCategories)} />
            </DetailSection>
          )}

          {activeTab === "quality" && profile && (
            <>
              <DetailSection title="Качество и товар">
                <DetailRow label="Откуда товар" value={profile.productSourceType} />
                <DetailRow label="Документы происхождения" value={profile.supplierDocuments} />
                <DetailRow label="Гарантия, дней" value={profile.warrantyDays} />
                <DetailRow label="Возврат, дней" value={profile.returnDays} />
                <DetailRow label="Quality charter принят" value={profile.qualityCharterAccepted} />
                <DetailRow label="Риск категории" value={categoryRiskLabel(evaluation?.categoryRisk)} />
              </DetailSection>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Скоринг и checklist</h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
                    {recommendationLabel(evaluation?.recommendation)}
                  </span>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <div className="rounded-lg bg-white p-2">Юр: {evaluation?.legalIdentityScore ?? "-"}</div>
                  <div className="rounded-lg bg-white p-2">Предст: {evaluation?.representativeScore ?? "-"}</div>
                  <div className="rounded-lg bg-white p-2">Payout: {evaluation?.payoutScore ?? "-"}</div>
                  <div className="rounded-lg bg-white p-2">Качество: {evaluation?.qualityScore ?? "-"}</div>
                  <div className="rounded-lg bg-white p-2">Итого: {evaluation?.totalScore ?? "-"}</div>
                </div>
                {evaluation?.checklist?.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {evaluation.checklist.map((item) => (
                      <div key={item.key} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                        {item.passed ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                        <div>
                          <div className="font-medium text-slate-900">{item.label || item.key}</div>
                          <div className="text-xs text-slate-500">{item.key}: {item.passed ? "ok" : "fail"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Checklist не рассчитан.</div>
                )}
              </section>
            </>
          )}

          {activeTab === "business" && !profile && (
            <>
              <DetailSection title="Legacy заявка">
                <DetailRow label="Имя / компания" value={request.name} />
                <DetailRow label="Email" value={request.email} />
                <DetailRow label="Контакт" value={request.contact} />
                <DetailRow label="Ссылка" value={request.link} />
                <DetailRow label="Категория" value={request.category} />
                <DetailRow label="ИНН" value={request.inn} />
                <DetailRow label="География" value={request.geography} />
                <DetailRow label="Соц. профиль" value={request.socialProfile} />
                <DetailRow label="Доверие / документы" value={request.credibility} />
                <DetailRow label="Почему мы" value={request.whyUs} />
              </DetailSection>
              <DetailSection title="История">
                <DetailRow label="Аккаунт" value={`${request.applicant.name} (${request.applicant.email})`} />
                <DetailRow label="ID аккаунта" value={request.applicant.id} />
                <DetailRow label="Статус аккаунта" value={request.applicant.status} />
                <DetailRow label="Создано" value={new Date(request.createdAt).toLocaleString("ru-RU")} />
                <DetailRow label="Проверил" value={request.reviewedBy ? `${request.reviewedBy.name} (${request.reviewedBy.email})` : "Не указано"} />
                <DetailRow label="Дата ревью" value={request.reviewedAt ? new Date(request.reviewedAt).toLocaleString("ru-RU") : "Не указано"} />
                <DetailRow label="Комментарий админа" value={request.adminNote} />
                <DetailRow label="Причина отклонения" value={request.rejectionReason} />
              </DetailSection>
            </>
          )}

          {!profile && activeTab !== "business" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Это старая legacy-заявка без новой анкеты партнёрской валидации. Полные данные показаны во вкладке “1. Бизнес”.
            </div>
          )}
        </div>
      </div>
    </AppModal>,
    document.body,
  );
}
