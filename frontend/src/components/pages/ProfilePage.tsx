import React, { useEffect, useMemo, useState } from "react";
import { LogOut, MapPin, Package, Plus, Settings, Star, Store, User as UserIcon, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { AchievementsPage } from "../partner/AchievementsPage";
import { PartnerListingsPage } from "./PartnerListingsPage";
import { PartnerOrdersPage } from "./PartnerOrdersPage";
import { QuestionsPage } from "../partner/QuestionsPage";

type UserType = "regular" | "partner";

type TabType =
  | "profile"
  | "addresses"
  | "orders"
  | "wishlist"
  | "partnership"
  | "partner-listings"
  | "partner-questions"
  | "partner-orders"
  | "partner-achievements";

interface ProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
  userType: UserType;
  initialTab?: TabType;
}

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
  city?: string | null;
  joinDate: string;
};

type Address = {
  id: string;
  name: string;
  region: string;
  city: string;
  street: string;
  building: string;
  postalCode: string;
  isDefault: boolean;
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
  items: Array<{
    id: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
  }>;
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

const baseTabsRegular: Array<{ id: TabType; label: string; icon: typeof UserIcon }> = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
  { id: "partnership", label: "Партнерство", icon: Store },
];

const partnerTabs: Array<{ id: TabType; label: string; icon: typeof Store }> = [
  { id: "partner-achievements", label: "Геймификация", icon: Star },
  { id: "partner-listings", label: "Объявления", icon: Store },
  { id: "partner-questions", label: "Вопросы", icon: Package },
  { id: "partner-orders", label: "Заказы", icon: Package },
];

export function ProfilePage({ onBack, onLogout, userType, initialTab }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? "profile");
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

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
    region: "",
    city: "",
    street: "",
    building: "",
    postalCode: "",
  });

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
    () => (userType === "partner" ? [...baseTabsRegular, ...partnerTabs] : baseTabsRegular),
    [userType],
  );

  const loadProfile = async () => {
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
  };

  useEffect(() => {
    void loadProfile();
  }, []);

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
    if (!addressForm.name || !addressForm.city || !addressForm.street) {
      alert("Заполните обязательные поля адреса");
      return;
    }

    try {
      await apiPost<Address>("/profile/addresses", {
        name: addressForm.name,
        region: addressForm.region,
        city: addressForm.city,
        street: addressForm.street,
        building: addressForm.building,
        postalCode: addressForm.postalCode,
        isDefault: addresses.length === 0,
      });
      setAddressModalOpen(false);
      setAddressForm({ name: "", region: "", city: "", street: "", building: "", postalCode: "" });
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

  const removeWishlistItem = async (id: string) => {
    try {
      await apiDelete<{ success: boolean }>(`/profile/wishlist/${id}`);
      setWishlistItems((prev) => prev.filter((item) => item.id !== id));
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
                  {address.region}, {address.city}, {address.street}, {address.building}, {address.postalCode}
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Новый адрес</h4>
              <button onClick={() => setAddressModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={addressForm.name} onChange={(event) => setAddressForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Название адреса" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.region} onChange={(event) => setAddressForm((prev) => ({ ...prev, region: event.target.value }))} placeholder="Регион" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.city} onChange={(event) => setAddressForm((prev) => ({ ...prev, city: event.target.value }))} placeholder="Город" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.street} onChange={(event) => setAddressForm((prev) => ({ ...prev, street: event.target.value }))} placeholder="Улица" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.building} onChange={(event) => setAddressForm((prev) => ({ ...prev, building: event.target.value }))} placeholder="Дом / квартира" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={addressForm.postalCode} onChange={(event) => setAddressForm((prev) => ({ ...prev, postalCode: event.target.value }))} placeholder="Индекс" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
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
          <div className="text-sm text-gray-700 mt-2">{order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</div>
        </div>
      ))}
      {orders.length === 0 && <div className="text-sm text-gray-500">Заказов пока нет</div>}
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
    if (activeTab === "partner-achievements") return <AchievementsPage />;
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
    <div className="pt-24 md:pt-28 pb-16 bg-gray-50 min-h-screen">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-80 bg-white border border-gray-200 rounded-2xl p-4 h-fit">
            <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900 mb-4">← На главную</button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden">
                {profile?.avatar ? (
                  <img src={profile.avatar} alt={profile.displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <UserIcon className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div>
                <div className="font-semibold">{profile?.displayName || profile?.name}</div>
                <div className="text-xs text-gray-500">На Ecomm с {profile?.joinDate} года</div>
              </div>
            </div>

            <div className="space-y-1 mb-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 ${
                      activeTab === tab.id ? "bg-[rgb(38,83,141)] text-white" : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={onLogout}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 text-gray-700 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Выйти
            </button>
          </aside>

          <main className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 md:p-6">
            {renderActiveTab()}
          </main>
        </div>
      </div>
    </div>
  );
}
