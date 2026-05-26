import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, XCircle } from "lucide-react";
import { AppModal } from "../../../shared/ui/app-modal";
import { notifyInfo } from "../../../shared/ui/notifications";
import { REVIEW_TABS } from "./sellers.constants";
import { DetailLinkList, DetailRow, DetailSection } from "./SellerDetailPrimitives";
import { SellerStatusBadge } from "./SellerStatusBadge";
import type { PartnershipRequest, ReviewAction, ReviewTab } from "./sellers.types";
import {
  authorityTypeLabel,
  categoryRiskLabel,
  deriveAllowedActions,
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
  const allowedActions = request.allowedActions ?? deriveAllowedActions(request.status);
  const hasFinalDecision = request.status === "approved" || request.status === "rejected";
  const requiresNote = action === "needs_more_info" || action === "rejected";
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
    if (!allowedActions.includes(action)) {
      notifyInfo("Это действие больше недоступно для текущего статуса заявки.");
      setAction(null);
      return;
    }
    if (requiresNote && note.trim().length < 3) {
      notifyInfo("Укажите комментарий модератора.");
      return;
    }
    onAction(action, note.trim());
  };

  const reviewActions: Array<{ value: ReviewAction; label: string; className: string }> = [
    { value: "approved_limited", label: "Ограниченно", className: "btn-success-soft" },
    { value: "approved", label: "Одобрить", className: "btn-success-soft" },
    { value: "needs_more_info", label: "Уточнить", className: "btn-secondary" },
    { value: "rejected", label: "Отклонить", className: "btn-danger-soft" },
  ];

  const reviewActionControls = (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {reviewActions.map((item) => {
          const isVisuallyLocked =
            hasFinalDecision ||
            (request.status === "approved_limited" && item.value === "approved_limited");
          const isAllowed = !isVisuallyLocked && allowedActions.includes(item.value);
          const buttonClassName = isAllowed
            ? `${item.className} ${action === item.value ? "ring-2 ring-[rgb(38,83,141)]" : ""}`
            : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400";
          return (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              if (isAllowed) setAction(item.value);
            }}
            className={`${buttonClassName} px-3 py-2 text-xs sm:text-sm`}
            disabled={busy || !isAllowed}
            title={
              isAllowed
                ? undefined
                : hasFinalDecision
                  ? "Для этой заявки уже принято окончательное решение"
                  : item.value === "approved_limited" && request.status === "approved_limited"
                    ? "Ограниченное одобрение уже было применено"
                    : "Это действие больше недоступно для текущего статуса заявки"
            }
          >
            {item.label}
          </button>
          );
        })}
      </div>

      <div className="text-xs text-slate-500">
        После ограниченного одобрения дальнейшее ручное повышение или снятие партнёрства
        доступно во вкладке «Пользователи».
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
                <DetailLinkList label="Публичные профили" urls={profile.publicProfileUrls} />
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
              <DetailRow label="Основание полномочий" value={authorityTypeLabel(profile.authorityType)} />
              <DetailRow label="Телефон представителя" value={profile.representativePhone} />
              <DetailRow label="Email представителя" value={profile.representativeEmail} />
              <DetailRow label="Рабочий телефон компании / ИП" value={profile.supportPhone} />
              <DetailRow label="Рабочий email компании / ИП" value={profile.supportEmail || profile.businessEmail} />
              <DetailRow label="Часы связи / поддержки" value={profile.serviceHours} />
              <DetailRow label="Доверенность / документ" value={profile.authorityDocument} />
            </DetailSection>
          )}

          {activeTab === "sales" && profile && (
            <>
            <DetailSection title="Продажи и правила платформы">
              <DetailRow
                label="Описание бизнеса и происхождение товара"
                value={profile.productSourceType || profile.businessRole}
              />
              <DetailRow label="Категории" value={joinList(profile.categories)} />
              <DetailRow label="Мощность в месяц" value={profile.monthlyCapacity} />
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
                  <div className="rounded-lg bg-white p-2">Каналы: {evaluation?.channelsScore ?? "-"}</div>
                  <div className="rounded-lg bg-white p-2">Продажи: {evaluation?.salesScore ?? "-"}</div>
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
