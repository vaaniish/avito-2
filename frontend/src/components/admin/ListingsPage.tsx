import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Search, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

type ListingStatus = "all" | "pending" | "approved" | "rejected";

type AdminListing = {
  id: string;
  title: string;
  sellerId: string;
  sellerName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  category: string;
  price: number;
  complaintsCount: number;
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
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          listing.id.toLowerCase().includes(query) ||
          listing.title.toLowerCase().includes(query) ||
          listing.sellerName.toLowerCase().includes(query);

        const matchesStatus = statusFilter === "all" || listing.status === statusFilter;
        return matchesSearch && matchesStatus;
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

    return <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>{labels[status]}</span>;
  };

  const moderate = async (listingId: string, status: "approved" | "rejected") => {
    try {
      await apiPatch<{ success: boolean }>(`/admin/listings/${listingId}/moderation`, { status });
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить модерацию");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 md:mb-2">Модерация объявлений</h1>
        <p className="text-xs md:text-sm lg:text-base text-gray-600">Контроль качества карточек и исключений</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 lg:gap-4">
        <div className="p-3 md:p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200">
          <div className="text-xs md:text-sm text-yellow-700 mb-1">На проверке</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-yellow-700">{stats.pending}</div>
        </div>
        <div className="p-3 md:p-4 bg-green-50 rounded-xl border-2 border-green-200">
          <div className="text-xs md:text-sm text-green-700 mb-1">Опубликовано</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-green-700">{stats.approved}</div>
        </div>
        <div className="p-3 md:p-4 bg-red-50 rounded-xl border-2 border-red-200">
          <div className="text-xs md:text-sm text-red-700 mb-1">Отклонено</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-red-700">{stats.rejected}</div>
        </div>
        <div className="p-3 md:p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
          <div className="text-xs md:text-sm text-blue-700 mb-1">Новых продавцов</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-blue-700">{stats.newSellers}</div>
        </div>
        <div className="p-3 md:p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
          <div className="text-xs md:text-sm text-orange-700 mb-1">С жалобами</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-orange-700">{stats.withComplaints}</div>
        </div>
      </div>

      <div className="p-3 md:p-4 lg:p-6 bg-white rounded-xl md:rounded-2xl border-2 border-gray-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по ID, названию или продавцу..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-9 md:pl-12 pr-3 md:pr-4 py-2 md:py-3 rounded-xl border border-gray-300"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {[
            { value: "pending", label: "На проверке" },
            { value: "approved", label: "Опубликовано" },
            { value: "rejected", label: "Отклонено" },
            { value: "all", label: "Все" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as ListingStatus)}
              className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap ${
                statusFilter === option.value ? "bg-[rgb(38,83,141)] text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredListings.map((listing) => (
          <div key={listing.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{listing.id} • {listing.title}</div>
                <div className="text-xs text-gray-500">{new Date(listing.createdAt).toLocaleString("ru-RU")}</div>
                <div className="text-xs text-gray-600">Продавец: {listing.sellerName} ({listing.sellerId})</div>
                <div className="text-xs text-gray-600">Категория: {listing.category} • {listing.price.toLocaleString("ru-RU")} ₽</div>
                <div className="text-xs text-gray-600">Флаги: {listing.autoFlags.join(", ") || "нет"}</div>
                <div className="text-xs text-gray-600">Жалоб: {listing.complaintsCount}</div>
              </div>

              <div className="flex items-center gap-2">
                {getStatusBadge(listing.status)}
                <button
                  onClick={() => void moderate(listing.id, "approved")}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> Одобрить
                </button>
                <button
                  onClick={() => void moderate(listing.id, "rejected")}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredListings.length === 0 && <div className="text-sm text-gray-500">Объявления не найдены</div>}
      </div>
    </div>
  );
}
