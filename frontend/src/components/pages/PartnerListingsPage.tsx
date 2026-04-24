import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Edit2, Eye, EyeOff, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { ConfirmDialog, ToastViewport, type AppNotice } from "../ui/feedback";
import type { Address } from "./profile.models";

type ListingAttribute = { key: string; value: string };
type ListingType = "products" | "services";
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Listing = {
  id: string;
  title: string;
  price: number;
  condition: "new" | "used";
  status: "active" | "inactive" | "moderation";
  views: number;
  created_at: string;
  image: string;
  images?: string[];
  description?: string | null;
  category?: string;
  city?: string | null;
  attributes?: ListingAttribute[];
  moderation?: { status: "approved" | "pending" | "rejected" };
};

type FormState = {
  title: string;
  price: string;
  condition: "new" | "used";
  description: string;
  category: string;
  type: ListingType;
  meetingAddress: string;
  images: string[];
};

type CatalogCategoryDto = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string; items: string[] }>;
};

type ProfileAddressDto = Pick<Address, "id" | "fullAddress" | "city" | "isDefault">;
type CategoryGuessDto = { category: string | null; confidence: number; source?: "listing" | "catalog" };

type PartnerListingsPageProps = {
  onRequestAddressChange?: () => void;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
const MAX_IMAGES = 10;
const MIN_IMAGES = 1;
const META_ATTR_MEETING_ADDRESS = "__meeting_address";
const PHOTO_RECOMMENDATION_TEXT =
  "Рекомендуемый размер фото: от 1200×900 px (соотношение 4:3).";

const STEP_TITLE: Record<WizardStep, string> = {
  1: "Внешний вид",
  2: "Укажите название",
  3: "Тип и категория",
  4: "Состояние",
  5: "Опишите товар",
  6: "Адрес",
  7: "Цена и публикация",
};

function extractCategoryOptions(data: CatalogCategoryDto[]): string[] {
  const set = new Set<string>(data.map((category) => category.name.trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function getMetaAttribute(attrs: ListingAttribute[] | undefined, key: string): string {
  return attrs?.find((x) => x.key === key)?.value ?? "";
}

function buildInitialForm(type: ListingType): FormState {
  return {
    title: "",
    price: "",
    condition: "new",
    description: "",
    category: "",
    type,
    meetingAddress: "",
    images: [],
  };
}

export function PartnerListingsPage({ onRequestAddressChange }: PartnerListingsPageProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "moderation">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [listingTypeFilter, setListingTypeFilter] = useState<ListingType>("products");
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [addressBook, setAddressBook] = useState<string[]>([]);
  const [defaultProfileAddress, setDefaultProfileAddress] = useState<ProfileAddressDto | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isGuessingCategory, setIsGuessingCategory] = useState(false);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [isDeleteBusy, setIsDeleteBusy] = useState(false);
  const [titlePickedFromSuggestion, setTitlePickedFromSuggestion] = useState(false);
  const [preservedAttributes, setPreservedAttributes] = useState<ListingAttribute[]>([]);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<FormState | null>(null);
  const [inlinePreservedAttributes, setInlinePreservedAttributes] = useState<ListingAttribute[]>([]);
  const [isInlineSaving, setIsInlineSaving] = useState(false);

  const [form, setForm] = useState<FormState>(() => buildInitialForm("products"));

  const showNotice = useCallback((message: string, tone: AppNotice["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1_000);
    setNotices((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const closeNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const loadListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<Listing[]>(`/partner/listings?type=${listingTypeFilter}`);
      setListings(data);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось загрузить объявления", "error");
    } finally {
      setIsLoading(false);
    }
  }, [listingTypeFilter, showNotice]);

  const loadCategories = useCallback(async (type: ListingType) => {
    try {
      const data = await apiGet<CatalogCategoryDto[]>(`/catalog/categories?type=${type}`);
      const options = extractCategoryOptions(data);
      setCategoryOptions(options);
      setForm((prev) => {
        if (prev.type !== type) return prev;
        if (prev.category && options.includes(prev.category)) return prev;
        return { ...prev, category: "" };
      });
    } catch {
      setCategoryOptions([]);
      setForm((prev) => ({ ...prev, category: "" }));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const addressesData = await apiGet<ProfileAddressDto[]>("/profile/addresses");
        const normalizedAddresses = addressesData
          .map((address) => ({
            ...address,
            fullAddress: address.fullAddress?.trim() ?? "",
            city: address.city?.trim() ?? "",
          }))
          .filter((address) => address.fullAddress);
        setAddressBook(Array.from(new Set(normalizedAddresses.map((address) => address.fullAddress))));
        setDefaultProfileAddress(
          normalizedAddresses.find((address) => address.isDefault) ?? normalizedAddresses[0] ?? null,
        );
      } catch {
        setAddressBook([]);
        setDefaultProfileAddress(null);
      }
    })();
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (!showModal) return;
    void loadCategories(form.type);
  }, [showModal, form.type, loadCategories]);

  useEffect(() => {
    void loadCategories(listingTypeFilter);
  }, [listingTypeFilter, loadCategories]);

  useEffect(() => {
    if (!showModal || step !== 2 || titlePickedFromSuggestion) {
      setTitleSuggestions([]);
      return;
    }
    const q = form.title.trim();
    if (q.length < 2) {
      setTitleSuggestions([]);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        setIsSuggestionsLoading(true);
        const res = await apiGet<string[]>(`/partner/listings/title-suggestions?q=${encodeURIComponent(q)}&type=${encodeURIComponent(form.type)}`);
        const normalized = q.toLocaleLowerCase("ru-RU");
        const next = Array.from(new Set(res.map((x) => x.trim()).filter(Boolean))).filter(
          (x) => x.toLocaleLowerCase("ru-RU") !== normalized,
        ).slice(0, 8);
        if (!cancelled) setTitleSuggestions(next);
      } catch {
        if (!cancelled) setTitleSuggestions([]);
      } finally {
        if (!cancelled) setIsSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [form.title, form.type, showModal, step, titlePickedFromSuggestion]);

  const guessCategoryByTitle = useCallback(async (title: string, type: ListingType) => {
    try {
      setIsGuessingCategory(true);
      const guessed = await apiGet<CategoryGuessDto>(
        `/partner/listings/category-guess?title=${encodeURIComponent(title)}&type=${encodeURIComponent(type)}`,
      );
      if (!guessed.category) return;
      const normalized = guessed.category.trim().toLocaleLowerCase("ru-RU");
      if (!normalized) return;
      setForm((prev) => {
        const matched = categoryOptions.find(
          (option) => option.toLocaleLowerCase("ru-RU") === normalized,
        );
        if (!matched) return prev;
        return { ...prev, category: matched };
      });
    } catch {
      // Ignore guess errors silently - user can select category manually.
    } finally {
      setIsGuessingCategory(false);
    }
  }, [categoryOptions]);

  const filteredListings = useMemo(() => listings.filter((listing) => {
    const statusOk = statusFilter === "all" || listing.status === statusFilter;
    return statusOk && matchesSearch(listing, searchQuery);
  }), [listings, searchQuery, statusFilter]);

  const stats = useMemo(() => ({
    total: listings.length,
    active: listings.filter((x) => x.status === "active").length,
    moderation: listings.filter((x) => x.status === "moderation").length,
    inactive: listings.filter((x) => x.status === "inactive").length,
  }), [listings]);

  const hasMeetingAddress = form.meetingAddress.trim().length >= 5;
  const isStep6Ready = hasMeetingAddress;

  const openCreate = () => {
    setInlineEditingId(null);
    setInlineForm(null);
    setInlinePreservedAttributes([]);
    const defaultAddressValue = defaultProfileAddress?.fullAddress?.trim() ?? "";
    setForm({
      ...buildInitialForm(listingTypeFilter),
      meetingAddress: defaultAddressValue,
    });
    setPreservedAttributes([]);
    setTitlePickedFromSuggestion(false);
    setTitleSuggestions([]);
    setStep(1);
    setShowModal(true);
  };

  const handleChangeAddress = () => {
    if (onRequestAddressChange) {
      onRequestAddressChange();
      return;
    }
    window.location.assign("/profile/addresses");
  };

  const openEdit = (listing: Listing) => {
    if (inlineEditingId === listing.id) {
      cancelInlineEdit();
      return;
    }
    setInlineEditingId(listing.id);
    setInlineForm({
      title: listing.title,
      price: String(listing.price),
      condition: listing.condition,
      description: listing.description ?? "",
      category: listing.category ?? "",
      type: listingTypeFilter,
      meetingAddress: getMetaAttribute(listing.attributes, META_ATTR_MEETING_ADDRESS),
      images: listing.images && listing.images.length > 0 ? listing.images : listing.image ? [listing.image] : [],
    });
    setInlinePreservedAttributes((listing.attributes ?? []).filter((x) => x.key !== META_ATTR_MEETING_ADDRESS));
  };

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        showNotice(`Файл ${file.name} не является изображением`, "error");
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        showNotice(`Файл ${file.name} больше 3 МБ`, "error");
        return;
      }
    }

    const encoded = await Promise.all(files.map((file) => fileToDataUrl(file)));
    setForm((prev) => ({ ...prev, images: Array.from(new Set([...prev.images, ...encoded])).slice(0, MAX_IMAGES) }));
  };

  const removeImage = (index: number) => {
    if (form.images.length <= MIN_IMAGES) {
      showNotice("Нужно оставить минимум 1 фотографию", "info");
      return;
    }
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const validateStep = (s: WizardStep): string | null => {
    if (s === 1 && form.images.length === 0) return "Добавьте хотя бы одну фотографию";
    if (s === 2 && form.title.trim().length < 2) return "Укажите название объявления";
    if (s === 3 && !form.category) return "Выберите категорию";
    if (s === 5 && form.description.trim().length < 10) return "Описание должно быть не короче 10 символов";
    if (s === 6) {
      if (form.meetingAddress.trim().length < 5) return "Не найден адрес по умолчанию. Добавьте адрес доставки";
    }
    if (s === 7) {
      const price = Number(form.price);
      if (!Number.isFinite(price) || price <= 0) return "Укажите корректную цену";
    }
    return null;
  };

  const nextStep = () => {
    const err = validateStep(step);
    if (err) {
      showNotice(err, "info");
      return;
    }
    if (step < 7) setStep((prev) => (prev + 1) as WizardStep);
  };

  const prevStep = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as WizardStep);
      return;
    }
    setShowModal(false);
  };

  const save = () => {
    const err = validateStep(7);
    if (err) {
      showNotice(err, "info");
      return;
    }
    const snapshotForm = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      meetingAddress: form.meetingAddress.trim(),
      price: String(Math.round(Number(form.price))),
      images: [...form.images],
    };

    const attributes: ListingAttribute[] = [...preservedAttributes];
    if (snapshotForm.meetingAddress) {
      attributes.push({ key: META_ATTR_MEETING_ADDRESS, value: snapshotForm.meetingAddress });
    }

    const payload = {
      title: snapshotForm.title,
      price: Number(snapshotForm.price),
      condition: snapshotForm.condition,
      description: snapshotForm.description,
      category: snapshotForm.category,
      images: snapshotForm.images,
      attributes,
    };

    const optimisticCity = defaultProfileAddress?.city ?? null;

    const optimisticListing: Listing = {
      id: `tmp-${Date.now()}`,
      title: snapshotForm.title,
      price: Number(snapshotForm.price),
      condition: snapshotForm.condition,
      status: "moderation",
      views: 0,
      created_at: new Date().toISOString(),
      image: snapshotForm.images[0] ?? FALLBACK_IMAGE,
      images: snapshotForm.images,
      description: snapshotForm.description,
      category: snapshotForm.category,
      city: optimisticCity,
      attributes,
      moderation: { status: "pending" },
    };
    setListings((prev) => [optimisticListing, ...prev]);

    setShowModal(false);
    setStep(1);
    setTitleSuggestions([]);
    setTitlePickedFromSuggestion(false);

    void (async () => {
      try {
        await apiPost<Listing>("/partner/listings", {
          ...payload,
          type: snapshotForm.type,
        });

        if (listingTypeFilter !== snapshotForm.type) {
          setListingTypeFilter(snapshotForm.type);
          return;
        }

        await loadListings();
      } catch (error) {
        showNotice(error instanceof Error ? error.message : "Не удалось сохранить объявление", "error");
        await loadListings();
      }
    })();
  };

  const remove = (id: string) => {
    setDeleteCandidateId(id);
  };

  const confirmRemove = async () => {
    if (!deleteCandidateId) return;
    setIsDeleteBusy(true);
    try {
      await apiDelete<{ success: boolean }>(`/partner/listings/${deleteCandidateId}`);
      await loadListings();
      showNotice("Объявление удалено", "success");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось удалить объявление", "error");
    } finally {
      setIsDeleteBusy(false);
      setDeleteCandidateId(null);
    }
  };

  const toggleStatus = async (listing: Listing) => {
    try {
      await apiPost<{ success: boolean }>(`/partner/listings/${listing.id}/toggle-status`);
      await loadListings();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось сменить статус", "error");
    }
  };

  const inlineAddressSuggestions = useMemo(() => {
    if (!inlineForm) return [];
    const q = inlineForm.meetingAddress.trim().toLocaleLowerCase("ru-RU");
    if (!q) return addressBook.slice(0, 8);
    return addressBook.filter((x) => x.toLocaleLowerCase("ru-RU").includes(q)).slice(0, 8);
  }, [addressBook, inlineForm]);

  const cancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineForm(null);
    setInlinePreservedAttributes([]);
  };

  const onInlineFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!inlineForm || !files.length) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        showNotice(`Файл ${file.name} не является изображением`, "error");
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        showNotice(`Файл ${file.name} больше 3 МБ`, "error");
        return;
      }
    }

    const encoded = await Promise.all(files.map((file) => fileToDataUrl(file)));
    setInlineForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        images: Array.from(new Set([...prev.images, ...encoded])).slice(0, MAX_IMAGES),
      };
    });
  };

  const removeInlineImage = (index: number) => {
    if (!inlineForm) return;
    if (inlineForm.images.length <= MIN_IMAGES) {
      showNotice("Нужно оставить минимум 1 фотографию", "info");
      return;
    }
    setInlineForm((prev) => {
      if (!prev) return prev;
      return { ...prev, images: prev.images.filter((_, i) => i !== index) };
    });
  };

  const saveInlineEdit = async (listing: Listing) => {
    if (!inlineForm) return;

    const title = inlineForm.title.trim();
    const description = inlineForm.description.trim();
    const meetingAddress = inlineForm.meetingAddress.trim();
    const price = Math.round(Number(inlineForm.price));

    if (title.length < 2) {
      showNotice("Укажите название объявления", "info");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      showNotice("Укажите корректную цену", "info");
      return;
    }
    if (!inlineForm.category) {
      showNotice("Выберите категорию", "info");
      return;
    }
    if (description.length < 10) {
      showNotice("Описание должно быть не короче 10 символов", "info");
      return;
    }
    if (meetingAddress.length < 5) {
      showNotice("Укажите адрес", "info");
      return;
    }
    if (inlineForm.images.length === 0) {
      showNotice("Добавьте хотя бы одну фотографию", "info");
      return;
    }

    const attributes: ListingAttribute[] = [...inlinePreservedAttributes];
    attributes.push({ key: META_ATTR_MEETING_ADDRESS, value: meetingAddress });

    const payload = {
      title,
      price,
      condition: inlineForm.condition,
      description,
      category: inlineForm.category,
      images: inlineForm.images,
      attributes,
    };

    const optimisticCity = listing.city ?? null;
    setListings((prev) =>
      prev.map((item) =>
        item.id === listing.id
          ? {
              ...item,
              title,
              price,
              condition: inlineForm.condition,
              description,
              category: inlineForm.category,
              city: optimisticCity,
              image: inlineForm.images[0] ?? item.image,
              images: inlineForm.images,
              status: "moderation",
            }
          : item,
      ),
    );

    setIsInlineSaving(true);
    cancelInlineEdit();
    try {
      await apiPatch<Listing>(`/partner/listings/${listing.id}`, payload);
      await loadListings();
      showNotice("Изменения сохранены", "success");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось сохранить изменения", "error");
      await loadListings();
    } finally {
      setIsInlineSaving(false);
    }
  };

  const getStatusLabel = (status: Listing["status"]) => {
    if (status === "active") return { label: "Активно", color: "bg-green-100 text-green-700" };
    if (status === "moderation") return { label: "На модерации", color: "bg-yellow-100 text-yellow-700" };
    return { label: "Неактивно", color: "bg-gray-100 text-gray-700" };
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <ToastViewport notices={notices} onClose={closeNotice} />
      <ConfirmDialog
        open={Boolean(deleteCandidateId)}
        title="Удалить объявление?"
        description="Объявление будет удалено без возможности восстановления."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        confirmTone="danger"
        confirmPhrase="УДАЛИТЬ"
        confirmHint="Введите «УДАЛИТЬ», чтобы подтвердить действие."
        isBusy={isDeleteBusy}
        onCancel={() => setDeleteCandidateId(null)}
        onConfirm={() => void confirmRemove()}
      />

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="dashboard-title">Мои объявления</h2>
          <p className="dashboard-subtitle">Управляйте карточками, статусами и видимостью</p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5">
          <Plus className="h-4 w-4" /> Создать
        </button>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat"><div className="dashboard-stat__label">Всего</div><div className="dashboard-stat__value">{stats.total}</div></div>
        <div className="dashboard-stat dashboard-stat--ok"><div className="dashboard-stat__label">Активные</div><div className="dashboard-stat__value">{stats.active}</div></div>
        <div className="dashboard-stat dashboard-stat--warn"><div className="dashboard-stat__label">На модерации</div><div className="dashboard-stat__value">{stats.moderation}</div></div>
        <div className="dashboard-stat"><div className="dashboard-stat__label">Неактивные</div><div className="dashboard-stat__value">{stats.inactive}</div></div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск по названию, описанию и категории..." className="dashboard-search__input" />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="dashboard-select">
            <option value="all">Все статусы</option><option value="active">Активные</option><option value="inactive">Неактивные</option><option value="moderation">На модерации</option>
          </select>
          <select value={listingTypeFilter} onChange={(e) => setListingTypeFilter(e.target.value as ListingType)} className="dashboard-select">
            <option value="products">Товары</option><option value="services">Услуги</option>
          </select>
        </div>
      </div>

      {isLoading ? <div className="text-sm text-gray-500">Загрузка...</div> : (
        <div className="space-y-3">
          {filteredListings.map((listing) => {
            const status = getStatusLabel(listing.status);
            return (
              <article key={listing.id} className="dashboard-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    <img src={listing.image || FALLBACK_IMAGE} alt={listing.title} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900 md:text-base">{listing.title}</div>
                    <div className="text-sm text-gray-600">{listing.price.toLocaleString("ru-RU")} ₽</div>
                    <div className="text-xs text-gray-500">Просмотры: {listing.views}</div>
                    {listing.city && <div className="text-xs text-gray-500">{listing.city}</div>}
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className={`rounded-full px-2 py-1 text-xs ${status.color}`}>{status.label}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void toggleStatus(listing)}
                        disabled={isInlineSaving}
                        title={listing.status === "inactive" ? "Отправить повторно на проверку" : "Снять с публикации"}
                        className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {listing.status === "inactive" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => openEdit(listing)} className="rounded-lg p-2 hover:bg-gray-100">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void remove(listing.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
                <div
                  className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                    inlineEditingId === listing.id && inlineForm
                      ? "mt-4 grid-rows-[1fr] opacity-100"
                      : "mt-0 grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0">
                    {inlineEditingId === listing.id && inlineForm && (
                      <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Название</label>
                            <input
                              value={inlineForm.title}
                              onChange={(e) => setInlineForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                              className="field-control"
                              placeholder="Название объявления"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Цена</label>
                            <input
                              type="number"
                              value={inlineForm.price}
                              onChange={(e) => setInlineForm((prev) => (prev ? { ...prev, price: e.target.value } : prev))}
                              className="field-control"
                              placeholder="Цена, ₽"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Категория</label>
                            <select
                              value={inlineForm.category}
                              onChange={(e) => setInlineForm((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                              className="field-control"
                            >
                              <option value="">Выберите категорию</option>
                              {categoryOptions.map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Состояние</label>
                          <div className="grid gap-2 md:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => setInlineForm((prev) => (prev ? { ...prev, condition: "new" } : prev))}
                              className={`rounded-xl border px-3 py-2 text-sm text-left ${inlineForm.condition === "new" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white"}`}
                            >
                              Новое
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineForm((prev) => (prev ? { ...prev, condition: "used" } : prev))}
                              className={`rounded-xl border px-3 py-2 text-sm text-left ${inlineForm.condition === "used" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white"}`}
                            >
                              Б/у
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Описание</label>
                          <textarea
                            value={inlineForm.description}
                            onChange={(e) => setInlineForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                            className="field-control"
                            rows={5}
                            placeholder="Описание товара"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Адрес встречи</label>
                          <input
                            value={inlineForm.meetingAddress}
                            onChange={(e) => setInlineForm((prev) => (prev ? { ...prev, meetingAddress: e.target.value } : prev))}
                            className="field-control"
                            list={`address-suggest-${listing.id}`}
                            placeholder="Например: ул. Ленина, 15"
                          />
                          <datalist id={`address-suggest-${listing.id}`}>
                            {inlineAddressSuggestions.map((a) => <option key={a} value={a} />)}
                          </datalist>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Фотографии</label>
                          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <Upload className="h-4 w-4" />
                              Добавить фото
                              <input type="file" accept="image/*" multiple className="hidden" onChange={onInlineFilesSelected} />
                            </label>
                            <div className="text-xs text-gray-500">{PHOTO_RECOMMENDATION_TEXT}</div>

                            {inlineForm.images.length > 0 ? (
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {inlineForm.images.map((img, i) => (
                                  <div key={`${listing.id}-${i}-${img.slice(0, 20)}`} className="relative h-44 overflow-hidden rounded-xl border border-gray-200 bg-slate-100">
                                    <img src={img} alt={`Фото ${i + 1}`} className="h-full w-full object-contain" />
                                    <button
                                      type="button"
                                      onClick={() => removeInlineImage(i)}
                                      disabled={inlineForm.images.length <= MIN_IMAGES}
                                      className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                                      title={inlineForm.images.length <= MIN_IMAGES ? "Нужно оставить минимум 1 фото" : "Удалить фото"}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                                Фото пока не добавлены
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={cancelInlineEdit} className="btn-secondary px-4 py-2">
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveInlineEdit(listing)}
                            disabled={isInlineSaving}
                            className="btn-primary px-4 py-2 disabled:opacity-60"
                          >
                            {isInlineSaving ? "Сохраняем..." : "Сохранить изменения"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {filteredListings.length === 0 && <div className="dashboard-empty">Объявления не найдены</div>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="app-modal-panel app-modal-panel--md flex h-[90vh] flex-col p-0 md:h-auto">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <button type="button" onClick={prevStep} className="btn-secondary p-2"><ArrowLeft className="h-4 w-4" /></button>
              <div className="text-sm text-gray-600">{STEP_TITLE[step]} • шаг {step} из 7</div>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary p-2"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Внешний вид</h3>
                  <p className="text-sm text-gray-600">Добавьте несколько фотографий товара (до 10 файлов).</p>
                  <p className="text-xs text-gray-500">{PHOTO_RECOMMENDATION_TEXT}</p>
                  <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-700">
                    <Upload className="h-5 w-5" /><span>Загрузить фото</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={onFilesSelected} />
                  </label>
                  {form.images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {form.images.map((img, i) => (
                        <div key={`${i}-${img.slice(0, 24)}`} className="relative h-44 overflow-hidden rounded-xl border border-gray-200 bg-slate-100">
                          <img src={img} alt={`Фото ${i + 1}`} className="h-full w-full object-contain" />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            disabled={form.images.length <= MIN_IMAGES}
                            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                            title={form.images.length <= MIN_IMAGES ? "Нужно оставить минимум 1 фото" : "Удалить фото"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">Фото пока не добавлены</div>}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Укажите название</h3>
                  <input
                    value={form.title}
                    onChange={(e) => {
                      setTitlePickedFromSuggestion(false);
                      setForm((p) => ({ ...p, title: e.target.value }));
                    }}
                    className="field-control"
                    placeholder="Введите название"
                  />
                  {isSuggestionsLoading && <div className="text-sm text-gray-500">Ищем подсказки...</div>}
                  {!isSuggestionsLoading && titleSuggestions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-500">Похожие названия из системы:</div>
                      {titleSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setTitlePickedFromSuggestion(true);
                            setForm((p) => ({ ...p, title: s }));
                            setTitleSuggestions([]);
                            void guessCategoryByTitle(s, form.type);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {isGuessingCategory && (
                    <div className="text-xs text-gray-500">Подбираем категорию по похожим объявлениям...</div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Тип и категория</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm((p) => ({ ...p, type: "products" }))} className={`rounded-xl border px-3 py-2 text-sm ${form.type === "products" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white"}`}>Товар</button>
                    <button type="button" onClick={() => setForm((p) => ({ ...p, type: "services" }))} className={`rounded-xl border px-3 py-2 text-sm ${form.type === "services" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white"}`}>Услуга</button>
                  </div>
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="field-control">
                    <option value="">Выберите категорию</option>
                    {categoryOptions.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Состояние</h3>
                  <button type="button" onClick={() => setForm((p) => ({ ...p, condition: "new" }))} className={`w-full rounded-xl border px-4 py-3 text-left ${form.condition === "new" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white"}`}>Новое</button>
                  <button type="button" onClick={() => setForm((p) => ({ ...p, condition: "used" }))} className={`w-full rounded-xl border px-4 py-3 text-left ${form.condition === "used" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white"}`}>Б/у</button>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Опишите товар</h3>
                  <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="field-control" rows={8} placeholder="Подробно опишите состояние, комплектацию, особенности и дефекты" />
                </div>
              )}

              {step === 6 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Адрес</h3>
                  {hasMeetingAddress ? (
                    <>
                      <p className="text-sm text-gray-600">
                        Подтвердите адрес по умолчанию для встречи с покупателем.
                      </p>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                        {form.meetingAddress}
                      </div>
                      <div className="text-xs text-gray-500">
                        Если адрес не подходит, добавьте новый адрес доставки.
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      У вас пока нет адреса по умолчанию. Добавьте его в разделе адресов доставки.
                    </div>
                  )}
                  <button type="button" onClick={handleChangeAddress} className="btn-secondary px-4 py-2.5">
                    {hasMeetingAddress ? "Нет, изменить адрес" : "Добавить адрес"}
                  </button>
                </div>
              )}

              {step === 7 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold">Цена и публикация</h3>
                  <input type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} className="field-control" placeholder="Цена, ₽" />
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">Торг в карточке не предусмотрен. Общение с покупателем только через раздел «Вопросы и ответы».</div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <button type="button" onClick={prevStep} className="btn-secondary px-4 py-2.5">Назад</button>
                {step < 7 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={step === 6 && !isStep6Ready}
                    className="btn-primary flex-1 px-4 py-2.5 disabled:opacity-60"
                  >
                    Продолжить
                  </button>
                ) : (
                  <button type="button" onClick={save} className="btn-primary flex-1 px-4 py-2.5">Опубликовать</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
