import React, { useEffect, useMemo, useState, useCallback } from "react";
import { LogOut, MapPin, Package, Plus, Star, Store, User as UserIcon, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { PartnerListingsPage } from "./PartnerListingsPage";
import { PartnerOrdersPage } from "./PartnerOrdersPage";
import { QuestionsPage } from "../partner/QuestionsPage";
import { YandexMapPicker } from "../../components/YandexMapPicker";

type UserType = "regular" | "partner";

type TabType =
  | "profile"
  | "addresses"
  | "orders"
  | "wishlist"
  | "partnership"
  | "partner-listings"
  | "partner-questions"
  | "partner-orders";

interface ProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
  userType: UserType;
  initialTab?: TabType;
  onWishlistUpdate?: (productId: string, isWishlisted: boolean) => void;
}

type City = {
  id: number;
  name: string;
  region: string;
};

type ProfileUser = {
  id: number;
  public_id: string;
  role: "regular" | "partner" | "admin";
  firstName: string;
  lastName: string;
  displayName: string;
  name: string;
  email: string;
  avatar?: string | null;
  city?: City | null;
  joinDate: string;
};

type Address = {
  id: string;
  name: string;
  city: City;
  street: string;
  building: string;
  postalCode: string;
  isDefault: boolean;
};

type OrderItem = {
  id: string;
  listingPublicId: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
};

type Order = {
  id: string;
  orderNumber: string;
  date: string;
  status: "processing" | "completed" | "cancelled" | "shipped";
  total: number;
  deliveryDate: string;
  deliveryAddress: string;
  deliveryCost: number;
  discount: number;
  seller: {
    name: string;
    avatar?: string | null;
    phone?: string;
    address?: string;
    workingHours?: string;
  };
  items: OrderItem[];
};

type WishlistItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  location?: string;
  condition?: "new" | "used";
  seller: string;
  addedDate: string;
};

type ProfilePayload = {
  user: ProfileUser;
  addresses: Address[];
  orders: Order[];
  wishlist: WishlistItem[];
};

const regularTabs: Array<{ id: TabType; label: string; icon: typeof UserIcon }> = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
  { id: "partnership", label: "Партнерство", icon: Store },
];

const partnerBaseTabs: Array<{ id: TabType; label: string; icon: typeof UserIcon }> = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
];

const partnerTabs: Array<{ id: TabType; label: string; icon: typeof Store }> = [
  { id: "partner-listings", label: "Объявления", icon: Store },
  { id: "partner-questions", label: "Вопросы", icon: Package },
  { id: "partner-orders", label: "Заказы", icon: Package },
];

export function ProfilePage({ onBack, onLogout, userType, initialTab, onWishlistUpdate }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? "profile");
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [allCities, setAllCities] = useState<City[]>([]);

  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    oldPassword: "",
    newPassword: "",
  });

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({
    name: "",
    cityId: null as number | null,
    street: "",
    building: "",
    postalCode: "",
  });

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [itemToReview, setItemToReview] = useState<OrderItem | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: "" });

  const [partnershipForm, setPartnershipForm] = useState({
    sellerType: "company" as "company" | "private",
    name: "",
    email: "",
    contact: "",
    link: "",
    category: "",
    inn: "",
    geography: "",
    socialProfile: "",
    credibility: "",
    whyUs: "",
  });

  const tabs = useMemo(
    () => (userType === "partner" ? [...partnerBaseTabs, ...partnerTabs] : regularTabs),
    [userType],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(userType === "partner" ? "partner-listings" : "profile");
    }
  }, [activeTab, tabs, userType]);

  const fetchCities = useCallback(async () => {
    try {
      const citiesData = await apiGet<City[]>("/catalog/cities");
      setAllCities(citiesData);
    } catch (error) {
      console.error("Error fetching cities:", error);
    }
  }, []);

  const resolveCityId = useCallback((cityName: string): number | undefined => {
    const city = allCities.find(c => c.name === cityName);
    return city?.id;
  }, [allCities]);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<ProfilePayload>("/profile/me");
      setProfile(data.user);
      setAddresses(data.addresses);
      setOrders(data.orders);
      setWishlistItems(data.wishlist);
      setProfileForm({
        firstName: data.user.firstName || "",
        lastName: data.user.lastName || "",
        displayName: data.user.displayName || data.user.name || "",
        email: data.user.email,
        oldPassword: "",
        newPassword: "",
      });
      setPartnershipForm((prev) => ({
        ...prev,
        name: data.user.displayName || data.user.name,
        email: data.user.email,
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить профиль");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCities();
    void loadProfile();
  }, [fetchCities, loadProfile]);

  const handlePostReview = async () => {
    if (!itemToReview) return;
    if (reviewForm.rating === 0) {
      alert("Пожалуйста, поставьте оценку.");
      return;
    }
    if (reviewForm.comment.trim().length < 3) {
      alert("Комментарий слишком короткий.");
      return;
    }

    try {
      await apiPost(`/profile/listings/${itemToReview.listingPublicId}/review`, {
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      alert("Спасибо за ваш отзыв!");
      setReviewModalOpen(false);
      setItemToReview(null);
      setReviewForm({ rating: 0, comment: "" });
      // Optionally, refetch orders or update state to show "review submitted"
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось отправить отзыв.");
    }
  };

  const saveProfile = async () => {
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        displayName: profileForm.displayName,
        email: profileForm.email,
      };

      if (profileForm.newPassword) {
        payload.oldPassword = profileForm.oldPassword;
        payload.newPassword = profileForm.newPassword;
      }

      await apiPatch<{ success: boolean }>("/profile/me", payload);
      await loadProfile();
      alert("Профиль обновлен");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaveLoading(false);
    }
  };

  const createAddress = async () => {
    if (!addressForm.name || !addressForm.cityId || !addressForm.street) {
      alert("Заполните обязательные поля адреса");
      return;
    }

    try {
      await apiPost<Address>("/profile/addresses", {
        name: addressForm.name,
        cityId: addressForm.cityId,
        street: addressForm.street,
        building: addressForm.building,
        postalCode: addressForm.postalCode,
        isDefault: addresses.length === 0,
      });
      setAddressModalOpen(false);
      setAddressForm({ name: "", cityId: null, street: "", building: "", postalCode: "" });
      await loadProfile();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось добавить адрес");
    }
  };

  const deleteAddress = async (id: string) => {
    try {
      await apiDelete<{ success: boolean }>(`/profile/addresses/${id}`);
      await loadProfile();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось удалить адрес");
    }
  };

  const setDefaultAddress = async (id: string) => {
    try {
      await apiPost<{ success: boolean }>(`/profile/addresses/${id}/default`);
      await loadProfile();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось установить адрес по умолчанию");
    }
  };

  const handleAddressSelectFromMap = (address: {
    city: string;
    street: string;
    building: string;
    postalCode: string;
  }) => {
    const cityId = resolveCityId(address.city);
    if (cityId === undefined) {
        alert(`Город "${address.city}" не найден в списке доступных городов. Пожалуйста, выберите город из списка или добавьте его.`);
        return;
    }
    setAddressForm(prev => ({
        ...prev,
        cityId,
        street: address.street,
        building: address.building,
        postalCode: address.postalCode,
    }));
  };

  const removeWishlistItem = async (id: string) => {
    try {
      await apiDelete<{ success: boolean }>(`/profile/wishlist/${id}`);
      setWishlistItems((prev) => prev.filter((item) => item.id !== id));
      // Обновляем глобальное состояние вишлиста
      onWishlistUpdate?.(id, false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось удалить из избранного");
    }
  };

  const submitPartnershipRequest = async () => {
    if (!partnershipForm.name || !partnershipForm.email || !partnershipForm.contact || !partnershipForm.link || !partnershipForm.category || !partnershipForm.whyUs) {
      alert("Заполните обязательные поля заявки");
      return;
    }

    try {
      const response = await apiPost<{ success: boolean; request_id: string }>("/profile/partnership-requests", partnershipForm);
      alert(`Заявка отправлена: ${response.request_id}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось отправить заявку");
    }
  };

  const renderProfileTab = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Настройки профиля</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={profileForm.firstName}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
          placeholder="Имя"
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
        <input
          value={profileForm.lastName}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, lastName: event.target.value }))}
          placeholder="Фамилия"
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
      <input
        value={profileForm.displayName}
        onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
        placeholder="Отображаемое имя"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
      />
      <input
        value={profileForm.email}
        onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
        placeholder="Email"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="password"
          value={profileForm.oldPassword}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, oldPassword: event.target.value }))}
          placeholder="Старый пароль"
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
        <input
          type="password"
          value={profileForm.newPassword}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, newPassword: event.target.value }))}
          placeholder="Новый пароль"
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
      <button
        onClick={() => void saveProfile()}
        disabled={saveLoading}
        className="px-4 py-2 bg-[rgb(38,83,141)] text-white rounded-lg disabled:bg-gray-400"
      >
        {saveLoading ? "Сохраняем..." : "Сохранить изменения"}
      </button>
    </div>
  );

  const renderAddressesTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Адреса доставки</h3>
        <button
          onClick={() => setAddressModalOpen(true)}
          className="px-3 py-2 bg-[rgb(38,83,141)] text-white rounded-lg flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      <div className="space-y-3">
        {addresses.map((address) => (
          <div key={address.id} className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{address.name} {address.isDefault && <span className="text-xs text-green-600">(по умолчанию)</span>}</div>
                <div className="text-sm text-gray-600">
                  {address.city.region}, {address.city.name}, {address.street}, {address.building}, {address.postalCode}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!address.isDefault && (
                  <button onClick={() => void setDefaultAddress(address.id)} className="text-xs px-2 py-1 border rounded">По умолчанию</button>
                )}
                <button onClick={() => void deleteAddress(address.id)} className="text-xs px-2 py-1 border rounded text-red-600">Удалить</button>
              </div>
            </div>
          </div>
        ))}
        {addresses.length === 0 && <div className="text-sm text-gray-500">Нет сохраненных адресов</div>}
      </div>

      {addressModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg flex flex-col h-[90vh] md:h-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Новый адрес</h4>
              <button onClick={() => setAddressModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto">
              <input value={addressForm.name} onChange={(event) => setAddressForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Название адреса" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <select
                value={addressForm.cityId ?? ""}
                onChange={(event) => setAddressForm((prev) => ({ ...prev, cityId: Number(event.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Выберите город</option>
                {allCities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} ({city.region})
                  </option>
                ))}
              </select>
              <input value={addressForm.street} onChange={(event) => setAddressForm((prev) => ({ ...prev, street: event.target.value }))} placeholder="Улица" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.building} onChange={(event) => setAddressForm((prev) => ({ ...prev, building: event.target.value }))} placeholder="Дом / квартира" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.postalCode} onChange={(event) => setAddressForm((prev) => ({ ...prev, postalCode: event.target.value }))} placeholder="Индекс" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <div className="h-64 mt-3">
                <YandexMapPicker onAddressSelect={handleAddressSelectFromMap} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => void createAddress()} className="flex-1 py-2 bg-[rgb(38,83,141)] text-white rounded-lg">Сохранить</button>
              <button onClick={() => setAddressModalOpen(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderOrdersTab = () => (
    <div className="space-y-3">
      <h3 className="text-xl font-semibold">История заказов</h3>
      {orders.map((order) => (
        <div key={order.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{order.orderNumber}</div>
              <div className="text-xs text-gray-500">{new Date(order.date).toLocaleString("ru-RU")}</div>
              <div className="text-sm text-gray-600">Продавец: {order.seller.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm">{order.total.toLocaleString("ru-RU")} ₽</div>
              <div className="text-xs text-gray-500">Статус: {order.status}</div>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">{item.price.toLocaleString("ru-RU")} ₽ x {item.quantity}</p>
                </div>
                {order.status === "completed" && (
                  <button
                    onClick={() => {
                      setItemToReview(item);
                      setReviewModalOpen(true);
                    }}
                    className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100"
                  >
                    Оставить отзыв
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {orders.length === 0 && <div className="text-sm text-gray-500">Заказов пока нет</div>}

      {reviewModalOpen && itemToReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Отзыв о товаре</h4>
              <button onClick={() => setReviewModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-medium mb-2">{itemToReview.name}</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm">Ваша оценка:</p>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setReviewForm(prev => ({ ...prev, rating: star }))}>
                      <Star
                        className={`w-6 h-6 cursor-pointer ${
                          star <= reviewForm.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={reviewForm.comment}
                onChange={(e) => setReviewForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Напишите ваш комментарий..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => void handlePostReview()} className="flex-1 py-2 bg-[rgb(38,83,141)] text-white rounded-lg">Отправить отзыв</button>
              <button onClick={() => setReviewModalOpen(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderWishlistTab = () => (
    <div className="space-y-3">
      <h3 className="text-xl font-semibold">Избранные товары</h3>
      {wishlistItems.map((item) => (
        <div key={item.id} className="border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />
          <div className="flex-1">
            <div className="font-medium">{item.name}</div>
            <div className="text-sm text-gray-600">{item.price.toLocaleString("ru-RU")} ₽ • {item.seller}</div>
          </div>
          <button onClick={() => void removeWishlistItem(item.id)} className="text-sm text-red-600 hover:underline">Удалить</button>
        </div>
      ))}
      {wishlistItems.length === 0 && <div className="text-sm text-gray-500">Избранное пусто</div>}
    </div>
  );

  const renderPartnershipTab = () => (
    <div className="space-y-3">
      <h3 className="text-xl font-semibold">Заявка на партнерство</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          value={partnershipForm.sellerType}
          onChange={(event) => setPartnershipForm((prev) => ({ ...prev, sellerType: event.target.value as "company" | "private" }))}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="company">Компания</option>
          <option value="private">Частный продавец</option>
        </select>
        <input value={partnershipForm.name} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Название / ФИО" className="px-3 py-2 border border-gray-300 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={partnershipForm.email} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" className="px-3 py-2 border border-gray-300 rounded-lg" />
        <input value={partnershipForm.contact} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, contact: event.target.value }))} placeholder="Контакт" className="px-3 py-2 border border-gray-300 rounded-lg" />
      </div>
      <input value={partnershipForm.link} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, link: event.target.value }))} placeholder="Ссылка на сайт/профиль" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      <input value={partnershipForm.category} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Категория" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      <input value={partnershipForm.inn} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, inn: event.target.value }))} placeholder="ИНН (опционально)" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      <textarea value={partnershipForm.whyUs} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, whyUs: event.target.value }))} placeholder="Почему хотите работать с нами" rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      <button onClick={() => void submitPartnershipRequest()} className="px-4 py-2 bg-[rgb(38,83,141)] text-white rounded-lg">Отправить заявку</button>
    </div>
  );

  const renderPartnerTab = () => {
    if (activeTab === "partner-listings") return <PartnerListingsPage />;
    if (activeTab === "partner-questions") return <QuestionsPage />;
    if (activeTab === "partner-orders") return <PartnerOrdersPage />;
    return null;
  };

  const renderActiveTab = () => {
    if (activeTab === "profile") return renderProfileTab();
    if (activeTab === "addresses") return renderAddressesTab();
    if (activeTab === "orders") return renderOrdersTab();
    if (activeTab === "wishlist") return renderWishlistTab();
    if (activeTab === "partnership") return renderPartnershipTab();
    return renderPartnerTab();
  };

  if (isLoading) {
    return <div className="pt-28 max-w-[1200px] mx-auto px-4 text-gray-500">Загрузка профиля...</div>;
  }

  return (
    <div className="min-h-screen app-shell pb-16 pt-24 md:pt-28">
      <div className="page-container">
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <aside className="surface-card h-fit lg:w-80 p-4">
            <button onClick={onBack} className="back-link mb-4 text-sm">← На главную</button>

            <div className="mb-4 flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-full bg-gray-200">
                {userType !== "partner" && profile?.avatar ? (
                  <img src={profile.avatar} alt={profile.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <UserIcon className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold">{profile?.displayName || profile?.name}</div>
                <div className="text-xs text-gray-500">На Ecomm с {profile?.joinDate} года</div>
              </div>
            </div>

            {userType === "partner" ? (
              <div className="mb-4 space-y-4">
                <div>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Базовые</p>
                  <div className="space-y-1">
                    {partnerBaseTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                            activeTab === tab.id ? "bg-[rgb(38,83,141)] text-white" : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Партнерские</p>
                  <div className="space-y-1">
                    {partnerTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                            activeTab === tab.id ? "bg-[rgb(38,83,141)] text-white" : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 space-y-1">
                {regularTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                        activeTab === tab.id ? "bg-[rgb(38,83,141)] text-white" : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={onLogout}
              className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </aside>

          <main className="surface-card flex-1 p-4 md:p-6">
            {renderActiveTab()}
          </main>
        </div>
      </div>
    </div>
  );
}