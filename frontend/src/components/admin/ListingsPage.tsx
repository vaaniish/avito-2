import { useEffect, useMemo, useState } from "react";
import { CheckCircle, ExternalLink, Search, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { ScoreExplanation, type ScoreExplanationRow } from "./ScoreExplanation";
import { notifyError, notifyInfo, notifySuccess } from "../ui/notifications";

type ListingStatus = "all" | "pending" | "approved" | "rejected";
type QuickRiskFilter = "all" | "highRisk" | "contactPayment" | "photoRisk" | "newSeller";
type ModerationAction = "approved" | "rejected";

const SIGNAL_LABELS: Record<string, string> = {
  contact_details_detected: "контакты",
  offplatform_payment_detected: "обход оплаты",
  sexual_explicit_text_detected: "18+",
  violence_gore_text_detected: "насилие",
  drug_related_text_detected: "наркотики",
  weapon_related_text_detected: "оружие",
  scam_language_detected: "скам-формулировки",
  profanity_detected: "брань",
  spam_markers_detected: "спам",
  price_outlier: "странная цена",
  too_short_title: "короткий заголовок",
  too_short_description: "короткое описание",
  seller_new_account: "новый продавец",
  seller_not_verified: "неверифицирован",
  seller_has_complaints: "есть жалобы",
  seller_many_complaints: "много жалоб",
  trusted_seller_discount: "доверенный продавец",
  image_exact_duplicate: "дубли фото",
  image_near_duplicate: "похожие фото",
  image_low_contrast: "почти пустое/однотонное фото",
  image_low_resolution: "маленькое фото",
  image_similar_composition: "похожая композиция фото",
  suspicious_image_url_markers: "подозрительный URL фото",
  contacts_in_description: "контакты в описании",
  forbidden_words: "запрещенные слова",
  new_seller: "новый продавец",
  seller_with_complaints: "продавец с жалобами",
  multiple_reports: "несколько жалоб",
};

const LISTING_RISK_WEIGHTS: Record<string, { points: number; reason: string }> = {
  contact_details_detected: {
    points: 32,
    reason: "Высокий риск ухода сделки из платформы, но контакт сам по себе еще требует контекста.",
  },
  offplatform_payment_detected: {
    points: 45,
    reason: "Сильный сигнал обхода безопасной сделки и защиты оплаты.",
  },
  sexual_explicit_text_detected: {
    points: 70,
    reason: "Критическая категория: одного уверенного сигнала почти достаточно для жесткой реакции.",
  },
  violence_gore_text_detected: {
    points: 70,
    reason: "Критическая категория вредного контента с высоким приоритетом удаления.",
  },
  drug_related_text_detected: {
    points: 75,
    reason: "Самая жесткая категория: высокий юридический и пользовательский риск.",
  },
  weapon_related_text_detected: {
    points: 70,
    reason: "Критическая категория: объявление требует немедленной проверки или отклонения.",
  },
  scam_language_detected: {
    points: 50,
    reason: "Высокая вероятность мошенничества, но формулировки нужно сверить с контекстом.",
  },
  profanity_detected: {
    points: 20,
    reason: "Портит качество и безопасность коммуникации, но обычно слабее мошенничества.",
  },
  spam_markers_detected: {
    points: 15,
    reason: "Снижает качество объявления, но часто бывает шумным сигналом и требует контекста.",
  },
  suspicious_image_url_markers: {
    points: 20,
    reason: "Косвенный сигнал: URL может указывать на запрещенный или небезопасный контент.",
  },
  price_outlier: {
    points: 12,
    reason: "Слабая аномалия цены: сама по себе не должна блокировать объявление.",
  },
  too_short_title: {
    points: 10,
    reason: "Сигнал неполного или низкокачественного объявления.",
  },
  too_short_description: {
    points: 10,
    reason: "Недостаточно деталей для безопасной покупки, нужен ручной взгляд.",
  },
  image_exact_duplicate: {
    points: 14,
    reason: "Риск копирования карточки или массовой публикации чужих материалов.",
  },
  image_near_duplicate: {
    points: 14,
    reason: "Риск копирования или повторного размещения, но сигнал не абсолютный.",
  },
  image_low_resolution: {
    points: 8,
    reason: "Мягкий сигнал качества: плохое фото мешает проверке товара.",
  },
  image_low_contrast: {
    points: 6,
    reason: "Мягкий фото-сигнал: изображение может быть пустым или плохо проверяемым.",
  },
  image_similar_composition: {
    points: 6,
    reason: "Мягкий сигнал похожей композиции, полезен только вместе с другими факторами.",
  },
  seller_new_account: {
    points: 8,
    reason: "Слабый фактор доверия: у нового аккаунта меньше истории на платформе.",
  },
  seller_not_verified: {
    points: 6,
    reason: "Слабый фактор доверия: личность или бизнес продавца подтверждены хуже.",
  },
  seller_has_complaints: {
    points: 6,
    reason: "История жалоб слегка повышает риск, но еще не говорит о системной проблеме.",
  },
  seller_many_complaints: {
    points: 12,
    reason: "Несколько жалоб на продавца сильнее поднимают риск повторного нарушения.",
  },
  trusted_seller_discount: {
    points: -10,
    reason: "Снижает риск за зрелый аккаунт, верификацию, заказы и отсутствие жалоб.",
  },
};

function signalLabel(signal: string): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

function buildListingRiskRows(listing: AdminListing): ScoreExplanationRow[] {
  return listingSignals(listing)
    .map((signal) => {
      const weight = LISTING_RISK_WEIGHTS[signal];
      if (!weight) return null;
      return {
        label: signalLabel(signal),
        points: weight.points,
        reason: weight.reason,
      };
    })
    .filter((row): row is ScoreExplanationRow => row !== null);
}

function listingRiskNotes(listing: AdminListing): string[] {
  const signals = listingSignals(listing);
  const hasHardSignal = signals.some((signal) =>
    [
      "contact_details_detected",
      "offplatform_payment_detected",
      "sexual_explicit_text_detected",
      "violence_gore_text_detected",
      "drug_related_text_detected",
      "weapon_related_text_detected",
      "scam_language_detected",
    ].includes(signal),
  );
  return [
    "Итог округляется и ограничивается диапазоном 0..100.",
    "30+ баллов или любой жесткий сигнал отправляют объявление на ручную проверку.",
    "70+ баллов вместе с жестким нарушением могут привести к автоотклонению.",
    hasHardSignal
      ? "В этом объявлении есть жесткий сигнал, поэтому даже умеренный балл требует внимания."
      : "Жестких сигналов нет: решение сильнее зависит от суммы мягких факторов.",
  ];
}

function listingSignals(listing: AdminListing): string[] {
  return Array.from(new Set([...(listing.latestModeration?.signals ?? []), ...listing.autoFlags]));
}

function hasAnySignal(listing: AdminListing, signals: string[]): boolean {
  const set = new Set(listingSignals(listing));
  return signals.some((signal) => set.has(signal));
}

function compactSignals(listing: AdminListing, limit = 4): string[] {
  return listingSignals(listing).filter((signal) => signal !== "trusted_seller_discount").slice(0, limit);
}

function moderationListingUrl(listingUrl: string): string {
  const separator = listingUrl.includes("?") ? "&" : "?";
  return `${listingUrl}${separator}from=admin-listings`;
}

type AdminListing = {
  id: string;
  listingUrl: string;
  title: string;
  description: string | null;
  sellerId: string;
  sellerName: string;
  sellerStatus: "active" | "blocked";
  status: "pending" | "approved" | "rejected";
  listingStatus: "active" | "inactive" | "moderation";
  createdAt: string;
  category: string;
  city: string;
  region: string;
  price: number;
  salePrice: number | null;
  views: number;
  rating: number;
  complaintsCount: number;
  ordersCount: number;
  wishlistCount: number;
  questionsCount: number;
  autoFlags: string[];
  latestModeration: {
    id: string;
    decision: string;
    reasonCode: string;
    reasonNote: string | null;
    riskScore: number | null;
    signals: string[];
    createdAt: string;
  } | null;
};

type AdminListingModerationResponse = {
  success: boolean;
  status: "approved" | "pending" | "rejected";
  listingStatus: "active" | "inactive" | "moderation";
  activationBlockedByOrder?: boolean;
};

export function ListingsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListingStatus>("pending");
  const [quickRiskFilter, setQuickRiskFilter] = useState<QuickRiskFilter>("all");
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [rejectingListingId, setRejectingListingId] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [moderationInFlight, setModerationInFlight] = useState<{
    listingId: string;
    action: ModerationAction;
  } | null>(null);

  const loadListings = async () => {
    try {
      const result = await apiGet<AdminListing[]>("/admin/listings");
      setListings(result);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить объявления");
    }
  };

  useEffect(() => {
    void loadListings();
  }, []);

  const filteredListings = useMemo(
    () => {
      const filtered = listings.filter((listing) => {
        const matchesText = matchesSearch(listing, searchQuery);
        const matchesStatus = statusFilter === "all" || listing.status === statusFilter;
        const matchesQuickRisk =
          quickRiskFilter === "all" ||
          (quickRiskFilter === "highRisk" && (listing.latestModeration?.riskScore ?? 0) >= 70) ||
          (quickRiskFilter === "contactPayment" &&
            hasAnySignal(listing, [
              "contact_details_detected",
              "offplatform_payment_detected",
              "contacts_in_description",
              "forbidden_words",
            ])) ||
          (quickRiskFilter === "photoRisk" &&
            hasAnySignal(listing, [
              "image_exact_duplicate",
              "image_near_duplicate",
              "image_low_contrast",
              "image_low_resolution",
              "image_similar_composition",
              "suspicious_image_url_markers",
            ])) ||
          (quickRiskFilter === "newSeller" &&
            hasAnySignal(listing, ["seller_new_account", "new_seller"]));

        return matchesText && matchesStatus && matchesQuickRisk;
      });

      return filtered.sort((left, right) => {
        const leftRisk = left.latestModeration?.riskScore ?? 0;
        const rightRisk = right.latestModeration?.riskScore ?? 0;
        if (left.status === "pending" && right.status === "pending" && leftRisk !== rightRisk) {
          return rightRisk - leftRisk;
        }
        if (left.status !== right.status) {
          if (left.status === "pending") return -1;
          if (right.status === "pending") return 1;
        }
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
    },
    [listings, quickRiskFilter, searchQuery, statusFilter],
  );

  const stats = {
    pending: listings.filter((item) => item.status === "pending").length,
    approved: listings.filter((item) => item.status === "approved").length,
    rejected: listings.filter((item) => item.status === "rejected").length,
    newSellers: listings.filter((item) => item.autoFlags.includes("new_seller")).length,
    withComplaints: listings.filter((item) => item.complaintsCount > 0).length,
  };

  const applyModerationResult = (
    listingId: string,
    result: AdminListingModerationResponse,
  ) => {
    setListings((current) =>
      current.map((listing) =>
        listing.id === listingId
          ? {
              ...listing,
              status: result.status,
              listingStatus: result.listingStatus,
            }
          : listing,
      ),
    );
  };

  const moderateListing = async (
    listingId: string,
    status: ModerationAction,
    reasonNote?: string,
  ) => {
    setModerationInFlight({ listingId, action: status });
    try {
      const result = await apiPatch<AdminListingModerationResponse>(
        `/admin/listings/${encodeURIComponent(listingId)}/moderation`,
        {
          status,
          reasonCode:
            status === "approved"
              ? "ADMIN_APPROVED_MANUAL_REVIEW"
              : "ADMIN_REJECT_QUALITY_INCOMPLETE",
          reasonNote: reasonNote?.trim() || null,
        },
      );
      applyModerationResult(listingId, result);
      if (status === "rejected") {
        setRejectingListingId(null);
        setRejectionNotes((current) => {
          const next = { ...current };
          delete next[listingId];
          return next;
        });
      }
      notifySuccess(
        status === "approved"
          ? result.activationBlockedByOrder
            ? "Объявление одобрено, но осталось неактивным из-за заказа."
            : "Объявление одобрено."
          : "Объявление отклонено.",
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось обновить модерацию");
    } finally {
      setModerationInFlight(null);
    }
  };

  const openRejectForm = (listingId: string) => {
    setRejectingListingId(listingId);
    setRejectionNotes((current) => ({
      ...current,
      [listingId]: current[listingId] ?? "",
    }));
  };

  const submitReject = async (listingId: string) => {
    const note = (rejectionNotes[listingId] ?? "").trim();
    if (note.length < 3) {
      notifyInfo("Добавьте комментарий к отклонению.");
      return;
    }
    await moderateListing(listingId, "rejected", note);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Модерация объявлений</h1>
        <p className="dashboard-subtitle">Переходите в реальную карточку и проверяйте зафиксированные сигналы</p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--5">
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">На проверке</div>
          <div className="dashboard-stat__value">{stats.pending}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Опубликовано</div>
          <div className="dashboard-stat__value">{stats.approved}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Отклонено</div>
          <div className="dashboard-stat__value">{stats.rejected}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">Новых продавцов</div>
          <div className="dashboard-stat__value">{stats.newSellers}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">С жалобами</div>
          <div className="dashboard-stat__value">{stats.withComplaints}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            type="text"
            placeholder="Поиск по объявлению, продавцу, категории"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "pending", label: "На проверке" },
            { value: "approved", label: "Опубликовано" },
            { value: "rejected", label: "Отклонено" },
            { value: "all", label: "Все" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as ListingStatus)}
              className={`dashboard-chip ${statusFilter === option.value ? "dashboard-chip--active" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "all", label: "Все риски" },
            { value: "highRisk", label: "Высокий риск" },
            { value: "contactPayment", label: "Контакты/оплата" },
            { value: "photoRisk", label: "Фото" },
            { value: "newSeller", label: "Новый продавец" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setQuickRiskFilter(option.value as QuickRiskFilter)}
              className={`dashboard-chip ${quickRiskFilter === option.value ? "dashboard-chip--active" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredListings.map((listing) => {
          const signals = compactSignals(listing);
          const riskScore = listing.latestModeration?.riskScore ?? 0;
          const riskRows = buildListingRiskRows(listing);
          const isRejecting = rejectingListingId === listing.id;
          const note = rejectionNotes[listing.id] ?? "";
          const isApproving =
            moderationInFlight?.listingId === listing.id &&
            moderationInFlight.action === "approved";
          const isRejectSubmitting =
            moderationInFlight?.listingId === listing.id &&
            moderationInFlight.action === "rejected";
          const isModerationBusy = moderationInFlight?.listingId === listing.id;
          return (
            <div key={listing.id} className="dashboard-card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(listing.status)}
                    <ScoreExplanation
                      label="Риск"
                      value={riskScore}
                      title="Как рассчитан риск объявления"
                      formula="Сумма сработавших сигналов, затем округление и ограничение 0..100"
                      rows={riskRows}
                      notes={listingRiskNotes(listing)}
                      tone={riskScore >= 30 ? "warning" : "neutral"}
                    />
                    <span className="text-xs text-gray-500">
                      {new Date(listing.createdAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-950 break-words">
                    {listing.id} · {listing.title}
                  </div>
                  <div className="text-xs text-gray-600 break-words">
                    {listing.price.toLocaleString("ru-RU")} ₽ · {listing.category} · {listing.city}, {listing.region}
                  </div>
                  <div className="text-xs text-gray-600 break-words">
                    Продавец: {listing.sellerName} ({listing.sellerId}) · Жалобы: {listing.complaintsCount} · Заказы: {listing.ordersCount}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {signals.length > 0 ? (
                      signals.map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          {signalLabel(signal)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">Сигналов нет</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <a
                    href={moderationListingUrl(listing.listingUrl)}
                    className="btn-primary inline-flex items-center justify-center gap-1 px-4 py-2.5 text-sm"
                  >
                    Перейти к объявлению <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    className="btn-success-soft inline-flex items-center justify-center gap-1 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void moderateListing(listing.id, "approved")}
                    disabled={isModerationBusy}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {isApproving ? "Одобряем..." : "Одобрить объявление"}
                  </button>
                  <button
                    type="button"
                    className="btn-danger-soft inline-flex items-center justify-center gap-1 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => openRejectForm(listing.id)}
                    disabled={isModerationBusy}
                  >
                    <XCircle className="h-4 w-4" />
                    Отклонить объявление
                  </button>
                </div>
              </div>

              {isRejecting ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    Комментарий к отклонению
                  </label>
                  <textarea
                    className="field-control min-h-[104px] text-sm"
                    placeholder="Например: неполное описание, запрещённые контакты, некачественные фото"
                    value={note}
                    onChange={(event) =>
                      setRejectionNotes((current) => ({
                        ...current,
                        [listing.id]: event.target.value,
                      }))
                    }
                    maxLength={2000}
                    disabled={isRejectSubmitting}
                  />
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-slate-500">
                      {note.length} из 2 000
                    </span>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        className="btn-secondary px-4 py-2 text-sm"
                        onClick={() => setRejectingListingId(null)}
                        disabled={isRejectSubmitting}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="btn-danger-soft px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void submitReject(listing.id)}
                        disabled={isRejectSubmitting}
                      >
                        {isRejectSubmitting ? "Отклоняем..." : "Подтвердить отклонение"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {filteredListings.length === 0 && (
          <div className="dashboard-empty">Объявления не найдены</div>
        )}
      </div>
    </div>
  );
}

function getStatusBadge(status: Exclude<ListingStatus, "all">) {
  const styles = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-300",
    approved: "bg-green-100 text-green-700 border-green-300",
    rejected: "bg-red-100 text-red-700 border-red-300",
  };
  const labels = {
    pending: "На проверке",
    approved: "Опубликовано",
    rejected: "Отклонено",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
