import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Edit2, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { CityClient } from "../../types"; // Import CityClient

type Listing = {
  id: string;
  title: string;
  price: number;
  condition: "new" | "used";
  status: "active" | "inactive" | "moderation";
  views: number;
  created_at: string;
  image: string;
  description?: string | null;
  category?: string;
  city?: string; // Add city to Listing type
};

export function PartnerListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "moderation">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    price: "",
    condition: "new" as "new" | "used",
    description: "",
    category: "Электроника",
    image: "",
    cityId: null as number | null, // Changed from city: string
    type: "products" as "products" | "services",
  });
  const [allCities, setAllCities] = useState<CityClient[]>([]); // State to store all cities

  const fetchCities = useCallback(async () => {
    try {
      const citiesData = await apiGet<CityClient[]>("/catalog/cities");
      setAllCities(citiesData);
    } catch (error) {
      console.error("Error fetching cities:", error);
    }
  }, []);

  const resolveCityId = useCallback((cityName: string): number | undefined => {
    const city = allCities.find(c => c.name === cityName);
    return city?.id;
  }, [allCities]);

  const loadListings = async () => {
    setIsLoading(true);
    try {
      const result = await apiGet<Listing[]>(`/partner/listings?type=${formData.type}`);
      setListings(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить объявления");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCities(); // Fetch cities on mount
    void loadListings();
  }, [formData.type, fetchCities]);

  const filteredListings = useMemo(
    () =>
      listings.filter((listing) => {
        const matchesStatus = statusFilter === "all" || listing.status === statusFilter;
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          listing.title.toLowerCase().includes(query) ||
          (listing.description || "").toLowerCase().includes(query) ||
          (listing.category || "").toLowerCase().includes(query);
        return matchesStatus && matchesSearch;
      }),
    [listings, searchQuery, statusFilter],
  );

  const handleCreateNew = () => {
    setEditingListing(null);
    setFormData({
      title: "",
      price: "",
      condition: "new",
      description: "",
      category: "Электроника",
      image: "",
      cityId: resolveCityId("Москва") ?? null, // Resolve cityId for default "Москва"
      type: "products",
    });
    setShowModal(true);
  };

  const handleEdit = (listing: Listing) => {
    setEditingListing(listing);
    setFormData({
      title: listing.title,
      price: String(listing.price),
      condition: listing.condition,
      description: listing.description || "",
      category: listing.category || "Электроника",
      image: listing.image,
      cityId: resolveCityId(listing.city ?? "") ?? null, // Resolve cityId from existing listing.city
      type: formData.type,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.price || formData.cityId === null) {
      alert("Заполните обязательные поля: название, цена и город");
      return;
    }

    try {
      const payload: {
        title: string;
        price: number;
        condition: "new" | "used";
        description: string;
        category: string;
        image: string;
        cityId: number; // Use cityId
        type?: "products" | "services";
      } = {
        title: formData.title,
        price: Number(formData.price),
        condition: formData.condition,
        description: formData.description,
        category: formData.category,
        image: formData.image,
        cityId: formData.cityId,
      };

      if (editingListing) {
        await apiPatch<Listing>(`/partner/listings/${editingListing.id}`, payload);
      } else {
        payload.type = formData.type;
        await apiPost<Listing>("/partner/listings", payload);
      }

      setShowModal(false);
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось сохранить объявление");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить это объявление?")) return;

    try {
      await apiDelete<{ success: boolean }>(`/partner/listings/${id}`);
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось удалить объявление");
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      await apiPost<{ success: boolean }>(`/partner/listings/${id}/toggle-status`);
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось сменить статус");
    }
  };

  const getStatusLabel = (status: Listing["status"]) => {
    const statusMap = {
      active: { label: "Активно", color: "bg-green-100 text-green-700" },
      inactive: { label: "Неактивно", color: "bg-gray-100 text-gray-700" },
      moderation: { label: "На модерации", color: "bg-yellow-100 text-yellow-700" },
    };
    return statusMap[status];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3">
        <h2 className="text-2xl md:text-3xl text-gray-900">Мои объявления</h2>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-[rgb(38,83,141)] text-white rounded-xl hover:bg-[rgb(58,103,161)] transition-all duration-300"
        >
          <Plus className="w-4 h-4" /> Создать
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-200 mb-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск объявлений"
            className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
          <option value="moderation">На модерации</option>
        </select>

        <select
          value={formData.type}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, type: event.target.value as "products" | "services" }))
          }
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="products">Товары</option>
          <option value="services">Услуги</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {filteredListings.map((listing) => {
            const status = getStatusLabel(listing.status);
            return (
              <div key={listing.id} className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4">
                <img src={listing.image} alt={listing.title} className="w-16 h-16 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{listing.title}</div>
                  <div className="text-sm text-gray-600">{listing.price.toLocaleString("ru-RU")} ₽</div>
                  <div className="text-xs text-gray-500">Просмотры: {listing.views}</div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${status.color}`}>{status.label}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => void handleToggleStatus(listing.id)} className="p-2 rounded-lg hover:bg-gray-100">
                    {listing.status === "active" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleEdit(listing)} className="p-2 rounded-lg hover:bg-gray-100">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => void handleDelete(listing.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredListings.length === 0 && <div className="text-sm text-gray-500">Объявления не найдены</div>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">{editingListing ? "Редактировать" : "Создать"}</h3>
              <button onClick={() => setShowModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                value={formData.title}
                onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Название"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="number"
                value={formData.price}
                onChange={(event) => setFormData((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="Цена"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <textarea
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Описание"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={3}
              />
              <input
                value={formData.category}
                onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Категория"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                value={formData.image}
                onChange={(event) => setFormData((prev) => ({ ...prev, image: event.target.value }))}
                placeholder="URL изображения"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={formData.cityId ?? ""}
                onChange={(event) => setFormData((prev) => ({ ...prev, cityId: Number(event.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Выберите город</option>
                {allCities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} ({city.region})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => void handleSave()} className="flex-1 py-2 bg-[rgb(38,83,141)] text-white rounded-lg">
                Сохранить
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}