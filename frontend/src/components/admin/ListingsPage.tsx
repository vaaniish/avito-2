import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, ExternalLink, Search, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";

type ListingStatus = "all" | "pending" | "approved" | "rejected";

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
};

export function ListingsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListingStatus>("pending");
  const [listings, setListings] = useState<AdminListing[]>([]);

  const loadListings = async () => {
    try {
      const result = await apiGet<AdminListing[]>("/admin/listings");
      setListings(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить объявления");
    }
  };

  useEffect(() => {
    void loadListings();
  }, []);

  const filteredListings = useMemo(
    () =>
      listings.filter((listing) => {
        const matchesText = matchesSearch(listing, searchQuery);
        const matchesStatus =
          statusFilter === "all" || listing.status === statusFilter;
        return matchesText && matchesStatus;
      }),
    [listings, searchQuery, statusFilter],
  );

  const stats = {
    pending: listings.filter((item) => item.status === "pending").length,
    approved: listings.filter((item) => item.status === "approved").length,
    rejected: listings.filter((item) => item.status === "rejected").length,
    newSellers: listings.filter((item) => item.autoFlags.includes("new_seller")).length,
    withComplaints: listings.filter((item) => item.complaintsCount > 0).length,
  };

  const getStatusBadge = (status: Exclude<ListingStatus, "all">) => {
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
      <span
        className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  const moderate = async (listingId: string, status: "approved" | "rejected") => {
    try {
      await apiPatch<{ success: boolean }>(`/admin/listings/${listingId}/moderation`, {
        status,
      });
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить модерацию");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Модерация объявлений</h1>
        <p className="dashboard-subtitle">Контроль качества карточек и быстрый переход к объявлению</p>
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
            placeholder="Поиск по любому полю объявления"
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
              className={`dashboard-chip ${
                statusFilter === option.value ? "dashboard-chip--active" : ""
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredListings.map((listing) => (
          <div key={listing.id} className="dashboard-card">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words">
                  {listing.id} · {listing.title}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(listing.createdAt).toLocaleString("ru-RU")}
                </div>
                <div className="text-xs text-gray-600 break-words">
                  Продавец: {listing.sellerName} ({listing.sellerId}) · {listing.sellerStatus}
                </div>
                <div className="text-xs text-gray-600 break-words">
                  {listing.category} · {listing.city}, {listing.region}
                </div>
                <div className="text-xs text-gray-600 break-words">
                  Цена: {listing.price.toLocaleString("ru-RU")} ₽
                  {listing.salePrice ? ` → ${listing.salePrice.toLocaleString("ru-RU")} ₽` : ""}
                  {" · "}Рейтинг: {listing.rating.toFixed(1)}
                  {" · "}Просмотры: {listing.views}
                </div>
                <div className="text-xs text-gray-600 break-words">
                  Жалобы: {listing.complaintsCount} · Заказы: {listing.ordersCount} · Избранное:{" "}
                  {listing.wishlistCount} · Вопросы: {listing.questionsCount}
                </div>
                <div className="text-xs text-gray-600 break-words">
                  Флаги: {listing.autoFlags.join(", ") || "нет"}
                </div>
                <a
                  href={listing.listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-[rgb(38,83,141)] hover:underline"
                >
                  Открыть объявление <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {getStatusBadge(listing.status)}
                <button
                  onClick={() => void moderate(listing.id, "approved")}
                  className="btn-success-soft flex items-center gap-1 px-3 py-2 text-sm"
                >
                  <CheckCircle className="w-4 h-4" /> Одобрить
                </button>
                <button
                  onClick={() => void moderate(listing.id, "rejected")}
                  className="btn-danger-soft flex items-center gap-1 px-3 py-2 text-sm"
                >
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredListings.length === 0 && (
          <div className="dashboard-empty">Объявления не найдены</div>
        )}
      </div>
    </div>
  );
}

