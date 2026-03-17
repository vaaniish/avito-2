import React, { Suspense, lazy, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { LogOut, MapPin, Package, Plus, Star, Store, User as UserIcon, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { YandexMapPicker } from "../../components/YandexMapPicker";

type UserType = "regular" | "partner";

export type ProfileTab =
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
  initialTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  onWishlistUpdate?: (productId: string, isWishlisted: boolean) => void;
  onOpenListing?: (listingPublicId: string) => void;
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
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment?: string;
  entrance?: string;
  building?: string;
  postalCode: string;
  lat?: number | null;
  lon?: number | null;
  isDefault: boolean;
};

type AddressSuggestionOption = {
  label: string;
  value: string;
  postalCode?: string;
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  entrance?: string;
  lat?: number | null;
  lon?: number | null;
  formatted?: string;
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

const YANDEX_GEOSUGGEST_API_KEY =
  import.meta.env.VITE_YANDEX_GEOSUGGEST_API_KEY?.toString().trim() ?? "";
const FEDERAL_DISTRICT_RE = /\u0444\u0435\u0434\u0435\u0440\u0430\u043b\u044c\u043d\p{L}*\s+\u043e\u043a\u0440\u0443\u0433/iu;
const MUNICIPAL_FORMATION_RE =
  /\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b\u044c\u043d\p{L}*\s+\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u043d\p{L}*/iu;
const REGION_LEVEL_RE =
  /(?:\u043e\u0431\u043b\u0430\u0441\u0442\p{L}*|\u043a\u0440\u0430\u0439|\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\p{L}*|\u0430\u0432\u0442\u043e\u043d\u043e\u043c\p{L}*\s+\u043e\u0431\u043b\u0430\u0441\u0442\p{L}*|\u0430\u0432\u0442\u043e\u043d\u043e\u043c\p{L}*\s+\u043e\u043a\u0440\u0443\u0433)/iu;
const RUSSIAN_COUNTRY_RE = /(?:^|\b)(?:\u0440\u043e\u0441\u0441\u0438\p{L}*|russia|russian\s+federation)(?:$|\b)/iu;
const RUSSIA_BOUNDS: number[][] = [
  [41.185, 19.6389],
  [81.8587, 180],
];
const RUSSIA_BBOX = "19.6389,41.185~180,81.8587";

const normalizeAdministrativeLabel = (value: string) => {
  return value
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/\s+/g, " ")
    .trim();
};

const isFederalDistrict = (value: string) => {
  const normalized = normalizeAdministrativeLabel(value);
  return FEDERAL_DISTRICT_RE.test(value) || (normalized.includes("\u0444\u0435\u0434\u0435\u0440\u0430\u043b") && normalized.includes("\u043e\u043a\u0440\u0443\u0433"));
};

const isMunicipalFormation = (value: string) => {
  const normalized = normalizeAdministrativeLabel(value);
  return MUNICIPAL_FORMATION_RE.test(value) || (normalized.includes("\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b") && normalized.includes("\u043e\u0431\u0440\u0430\u0437\u043e\u0432"));
};

const isBroadAdministrativeUnit = (value: string) => isFederalDistrict(value) || isMunicipalFormation(value);

const isRussianCountry = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return true;
  return RUSSIAN_COUNTRY_RE.test(normalized);
};

const regularTabs: Array<{ id: ProfileTab; label: string; icon: typeof UserIcon }> = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
  { id: "partnership", label: "Партнерство", icon: Store },
];

const partnerBaseTabs: Array<{ id: ProfileTab; label: string; icon: typeof UserIcon }> = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
];

const partnerTabs: Array<{ id: ProfileTab; label: string; icon: typeof Store }> = [
  { id: "partner-listings", label: "Объявления", icon: Store },
  { id: "partner-questions", label: "Вопросы", icon: Package },
  { id: "partner-orders", label: "Заказы", icon: Package },
];

const PartnerListingsPage = lazy(() =>
  import("./PartnerListingsPage").then((module) => ({ default: module.PartnerListingsPage })),
);
const PartnerOrdersPage = lazy(() =>
  import("./PartnerOrdersPage").then((module) => ({ default: module.PartnerOrdersPage })),
);
const QuestionsPage = lazy(() =>
  import("../partner/QuestionsPage").then((module) => ({ default: module.QuestionsPage })),
);

export function ProfilePage({
  onBack,
  onLogout,
  userType,
  initialTab,
  onTabChange,
  onWishlistUpdate,
  onOpenListing,
}: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab ?? "profile");
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
    fullAddress: "",
    region: "",
    city: "",
    street: "",
    house: "",
    apartment: "",
    entrance: "",
    postalCode: "",
    lat: null as number | null,
    lon: null as number | null,
  });
  const [addressMapHint, setAddressMapHint] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestionOption[]>([]);
  const [isAddressInputFocused, setIsAddressInputFocused] = useState(false);
  const [addressSuggestionActiveIndex, setAddressSuggestionActiveIndex] = useState(-1);
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>(null);
  const addressBoundsCacheRef = useRef<Map<string, number[][] | null>>(new Map());
  const addressSuggestionsCacheRef = useRef<Map<string, AddressSuggestionOption[]>>(new Map());
  const addressSuggestionsRequestSeqRef = useRef(0);
  const addressInputBlurTimeoutRef = useRef<number | null>(null);
  const isSelectingAddressSuggestionRef = useRef(false);

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

  const handleOpenListing = useCallback(
    (listingPublicId: string) => {
      const normalizedListingId = listingPublicId.trim();
      if (!normalizedListingId) return;
      if (onOpenListing) {
        onOpenListing(normalizedListingId);
        return;
      }
      window.location.assign(`/products/${encodeURIComponent(normalizedListingId)}`);
    },
    [onOpenListing],
  );

  const tabs = useMemo(
    () => (userType === "partner" ? [...partnerBaseTabs, ...partnerTabs] : regularTabs),
    [userType],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(userType === "partner" ? "partner-listings" : "profile");
    }
  }, [activeTab, tabs, userType]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  const resolveCityRegion = useCallback((): string => "", []);

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
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    addressSuggestionsCacheRef.current.clear();
  }, []);

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

  const composeFullAddress = useCallback((parts: {
    region?: string;
    city?: string;
    street?: string;
    house?: string;
    apartment?: string;
    entrance?: string;
  }) => {
    const normalize = (value?: string) => String(value ?? "").trim();
    const region = normalize(parts.region);
    const city = normalize(parts.city);
    const street = normalize(parts.street);
    const house = normalize(parts.house);
    const apartment = normalize(parts.apartment);
    const entrance = normalize(parts.entrance);

    const cityPart =
      city && region && city.toLowerCase().replace(/\s+/g, " ") === region.toLowerCase().replace(/\s+/g, " ")
        ? ""
        : city;

    const housePart = house ? `дом ${house}` : "";
    const entrancePart = entrance ? `подъезд ${entrance}` : "";
    const apartmentPart = apartment ? `кв. ${apartment}` : "";

    return [region, cityPart, street, housePart, entrancePart, apartmentPart].filter(Boolean).join(", ");
  }, []);

  const sanitizeRegion = useCallback((value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return isBroadAdministrativeUnit(raw) ? "" : raw;
  }, []);

  const resolvePreferredRegion = useCallback((province: string, area: string) => {
    const candidates = [province, area]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    if (candidates.length === 0) return "";

    const narrowed = candidates.filter(
      (item) => !isBroadAdministrativeUnit(item),
    );
    if (narrowed.length === 0) return "";

    const regionLevel = narrowed.find((item) => REGION_LEVEL_RE.test(item));
    return regionLevel || narrowed[0];
  }, []);

  const extractRegionFromInput = useCallback((value: string) => {
    const parts = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const matched = parts.find(
      (item) => REGION_LEVEL_RE.test(item) && !isBroadAdministrativeUnit(item),
    );
    return matched || "";
  }, []);

  const normalizeAddressToken = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const normalizeSuggestionComparable = useCallback(
    (value: string) =>
      normalizeAddressToken(
        String(value ?? "")
          .replace(/\(\s*индекс\s*\d{6}\s*\)/giu, "")
          .trim(),
      ),
    [normalizeAddressToken],
  );

  const normalizeRegionForMatch = useCallback((value: string | null | undefined) => {
    return normalizeAddressToken(String(value ?? ""))
      .replace(/(^|[\s,])(?:\u043e\u0431\u043b\.?)(?=$|[\s,])/giu, "$1\u043e\u0431\u043b\u0430\u0441\u0442\u044c")
      .replace(/(^|[\s,])(?:\u0440\u0435\u0441\u043f\.?)(?=$|[\s,])/giu, "$1\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\u0430")
      .replace(/(^|[\s,])(?:ao|a\.o\.?|\u0430\u043e)(?=$|[\s,])/giu, "$1autonomous okrug")
      .replace(/\s+/g, " ")
      .trim();
  }, [normalizeAddressToken]);

  const commonPrefixLength = useCallback((leftValue: string, rightValue: string) => {
    const left = String(leftValue ?? "");
    const right = String(rightValue ?? "");
    const max = Math.min(left.length, right.length);
    let index = 0;
    while (index < max && left[index] === right[index]) {
      index += 1;
    }
    return index;
  }, []);

  const computeRegionMatchScore = useCallback(
    (queryValue: string | null | undefined, regionValue: string | null | undefined) => {
      const queryNorm = normalizeRegionForMatch(queryValue);
      const regionNorm = normalizeRegionForMatch(regionValue);
      if (!queryNorm || !regionNorm) return Number.NEGATIVE_INFINITY;

      if (queryNorm === regionNorm) return 1400;

      let score = 0;
      if (regionNorm.startsWith(queryNorm)) score += 860;
      if (regionNorm.includes(queryNorm)) score += 560;
      if (queryNorm.includes(regionNorm)) score += 320;

      const queryTokens = queryNorm.split(" ").filter(Boolean);
      const regionTokens = regionNorm.split(" ").filter(Boolean);
      const queryMain = queryTokens[0] ?? "";
      const regionMain = regionTokens[0] ?? "";

      // Short prefixes must match the beginning of the primary region token.
      // This prevents noisy matches like "Ки" -> "Краснодарский край".
      if (queryMain.length <= 2 && queryMain && regionMain && !regionMain.startsWith(queryMain)) {
        return Number.NEGATIVE_INFINITY;
      }
      if (
        queryMain.length >= 3 &&
        queryMain &&
        regionMain &&
        !regionMain.includes(queryMain) &&
        commonPrefixLength(queryMain, regionMain) < 2
      ) {
        return Number.NEGATIVE_INFINITY;
      }

      if (queryMain && regionMain) {
        const prefixLength = commonPrefixLength(queryMain, regionMain);
        const minLength = Math.min(queryMain.length, regionMain.length);
        const maxLength = Math.max(queryMain.length, regionMain.length);
        const minRatio = minLength ? prefixLength / minLength : 0;
        const maxRatio = maxLength ? prefixLength / maxLength : 0;

        if (prefixLength >= 3) score += prefixLength * 55;
        if (minRatio >= 0.75) score += 220;
        else if (minRatio >= 0.6) score += 140;
        else if (minRatio >= 0.45) score += 60;

        if (maxRatio >= 0.65) score += 100;
      }

      const sharedTokens = queryTokens.filter((token) => regionTokens.includes(token)).length;
      const sharedDetails = queryTokens.slice(1).filter((token) => regionTokens.includes(token)).length;
      score += sharedTokens * 120;
      score += sharedDetails * 50;

      return score > 0 ? score : Number.NEGATIVE_INFINITY;
    },
    [commonPrefixLength, normalizeRegionForMatch],
  );

  const extractHouseNumber = useCallback((value: string) => {
    const match = value.match(/(?:дом|д\.?)\s*([0-9a-zа-я/-]+)/i);
    return match?.[1]?.trim() ?? "";
  }, []);

  const extractApartmentNumber = useCallback((value: string) => {
    const match = value.match(/(?:кв\.?|квартира)\s*([0-9a-zа-я/-]+)/i);
    return match?.[1]?.trim() ?? "";
  }, []);

  const extractEntranceNumber = useCallback((value: string) => {
    const match = value.match(/(?:подъезд|под\.?\s*езд|подьезд)\s*([0-9a-zа-я/-]+)/iu);
    return match?.[1]?.trim() ?? "";
  }, []);

  const sanitizeHouseValue = useCallback((value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    return raw
      .replace(/^\s*(?:дом|д\.?)\s*/iu, "")
      .replace(/\s*,?\s*(?:кв\.?|квартира)\s*[0-9a-zа-я/-]+.*$/iu, "")
      .replace(/\s*,?\s*(?:под[ъь]?езд|под\.?\s*езд)\s*[0-9a-zа-я/-]+.*$/iu, "")
      .trim();
  }, []);

  const sanitizeStreetValue = useCallback((value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    return raw
      .replace(/(?:дом|д\.?)\s*[0-9a-zа-я/-].*$/iu, "")
      .replace(/\s*,?\s*(?:кв\.?|квартира)\s*[0-9a-zа-я/-]+.*$/iu, "")
      .replace(/\s*,?\s*(?:под[ъь]?езд|под\.?\s*езд)\s*[0-9a-zа-я/-]+.*$/iu, "")
      .replace(/\s+\d+[a-zа-я/-]*$/iu, "")
      .trim();
  }, []);

  const sanitizeApartmentValue = useCallback((value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return raw.replace(/^\s*(?:кв\.?|квартира)\s*/iu, "").trim();
  }, []);

  const sanitizeEntranceValue = useCallback((value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return raw.replace(/^\s*(?:под[ъь]?езд|под\.?\s*езд)\s*/iu, "").trim();
  }, []);

  const normalizeAddressDisplay = useCallback((value: string | null | undefined) => {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/,\s*,+/g, ", ")
      .replace(/,\s*$/g, "")
      .trim();
  }, []);

  const sanitizeCityValue = useCallback((value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return isBroadAdministrativeUnit(raw) ? "" : raw;
  }, []);

  const stripCityPrefix = useCallback((value: string | null | undefined) => {
    return String(value ?? "")
      .replace(/^\s*(?:г\.?|город)\s+/iu, "")
      .trim();
  }, []);

  const normalizeCityForMatch = useCallback(
    (value: string | null | undefined) => normalizeAddressToken(stripCityPrefix(value)),
    [normalizeAddressToken, stripCityPrefix],
  );

  const areRegionsCompatible = useCallback(
    (expectedRegion: string | null | undefined, actualRegion: string | null | undefined) => {
      const expected = normalizeAddressToken(String(expectedRegion ?? ""));
      const actual = normalizeAddressToken(String(actualRegion ?? ""));
      if (!expected || !actual) return true;
      if (actual.includes(expected) || expected.includes(actual)) return true;

      const score = computeRegionMatchScore(expectedRegion, actualRegion);
      return Number.isFinite(score) && score >= 220;
    },
    [computeRegionMatchScore, normalizeAddressToken],
  );

  const buildRegionCandidateFromQuery = useCallback((value: string) => {
    const cleaned = String(value ?? "").trim().replace(/,\s*$/u, "");
    if (!cleaned) return "";
    return sanitizeRegion(
      cleaned
        .replace(/(^|[\s,])обл\.?($|[\s,])/giu, "$1область$2")
        .replace(/(^|[\s,])респ\.?($|[\s,])/giu, "$1республика$2")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }, [sanitizeRegion]);

  type AddressSuggestStage = "region" | "city" | "street" | "house" | "apartment" | "entrance";

  const normalizeBounds = useCallback((value: unknown): number[][] | null => {
    if (!Array.isArray(value) || value.length < 2) return null;
    const first = value[0];
    const second = value[1];
    if (!Array.isArray(first) || !Array.isArray(second) || first.length < 2 || second.length < 2) {
      return null;
    }

    const lat1 = Number(first[0]);
    const lon1 = Number(first[1]);
    const lat2 = Number(second[0]);
    const lon2 = Number(second[1]);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

    const south = Math.min(lat1, lat2);
    const north = Math.max(lat1, lat2);
    const west = Math.min(lon1, lon2);
    const east = Math.max(lon1, lon2);
    return [
      [south, west],
      [north, east],
    ];
  }, []);

  const boundsToBbox = useCallback((bounds: number[][] | null) => {
    if (!bounds) return "";
    const south = Number(bounds[0]?.[0]);
    const west = Number(bounds[0]?.[1]);
    const north = Number(bounds[1]?.[0]);
    const east = Number(bounds[1]?.[1]);
    if (![south, west, north, east].every(Number.isFinite)) return "";
    return `${west},${south}~${east},${north}`;
  }, []);

  const splitAddressInput = useCallback((value: string) => {
    const hasTrailingComma = /,\s*$/.test(value);
    const tokens = value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

    const stepIndex = hasTrailingComma ? tokens.length : Math.max(tokens.length - 1, 0);
    const context = tokens.slice(0, stepIndex);
    const query = hasTrailingComma ? "" : (tokens[stepIndex] ?? "");

    return {
      tokens,
      context,
      query,
      hasTrailingComma,
    };
  }, []);

  const buildAddressFromTokens = useCallback((tokens: string[]) => {
    const nextTokens: string[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
      const cleaned = token.trim();
      if (!cleaned) continue;
      const normalized = normalizeAddressToken(cleaned);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      nextTokens.push(cleaned);
    }

    return nextTokens.join(", ");
  }, [normalizeAddressToken]);

  const normalizeFreeformAddressForGeocode = useCallback((value: string) => {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) return "";

    let next = raw;
    if (!/(?:дом|д\.?)\s*[0-9a-zа-я/-]+/iu.test(next)) {
      next = next.replace(
        /(\b\d{1,4}[a-zа-я/-]?\b)(?!.*\b\d{1,4}[a-zа-я/-]?\b)/iu,
        "дом $1",
      );
    }
    next = next
      .replace(/\bкв\b\.?\s*(\d{1,4})/iu, "кв. $1")
      .replace(/\bпод[ъь]?езд\b\.?\s*(\d{1,3})/iu, "подъезд $1");

    return next.trim();
  }, []);

  const splitCompactRegionToken = useCallback((value: string) => {
    const raw = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!raw) {
      return { region: "", tail: "" };
    }

    const regionSuffixMatch = raw.match(
      /\b(?:область|край|автономная\s+область|автономный\s+округ)\b/iu,
    );
    if (regionSuffixMatch && Number.isInteger(regionSuffixMatch.index)) {
      const endIndex = Number(regionSuffixMatch.index) + regionSuffixMatch[0].length;
      return {
        region: sanitizeRegion(raw.slice(0, endIndex).trim()),
        tail: raw.slice(endIndex).replace(/^[,\s]+/u, "").trim(),
      };
    }

    const republicMatch = raw.match(/^(республика\s+[^,\d]+?)(?:\s+(.*))?$/iu);
    if (republicMatch) {
      return {
        region: sanitizeRegion(String(republicMatch[1] ?? "").trim()),
        tail: String(republicMatch[2] ?? "").trim(),
      };
    }

    return { region: "", tail: raw };
  }, [sanitizeRegion]);

  const resolveSearchBounds = useCallback(async (
    stage: AddressSuggestStage,
    contextTokens: string[],
    queryToken: string,
  ) => {
    const ymaps = (window as unknown as { ymaps?: any }).ymaps;
    if (!ymaps?.geocode) return null;

    let seedQuery = "";
    if (stage === "city") {
      seedQuery = sanitizeRegion(contextTokens[0]);
    } else if (stage === "street" || stage === "house" || stage === "apartment" || stage === "entrance") {
      seedQuery = buildAddressFromTokens([
        sanitizeRegion(contextTokens[0]),
        sanitizeCityValue(stripCityPrefix(contextTokens[1] || "")),
      ]);
    } else if (stage === "region") {
      seedQuery = buildRegionCandidateFromQuery(queryToken);
    }

    seedQuery = seedQuery.trim();
    if (!seedQuery) return null;

    const cacheKey = normalizeAddressToken(seedQuery);
    if (addressBoundsCacheRef.current.has(cacheKey)) {
      return addressBoundsCacheRef.current.get(cacheKey) ?? null;
    }

    try {
      const geocodeResult = await ymaps.geocode(seedQuery, {
        results: 1,
        boundedBy: RUSSIA_BOUNDS,
        strictBounds: true,
      });
      const firstGeoObject = geocodeResult?.geoObjects?.get?.(0);
      if (!firstGeoObject) {
        addressBoundsCacheRef.current.set(cacheKey, null);
        return null;
      }

      const bounds = normalizeBounds(
        firstGeoObject?.properties?.get?.("boundedBy") ??
        geocodeResult?.geoObjects?.getBounds?.(),
      );
      addressBoundsCacheRef.current.set(cacheKey, bounds);
      return bounds;
    } catch {
      addressBoundsCacheRef.current.set(cacheKey, null);
      return null;
    }
  }, [
    buildAddressFromTokens,
    buildRegionCandidateFromQuery,
    normalizeAddressToken,
    normalizeBounds,
    sanitizeCityValue,
    sanitizeRegion,
    stripCityPrefix,
  ]);

  const resolveSearchBoundsWithTimeout = useCallback(async (
    stage: AddressSuggestStage,
    contextTokens: string[],
    queryToken: string,
    timeoutMs = 280,
  ) => {
    let timeoutId = 0;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
    });

    const bounds = await Promise.race<number[][] | null>([
      resolveSearchBounds(stage, contextTokens, queryToken),
      timeoutPromise,
    ]);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }

    return bounds;
  }, [resolveSearchBounds]);

  const detectAddressStep = useCallback((input: string): AddressSuggestStage => {
    const { context, query } = splitAddressInput(input);
    const level = context.length;
    const normalizedQuery = normalizeAddressToken(query);

    if (/(?:под[ъь]?езд|под\s*езд)\s*\d*/iu.test(normalizedQuery)) return "entrance";
    if (/(?:кв\.?|квартира)\s*\d*/iu.test(normalizedQuery)) return "apartment";
    if (level <= 0) return "region";
    if (level === 1) return "city";
    if (level === 2) return "street";
    if (level === 3) return "house";
    if (level === 4) return "entrance";
    return "apartment";
  }, [normalizeAddressToken, splitAddressInput]);

  const mergeAddressSuggestionWithContext = useCallback(
    (currentInput: string, suggestion: string) => {
      const selected = suggestion.trim();
      if (!selected) return "";

      const stage = detectAddressStep(currentInput);
      const stageIndex = stage === "region"
        ? 0
        : stage === "city"
          ? 1
          : stage === "street"
            ? 2
            : stage === "house"
              ? 3
              : stage === "apartment"
                ? 4
                : 5;

      const { context } = splitAddressInput(currentInput.trim());
      const suggestionTokens = selected
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);

      if (stage === "city") {
        const compactRegion = splitCompactRegionToken(context[0] || "");
        const regionToken = sanitizeRegion(compactRegion.region || "");
        const suggestionHead = suggestionTokens[0] || "";
        const compactSuggestionHead = splitCompactRegionToken(suggestionHead);
        const suggestionCity = sanitizeCityValue(
          stripCityPrefix(
            suggestionTokens[1] ||
            compactSuggestionHead.tail ||
            suggestionTokens[suggestionTokens.length - 1] ||
            "",
          ),
        );

        if (regionToken && suggestionCity && !REGION_LEVEL_RE.test(suggestionCity)) {
          const mergedCity = buildAddressFromTokens([regionToken, suggestionCity]);
          if (mergedCity) return mergedCity;
        }
      }

      const baseTokens = context.slice(0, stageIndex);
      if (stage === "city" && baseTokens.length > 0) {
        const compactRegion = splitCompactRegionToken(baseTokens[0]);
        if (compactRegion.region) {
          baseTokens[0] = compactRegion.region;
        }
      }

      const merged = buildAddressFromTokens([...baseTokens, ...suggestionTokens]);
      return merged || selected;
    },
    [
      buildAddressFromTokens,
      detectAddressStep,
      sanitizeCityValue,
      sanitizeRegion,
      splitAddressInput,
      splitCompactRegionToken,
      stripCityPrefix,
    ],
  );

  const parseGeoObjectAddress = useCallback((geoObject: any) => {
    const components = geoObject?.properties?.get?.(
      "metaDataProperty.GeocoderMetaData.Address.Components",
    ) as Array<{ kind: string; name: string }> | undefined;

    let province = "";
    let area = "";
    let city = "";
    let street = "";
    let house = "";
    let postalCode = "";
    let country = "";

    for (const component of components ?? []) {
      if (component.kind === "province" && !province) province = component.name;
      if (component.kind === "area" && !area) area = component.name;
      if (component.kind === "locality" && !isBroadAdministrativeUnit(component.name)) {
        city = component.name;
      }
      if (component.kind === "street") street = component.name;
      if (component.kind === "house") house = sanitizeHouseValue(component.name);
      if (component.kind === "postal_code") postalCode = component.name;
      if (component.kind === "country" && !country) country = component.name;
    }

    const region = sanitizeRegion(resolvePreferredRegion(province, area));
    const safeCity = sanitizeCityValue(city);

    if (!safeCity && region) {
      city = region;
    } else {
      city = safeCity;
    }

    const formatted = String(geoObject?.properties?.get?.("text") ?? "").trim();
    const coords = geoObject?.geometry?.getCoordinates?.();
    const lat = Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : NaN;
    const lon = Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : NaN;

    return {
      region: sanitizeRegion(region),
      city: sanitizeCityValue(city),
      street,
      house: sanitizeHouseValue(house),
      postalCode,
      formatted,
      country: country.trim(),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    };
  }, [resolvePreferredRegion, sanitizeCityValue, sanitizeHouseValue, sanitizeRegion]);

  const geocodeAddress = useCallback(async (query: string) => {
    const rawQuery = query.trim();
    if (!rawQuery) return null;

    const ymaps = (window as unknown as { ymaps?: any }).ymaps;
    if (!ymaps?.geocode) return null;

    const mergeParsed = (base: {
      region: string;
      city: string;
      street: string;
      house: string;
      postalCode: string;
      formatted: string;
      country?: string;
      lat?: number | null;
      lon?: number | null;
    }, candidate: {
      region: string;
      city: string;
      street: string;
      house: string;
      postalCode: string;
      formatted: string;
      country?: string;
      lat?: number | null;
      lon?: number | null;
    }) => {
      const nextCity = sanitizeCityValue(base.city || candidate.city);
      return {
        ...base,
        region:
          sanitizeRegion(base.region) ||
          sanitizeRegion(candidate.region) ||
          sanitizeRegion(resolveCityRegion(nextCity)),
        city: nextCity,
        street: base.street || candidate.street,
        house: sanitizeHouseValue(base.house || candidate.house),
        postalCode: base.postalCode || candidate.postalCode,
        formatted: base.formatted || candidate.formatted,
        country: base.country || candidate.country,
        lat: typeof base.lat === "number" ? base.lat : candidate.lat ?? null,
        lon: typeof base.lon === "number" ? base.lon : candidate.lon ?? null,
      };
    };

    try {
      const geocodeResult = await ymaps.geocode(rawQuery, {
        results: 1,
        boundedBy: RUSSIA_BOUNDS,
        strictBounds: true,
      });
      const firstGeoObject = geocodeResult?.geoObjects?.get?.(0);
      if (!firstGeoObject) return null;

      let parsed = parseGeoObjectAddress(firstGeoObject);
      if (!isRussianCountry(parsed.country)) return null;

      if (!parsed.house || !parsed.postalCode || !sanitizeRegion(parsed.region)) {
        try {
          const houseGeocode = await ymaps.geocode(rawQuery, {
            kind: "house",
            results: 1,
            boundedBy: RUSSIA_BOUNDS,
            strictBounds: true,
          });
          const houseGeoObject = houseGeocode?.geoObjects?.get?.(0);
          if (houseGeoObject) {
            parsed = mergeParsed(parsed, parseGeoObjectAddress(houseGeoObject));
            if (!isRussianCountry(parsed.country)) return null;
          }
        } catch {
          // keep primary result
        }
      }

      if (!parsed.postalCode && parsed.house) {
        try {
          const houseQuery = [parsed.region, parsed.city, parsed.street, parsed.house ? `дом ${parsed.house}` : ""]
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .join(", ");
          if (houseQuery) {
            const exactHouseGeocode = await ymaps.geocode(houseQuery, {
              kind: "house",
              results: 1,
              boundedBy: RUSSIA_BOUNDS,
              strictBounds: true,
            });
            const exactHouseGeoObject = exactHouseGeocode?.geoObjects?.get?.(0);
            if (exactHouseGeoObject) {
              parsed = mergeParsed(parsed, parseGeoObjectAddress(exactHouseGeoObject));
              if (!isRussianCountry(parsed.country)) return null;
            }
          }
        } catch {
          // keep previous result
        }
      }
      if (!isRussianCountry(parsed.country)) return null;

      if (parsed.postalCode) {
        return {
          ...parsed,
          region: sanitizeRegion(parsed.region) || sanitizeRegion(resolveCityRegion(parsed.city)),
          city: sanitizeCityValue(parsed.city),
          house: sanitizeHouseValue(parsed.house),
        };
      }

      const coords = firstGeoObject?.geometry?.getCoordinates?.();
      if (!Array.isArray(coords) || coords.length < 2) {
        return {
          ...parsed,
          region: sanitizeRegion(parsed.region) || sanitizeRegion(resolveCityRegion(parsed.city)),
          city: sanitizeCityValue(parsed.city),
          house: sanitizeHouseValue(parsed.house),
        };
      }

      try {
        const reverseGeocode = await ymaps.geocode(coords, { kind: "house", results: 1 });
        const reverseFirst = reverseGeocode?.geoObjects?.get?.(0);
        if (!reverseFirst) {
          return {
            ...parsed,
            region: sanitizeRegion(parsed.region) || sanitizeRegion(resolveCityRegion(parsed.city)),
            city: sanitizeCityValue(parsed.city),
            house: sanitizeHouseValue(parsed.house),
          };
        }
        const reverseParsed = parseGeoObjectAddress(reverseFirst);
        const merged = mergeParsed(parsed, reverseParsed);
        return isRussianCountry(merged.country) ? merged : null;
      } catch {
        return {
          ...parsed,
          region: sanitizeRegion(parsed.region) || sanitizeRegion(resolveCityRegion(parsed.city)),
          city: sanitizeCityValue(parsed.city),
          house: sanitizeHouseValue(parsed.house),
        };
      }
    } catch {
      return null;
    }
  }, [parseGeoObjectAddress, resolveCityRegion, sanitizeCityValue, sanitizeHouseValue, sanitizeRegion]);

  const isParsedAddressMatchInput = useCallback((
    raw: string,
    stage: AddressSuggestStage,
    contextTokens: string[],
    queryToken: string,
    parsed: {
      region: string;
      city: string;
      street: string;
      house: string;
      postalCode: string;
      formatted: string;
    } | null,
  ) => {
    if (!parsed) return false;

    const inputRegion = sanitizeRegion(extractRegionFromInput(raw) || contextTokens[0] || "");
    if (inputRegion && !areRegionsCompatible(inputRegion, parsed.region)) {
      return false;
    }

    const expectedCity = sanitizeCityValue(
      stripCityPrefix(
        (stage === "city" ? queryToken : "") || contextTokens[1] || "",
      ),
    );
    if (expectedCity) {
      const expectedCityNorm = normalizeCityForMatch(expectedCity);
      const parsedCityNorm = normalizeCityForMatch(parsed.city);
      if (
        !parsedCityNorm ||
        (!parsedCityNorm.includes(expectedCityNorm) && !expectedCityNorm.includes(parsedCityNorm))
      ) {
        return false;
      }
    }

    const expectedStreet = sanitizeStreetValue(
      (stage === "street" ? queryToken : "") || contextTokens[2] || "",
    );
    if (expectedStreet) {
      const expectedStreetNorm = normalizeAddressToken(expectedStreet);
      const parsedStreetNorm = normalizeAddressToken(parsed.street);
      if (
        !parsedStreetNorm ||
        (!parsedStreetNorm.includes(expectedStreetNorm) &&
          !expectedStreetNorm.includes(parsedStreetNorm))
      ) {
        return false;
      }
    }

    const expectedHouse = sanitizeHouseValue(
      (stage === "house" || stage === "apartment" || stage === "entrance"
        ? extractHouseNumber(raw) || queryToken
        : "") || contextTokens[3] || "",
    );
    if (expectedHouse) {
      const expectedHouseNorm = normalizeAddressToken(expectedHouse);
      const parsedHouseNorm = normalizeAddressToken(sanitizeHouseValue(parsed.house));
      if (!parsedHouseNorm || parsedHouseNorm !== expectedHouseNorm) {
        return false;
      }
    }

    return true;
  }, [
    areRegionsCompatible,
    extractHouseNumber,
    extractRegionFromInput,
    normalizeAddressToken,
    normalizeCityForMatch,
    sanitizeCityValue,
    sanitizeHouseValue,
    sanitizeRegion,
    sanitizeStreetValue,
    stripCityPrefix,
  ]);

  const applyFullAddressValue = async (inputValue: string) => {
    const rawInput = inputValue.trim();
    if (!rawInput) return;

    const geocodeSeed = rawInput.includes(",")
      ? rawInput
      : normalizeFreeformAddressForGeocode(rawInput);
    const parsed =
      await geocodeAddressWithTimeout(rawInput, 900) ||
      (geocodeSeed !== rawInput ? await geocodeAddressWithTimeout(geocodeSeed, 900) : null);

    if (!parsed) {
      setAddressForm((prev) => ({
        ...prev,
        fullAddress: normalizeAddressDisplay(rawInput),
      }));
      setAddressMapHint("Не удалось определить координаты. Выберите подсказку или точку на карте.");
      return;
    }

    const apartmentFromInput = sanitizeApartmentValue(
      extractApartmentNumber(rawInput),
    );
    const entranceFromInput = sanitizeEntranceValue(
      extractEntranceNumber(rawInput),
    );

    let nextCenterQuery: string | null = null;
    setAddressForm((prev) => {
      const region = sanitizeRegion(parsed.region);
      const city = sanitizeCityValue(parsed.city);
      const street = sanitizeStreetValue(parsed.street);
      const house = sanitizeHouseValue(parsed.house);
      const apartment = apartmentFromInput;
      const entrance = entranceFromInput;
      const canonicalBase = normalizeAddressDisplay(
        parsed.formatted ||
        composeFullAddress({
          region,
          city,
          street,
          house,
        }) ||
        rawInput,
      );
      nextCenterQuery = canonicalBase || null;

      return {
        ...prev,
        fullAddress: canonicalBase || rawInput,
        region,
        city,
        street,
        house,
        apartment,
        entrance,
        postalCode: parsed.postalCode || "",
        lat: typeof parsed.lat === "number" ? parsed.lat : prev.lat,
        lon: typeof parsed.lon === "number" ? parsed.lon : prev.lon,
      };
    });

    setAddressMapHint("");
    setMapCenterQuery(nextCenterQuery);
  };

  const geocodeAddressWithTimeout = useCallback(async (
    query: string,
    timeoutMs = 900,
  ) => {
    let timeoutId = 0;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
    });

    const result = await Promise.race([
      geocodeAddress(query),
      timeoutPromise,
    ]);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }

    return result;
  }, [geocodeAddress]);

  const normalizeHouseToken = useCallback((value: string) => {
    return value
      .replace(/(?:дом|д\.?)\s*/giu, "")
      .trim();
  }, []);

  const buildSuggestionValue = useCallback(
    (stage: AddressSuggestStage, contextTokens: string[], queryToken: string, parsed: {
      region: string;
      city: string;
      street: string;
      house: string;
      postalCode: string;
      formatted: string;
    }) => {
      if (stage === "region") {
        const fromFormatted = sanitizeRegion(extractRegionFromInput(parsed.formatted));
        return sanitizeRegion(parsed.region) || fromFormatted;
      }

      if (stage === "city") {
        const regionToken =
          sanitizeRegion(contextTokens[0]) ||
          sanitizeRegion(parsed.region) ||
          sanitizeRegion(extractRegionFromInput(parsed.formatted));
        const cityToken = sanitizeCityValue(parsed.city);
        if (!cityToken) return "";
        return buildAddressFromTokens([
          regionToken,
          cityToken,
        ]);
      }

      if (stage === "street") {
        const regionToken =
          sanitizeRegion(contextTokens[0]) ||
          sanitizeRegion(parsed.region) ||
          sanitizeRegion(extractRegionFromInput(parsed.formatted));
        const cityToken = sanitizeCityValue(contextTokens[1]) || sanitizeCityValue(parsed.city);
        return buildAddressFromTokens([
          regionToken,
          cityToken,
          parsed.street || queryToken,
        ]);
      }

      const regionToken =
        sanitizeRegion(contextTokens[0]) ||
        sanitizeRegion(parsed.region) ||
        sanitizeRegion(extractRegionFromInput(parsed.formatted));
      const cityToken = sanitizeCityValue(contextTokens[1]) || sanitizeCityValue(parsed.city);
      const streetToken = contextTokens[2] || parsed.street;
      const houseToken = sanitizeHouseValue(parsed.house || normalizeHouseToken(queryToken));

      if (stage === "house") {
        return buildAddressFromTokens([
          regionToken,
          cityToken,
          streetToken,
          houseToken ? `дом ${houseToken}` : "",
        ]);
      }

      if (stage === "apartment") {
        const contextEntranceToken =
          /(?:под[ъь]?езд|под\.?\s*езд)/iu.test(contextTokens[4] || "")
            ? contextTokens[4]
            : "";
        const apartmentToken = extractApartmentNumber(queryToken);
        return buildAddressFromTokens([
          regionToken,
          cityToken,
          streetToken,
          houseToken ? `дом ${houseToken}` : "",
          contextEntranceToken,
          apartmentToken ? `кв. ${apartmentToken}` : "",
        ]);
      }

      const contextToken = contextTokens[4] || "";
      const contextEntranceToken =
        /(?:под[ъь]?езд|под\.?\s*езд)/iu.test(contextToken) ? contextToken : "";
      const contextApartmentToken =
        /(?:кв\.?|квартира)/iu.test(contextToken) ? contextToken : "";
      const apartmentToken =
        contextApartmentToken || (extractApartmentNumber(queryToken) ? `кв. ${extractApartmentNumber(queryToken)}` : "");
      const entranceToken = contextEntranceToken || (
        extractEntranceNumber(queryToken) ? `подъезд ${extractEntranceNumber(queryToken)}` : ""
      );
      return buildAddressFromTokens([
        regionToken,
        cityToken,
        streetToken,
        houseToken ? `дом ${houseToken}` : "",
        entranceToken,
        apartmentToken,
      ]);
    },
    [
      buildAddressFromTokens,
      extractApartmentNumber,
      extractEntranceNumber,
      extractRegionFromInput,
      normalizeHouseToken,
      sanitizeCityValue,
      sanitizeHouseValue,
      sanitizeRegion,
    ],
  );

  const scoreAddressSuggestion = useCallback(
    (stage: AddressSuggestStage, contextTokens: string[], queryToken: string, value: string) => {
      const normalizedValue = normalizeAddressToken(value);
      const normalizedQuery = normalizeAddressToken(queryToken);
      const normalizedContext = contextTokens
        .map((token) => normalizeAddressToken(token))
        .filter(Boolean);
      const normalizedValueTokens = value
        .split(",")
        .map((token) => normalizeAddressToken(token))
        .filter(Boolean);

      let score = 0;
      for (const token of normalizedContext) {
        if (normalizedValue.includes(token)) {
          score += 30;
        } else {
          score -= 120;
        }
      }

      // Strongly prioritize candidates that preserve the exact hierarchy prefix:
      // region -> city -> street -> house.
      let matchedPrefixCount = 0;
      for (let i = 0; i < normalizedContext.length; i += 1) {
        const expected = normalizedContext[i];
        const actual = normalizedValueTokens[i];
        if (!expected || !actual) break;
        if (actual.includes(expected) || expected.includes(actual)) {
          matchedPrefixCount += 1;
          continue;
        }
        break;
      }
      if (normalizedContext.length > 0) {
        if (matchedPrefixCount === normalizedContext.length) {
          score += 220;
        } else {
          score -= (normalizedContext.length - matchedPrefixCount) * 180;
        }
      }

      if (normalizedQuery) {
        score += normalizedValue.includes(normalizedQuery) ? 28 : -40;
      }

      const contextPrefix = buildAddressFromTokens(contextTokens).toLowerCase();
      if (contextPrefix && value.toLowerCase().startsWith(contextPrefix)) {
        score += 40;
      }

      const depth = value.split(",").map((token) => token.trim()).filter(Boolean).length;
      const targetDepth =
        stage === "region"
          ? 1
          : stage === "city"
            ? 2
            : stage === "street"
              ? 3
              : stage === "house"
                ? 4
                : stage === "apartment"
                  ? 5
                  : 6;
      score += Math.max(0, 22 - Math.abs(depth - targetDepth) * 6);

      if (stage === "house" && /дом\s*\d/iu.test(value)) {
        score += 20;
      }
      if (stage === "region" && REGION_LEVEL_RE.test(value)) {
        score += 45;
      }
      if (stage === "region" && isBroadAdministrativeUnit(value)) {
        score -= 240;
      }
      if (stage === "city") {
        const tokens = value.split(",").map((token) => token.trim()).filter(Boolean);
        const cityToken = tokens[1] || tokens[tokens.length - 1] || "";
        const cityNorm = normalizeCityForMatch(cityToken);
        const queryNorm = normalizeCityForMatch(queryToken);

        if (queryNorm) {
          if (cityNorm === queryNorm) {
            score += 220;
          } else if (cityNorm.startsWith(queryNorm)) {
            score += 95;
          } else if (cityNorm.includes(queryNorm)) {
            score += 40;
          } else {
            score -= 130;
          }
        }
      }
      if (stage === "apartment" && /кв\.\s*\d/iu.test(value)) {
        score += 20;
      }
      if (stage === "entrance" && /под[ъь]?езд\s*\d/iu.test(value)) {
        score += 20;
      }

      return score;
    },
    [buildAddressFromTokens, normalizeAddressToken, normalizeCityForMatch],
  );

  const fetchFreeformAddressSuggestions = useCallback(async (
    query: string,
    results = 8,
  ): Promise<AddressSuggestionOption[]> => {
    const raw = query.trim();
    if (raw.length < 2) return [];
    const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
    const contextCity = sanitizeCityValue(defaultAddress?.city || profile?.city || "");
    const contextRegion = sanitizeRegion(defaultAddress?.region || "");

    const normalizedRaw = normalizeAddressToken(raw);
    const rawKeywords = normalizedRaw
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean);
    const expandKeywordToken = (token: string) => {
      const compact = token.replace(/\./g, "");
      if (/^об(?:л)?$/iu.test(compact)) return "область";
      if (/^респ(?:убл(?:ика)?)?$/iu.test(compact)) return "республика";
      if (/^авт\.?$/iu.test(compact)) return "автономный";
      return token;
    };
    const expandedKeywords = rawKeywords.map(expandKeywordToken);
    const baseQueryKeywords = Array.from(
      new Set(
        expandedKeywords.filter((token) => token.length >= 3 || /\d/.test(token)),
      ),
    );
    const queryKeywords = Array.from(
      new Set(
        baseQueryKeywords.filter((token) => token.length >= 3 || /\d/.test(token)),
      ),
    );
    const alphaKeywords = baseQueryKeywords.filter((token) => !/\d/.test(token));
    const numericKeywords = baseQueryKeywords.filter((token) => /\d/.test(token));
    const providerKeywords = queryKeywords.length > 0
      ? queryKeywords
      : Array.from(
        new Set(
          expandedKeywords.filter((token) => token.length >= 2 || /\d/.test(token)),
        ),
      );

    const regionDescriptor = providerKeywords.find((token) =>
      /^(?:область|край|республика|округ)$/iu.test(token),
    );
    const regionAdjective = providerKeywords.find((token) =>
      /(?:ская|ский|ское|ской)$/iu.test(token),
    );
    const localityKeywords = providerKeywords.filter(
      (token) => token !== regionDescriptor && token !== regionAdjective,
    );

    const normalizedQuery = providerKeywords.join(" ").trim();
    const normalizedFreeform = normalizeFreeformAddressForGeocode(raw);
    const structuredProviderQuery =
      regionAdjective && regionDescriptor && localityKeywords.length > 0
        ? [regionAdjective, regionDescriptor, ...localityKeywords].join(" ").trim()
        : "";
    const dedupeQueryWords = (value: string) => {
      const words = normalizeAddressToken(value).split(" ").filter(Boolean);
      if (words.length === 0) return "";
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const word of words) {
        if (seen.has(word)) continue;
        seen.add(word);
        deduped.push(word);
      }
      return deduped.join(" ").trim();
    };
    const providerQueryVariants = Array.from(
      new Set(
        [
          structuredProviderQuery,
          normalizedQuery,
          dedupeQueryWords(raw),
          dedupeQueryWords(raw.replace(/,/g, " ")),
          localityKeywords.join(" ").trim(),
          [regionAdjective, regionDescriptor, ...localityKeywords].filter(Boolean).join(" ").trim(),
          [...localityKeywords, regionAdjective, regionDescriptor].filter(Boolean).join(" ").trim(),
          contextCity ? `${raw} ${contextCity}` : "",
          contextCity && contextRegion ? `${raw} ${contextCity} ${contextRegion}` : "",
          contextRegion ? `${raw} ${contextRegion}` : "",
          normalizedFreeform,
          raw,
        ]
          .map((item) => item.trim().replace(/\s+/g, " "))
          .filter((item) => item.length >= 2),
      ),
    ).slice(0, 7);
    const cacheKey = `freeform:${normalizedQuery || normalizedRaw}`;
    const cached = addressSuggestionsCacheRef.current.get(cacheKey);
    if (cached?.length) {
      return cached.slice(0, results);
    }

    const ymaps = (window as unknown as { ymaps?: any }).ymaps;
    const suggestResults = Math.min(10, Math.max(results, 1));
    const hasNumericIntent = /\d/.test(raw);
    const hasStreetIntent =
      /(?:улиц|ул\.?|проспект|пр-?кт|бульвар|проезд|шоссе|переул|пер\.?|набереж|наб\.?|тракт)/iu
        .test(raw);
    const hasHouseIntent =
      hasNumericIntent ||
      /(?:дом|д\.?|кв\.?|квартира|под[ъь]?езд|под\.?\s*езд)/iu.test(raw);
    const broadLocalityIntent = !hasStreetIntent && !hasHouseIntent;
    const administrativeKeywords = new Set([
      "\u043e\u0431\u043b\u0430\u0441\u0442\u044c",
      "\u043a\u0440\u0430\u0439",
      "\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\u0430",
      "\u043e\u043a\u0440\u0443\u0433",
      "\u0440\u0430\u0439\u043e\u043d",
      "\u0433\u043e\u0440\u043e\u0434",
      "\u043f\u043e\u0441\u0435\u043b\u043e\u043a",
      "\u043f\u043e\u0441\u0451\u043b\u043e\u043a",
      "\u043f\u0433\u0442",
      "\u0441\u0435\u043b\u043e",
      "\u0434\u0435\u0440\u0435\u0432\u043d\u044f",
      "\u0440-\u043d",
    ]);
    const hasSpecificLocationKeyword = providerKeywords.some((token) => {
      if (!token || token.length < 3) return false;
      if (administrativeKeywords.has(token)) return false;
      return true;
    });
    const commaPrefix = raw.includes(",") ? String(raw.split(",")[0] ?? "").trim() : "";
    const anchorToken = normalizeAddressToken(commaPrefix)
      .split(" ")
      .filter((token) => token.length >= 3 && !/\d/.test(token))
      .find((token) => !administrativeKeywords.has(token)) || "";
    const enforceAnchorToken = Boolean(anchorToken) && raw.includes(",");
    const allowDetailedAddressForBroadLocality =
      broadLocalityIntent && hasSpecificLocationKeyword;
    const minKeywordMatches =
      queryKeywords.length <= 2
        ? queryKeywords.length
        : Math.max(2, queryKeywords.length - 1);
    const queryForProviders = providerQueryVariants[0] || structuredProviderQuery || normalizedQuery || normalizedFreeform || raw;
    const countKeywordMatches = (candidateNorm: string) => {
      if (queryKeywords.length === 0) return 0;
      let matched = 0;
      for (const keyword of queryKeywords) {
        if (!keyword) continue;
        if (candidateNorm.includes(keyword)) {
          matched += 1;
        }
      }
      return matched;
    };
    const countAlphaMatches = (candidateNorm: string) => {
      if (alphaKeywords.length === 0) return 0;
      let matched = 0;
      for (const keyword of alphaKeywords) {
        if (candidateNorm.includes(keyword)) {
          matched += 1;
        }
      }
      return matched;
    };
    const countNumericMatches = (candidateNorm: string) => {
      if (numericKeywords.length === 0) return 0;
      let matched = 0;
      for (const keyword of numericKeywords) {
        if (candidateNorm.includes(keyword)) {
          matched += 1;
        }
      }
      return matched;
    };

    type RankedSuggestion = AddressSuggestionOption & { score: number };
    const ranked = new Map<string, RankedSuggestion>();
    const relaxedRanked = new Map<string, RankedSuggestion>();
    const upsertRanked = (
      target: Map<string, RankedSuggestion>,
      key: string,
      candidate: RankedSuggestion,
    ) => {
      const prev = target.get(key);
      if (!prev || candidate.score > prev.score) {
        target.set(key, candidate);
      }
    };
    const upsertSuggestion = (
      parsed: {
        region: string;
        city: string;
        street: string;
        house: string;
        postalCode: string;
        formatted: string;
        country?: string;
        lat?: number | null;
        lon?: number | null;
      } | null,
      sourceIndex: number,
      _kind: string,
      _sourceText?: string,
    ) => {
      if (!parsed) return;
      if (!isRussianCountry(parsed.country)) return;

      const compactRegion = splitCompactRegionToken(sanitizeRegion(parsed.region));
      const candidateRegion = sanitizeRegion(compactRegion.region || parsed.region);
      const fallbackCityFromRegion = sanitizeCityValue(stripCityPrefix(compactRegion.tail || ""));
      const candidateCity = sanitizeCityValue(parsed.city) || fallbackCityFromRegion;
      const candidateStreet = sanitizeStreetValue(parsed.street);
      const candidateHouse = sanitizeHouseValue(parsed.house);

      const useStreet =
        hasStreetIntent || hasHouseIntent || allowDetailedAddressForBroadLocality;
      const useHouse = hasHouseIntent || (allowDetailedAddressForBroadLocality && hasNumericIntent);
      const formattedValue = normalizeAddressDisplay(parsed.formatted);
      const value =
        formattedValue ||
        composeFullAddress({
          region: candidateRegion,
          city: candidateCity,
          street: useStreet ? candidateStreet : "",
          house: useHouse ? candidateHouse : "",
        }) ||
        composeFullAddress({
          region: candidateRegion,
          city: candidateCity,
        });
      if (!value) return;

      const normalizedValue = normalizeAddressToken(value);
      if (!normalizedValue) return;
      if (enforceAnchorToken && !normalizedValue.includes(anchorToken)) return;

      const alphaMatches = countAlphaMatches(normalizedValue);
      const numericMatches = countNumericMatches(normalizedValue);
      const keywordMatches = countKeywordMatches(normalizedValue);
      const requiredAlphaMatches =
        alphaKeywords.length <= 1 ? alphaKeywords.length : Math.min(alphaKeywords.length, 2);
      if (alphaKeywords.length > 0 && alphaMatches === 0) return;
      const relaxedMinKeywordMatches = queryKeywords.length > 0 ? 1 : 0;
      if (queryKeywords.length > 0 && keywordMatches < relaxedMinKeywordMatches) return;
      const meetsStrictKeywordThreshold =
        alphaKeywords.length > 0
          ? alphaMatches >= requiredAlphaMatches
          : queryKeywords.length === 0 || keywordMatches >= minKeywordMatches;

      let score = 0;
      score += alphaMatches * 210;
      score += numericMatches * 70;
      score += keywordMatches * 45;
      score += sourceIndex;
      if (alphaKeywords.length > 0 && alphaMatches === alphaKeywords.length) score += 240;
      if (numericKeywords.length > 0 && numericMatches === numericKeywords.length) score += 80;
      if (anchorToken && normalizedValue.includes(anchorToken)) score += 180;
      if (normalizedQuery && normalizedValue.includes(normalizedQuery)) score += 120;
      if (normalizedQuery && normalizedValue.startsWith(normalizedQuery)) score += 80;
      if (parsed.postalCode) score += 12;

      if (broadLocalityIntent) {
        if (candidateCity && !candidateStreet && !candidateHouse) score += 180;
        if (candidateRegion && !candidateCity) score += 70;
        if (allowDetailedAddressForBroadLocality) {
          if (candidateStreet) score += 220;
          if (candidateHouse) score += 120;
          if (!candidateStreet) score -= 80;
        }
      } else {
        if (hasStreetIntent && candidateStreet) score += 90;
        if (hasHouseIntent && candidateHouse) score += 110;
      }

      if (broadLocalityIntent && queryKeywords.length === 1 && candidateCity) {
        const queryCity = queryKeywords[0];
        const cityNorm = normalizeCityForMatch(candidateCity);
        if (cityNorm === queryCity) {
          score += 260;
        } else if (cityNorm.startsWith(queryCity)) {
          score += 130;
        } else if (cityNorm.includes(queryCity)) {
          score += 70;
        }
        score -= Math.min(45, Math.max(0, cityNorm.length - queryCity.length) * 2);
      }

      const key = normalizeAddressToken(value);
      if (!key) return;
      const candidate: RankedSuggestion = {
        label: parsed.postalCode ? `${value} (индекс ${parsed.postalCode})` : value,
        value,
        postalCode: parsed.postalCode || undefined,
        region: candidateRegion || undefined,
        city: candidateCity || undefined,
        street: candidateStreet || undefined,
        house: candidateHouse || undefined,
        lat: typeof parsed.lat === "number" ? parsed.lat : null,
        lon: typeof parsed.lon === "number" ? parsed.lon : null,
        formatted: formattedValue || undefined,
        score,
      };
      if (meetsStrictKeywordThreshold) {
        upsertRanked(ranked, key, candidate);
      } else {
        upsertRanked(relaxedRanked, key, {
          ...candidate,
          score: candidate.score - 180,
        });
      }
    };

    if (ymaps?.geocode) {
      try {
        const geocodeQueries =
          providerQueryVariants.length > 0 ? providerQueryVariants : [queryForProviders];
        for (let queryIndex = 0; queryIndex < geocodeQueries.length; queryIndex += 1) {
          const geocodeSeed = geocodeQueries[queryIndex];
          if (!geocodeSeed) continue;

          const geocodeResult = await ymaps.geocode(geocodeSeed, {
            results: Math.max(10, results * 2),
            boundedBy: RUSSIA_BOUNDS,
            strictBounds: true,
          });
          const geoObjects = geocodeResult?.geoObjects;
          const length = Number(geoObjects?.getLength?.() ?? 0);
          const queryPenalty = queryIndex * 16;

          for (let index = 0; index < length; index += 1) {
            const geoObject = geoObjects?.get?.(index);
            if (!geoObject) continue;
            const parsed = parseGeoObjectAddress(geoObject);
            const kind = String(
              geoObject?.properties?.get?.("metaDataProperty.GeocoderMetaData.kind") ?? "",
            );
            const sourceText = String(geoObject?.properties?.get?.("text") ?? "");
            const sourceBoost = Math.max(0, 340 - index * 16 - queryPenalty);
            upsertSuggestion(parsed, sourceBoost, kind, sourceText);
          }

          if (ranked.size >= results * 2) {
            break;
          }
        }
      } catch {
        // noop
      }
    }

    const providerCandidates: string[] = [];
    const pushProviderCandidate = (value: string) => {
      const cleaned = value.trim();
      if (!cleaned) return;
      if (normalizeAddressToken(cleaned).length < 3) return;
      providerCandidates.push(cleaned);
    };

    if (YANDEX_GEOSUGGEST_API_KEY) {
      const suggestTypes = broadLocalityIntent
        ? (allowDetailedAddressForBroadLocality
          ? "biz,street,house,locality,province,area"
          : "biz,locality,province,area")
        : hasHouseIntent
          ? "house,street,biz,locality"
          : hasStreetIntent
            ? "street,biz,locality,province,area"
            : "biz,locality,province,area,street";
      const suggestQueries =
        providerQueryVariants.length > 0 ? providerQueryVariants : [queryForProviders];
      for (let suggestIndex = 0; suggestIndex < Math.min(3, suggestQueries.length); suggestIndex += 1) {
        const suggestQuery = suggestQueries[suggestIndex];
        if (!suggestQuery) continue;
        try {
          const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
          url.searchParams.set("apikey", YANDEX_GEOSUGGEST_API_KEY);
          url.searchParams.set("text", suggestQuery);
          url.searchParams.set("lang", "ru_RU");
          url.searchParams.set("results", String(suggestResults));
          url.searchParams.set("print_address", "1");
          url.searchParams.set("types", suggestTypes);
          url.searchParams.set("bbox", RUSSIA_BBOX);
          url.searchParams.set("strict_bounds", "1");

          const abortController = new AbortController();
          const timeoutId = window.setTimeout(() => abortController.abort(), 900);
          const response = await fetch(url.toString(), { signal: abortController.signal });
          window.clearTimeout(timeoutId);

          if (!response.ok) continue;
          const payload = (await response.json()) as {
            results?: Array<{
              title?: { text?: string } | string;
              subtitle?: { text?: string } | string;
            }>;
          };

          for (const item of payload.results ?? []) {
            const title = typeof item.title === "string" ? item.title : String(item.title?.text ?? "");
            const subtitle = typeof item.subtitle === "string" ? item.subtitle : String(item.subtitle?.text ?? "");
            pushProviderCandidate([title.trim(), subtitle.trim()].filter(Boolean).join(", "));
          }

          if (providerCandidates.length >= suggestResults * 2) {
            break;
          }
        } catch {
          // noop
        }
      }
    }

    if (ymaps?.suggest) {
      const suggestQueries =
        providerQueryVariants.length > 0 ? providerQueryVariants : [queryForProviders];
      for (let suggestIndex = 0; suggestIndex < Math.min(3, suggestQueries.length); suggestIndex += 1) {
        const suggestQuery = suggestQueries[suggestIndex];
        if (!suggestQuery) continue;
        try {
          const quickSuggestions = await Promise.race([
            ymaps.suggest(suggestQuery, {
              provider: "yandex#search",
              results: suggestResults,
              boundedBy: RUSSIA_BOUNDS,
              strictBounds: true,
            }),
            new Promise<[] | null>((resolve) => {
              window.setTimeout(() => resolve(null), 800);
            }),
          ]);

          for (const item of Array.isArray(quickSuggestions) ? quickSuggestions : []) {
            pushProviderCandidate(String(item?.value || item?.displayName || ""));
          }

          if (providerCandidates.length >= suggestResults * 2) {
            break;
          }
        } catch {
          // noop
        }
      }
    }

    const uniqueProviderCandidates = Array.from(new Set(providerCandidates)).slice(0, 12);
    for (let index = 0; index < uniqueProviderCandidates.length; index += 1) {
      const candidateText = uniqueProviderCandidates[index];
      if (!candidateText) continue;
      const parsed = await geocodeAddressWithTimeout(candidateText, 700);
      const sourceBoost = Math.max(0, 190 - index * 12);
      upsertSuggestion(parsed, sourceBoost, "", candidateText);
    }

    let best = Array.from(ranked.values())
      .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"))
      .slice(0, results)
      .map(({ score, ...option }) => option);

    if (best.length === 0 && alphaKeywords.length <= 1) {
      best = Array.from(relaxedRanked.values())
        .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"))
        .slice(0, results)
        .map(({ score, ...option }) => option);
    }

    if (best.length === 0 && uniqueProviderCandidates.length > 0 && alphaKeywords.length <= 1) {
      best = uniqueProviderCandidates.slice(0, results).map((value) => ({
        label: value,
        value,
      }));
    }

    if (uniqueProviderCandidates.length > 0) {
      const direct = uniqueProviderCandidates
        .filter((value) => {
          const normalized = normalizeAddressToken(value);
          if (!normalized) return false;
          if (alphaKeywords.length === 0) return true;
          return alphaKeywords.some((token) => normalized.includes(token));
        })
        .map((value) => ({ label: value, value }))
        .slice(0, results);

      if (direct.length > 0) {
        const merged: AddressSuggestionOption[] = [];
        const seen = new Set<string>();
        for (const option of [...direct, ...best]) {
          const key = normalizeAddressToken(option.value);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push(option);
          if (merged.length >= results) break;
        }
        best = merged;
      }
    }

    if (best.length > 0) {
      addressSuggestionsCacheRef.current.set(cacheKey, best);
      if (addressSuggestionsCacheRef.current.size > 350) {
        const firstKey = addressSuggestionsCacheRef.current.keys().next().value;
        if (firstKey) {
          addressSuggestionsCacheRef.current.delete(firstKey);
        }
      }
    } else {
      addressSuggestionsCacheRef.current.delete(cacheKey);
    }

    return best;
  }, [
    addresses,
    composeFullAddress,
    geocodeAddressWithTimeout,
    isRussianCountry,
    normalizeAddressDisplay,
    normalizeCityForMatch,
    normalizeAddressToken,
    normalizeFreeformAddressForGeocode,
    profile?.city,
    sanitizeCityValue,
    sanitizeHouseValue,
    sanitizeRegion,
    sanitizeStreetValue,
    splitCompactRegionToken,
    stripCityPrefix,
  ]);

  const fetchLooseYandexSuggestions = useCallback(async (
    query: string,
    results = 8,
  ): Promise<AddressSuggestionOption[]> => {
    const raw = query.trim();
    if (raw.length < 2) return [];
    const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
    const contextCity = sanitizeCityValue(defaultAddress?.city || profile?.city || "");
    const contextRegion = sanitizeRegion(defaultAddress?.region || "");
    const rawNorm = normalizeAddressToken(raw);
    const rawTokens = Array.from(new Set(rawNorm.split(" ").filter(Boolean)));
    const alphaTokens = rawTokens.filter((token) => token.length >= 3 && !/\d/.test(token));
    const numericTokens = rawTokens.filter((token) => /\d/.test(token));
    const commaPrefix = raw.includes(",") ? String(raw.split(",")[0] ?? "").trim() : "";
    const anchorToken = normalizeAddressToken(commaPrefix)
      .split(" ")
      .filter((token) => token.length >= 3 && !/\d/.test(token))[0] || "";
    const enforceAnchorToken = Boolean(anchorToken) && raw.includes(",");

    const cacheKey = `loose:${normalizeAddressToken(raw)}`;
    const cached = addressSuggestionsCacheRef.current.get(cacheKey);
    if (cached?.length) {
      return cached.slice(0, results);
    }

    const ymaps = (window as unknown as { ymaps?: any }).ymaps;
    const suggestResults = Math.min(12, Math.max(results * 2, results));
    const queryVariants = Array.from(
      new Set(
        [
          raw,
          raw.replace(/,/g, " "),
          contextCity ? `${raw} ${contextCity}` : "",
          contextCity && contextRegion ? `${raw} ${contextCity} ${contextRegion}` : "",
          contextRegion ? `${raw} ${contextRegion}` : "",
          normalizeFreeformAddressForGeocode(raw),
          normalizeAddressToken(raw),
        ]
          .map((item) => String(item ?? "").trim().replace(/\s+/g, " "))
          .filter((item) => item.length >= 2),
      ),
    ).slice(0, 4);

    const candidates: string[] = [];
    const seenCandidates = new Set<string>();
    const pushCandidate = (value: string) => {
      const cleaned = normalizeAddressDisplay(value);
      if (!cleaned) return;
      const key = normalizeAddressToken(cleaned);
      if (!key || seenCandidates.has(key)) return;
      seenCandidates.add(key);
      candidates.push(cleaned);
    };

    if (YANDEX_GEOSUGGEST_API_KEY) {
      for (const suggestQuery of queryVariants) {
        try {
          const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
          url.searchParams.set("apikey", YANDEX_GEOSUGGEST_API_KEY);
          url.searchParams.set("text", suggestQuery);
          url.searchParams.set("lang", "ru_RU");
          url.searchParams.set("results", String(suggestResults));
          url.searchParams.set("print_address", "1");
          url.searchParams.set("types", "biz,street,house,locality,province,area");
          url.searchParams.set("bbox", RUSSIA_BBOX);
          url.searchParams.set("strict_bounds", "1");

          const abortController = new AbortController();
          const timeoutId = window.setTimeout(() => abortController.abort(), 900);
          const response = await fetch(url.toString(), { signal: abortController.signal });
          window.clearTimeout(timeoutId);
          if (!response.ok) continue;

          const payload = (await response.json()) as {
            results?: Array<{
              title?: { text?: string } | string;
              subtitle?: { text?: string } | string;
            }>;
          };
          for (const item of payload.results ?? []) {
            const title = typeof item.title === "string" ? item.title : String(item.title?.text ?? "");
            const subtitle = typeof item.subtitle === "string" ? item.subtitle : String(item.subtitle?.text ?? "");
            pushCandidate([title.trim(), subtitle.trim()].filter(Boolean).join(", "));
          }

          if (candidates.length >= suggestResults * 2) break;
        } catch {
          // noop
        }
      }
    }

    if (ymaps?.suggest) {
      for (const suggestQuery of queryVariants) {
        try {
          const quickSuggestions = await Promise.race([
            ymaps.suggest(suggestQuery, {
              provider: "yandex#search",
              results: suggestResults,
              boundedBy: RUSSIA_BOUNDS,
              strictBounds: true,
            }),
            new Promise<[] | null>((resolve) => {
              window.setTimeout(() => resolve(null), 800);
            }),
          ]);
          for (const item of Array.isArray(quickSuggestions) ? quickSuggestions : []) {
            pushCandidate(String(item?.value || item?.displayName || ""));
          }
          if (candidates.length >= suggestResults) break;
        } catch {
          // noop
        }
      }
    }

    if (candidates.length === 0) {
      addressSuggestionsCacheRef.current.delete(cacheKey);
      return [];
    }

    type Ranked = AddressSuggestionOption & { score: number };
    const ranked: Ranked[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < Math.min(candidates.length, 12); index += 1) {
      const candidateText = candidates[index];
      if (!candidateText) continue;

      const parsed = await geocodeAddressWithTimeout(candidateText, 700);
      if (parsed && !isRussianCountry(parsed.country)) continue;

      const formatted = normalizeAddressDisplay(parsed?.formatted || candidateText);
      const normalizedFormatted = normalizeAddressToken(formatted);
      if (!normalizedFormatted || seen.has(normalizedFormatted)) continue;
      if (enforceAnchorToken && !normalizedFormatted.includes(anchorToken)) continue;
      seen.add(normalizedFormatted);

      let alphaMatches = 0;
      for (const token of alphaTokens) {
        if (normalizedFormatted.includes(token)) alphaMatches += 1;
      }

      let numericMatches = 0;
      for (const token of numericTokens) {
        if (normalizedFormatted.includes(token)) numericMatches += 1;
      }

      if (alphaTokens.length >= 2 && alphaMatches < 2) continue;

      let score = Math.max(0, 280 - index * 14) + alphaMatches * 190 + numericMatches * 60;
      if (rawNorm && normalizedFormatted.includes(rawNorm)) score += 180;
      if (anchorToken && normalizedFormatted.includes(anchorToken)) score += 160;
      if (alphaTokens.length > 0 && alphaMatches === alphaTokens.length) score += 140;
      if (parsed?.postalCode) score += 16;

      ranked.push({
        label: parsed?.postalCode ? `${formatted} (индекс ${parsed.postalCode})` : formatted,
        value: formatted,
        postalCode: parsed?.postalCode || undefined,
        region: sanitizeRegion(parsed?.region),
        city: sanitizeCityValue(parsed?.city),
        street: sanitizeStreetValue(parsed?.street),
        house: sanitizeHouseValue(parsed?.house),
        lat: typeof parsed?.lat === "number" ? parsed.lat : null,
        lon: typeof parsed?.lon === "number" ? parsed.lon : null,
        formatted,
        score,
      });
    }

    let best = ranked
      .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"))
      .slice(0, results)
      .map(({ score, ...option }) => option);

    if (best.length === 0 && alphaTokens.length <= 1) {
      best = candidates.slice(0, results).map((value) => ({
        label: value,
        value,
      }));
    }

    if (best.length > 0) {
      addressSuggestionsCacheRef.current.set(cacheKey, best);
      if (addressSuggestionsCacheRef.current.size > 350) {
        const firstKey = addressSuggestionsCacheRef.current.keys().next().value;
        if (firstKey) {
          addressSuggestionsCacheRef.current.delete(firstKey);
        }
      }
    } else {
      addressSuggestionsCacheRef.current.delete(cacheKey);
    }

    return best;
  }, [
    addresses,
    geocodeAddressWithTimeout,
    isRussianCountry,
    normalizeAddressDisplay,
    normalizeAddressToken,
    normalizeFreeformAddressForGeocode,
    profile?.city,
    sanitizeCityValue,
    sanitizeHouseValue,
    sanitizeRegion,
    sanitizeStreetValue,
  ]);

  const fetchYandexNativeSuggestions = useCallback(async (
    query: string,
    results = 8,
  ): Promise<AddressSuggestionOption[]> => {
    const raw = query.trim();
    if (raw.length < 2) return [];

    const cacheKey = `native:${normalizeAddressToken(raw)}`;
    const cached = addressSuggestionsCacheRef.current.get(cacheKey);
    if (cached?.length) {
      return cached.slice(0, results);
    }

    const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
    const contextCity = sanitizeCityValue(defaultAddress?.city || profile?.city || "");
    const contextRegion = sanitizeRegion(defaultAddress?.region || "");
    const rawNormalized = normalizeAddressToken(raw);
    const rawTokens = rawNormalized.split(" ").filter(Boolean);
    const alphaTokens = Array.from(new Set(rawTokens.filter((token) => token.length >= 2 && !/\d/.test(token))));
    const numericTokens = Array.from(new Set(rawTokens.filter((token) => /\d/.test(token))));

    const dedupeWords = (value: string) => {
      const words = normalizeAddressToken(value).split(" ").filter(Boolean);
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const word of words) {
        if (seen.has(word)) continue;
        seen.add(word);
        deduped.push(word);
      }
      return deduped.join(" ").trim();
    };

    const queryVariants = Array.from(
      new Set(
        [
          raw,
          raw.replace(/,/g, " "),
          dedupeWords(raw),
          normalizeFreeformAddressForGeocode(raw),
          contextCity ? `${raw} ${contextCity}` : "",
          contextCity && contextRegion ? `${raw} ${contextCity} ${contextRegion}` : "",
          contextRegion ? `${raw} ${contextRegion}` : "",
        ]
          .map((item) => String(item ?? "").trim().replace(/\s+/g, " "))
          .filter((item) => item.length >= 2),
      ),
    ).slice(0, 6);

    const providerMap = new Map<string, { value: string; sourceScore: number }>();
    const pushProviderCandidate = (value: string, sourceScore: number) => {
      const cleaned = normalizeAddressDisplay(value);
      if (!cleaned) return;
      const key = normalizeAddressToken(cleaned);
      if (!key) return;
      const prev = providerMap.get(key);
      if (!prev || sourceScore > prev.sourceScore) {
        providerMap.set(key, { value: cleaned, sourceScore });
      }
    };

    const suggestResults = Math.min(14, Math.max(results * 2, results));
    const ymaps = (window as unknown as { ymaps?: any }).ymaps;

    if (YANDEX_GEOSUGGEST_API_KEY) {
      for (let variantIndex = 0; variantIndex < queryVariants.length; variantIndex += 1) {
        const suggestQuery = queryVariants[variantIndex];
        if (!suggestQuery) continue;
        try {
          const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
          url.searchParams.set("apikey", YANDEX_GEOSUGGEST_API_KEY);
          url.searchParams.set("text", suggestQuery);
          url.searchParams.set("lang", "ru_RU");
          url.searchParams.set("results", String(suggestResults));
          url.searchParams.set("print_address", "1");
          url.searchParams.set("types", "biz,street,house,locality,province,area,district,metro");
          url.searchParams.set("bbox", RUSSIA_BBOX);
          url.searchParams.set("strict_bounds", "1");

          const abortController = new AbortController();
          const timeoutId = window.setTimeout(() => abortController.abort(), 900);
          const response = await fetch(url.toString(), { signal: abortController.signal });
          window.clearTimeout(timeoutId);
          if (!response.ok) continue;

          const payload = (await response.json()) as {
            results?: Array<{
              title?: { text?: string } | string;
              subtitle?: { text?: string } | string;
            }>;
          };
          for (const item of payload.results ?? []) {
            const title = typeof item.title === "string" ? item.title : String(item.title?.text ?? "");
            const subtitle = typeof item.subtitle === "string" ? item.subtitle : String(item.subtitle?.text ?? "");
            pushProviderCandidate([title.trim(), subtitle.trim()].filter(Boolean).join(", "), 360 - variantIndex * 24);
          }

          if (providerMap.size >= suggestResults * 2) break;
        } catch {
          // noop
        }
      }
    }

    if (ymaps?.suggest) {
      for (let variantIndex = 0; variantIndex < queryVariants.length; variantIndex += 1) {
        const suggestQuery = queryVariants[variantIndex];
        if (!suggestQuery) continue;
        try {
          const quickSuggestions = await Promise.race([
            ymaps.suggest(suggestQuery, {
              provider: "yandex#search",
              results: suggestResults,
              boundedBy: RUSSIA_BOUNDS,
              strictBounds: true,
            }),
            new Promise<[] | null>((resolve) => {
              window.setTimeout(() => resolve(null), 800);
            }),
          ]);
          for (const item of Array.isArray(quickSuggestions) ? quickSuggestions : []) {
            pushProviderCandidate(String(item?.value || item?.displayName || ""), 340 - variantIndex * 24);
          }
          if (providerMap.size >= suggestResults * 2) break;
        } catch {
          // noop
        }
      }
    }

    if (ymaps?.geocode) {
      for (let variantIndex = 0; variantIndex < Math.min(3, queryVariants.length); variantIndex += 1) {
        const geocodeQuery = queryVariants[variantIndex];
        if (!geocodeQuery) continue;
        try {
          const geocodeResult = await ymaps.geocode(geocodeQuery, {
            results: suggestResults,
            boundedBy: RUSSIA_BOUNDS,
            strictBounds: true,
          });
          const geoObjects = geocodeResult?.geoObjects;
          const length = Number(geoObjects?.getLength?.() ?? 0);
          for (let index = 0; index < length; index += 1) {
            const geoObject = geoObjects?.get?.(index);
            if (!geoObject) continue;
            const text = String(geoObject?.properties?.get?.("text") ?? "").trim();
            if (!text) continue;
            pushProviderCandidate(text, 320 - variantIndex * 24 - index * 8);
          }
        } catch {
          // noop
        }
      }
    }

    if (providerMap.size === 0 && ymaps?.geocode) {
      try {
        const geocodeResult = await ymaps.geocode(raw, {
          results: suggestResults,
        });
        const geoObjects = geocodeResult?.geoObjects;
        const length = Number(geoObjects?.getLength?.() ?? 0);
        for (let index = 0; index < length; index += 1) {
          const geoObject = geoObjects?.get?.(index);
          if (!geoObject) continue;
          const text = String(geoObject?.properties?.get?.("text") ?? "").trim();
          if (!text) continue;
          pushProviderCandidate(text, 210 - index * 8);
        }
      } catch {
        // noop
      }
    }

    const providerCandidates = Array.from(providerMap.values())
      .sort((left, right) => right.sourceScore - left.sourceScore)
      .slice(0, 20);

    if (providerCandidates.length === 0) {
      addressSuggestionsCacheRef.current.delete(cacheKey);
      return [];
    }

    type RankedNative = AddressSuggestionOption & { score: number };
    const ranked: RankedNative[] = [];
    const seen = new Set<string>();
    const contextCityNorm = normalizeCityForMatch(contextCity);
    const contextRegionNorm = normalizeAddressToken(contextRegion);

    for (const candidate of providerCandidates) {
      const parsed = await geocodeAddressWithTimeout(candidate.value, 800);
      if (parsed && !isRussianCountry(parsed.country)) continue;

      const formatted = normalizeAddressDisplay(parsed?.formatted || candidate.value);
      const normalizedFormatted = normalizeAddressToken(formatted);
      if (!normalizedFormatted || seen.has(normalizedFormatted)) continue;

      let alphaMatches = 0;
      for (const token of alphaTokens) {
        if (normalizedFormatted.includes(token)) alphaMatches += 1;
      }
      let alphaPrefixMatches = 0;
      for (const token of alphaTokens) {
        if (token.length < 3) continue;
        if (normalizedFormatted.includes(token.slice(0, 3))) {
          alphaPrefixMatches += 1;
        }
      }

      let numericMatches = 0;
      for (const token of numericTokens) {
        if (normalizedFormatted.includes(token)) numericMatches += 1;
      }

      let score = candidate.sourceScore;
      score += alphaMatches * 170;
      score += alphaPrefixMatches * 40;
      score += numericMatches * 65;
      if (rawNormalized && normalizedFormatted.includes(rawNormalized)) score += 120;
      if (contextCityNorm && normalizeCityForMatch(parsed?.city || "").includes(contextCityNorm)) score += 230;
      if (contextRegionNorm && normalizedFormatted.includes(contextRegionNorm)) score += 90;
      if (parsed?.postalCode) score += 10;

      seen.add(normalizedFormatted);
      ranked.push({
        label: parsed?.postalCode ? `${formatted} (индекс ${parsed.postalCode})` : formatted,
        value: formatted,
        postalCode: parsed?.postalCode || undefined,
        region: sanitizeRegion(parsed?.region) || undefined,
        city: sanitizeCityValue(parsed?.city) || undefined,
        street: sanitizeStreetValue(parsed?.street) || undefined,
        house: sanitizeHouseValue(parsed?.house) || undefined,
        lat: typeof parsed?.lat === "number" ? parsed.lat : null,
        lon: typeof parsed?.lon === "number" ? parsed.lon : null,
        formatted,
        score,
      });
    }

    let best = ranked
      .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"))
      .slice(0, results)
      .map(({ score, ...option }) => option);

    if (best.length === 0 && providerCandidates.length > 0) {
      best = providerCandidates.slice(0, results).map((candidate) => ({
        label: candidate.value,
        value: candidate.value,
      }));
    }

    if (best.length > 0) {
      addressSuggestionsCacheRef.current.set(cacheKey, best);
      if (addressSuggestionsCacheRef.current.size > 350) {
        const firstKey = addressSuggestionsCacheRef.current.keys().next().value;
        if (firstKey) {
          addressSuggestionsCacheRef.current.delete(firstKey);
        }
      }
    } else {
      addressSuggestionsCacheRef.current.delete(cacheKey);
    }

    return best;
  }, [
    addresses,
    geocodeAddressWithTimeout,
    isRussianCountry,
    normalizeAddressDisplay,
    normalizeAddressToken,
    normalizeCityForMatch,
    normalizeFreeformAddressForGeocode,
    profile?.city,
    sanitizeCityValue,
    sanitizeHouseValue,
    sanitizeRegion,
    sanitizeStreetValue,
  ]);

  const fetchYandexSuggestions = useCallback(async (
    query: string,
    results = 8,
  ): Promise<AddressSuggestionOption[]> => {
    const raw = query.trim();
    if (raw.length < 2) return [];

    const nativeSuggestions = await fetchYandexNativeSuggestions(raw, results);
    if (nativeSuggestions.length > 0) {
      return nativeSuggestions;
    }

    const freeformFirst = await fetchFreeformAddressSuggestions(raw, results);
    if (freeformFirst.length > 0) {
      return freeformFirst;
    }

    const looseFallback = await fetchLooseYandexSuggestions(raw, results);
    if (looseFallback.length > 0) {
      return looseFallback;
    }

    const stage = detectAddressStep(raw);
    const cacheKey = `${stage}:${normalizeAddressToken(raw)}`;
    const cachedSuggestions = addressSuggestionsCacheRef.current.get(cacheKey);
    if (cachedSuggestions?.length) {
      return cachedSuggestions.slice(0, results);
    }

    const { context, query: queryToken } = splitAddressInput(raw);
    const contextTokens = [...context];
    const contextPrefix = buildAddressFromTokens(contextTokens);
    const geosuggestType =
      stage === "region"
        ? "province,area"
        : stage === "city"
          ? "locality"
          : stage === "street"
            ? "street"
            : stage === "house" || stage === "entrance"
              ? "house"
              : undefined;
    const suggestResults = Math.min(10, Math.max(results, 1));
    const cityStageExcludeRe =
      /(?:район|поселени\p{L}*|муниципальн\p{L}*|городск\p{L}*\s+поселени\p{L}*|пгт|пос[её]лок\s+городского\s+типа)/iu;

    if (stage === "apartment") {
      const possibleToken = String(contextTokens[4] ?? "");
      const hasEntranceInContext = /(?:под[ъь]?езд|под\.?\s*езд)/iu.test(possibleToken);
      const basePrefix = buildAddressFromTokens(
        hasEntranceInContext ? contextTokens.slice(0, 5) : contextTokens.slice(0, 4),
      );
      if (!basePrefix) return [];

      const apartmentQuery = (queryToken.match(/\d{1,4}/)?.[0] ?? "").trim();
      const parsed = await geocodeAddressWithTimeout(basePrefix, 450);
      const postalCode = parsed?.postalCode || undefined;
      const apartments = apartmentQuery
        ? [apartmentQuery]
        : Array.from({ length: 10 }, (_, index) => String(index + 1));

      return apartments.map((flat) => {
        const value = `${basePrefix}, кв. ${flat}`;
        return {
          label: postalCode ? `${value} (индекс ${postalCode})` : value,
          value,
          postalCode,
        };
      });
    }

    if (stage === "entrance") {
      const possibleToken = String(contextTokens[4] ?? "");
      const hasApartmentInContext = /(?:кв\.?|квартира)/iu.test(possibleToken);
      const basePrefix = buildAddressFromTokens(
        hasApartmentInContext ? contextTokens.slice(0, 5) : contextTokens.slice(0, 4),
      );
      if (!basePrefix) return [];

      const entranceQuery = (queryToken.match(/\d{1,3}/)?.[0] ?? "").trim();
      const parsed = await geocodeAddressWithTimeout(basePrefix, 450);
      const postalCode = parsed?.postalCode || undefined;
      const entrances = entranceQuery
        ? [entranceQuery]
        : Array.from({ length: 8 }, (_, index) => String(index + 1));

      return entrances.map((valueToken) => {
        const value = `${basePrefix}, подъезд ${valueToken}`;
        return {
          label: postalCode ? `${value} (индекс ${postalCode})` : value,
          value,
          postalCode,
        };
      });
    }

    const ymaps = (window as unknown as { ymaps?: any }).ymaps;

    const candidates: Array<AddressSuggestionOption & { score: number }> = [];
    const seen = new Set<string>();
    const compactExpectedRegion = splitCompactRegionToken(contextTokens[0] || "");
    const expectedRegionToken = sanitizeRegion(
      compactExpectedRegion.region || contextTokens[0] || extractRegionFromInput(raw),
    );
    const collectTopSuggestions = () => {
      candidates.sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"));
      return candidates.slice(0, results).map(({ score, ...option }) => option);
    };

    const pushCandidate = (
      valueRaw: string,
      postalCode?: string,
      options: { allowSameAsInput?: boolean; scoreBoost?: number } = {},
    ) => {
      let value = valueRaw.trim();
      if (!value) return;

      const tokens = value.split(",").map((token) => token.trim()).filter(Boolean);

      if (stage === "region") {
        const rawRegion =
          sanitizeRegion(extractRegionFromInput(value)) ||
          sanitizeRegion(value.split(",")[0] || "");
        const canonicalRegion = buildRegionCandidateFromQuery(rawRegion);
        value = canonicalRegion || rawRegion;
      }
      if (stage === "city") {
        const compactContextRegion = splitCompactRegionToken(contextTokens[0] || "");
        const regionToken =
          sanitizeRegion(compactContextRegion.region) ||
          sanitizeRegion(extractRegionFromInput(value)) ||
          sanitizeRegion(contextTokens[0]);
        const cityTokenRaw = sanitizeCityValue(
          stripCityPrefix(
            tokens[1] ||
            tokens[tokens.length - 1] ||
            compactContextRegion.tail ||
            "",
          ),
        );
        if (!cityTokenRaw) return;
        if (cityStageExcludeRe.test(cityTokenRaw)) return;
        if (REGION_LEVEL_RE.test(cityTokenRaw)) return;

        const queryCityNorm = normalizeCityForMatch(queryToken);
        const cityNorm = normalizeCityForMatch(cityTokenRaw);
        if (queryCityNorm && !cityNorm.includes(queryCityNorm)) return;

        value = buildAddressFromTokens([regionToken, cityTokenRaw]);
      }
      if (stage === "street") {
        const regionToken =
          sanitizeRegion(contextTokens[0]) ||
          sanitizeRegion(extractRegionFromInput(value));
        const cityToken = sanitizeCityValue(stripCityPrefix(contextTokens[1] || tokens[1] || ""));
        let streetToken = tokens[2] || tokens[tokens.length - 1] || "";
        streetToken = streetToken
          .replace(/(?:дом|д\.?)\s*[0-9a-zа-я/-].*$/iu, "")
          .replace(/\s+\d+[a-zа-я/-]*$/iu, "")
          .trim();

        if (!streetToken) return;
        if (/(?:дом|д\.?)\s*\d/iu.test(streetToken)) return;
        value = buildAddressFromTokens([regionToken, cityToken, streetToken]);
      }
      if (stage === "house") {
        const regionToken =
          sanitizeRegion(contextTokens[0]) ||
          sanitizeRegion(extractRegionFromInput(value));
        const cityToken = sanitizeCityValue(stripCityPrefix(contextTokens[1] || tokens[1] || ""));
        const streetToken = contextTokens[2] || tokens[2] || "";
        const houseToken = sanitizeHouseValue(tokens[3] || extractHouseNumber(value) || queryToken);
        if (!houseToken) return;
        value = buildAddressFromTokens([regionToken, cityToken, streetToken, `дом ${houseToken}`]);
      }

      value = value.trim();
      if (!value) return;
      const valueTokens = value.split(",").map((token) => token.trim()).filter(Boolean);

      if (stage === "city") {
        if (valueTokens.length < 2) return;
        const regionToken = sanitizeRegion(valueTokens[0] || "");
        const cityToken = sanitizeCityValue(stripCityPrefix(valueTokens[1] || ""));
        if (!regionToken || !cityToken) return;
      }
      if (stage === "street") {
        if (valueTokens.length < 3) return;
        const cityToken = sanitizeCityValue(stripCityPrefix(valueTokens[1] || ""));
        const streetToken = sanitizeStreetValue(valueTokens[2] || "");
        if (!cityToken || !streetToken) return;
      }
      if (stage === "house") {
        if (valueTokens.length < 4) return;
        const houseToken = sanitizeHouseValue(valueTokens[3] || "");
        if (!houseToken) return;
      }

      if (value === raw && !options.allowSameAsInput) return;
      if (isBroadAdministrativeUnit(value)) return;
      if (stage === "region" && !REGION_LEVEL_RE.test(value)) return;
      if (stage === "region") {
        const regionScore = computeRegionMatchScore(queryToken || raw, value);
        if (!Number.isFinite(regionScore) || regionScore < 220) return;
      }
      if (stage === "street" && /,\s*\d+[a-zа-я/-]*$/iu.test(value)) return;
      if (stage === "house" && /(?:кв\.?|квартира|под[ъь]?езд)/iu.test(value)) return;
      if (stage === "city" && /(?:федеральн\p{L}*\s+округ|муниципальн\p{L}*\s+образован)/iu.test(value)) return;

      const key = stage === "region"
        ? `region:${normalizeRegionForMatch(value) || normalizeAddressToken(value)}`
        : normalizeAddressToken(value);
      if (!key || seen.has(key)) return;
      seen.add(key);

      const score =
        scoreAddressSuggestion(stage, contextTokens, queryToken, value) +
        (options.scoreBoost ?? 0);
      candidates.push({ label: value, value, postalCode, score });
    };

    const manualRegionToken = sanitizeRegion(contextTokens[0] || "");
    const manualCityToken = sanitizeCityValue(stripCityPrefix(contextTokens[1] || ""));
    const manualStreetToken = sanitizeStreetValue(contextTokens[2] || "");
    const manualHouseToken = sanitizeHouseValue(extractHouseNumber(queryToken) || queryToken);
    const manualEntranceToken = sanitizeEntranceValue(contextTokens[4] || extractEntranceNumber(queryToken));
    const manualApartmentToken = sanitizeApartmentValue(extractApartmentNumber(queryToken));
    let canonicalHouseAddress = "";
    let canonicalHousePostalCode: string | undefined;

    if (stage === "street" && manualRegionToken && manualCityToken) {
      const typedStreetToken = sanitizeStreetValue(queryToken);
      if (typedStreetToken) {
        pushCandidate(
          buildAddressFromTokens([manualRegionToken, manualCityToken, typedStreetToken]),
          undefined,
          { allowSameAsInput: true, scoreBoost: 620 },
        );
      }
    }

    if (stage === "house" && manualRegionToken && manualCityToken && manualStreetToken && manualHouseToken) {
      canonicalHouseAddress = buildAddressFromTokens([
        manualRegionToken,
        manualCityToken,
        manualStreetToken,
        `дом ${manualHouseToken}`,
      ]);
      const canonicalParsed = await geocodeAddressWithTimeout(canonicalHouseAddress, 650);
      canonicalHousePostalCode = canonicalParsed?.postalCode || undefined;

      pushCandidate(
        canonicalHouseAddress,
        canonicalHousePostalCode,
        { allowSameAsInput: true, scoreBoost: 680 },
      );
    }

    if (stage === "apartment" && manualRegionToken && manualCityToken && manualStreetToken && manualHouseToken) {
      pushCandidate(
        buildAddressFromTokens([
          manualRegionToken,
          manualCityToken,
          manualStreetToken,
          `дом ${manualHouseToken}`,
          manualEntranceToken ? `подъезд ${manualEntranceToken}` : "",
          manualApartmentToken ? `кв. ${manualApartmentToken}` : "",
        ]),
        undefined,
        { allowSameAsInput: true, scoreBoost: 680 },
      );
    }

    if (stage === "region") {
      const manualRegion = buildRegionCandidateFromQuery(queryToken || raw);
      if (manualRegion) {
        pushCandidate(manualRegion, undefined, { allowSameAsInput: true, scoreBoost: 400 });
      }
    }

    if ((stage === "region" || stage === "city") && candidates.length > 0) {
      const normalizedPrimaryQuery = normalizeAddressToken(queryToken || raw);
      const hasRegionContext = Boolean(sanitizeRegion(contextTokens[0] || ""));
      const shouldFastReturnForCity =
        stage === "city" &&
        hasRegionContext &&
        normalizedPrimaryQuery.length >= 1 &&
        candidates.length >= 1;
      const shouldFastReturnForRegion =
        stage === "region" &&
        normalizedPrimaryQuery.length >= 3 &&
        candidates.length >= Math.min(results, 4);
      const shouldFastReturn = shouldFastReturnForCity || shouldFastReturnForRegion;

      if (shouldFastReturn) {
        candidates.sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"));
        const fastSuggestions = candidates.slice(0, results).map(({ score, ...option }) => option);
        addressSuggestionsCacheRef.current.set(cacheKey, fastSuggestions);
        return fastSuggestions;
      }
    }

    const geocodeQuery = queryToken
      ? buildAddressFromTokens([...contextTokens, queryToken])
      : raw;
    const shouldResolveBounds =
      stage === "street" || stage === "house";
    const contextBounds = shouldResolveBounds
      ? await resolveSearchBoundsWithTimeout(stage, contextTokens, queryToken)
      : null;
    const effectiveBounds = contextBounds ?? RUSSIA_BOUNDS;
    const bbox = boundsToBbox(effectiveBounds) || RUSSIA_BBOX;

    if (ymaps?.suggest) {
      try {
        const suggestQuery = queryToken
          ? buildAddressFromTokens([...contextTokens, queryToken])
          : raw;
        const suggestions = await Promise.race([
          ymaps.suggest(suggestQuery, {
            provider: "yandex#search",
            results: suggestResults,
            boundedBy: effectiveBounds,
            strictBounds: true,
          }),
          new Promise<[] | null>((resolve) => {
            window.setTimeout(() => resolve(null), 900);
          }),
        ]);
        for (const item of Array.isArray(suggestions) ? suggestions : []) {
          const rawSuggestion = String(item?.value || item?.displayName || "").trim();
          if (!rawSuggestion) continue;
          const merged = mergeAddressSuggestionWithContext(raw, rawSuggestion);
          if (!merged) continue;
          const mergedRegion = sanitizeRegion(extractRegionFromInput(merged) || merged.split(",")[0] || "");
          if (
            expectedRegionToken &&
            mergedRegion &&
            !areRegionsCompatible(expectedRegionToken, mergedRegion)
          ) {
            continue;
          }
          pushCandidate(merged);
        }
      } catch {
        // fallback to other providers below
      }
    }

    if (stage === "city" && candidates.length > 0) {
      const fastSuggestions = collectTopSuggestions();
      if (fastSuggestions.length > 0) {
        addressSuggestionsCacheRef.current.set(cacheKey, fastSuggestions);
        return fastSuggestions;
      }
    }

    if (YANDEX_GEOSUGGEST_API_KEY) {
      try {
        const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
        url.searchParams.set("apikey", YANDEX_GEOSUGGEST_API_KEY);
        url.searchParams.set("text", geocodeQuery);
        url.searchParams.set("lang", "ru_RU");
        url.searchParams.set("results", String(suggestResults));
        url.searchParams.set("print_address", "1");
        if (geosuggestType) {
          url.searchParams.set("types", geosuggestType);
        }
        url.searchParams.set("bbox", bbox);
        url.searchParams.set("strict_bounds", "1");

        const abortController = new AbortController();
        const timeoutId = window.setTimeout(() => abortController.abort(), 900);
        const response = await fetch(url.toString(), { signal: abortController.signal });
        window.clearTimeout(timeoutId);
        if (response.ok) {
          const payload = (await response.json()) as {
            results?: Array<{
              title?: { text?: string } | string;
              subtitle?: { text?: string } | string;
            }>;
          };

          for (const item of payload.results ?? []) {
            const title = typeof item.title === "string" ? item.title : String(item.title?.text ?? "");
            const subtitle = typeof item.subtitle === "string" ? item.subtitle : String(item.subtitle?.text ?? "");
            const candidate = [title.trim(), subtitle.trim()].filter(Boolean).join(", ");
            if (!candidate) continue;
            const merged = mergeAddressSuggestionWithContext(raw, candidate);
            if (!merged) continue;
            const mergedRegion = sanitizeRegion(extractRegionFromInput(merged) || merged.split(",")[0] || "");
            if (
              expectedRegionToken &&
              mergedRegion &&
              !areRegionsCompatible(expectedRegionToken, mergedRegion)
            ) {
              continue;
            }
            pushCandidate(merged);
          }
        }
      } catch {
        // noop
      }
    }

    if (stage === "city" && candidates.length > 0) {
      const fastSuggestions = collectTopSuggestions();
      if (fastSuggestions.length > 0) {
        addressSuggestionsCacheRef.current.set(cacheKey, fastSuggestions);
        return fastSuggestions;
      }
    }

    const shouldRunSlowGeocode =
      (stage === "street" || stage === "house") &&
      candidates.length < Math.max(3, Math.ceil(results / 2));

    if (ymaps?.geocode && shouldRunSlowGeocode) {
      try {
        const geocodeOptions = {
          results: Math.max(results, 6),
          boundedBy: effectiveBounds,
          strictBounds: true,
          ...(stage === "city" ? { kind: "locality" } : {}),
        };
        const geocodeResult = await ymaps.geocode(geocodeQuery, {
          ...geocodeOptions,
        });
        const geoObjects = geocodeResult?.geoObjects;
        const length = Number(geoObjects?.getLength?.() ?? 0);

        for (let i = 0; i < length; i += 1) {
          const geoObject = geoObjects?.get?.(i);
          if (!geoObject) continue;

          const parsed = parseGeoObjectAddress(geoObject);
          if (!isRussianCountry(parsed.country)) continue;
          if (!areRegionsCompatible(expectedRegionToken, parsed.region)) {
            continue;
          }
          const mapped = buildSuggestionValue(stage, contextTokens, queryToken, parsed);
          if (!mapped) continue;

          pushCandidate(mapped, parsed.postalCode || undefined);
        }
      } catch {
        // fallback to suggest APIs below
      }
    }

    candidates.sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"));
    let best = candidates.slice(0, results);

    if (!best.length && stage === "city") {
      const parsedCityFallback = await geocodeAddressWithTimeout(geocodeQuery, 700);
      if (parsedCityFallback?.city) {
        const fallbackRegion =
          sanitizeRegion(contextTokens[0]) ||
          sanitizeRegion(parsedCityFallback.region) ||
          sanitizeRegion(extractRegionFromInput(parsedCityFallback.formatted));

        if (!expectedRegionToken || !fallbackRegion || areRegionsCompatible(expectedRegionToken, fallbackRegion)) {
          pushCandidate(
            buildAddressFromTokens([fallbackRegion, sanitizeCityValue(parsedCityFallback.city)]),
            parsedCityFallback.postalCode || undefined,
            { allowSameAsInput: true, scoreBoost: 420 },
          );
          candidates.sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru"));
          best = candidates.slice(0, results);
        }
      }
    }

    if (stage === "house" && canonicalHouseAddress) {
      const postalCode = canonicalHousePostalCode;
      const normalizedCanonical = normalizeAddressToken(canonicalHouseAddress);
      const canonicalLabel = postalCode
        ? `${canonicalHouseAddress} (индекс ${postalCode})`
        : canonicalHouseAddress;

      const bestCanonicalIndex = best.findIndex(
        (option) => normalizeAddressToken(option.value) === normalizedCanonical,
      );
      if (bestCanonicalIndex >= 0) {
        const [canonicalItem] = best.splice(bestCanonicalIndex, 1);
        best.unshift({
          ...canonicalItem,
          label: canonicalLabel,
          value: canonicalHouseAddress,
          postalCode,
        });
      } else {
        best.unshift({
          label: canonicalLabel,
          value: canonicalHouseAddress,
          postalCode,
          score: Number.MAX_SAFE_INTEGER,
        });
      }

      best = best.slice(0, results);
    }

    if (!best.length && contextPrefix) {
      addressSuggestionsCacheRef.current.delete(cacheKey);
      return [];
    }

    const finalSuggestions = best.map(({ score, ...option }) => option);
    if (finalSuggestions.length > 0) {
      addressSuggestionsCacheRef.current.set(cacheKey, finalSuggestions);
    } else {
      addressSuggestionsCacheRef.current.delete(cacheKey);
    }
    if (addressSuggestionsCacheRef.current.size > 350) {
      const firstKey = addressSuggestionsCacheRef.current.keys().next().value;
      if (firstKey) {
        addressSuggestionsCacheRef.current.delete(firstKey);
      }
    }
    return finalSuggestions;
  }, [
    boundsToBbox,
    buildAddressFromTokens,
    buildRegionCandidateFromQuery,
    buildSuggestionValue,
    computeRegionMatchScore,
    detectAddressStep,
    areRegionsCompatible,
    extractApartmentNumber,
    extractEntranceNumber,
    extractHouseNumber,
    extractRegionFromInput,
    fetchFreeformAddressSuggestions,
    fetchLooseYandexSuggestions,
    fetchYandexNativeSuggestions,
    geocodeAddressWithTimeout,
    mergeAddressSuggestionWithContext,
    normalizeCityForMatch,
    normalizeRegionForMatch,
    normalizeAddressToken,
    parseGeoObjectAddress,
    sanitizeApartmentValue,
    sanitizeCityValue,
    sanitizeEntranceValue,
    sanitizeHouseValue,
    sanitizeRegion,
    scoreAddressSuggestion,
    resolveSearchBoundsWithTimeout,
    splitCompactRegionToken,
    stripCityPrefix,
    splitAddressInput,
  ]);

  useEffect(() => {
    if (!addressModalOpen || !isAddressInputFocused) return;

    const rawAddress = addressForm.fullAddress.trim();
    if (rawAddress.length < 2) {
      addressSuggestionsRequestSeqRef.current += 1;
      setAddressSuggestions([]);
      setAddressSuggestionActiveIndex(-1);
      return;
    }

    const requestSeq = addressSuggestionsRequestSeqRef.current + 1;
    addressSuggestionsRequestSeqRef.current = requestSeq;

    const timer = window.setTimeout(async () => {
      try {
        const suggestions = await fetchYandexSuggestions(rawAddress, 8);
        if (addressSuggestionsRequestSeqRef.current !== requestSeq) return;
        setAddressSuggestions(suggestions);
        setAddressSuggestionActiveIndex(-1);
      } catch {
        if (addressSuggestionsRequestSeqRef.current !== requestSeq) return;
        setAddressSuggestions([]);
        setAddressSuggestionActiveIndex(-1);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [addressModalOpen, isAddressInputFocused, addressForm.fullAddress, fetchYandexSuggestions]);

  useEffect(() => {
    if (!addressModalOpen) return;

    const rawAddress = addressForm.fullAddress.trim();
    if (rawAddress.length < 6) return;

    const numberMatches = rawAddress.match(/\b\d{1,4}[a-zа-я/-]?\b/giu) ?? [];
    const hasHouseLikeInput =
      /(?:дом|д\.?)\s*[0-9a-zа-я/-]+/iu.test(rawAddress) ||
      (numberMatches.length >= 1 && rawAddress.split(/\s+/).filter(Boolean).length >= 3);
    if (!hasHouseLikeInput) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const geocodeQuery = rawAddress.includes(",")
        ? rawAddress
        : normalizeFreeformAddressForGeocode(rawAddress);

      const parsed = await geocodeAddressWithTimeout(geocodeQuery, 900);
      if (cancelled || !parsed) return;

      let nextPostalCode = parsed.postalCode || "";
      let nextLat = typeof parsed.lat === "number" ? parsed.lat : null;
      let nextLon = typeof parsed.lon === "number" ? parsed.lon : null;

      if (!nextPostalCode) {
        const houseOnlyAddress = composeFullAddress({
          region: sanitizeRegion(parsed.region),
          city: sanitizeCityValue(parsed.city),
          street: sanitizeStreetValue(parsed.street),
          house: sanitizeHouseValue(parsed.house),
        });
        if (houseOnlyAddress) {
          const houseOnlyParsed = await geocodeAddressWithTimeout(houseOnlyAddress, 700);
          if (!cancelled && houseOnlyParsed) {
            nextPostalCode = houseOnlyParsed.postalCode || nextPostalCode;
            nextLat = typeof houseOnlyParsed.lat === "number" ? houseOnlyParsed.lat : nextLat;
            nextLon = typeof houseOnlyParsed.lon === "number" ? houseOnlyParsed.lon : nextLon;
          }
        }
      }

      setAddressForm((prev) => {
        if (prev.fullAddress.trim() !== rawAddress) return prev;

        const nextRegion = sanitizeRegion(parsed.region) || prev.region;
        const nextCity = sanitizeCityValue(parsed.city) || prev.city;
        const nextStreet = sanitizeStreetValue(parsed.street) || prev.street;
        const nextHouse = sanitizeHouseValue(parsed.house) || prev.house;
        const nextPostal = nextPostalCode || prev.postalCode;
        const resolvedLat = typeof nextLat === "number" ? nextLat : prev.lat;
        const resolvedLon = typeof nextLon === "number" ? nextLon : prev.lon;

        if (
          nextRegion === prev.region &&
          nextCity === prev.city &&
          nextStreet === prev.street &&
          nextHouse === prev.house &&
          nextPostal === prev.postalCode &&
          resolvedLat === prev.lat &&
          resolvedLon === prev.lon
        ) {
          return prev;
        }

        return {
          ...prev,
          region: nextRegion,
          city: nextCity,
          street: nextStreet,
          house: nextHouse,
          postalCode: nextPostal,
          lat: resolvedLat,
          lon: resolvedLon,
        };
      });
    }, 550);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    addressModalOpen,
    addressForm.fullAddress,
    composeFullAddress,
    geocodeAddressWithTimeout,
    normalizeFreeformAddressForGeocode,
    sanitizeCityValue,
    sanitizeHouseValue,
    sanitizeRegion,
    sanitizeStreetValue,
  ]);

  const createAddress = async () => {
    const name = addressForm.name.trim();
    const fullAddressInput = addressForm.fullAddress.trim();

    if (!name || !fullAddressInput) {
      setAddressMapHint("Заполните обязательные поля: название и полный адрес.");
      return;
    }

    const geocodeSeed = fullAddressInput.includes(",")
      ? fullAddressInput
      : normalizeFreeformAddressForGeocode(fullAddressInput);
    const parsed =
      await geocodeAddress(fullAddressInput) ||
      (geocodeSeed !== fullAddressInput ? await geocodeAddress(geocodeSeed) : null);

    if (!parsed) {
      setAddressMapHint("Не удалось определить координаты. Выберите подсказку или точку на карте.");
      return;
    }

    const region = sanitizeRegion(parsed.region);
    const city = sanitizeCityValue(parsed.city);
    const street = sanitizeStreetValue(parsed.street);
    const house = sanitizeHouseValue(parsed.house);
    const apartment = sanitizeApartmentValue(
      addressForm.apartment || extractApartmentNumber(fullAddressInput),
    );
    const entrance = sanitizeEntranceValue(
      addressForm.entrance || extractEntranceNumber(fullAddressInput),
    );
    const postalCode = parsed.postalCode || addressForm.postalCode.trim();
    const lat = typeof parsed.lat === "number" ? parsed.lat : addressForm.lat;
    const lon = typeof parsed.lon === "number" ? parsed.lon : addressForm.lon;

    if (
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      typeof lon !== "number" ||
      !Number.isFinite(lon)
    ) {
      setAddressMapHint("Не удалось определить координаты. Выберите подсказку или точку на карте.");
      return;
    }

    const canonicalBase = normalizeAddressDisplay(
      parsed.formatted ||
      composeFullAddress({
        region,
        city,
        street,
        house,
      }) ||
      fullAddressInput,
    );
    const normalizedFullAddress =
      canonicalBase ||
      fullAddressInput;

    try {
      await apiPost<Address>("/profile/addresses", {
        name,
        fullAddress: normalizedFullAddress,
        region,
        city,
        street,
        house,
        apartment,
        entrance,
        postalCode,
        lat,
        lon,
        isDefault: addresses.length === 0,
      });

      setAddressModalOpen(false);
      setAddressMapHint("");
      setAddressSuggestions([]);
      setIsAddressInputFocused(false);
      setMapCenterQuery(null);
      setAddressForm({
        name: "",
        fullAddress: "",
        region: "",
        city: "",
        street: "",
        house: "",
        apartment: "",
        entrance: "",
        postalCode: "",
        lat: null,
        lon: null,
      });

      await loadProfile();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось добавить адрес");
    }
  };

  const deleteAddress = async (id: string) => {
    const targetAddress = addresses.find((item) => item.id === id);
    if (targetAddress?.isDefault) {
      alert("Нельзя удалить адрес по умолчанию");
      return;
    }

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
    region: string;
    city: string;
    street: string;
    building: string;
    postalCode: string;
    fullAddress?: string;
    lat?: number | null;
    lon?: number | null;
    apartment?: string;
    entrance?: string;
  }) => {
    setAddressForm((prev) => {
      const nextRegion = sanitizeRegion(address.region);
      const nextCity = sanitizeCityValue(address.city);
      const nextStreet = sanitizeStreetValue(address.street);
      const nextHouse = sanitizeHouseValue(address.building);
      const nextApartment = sanitizeApartmentValue(address.apartment);
      const nextEntrance = sanitizeEntranceValue(address.entrance);
      const canonicalBase = normalizeAddressDisplay(
        address.fullAddress ||
        composeFullAddress({
          region: nextRegion,
          city: nextCity,
          street: nextStreet,
          house: nextHouse,
        }) ||
        prev.fullAddress,
      );

      return {
        ...prev,
        region: nextRegion,
        city: nextCity,
        street: nextStreet,
        house: nextHouse,
        apartment: nextApartment,
        entrance: nextEntrance,
        postalCode: address.postalCode || prev.postalCode,
        lat: typeof address.lat === "number" ? address.lat : prev.lat,
        lon: typeof address.lon === "number" ? address.lon : prev.lon,
        fullAddress: canonicalBase || prev.fullAddress,
      };
    });

    setAddressMapHint("");
    const centerCandidate = normalizeAddressDisplay(
      address.fullAddress ||
      composeFullAddress({
        region: sanitizeRegion(address.region),
        city: sanitizeCityValue(address.city),
        street: sanitizeStreetValue(address.street),
        house: sanitizeHouseValue(address.building),
      }),
    );
    setMapCenterQuery(centerCandidate || null);
  };
  const handleAddressSuggestionSelect = async (option: AddressSuggestionOption) => {
    if (addressInputBlurTimeoutRef.current) {
      window.clearTimeout(addressInputBlurTimeoutRef.current);
      addressInputBlurTimeoutRef.current = null;
    }
    isSelectingAddressSuggestionRef.current = false;

    setAddressSuggestions([]);
    setAddressSuggestionActiveIndex(-1);
    await applyFullAddressValue(option.formatted || option.value);
    setAddressForm((prev) => {
      return {
        ...prev,
        region: sanitizeRegion(option.region) || prev.region,
        city: sanitizeCityValue(option.city) || prev.city,
        street: sanitizeStreetValue(option.street) || prev.street,
        house: sanitizeHouseValue(option.house) || prev.house,
        apartment: sanitizeApartmentValue(option.apartment),
        entrance: sanitizeEntranceValue(option.entrance),
        postalCode: option.postalCode || prev.postalCode,
        lat: typeof option.lat === "number" ? option.lat : prev.lat,
        lon: typeof option.lon === "number" ? option.lon : prev.lon,
      };
    });

    // Keep suggestions flow alive after click selection.
    // The input usually keeps native focus due onMouseDown preventDefault,
    // so forcing false here blocks the next suggestion fetch until blur/focus cycle.
    setIsAddressInputFocused(true);
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

  const getOrderStatusMeta = (status: Order["status"]) => {
    const map: Record<Order["status"], { label: string; className: string }> = {
      processing: { label: "В обработке", className: "bg-amber-50 text-amber-700 border-amber-200" },
      shipped: { label: "Отправлен", className: "bg-blue-50 text-blue-700 border-blue-200" },
      completed: { label: "Завершен", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      cancelled: { label: "Отменен", className: "bg-red-50 text-red-700 border-red-200" },
    };
    return map[status];
  };

  const resetAddressModalState = () => {
    if (addressInputBlurTimeoutRef.current) {
      window.clearTimeout(addressInputBlurTimeoutRef.current);
      addressInputBlurTimeoutRef.current = null;
    }
    addressBoundsCacheRef.current.clear();
    addressSuggestionsCacheRef.current.clear();
    addressSuggestionsRequestSeqRef.current += 1;
    isSelectingAddressSuggestionRef.current = false;
    setAddressMapHint("");
    setAddressSuggestions([]);
    setAddressSuggestionActiveIndex(-1);
    setIsAddressInputFocused(false);
    setMapCenterQuery(null);
    setAddressForm({
      name: "",
      fullAddress: "",
      region: "",
      city: "",
      street: "",
      house: "",
      apartment: "",
      entrance: "",
      postalCode: "",
      lat: null,
      lon: null,
    });
  };

  const renderProfileTab = () => (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold md:text-xl">Настройки профиля</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={profileForm.firstName}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
          placeholder="Имя"
          className="field-control"
        />
        <input
          value={profileForm.lastName}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, lastName: event.target.value }))}
          placeholder="Фамилия"
          className="field-control"
        />
      </div>
      <input
        value={profileForm.displayName}
        onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
        placeholder="Отображаемое имя"
        className="field-control"
      />
      <input
        value={profileForm.email}
        onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
        placeholder="Email"
        className="field-control"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="password"
          value={profileForm.oldPassword}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, oldPassword: event.target.value }))}
          placeholder="Старый пароль"
          className="field-control"
        />
        <input
          type="password"
          value={profileForm.newPassword}
          onChange={(event) => setProfileForm((prev) => ({ ...prev, newPassword: event.target.value }))}
          placeholder="Новый пароль"
          className="field-control"
        />
      </div>
      <button
        onClick={() => void saveProfile()}
        disabled={saveLoading}
        className="btn-primary px-4 py-2.5 disabled:bg-gray-400"
      >
        {saveLoading ? "Сохраняем..." : "Сохранить изменения"}
      </button>
    </div>
  );

  const renderAddressesTab = () => (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold md:text-xl">Адреса доставки</h3>
        <button
          onClick={() => {
            resetAddressModalState();
            const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
            const initialCenter = normalizeAddressDisplay(
              defaultAddress?.fullAddress ||
              composeFullAddress({
                region: sanitizeRegion(defaultAddress?.region || ""),
                city: sanitizeCityValue(defaultAddress?.city || profile?.city || ""),
                street: sanitizeStreetValue(defaultAddress?.street || ""),
                house: sanitizeHouseValue(defaultAddress?.house || ""),
              }) ||
              sanitizeCityValue(profile?.city || "") ||
              "Россия",
            );
            setMapCenterQuery(initialCenter || "Россия");
            setAddressModalOpen(true);
          }}
          className="btn-primary px-3 py-2 flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      <div className="space-y-3">
        {addresses.map((address) => (
          <div key={address.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold break-words">
                  {address.name} {address.isDefault && <span className="text-xs text-green-600">(по умолчанию)</span>}
                </div>
                <div className="text-sm text-gray-600 break-words">
                  {(() => {
                    const baseAddress =
                      address.fullAddress ||
                      [address.region, address.city, address.street, address.building, address.postalCode]
                        .filter(Boolean)
                        .join(", ");
                    if (!address.postalCode) return baseAddress;
                    if (/(?:индекс\s*)?\d{6}/iu.test(baseAddress)) return baseAddress;
                    return `${baseAddress}, индекс ${address.postalCode}`;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                {!address.isDefault && (
                  <button onClick={() => void setDefaultAddress(address.id)} className="btn-secondary text-xs px-2 py-1.5">По умолчанию</button>
                )}
                <button
                  onClick={() => void deleteAddress(address.id)}
                  disabled={address.isDefault}
                  title={address.isDefault ? "Адрес по умолчанию удалить нельзя" : "Удалить адрес"}
                  className={`btn-secondary text-xs px-2 py-1.5 ${
                    address.isDefault
                      ? "cursor-not-allowed text-gray-400 opacity-60"
                      : "text-red-600"
                  }`}
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
        {addresses.length === 0 && <div className="text-sm text-gray-500">Нет сохраненных адресов</div>}
      </div>

      {addressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-[#d7e1ec] bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.65)]"
            style={{ width: "min(940px, 96vw)" }}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h4 className="text-lg font-semibold">Новый адрес</h4>
              <button
                onClick={() => {
                  resetAddressModalState();
                  setAddressModalOpen(false);
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
              <div className="space-y-3 overflow-visible">
                  <input
                    value={addressForm.name}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Название адреса"
                    className="field-control"
                  />

                  <div className="relative z-30">
                    <input
                      value={addressForm.fullAddress}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setAddressMapHint("");
                        setIsAddressInputFocused(true);
                        setAddressForm((prev) => ({ ...prev, fullAddress: nextValue }));
                      }}
                      onFocus={() => {
                        if (addressInputBlurTimeoutRef.current) {
                          window.clearTimeout(addressInputBlurTimeoutRef.current);
                          addressInputBlurTimeoutRef.current = null;
                        }
                        isSelectingAddressSuggestionRef.current = false;
                        setIsAddressInputFocused(true);
                        setAddressSuggestionActiveIndex(-1);
                      }}
                      onBlur={() => {
                        if (addressInputBlurTimeoutRef.current) {
                          window.clearTimeout(addressInputBlurTimeoutRef.current);
                        }
                        addressInputBlurTimeoutRef.current = window.setTimeout(() => {
                          addressInputBlurTimeoutRef.current = null;
                          const keepFocused = isSelectingAddressSuggestionRef.current;
                          isSelectingAddressSuggestionRef.current = false;
                          if (keepFocused) {
                            setIsAddressInputFocused(true);
                            return;
                          }
                          setIsAddressInputFocused(false);
                          setAddressSuggestionActiveIndex(-1);
                        }, 120);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          if (addressSuggestions.length === 0) return;
                          event.preventDefault();
                          setAddressSuggestionActiveIndex((prev) => {
                            const lastIndex = addressSuggestions.length - 1;
                            if (prev < 0) return 0;
                            return Math.min(prev + 1, lastIndex);
                          });
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          if (addressSuggestions.length === 0) return;
                          event.preventDefault();
                          setAddressSuggestionActiveIndex((prev) => (prev <= 0 ? 0 : prev - 1));
                          return;
                        }

                        if (event.key === "Escape") {
                          setAddressSuggestions([]);
                          setAddressSuggestionActiveIndex(-1);
                          setIsAddressInputFocused(false);
                          return;
                        }

                        if (event.key === "Tab") {
                          if (addressSuggestions.length === 0) return;
                          const tabSuggestion =
                            addressSuggestionActiveIndex >= 0
                              ? addressSuggestions[addressSuggestionActiveIndex]
                              : addressSuggestions[0];
                          if (!tabSuggestion) return;
                          event.preventDefault();
                          void handleAddressSuggestionSelect(tabSuggestion).then(() => {
                            setIsAddressInputFocused(true);
                          });
                          return;
                        }

                        if (event.key !== "Enter") return;
                        event.preventDefault();

                        const currentValue = addressForm.fullAddress.trim();
                        if (!currentValue) return;

                        const normalizedInput = normalizeSuggestionComparable(currentValue);
                        const findExactMatch = (items: AddressSuggestionOption[]) =>
                          items.find((option) => {
                            const valueNorm = normalizeSuggestionComparable(option.value);
                            const labelNorm = normalizeSuggestionComparable(option.label);
                            return valueNorm === normalizedInput || labelNorm === normalizedInput;
                          });

                        const immediateMatch = findExactMatch(addressSuggestions);
                        if (immediateMatch) {
                          void handleAddressSuggestionSelect(immediateMatch);
                          return;
                        }

                        void (async () => {
                          try {
                            const fetchedSuggestions = await fetchYandexSuggestions(currentValue, 8);
                            const exactFetched = findExactMatch(fetchedSuggestions);
                            if (exactFetched) {
                              await handleAddressSuggestionSelect(exactFetched);
                              return;
                            }

                            const geocodeSeed = currentValue.includes(",")
                              ? currentValue
                              : normalizeFreeformAddressForGeocode(currentValue);
                            const parsed = await geocodeAddressWithTimeout(geocodeSeed, 900);
                            if (!parsed) {
                              setAddressMapHint("Адрес не найден. Выберите вариант из подсказок или уточните ввод.");
                              return;
                            }

                            const normalizedFromGeocode = normalizeAddressDisplay(
                              parsed.formatted ||
                              composeFullAddress({
                                region: sanitizeRegion(parsed.region),
                                city: sanitizeCityValue(parsed.city),
                                street: sanitizeStreetValue(parsed.street),
                                house: sanitizeHouseValue(parsed.house),
                              }) ||
                              currentValue,
                            );

                            await applyFullAddressValue(normalizedFromGeocode);
                            setAddressMapHint("");
                            setIsAddressInputFocused(true);
                          } catch {
                            setAddressMapHint("Не удалось применить адрес. Попробуйте выбрать вариант из подсказок.");
                          }
                        })();
                        return;
                      }}
                      placeholder="Полный адрес: Кировская область, Киров, Октябрьский пр-кт, д. 117, подъезд 2, кв. 220"
                      className="field-control"
                    />
                    {isAddressInputFocused && addressSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {addressSuggestions.map((suggestion, index) => (
                          <button
                            key={suggestion.value}
                            type="button"
                            onPointerDown={(event) => {
                              isSelectingAddressSuggestionRef.current = true;
                              event.preventDefault();
                            }}
                            onMouseDown={(event) => {
                              isSelectingAddressSuggestionRef.current = true;
                              event.preventDefault();
                            }}
                            onMouseEnter={() => setAddressSuggestionActiveIndex(index)}
                            onClick={() => void handleAddressSuggestionSelect(suggestion)}
                            className={`w-full px-3 py-2 text-left text-sm ${
                              index === addressSuggestionActiveIndex ? "bg-gray-100" : "hover:bg-gray-50"
                            }`}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {addressForm.postalCode && (
                    <p className="text-xs text-gray-600">Индекс по адресу: {addressForm.postalCode}</p>
                  )}
                  {addressMapHint && <p className="text-xs text-amber-700">{addressMapHint}</p>}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <YandexMapPicker
                    onAddressSelect={handleAddressSelectFromMap}
                    height={520}
                    centerQuery={mapCenterQuery}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={() => void createAddress()} className="btn-primary flex-1 py-2.5">Сохранить</button>
              <button
                onClick={() => {
                  resetAddressModalState();
                  setAddressModalOpen(false);
                }}
                className="btn-secondary flex-1 py-2.5"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderOrdersTab = () => (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold md:text-xl">История заказов</h3>
      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{order.orderNumber}</div>
              <div className="text-xs text-gray-500">{new Date(order.date).toLocaleString("ru-RU")}</div>
              <div className="text-sm text-gray-600">Продавец: {order.seller.name}</div>
            </div>
            <div className="flex flex-col items-start gap-1 text-left sm:items-end sm:text-right">
              <div className="text-sm">{order.total.toLocaleString("ru-RU")} ₽</div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getOrderStatusMeta(order.status).className}`}>
                {getOrderStatusMeta(order.status).label}
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1">
                  {item.listingPublicId.trim() ? (
                    <button
                      type="button"
                      onClick={() => handleOpenListing(item.listingPublicId)}
                      className="text-left text-sm font-medium text-blue-700 hover:underline"
                    >
                      {item.name}
                    </button>
                  ) : (
                    <p className="text-sm font-medium">{item.name}</p>
                  )}
                  <p className="text-sm text-gray-600">{item.price.toLocaleString("ru-RU")} ₽ x {item.quantity}</p>
                </div>
                {order.status === "completed" && (
                  <button
                    onClick={() => {
                      setItemToReview(item);
                      setReviewModalOpen(true);
                    }}
                    className="btn-secondary text-xs px-2 py-1.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="app-modal-panel p-6">
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
                className="field-control"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => void handlePostReview()} className="btn-primary flex-1 py-2.5">Отправить отзыв</button>
              <button onClick={() => setReviewModalOpen(false)} className="btn-secondary flex-1 py-2.5">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderWishlistTab = () => (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold md:text-xl">Избранные товары</h3>
      {wishlistItems.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />
          <div className="flex-1">
            <button
              type="button"
              onClick={() => handleOpenListing(item.id)}
              className="text-left font-medium text-blue-700 hover:underline"
            >
              {item.name}
            </button>
            <div className="text-sm text-gray-600">{item.price.toLocaleString("ru-RU")} ₽ • {item.seller}</div>
          </div>
          <button onClick={() => void removeWishlistItem(item.id)} className="btn-secondary px-3 py-1.5 text-sm text-red-600">Удалить</button>
        </div>
      ))}
      {wishlistItems.length === 0 && <div className="text-sm text-gray-500">Избранное пусто</div>}
    </div>
  );

  const renderPartnershipTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold md:text-xl">Заявка на партнерство</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          value={partnershipForm.sellerType}
          onChange={(event) => setPartnershipForm((prev) => ({ ...prev, sellerType: event.target.value as "company" | "private" }))}
          className="field-control"
        >
          <option value="company">Компания</option>
          <option value="private">Частный продавец</option>
        </select>
        <input value={partnershipForm.name} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Название / ФИО" className="field-control" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={partnershipForm.email} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" className="field-control" />
        <input value={partnershipForm.contact} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, contact: event.target.value }))} placeholder="Контакт" className="field-control" />
      </div>
      <input value={partnershipForm.link} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, link: event.target.value }))} placeholder="Ссылка на сайт/профиль" className="field-control" />
      <input value={partnershipForm.category} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Категория" className="field-control" />
      <input value={partnershipForm.inn} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, inn: event.target.value }))} placeholder="ИНН (опционально)" className="field-control" />
      <textarea value={partnershipForm.whyUs} onChange={(event) => setPartnershipForm((prev) => ({ ...prev, whyUs: event.target.value }))} placeholder="Почему хотите работать с нами" rows={4} className="field-control" />
      <button onClick={() => void submitPartnershipRequest()} className="btn-primary px-4 py-2.5">Отправить заявку</button>
    </div>
  );

  const renderPartnerTab = () => {
    if (activeTab === "partner-listings") {
      return (
        <Suspense fallback={<div className="text-sm text-gray-500">Загрузка объявлений...</div>}>
          <PartnerListingsPage />
        </Suspense>
      );
    }
    if (activeTab === "partner-questions") {
      return (
        <Suspense fallback={<div className="text-sm text-gray-500">Загрузка вопросов...</div>}>
          <QuestionsPage />
        </Suspense>
      );
    }
    if (activeTab === "partner-orders") {
      return (
        <Suspense fallback={<div className="text-sm text-gray-500">Загрузка заказов...</div>}>
          <PartnerOrdersPage />
        </Suspense>
      );
    }
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
    <div className="min-h-screen app-shell pb-10 pt-24 md:pb-16 md:pt-28">
      <div className="page-container">
        <section className="dashboard-card mb-4 p-4 md:mb-6 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="dashboard-title">Личный кабинет</h1>
              <p className="dashboard-subtitle break-words">
                {profile?.displayName || profile?.name} • {profile?.email}
              </p>
            </div>
            <button onClick={onBack} className="back-link text-sm">← На главную</button>
          </div>
        </section>

        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <aside className="dashboard-sidebar h-fit p-4 lg:w-80">
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
              <div className="mb-4">
                <div className="dashboard-sidebar__section">
                  <p className="dashboard-sidebar__title">Базовые</p>
                  <div className="dashboard-nav-list">
                    {partnerBaseTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`dashboard-nav-btn ${
                            activeTab === tab.id
                              ? "dashboard-nav-btn--active"
                              : ""
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="dashboard-sidebar__section">
                  <p className="dashboard-sidebar__title">Партнерские</p>
                  <div className="dashboard-nav-list">
                    {partnerTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`dashboard-nav-btn ${
                            activeTab === tab.id
                              ? "dashboard-nav-btn--active"
                              : ""
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
              <div className="dashboard-sidebar__section mb-4">
                <div className="dashboard-nav-list">
                {regularTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                        className={`dashboard-nav-btn ${
                        activeTab === tab.id
                            ? "dashboard-nav-btn--active"
                            : ""
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
                </div>
              </div>
            )}

            <button
              onClick={onLogout}
              className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </aside>

          <main className="dashboard-sidebar flex-1 p-4 md:p-6">
            {renderActiveTab()}
          </main>
        </div>
      </div>
    </div>
  );
}
