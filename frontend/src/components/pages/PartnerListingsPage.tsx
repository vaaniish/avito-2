import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  ChevronDown,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { AppModal } from "../ui/app-modal";
import { ConfirmDialog, ToastViewport, type AppNotice } from "../ui/feedback";
import {
  composeFullAddress,
  extractApartmentNumber,
  extractEntranceNumber,
  normalizeAddressDisplay,
  normalizeFreeformAddressForGeocode,
  sanitizeApartmentValue,
  sanitizeCityValue,
  sanitizeEntranceValue,
  sanitizeHouseValue,
  sanitizeRegion,
  sanitizeStreetValue,
} from "./profile.address-helpers";
import { scheduleAddressAutofill } from "./profile.address-autofill";
import {
  createEmptyAddressForm,
  mergeAddressFromMap,
  prepareCreateAddressPayload,
  resolveMapCenterQuery,
  type AddressMapSelection,
} from "./profile.address-flow";
import { createAddressInputHandlers } from "./profile.address-input.handlers";
import {
  closeAddressCreateModal as closeAddressCreateModalHandler,
  handleAddressFullAddressChange as handleAddressFullAddressChangeHandler,
  openAddressCreateModal as openAddressCreateModalHandler,
  resetAddressModalState as resetAddressModalStateHandler,
} from "./profile.address-modal.handlers";
import { mountNativeAddressSuggest } from "./profile.address-suggest";
import { RUSSIA_BOUNDS, YANDEX_GEOSUGGEST_API_KEY } from "./profile.address-utils";
import { ProfileAddressCreateModal } from "./profile.address-create-modal";
import { geocodeAddress as geocodeProfileAddress } from "./profile.geocode";
import { analyzeListingImagesForModeration } from "./partner-listing-image-moderation";
import type {
  Address,
  AddressFormState,
  AddressSuggestionOption,
} from "./profile.models";

type ListingAttribute = { key: string; value: string };
type ListingType = "products";
type CreationScreen = "start" | "titleSearch" | "manualCategory" | "details";
type ListingCondition = "new" | "restored" | "used";
type DefectsValue = "" | "yes" | "no";
type CatalogRequestMode = "catalog" | "characteristic";

type CharacteristicField = {
  key: string;
  label: string;
  required?: boolean;
  options?: string[];
  inputType?: "text" | "number" | "select" | "textarea";
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  defaultValue?: string | null;
  orderIndex?: number;
  locked?: boolean;
  source?: "bracketGroups";
};

type Listing = {
  id: string;
  title: string;
  price: number;
  condition: ListingCondition;
  status: "active" | "inactive" | "moderation";
  views: number;
  created_at: string;
  image: string;
  images?: string[];
  description?: string | null;
  category?: string;
  city?: string | null;
  attributes?: ListingAttribute[];
  moderation?: {
    status: "approved" | "pending" | "rejected";
    reasonCode?: string | null;
    reasonNote?: string | null;
    decidedAt?: string | null;
  };
};

type FormState = {
  title: string;
  price: string;
  condition: ListingCondition;
  description: string;
  category: string;
  categoryRoot: string;
  customCategoryRoot: string;
  subcategory: string;
  customSubcategory: string;
  catalogItem: string;
  customCatalogItem: string;
  catalogRequestAttributes: string;
  catalogRequestComment: string;
  type: ListingType;
  meetingAddress: string;
  images: string[];
  hasDefects: DefectsValue;
  characteristics: Record<string, string>;
  hasMultipleStock: boolean;
};

type CatalogCategoryDto = {
  id: string;
  name: string;
  attributeSchema?: CharacteristicField[];
  subcategories: Array<{
    id: string;
    name: string;
    items: string[];
    attributeSchema?: CharacteristicField[];
    itemAttributeSchemas?: Record<string, CharacteristicField[]>;
  }>;
};

type ProfileAddressDto = Address;
type CategoryGuessDto = {
  category: string | null;
  confidence: number;
  source?: "listing" | "catalog";
};
type CreateSuggestionMatch = {
  itemId: string;
  itemPublicId: string;
  itemName: string;
  subcategoryId: string;
  subcategoryName: string;
  categoryId: string;
  categoryName: string;
  score: number;
};
type CreateSuggestionsDto = {
  query: string;
  chips: string[];
  titleSuggestions?: string[];
  matches: CreateSuggestionMatch[];
};
type ListingDraftDto = {
  id: string;
  title: string;
  type: ListingType;
  payload: Partial<FormState> | null;
  currentScreen: CreationScreen | string;
  updatedAt: string;
};
type CatalogReferenceCharacteristicDto = {
  key: string;
  label: string;
  value: string;
  rawValue: string;
  sourceGroupIndex: number;
  source?: "bracketGroups" | "titleFallback";
};

type CatalogReferenceVariantDto = {
  productId: string;
  title: string;
  characteristics: CatalogReferenceCharacteristicDto[];
};

type CatalogReferenceFieldDto = {
  key: string;
  label: string;
  options: string[];
  defaultValue: string | null;
  locked: boolean;
  source: "bracketGroups" | "titleFallback";
  orderIndex: number;
};

type CatalogReferenceDto = {
  item?: string;
  supported?: boolean;
  brands?: string[];
  brand?: string;
  models?: string[];
  model?: string;
  variants?: CatalogReferenceVariantDto[];
  characteristics?: CatalogReferenceCharacteristicDto[];
  fields?: CatalogReferenceFieldDto[];
};

type PartnerListingsPageProps = {
  onRequestAddressChange?: () => void;
  onOpenListing?: (listingPublicId: string) => void;
  onOpenCreateListing?: () => void;
  onExitCreate?: () => void;
  createMode?: boolean;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
const MAX_IMAGES = 10;
const MIN_IMAGES = 1;
const PRODUCT_MIN_IMAGES = 4;
const META_ATTR_MEETING_ADDRESS = "__meeting_address";
const META_ATTR_CATEGORY_ROOT = "__catalog_category";
const META_ATTR_SUBCATEGORY = "__catalog_subcategory";
const META_ATTR_CATALOG_ITEM = "__catalog_item";
const META_ATTR_CATALOG_ITEM_CUSTOM = "__catalog_item_custom";
const META_ATTR_CATALOG_REQUEST_ATTRIBUTES = "__catalog_request_attributes";
const META_ATTR_CATALOG_REQUEST_COMMENT = "__catalog_request_comment";
const META_ATTR_HAS_DEFECTS = "__has_defects";
const CUSTOM_OPTION = "Другой";
const CUSTOM_CATEGORY_OPTION = "Другая категория";
const CUSTOM_SUBCATEGORY_OPTION = "Другая подкатегория";
const CUSTOM_ITEM_OPTION = "Другой вид товара";
const CUSTOM_VALUE_OPTION = "Другое / предложить значение";
const PHOTO_RECOMMENDATION_TEXT =
  "Рекомендуемый размер фото: от 1200×900 px (соотношение 4:3).";
const FIELD_CLASS = "field-control min-h-12";
const TEXTAREA_CLASS = "field-control min-h-32 resize-y";
const FIELD_LABEL_CLASS = "text-[15px] font-bold text-gray-950";
const CATALOG_REQUEST_MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
function InlineIssue({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function normalizeSuggestionText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidCatalogRequestEmail(value: string): boolean {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/u.test(email);
}

function isValidCatalogRequestUrl(value: string): boolean {
  const rawValue = value.trim();
  try {
    const url = new URL(/^https?:\/\//iu.test(rawValue) ? rawValue : `https://${rawValue}`);
    const hostname = url.hostname.toLocaleLowerCase("ru-RU");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      /^[a-zа-я0-9.-]+\.[a-zа-я]{2,24}$/iu.test(hostname) &&
      !hostname.startsWith(".") &&
      !hostname.endsWith(".") &&
      !hostname.includes("..")
    );
  } catch {
    return false;
  }
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Не удалось прочитать фото"));
    reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
    reader.readAsDataURL(file);
  });
}

function shouldReplaceTitleWithSuggestion(currentTitle: string, suggestion: string): boolean {
  const current = normalizeSuggestionText(currentTitle);
  const next = normalizeSuggestionText(suggestion);
  if (!current || !next) return false;
  return next.includes(current) || current.includes(next);
}

function titleWithCompletion(currentTitle: string, suggestion: string): string {
  const current = currentTitle.trim();
  const next = suggestion.trim();
  if (!current) return next;
  if (!next) return current;

  const words = current.split(/\s+/);
  const last = words.at(-1) ?? "";
  const nextWords = next.split(/\s+/);
  const firstSuggestionWord = nextWords[0] ?? "";
  if (
    last.length > 0 &&
    firstSuggestionWord.toLocaleLowerCase("ru-RU").startsWith(last.toLocaleLowerCase("ru-RU")) &&
    firstSuggestionWord.toLocaleLowerCase("ru-RU") !== last.toLocaleLowerCase("ru-RU")
  ) {
    return [...words.slice(0, -1), next].join(" ");
  }

  return [current, next].filter(Boolean).join(" ");
}

type CharacteristicFieldDraft = Omit<CharacteristicField, "orderIndex">;

function characteristicField(
  key: string,
  label: string,
  overrides: Partial<CharacteristicFieldDraft> = {},
): CharacteristicFieldDraft {
  return {
    key,
    label,
    inputType:
      overrides.inputType ?? (overrides.options?.length ? "select" : "text"),
    required: overrides.required ?? true,
    options: overrides.options,
    unit: overrides.unit ?? null,
    min: overrides.min ?? null,
    max: overrides.max ?? null,
    defaultValue: overrides.defaultValue ?? null,
  };
}

const textField = (
  key: string,
  label: string,
  overrides: Partial<CharacteristicFieldDraft> = {},
) => characteristicField(key, label, overrides);
const numberField = (
  key: string,
  label: string,
  overrides: Partial<CharacteristicFieldDraft> = {},
) => characteristicField(key, label, { ...overrides, inputType: "number" });
const selectField = (
  key: string,
  label: string,
  options: string[],
  overrides: Partial<CharacteristicFieldDraft> = {},
) =>
  characteristicField(key, label, {
    ...overrides,
    inputType: "select",
    options,
  });
const textareaField = (
  key: string,
  label: string,
  overrides: Partial<CharacteristicFieldDraft> = {},
) => characteristicField(key, label, { ...overrides, inputType: "textarea" });

const colorField = textField("color", "Цвет");
const batteryField = numberField("battery_health", "Аккумулятор", {
  unit: "%",
  min: 1,
  max: 100,
});
const screenStateField = selectField("screen_state", "Состояние экрана", [
  "Без дефектов",
  "Есть царапины",
  "Есть трещины",
  "После замены",
  "Не проверялось",
]);
const phoneSimField = selectField("sim", "SIM / eSIM", [
  "1 SIM",
  "2 SIM",
  "eSIM",
  "SIM + eSIM",
  "Не знаю",
]);
const yesNoUnknown = ["Да", "Нет", "Не знаю"];
const brandOptions = (brands: string[]) => [...brands, CUSTOM_VALUE_OPTION, "Не знаю"];
const laptopFields = [
  textField("cpu", "Процессор"),
  textField("ram", "RAM"),
  textField("storage", "Накопитель"),
  numberField("screen_size", "Диагональ", { unit: "дюйм" }),
  textField("gpu", "Видеокарта"),
  batteryField,
];
const consoleFields = [
  textField("generation", "Поколение / версия"),
  textField("storage", "Память"),
  textField("revision", "Ревизия"),
  numberField("gamepads_count", "Количество геймпадов", { min: 0 }),
];

type FallbackSchemaConfig = {
  fields: CharacteristicFieldDraft[];
};

function makeFallbackSchema(
  config: FallbackSchemaConfig,
): CharacteristicField[] {
  const fields: CharacteristicFieldDraft[] = [
    textField("model", "Модель"),
    ...config.fields,
    textareaField("included", "Комплект"),
    textareaField("defects_description", "Дефекты"),
    textareaField("important_attributes", "Важные характеристики", {
      required: false,
    }),
  ];
  const seen = new Set<string>();
  return fields
    .filter((field) => {
      if (seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    })
    .map((field, index) => ({ ...field, orderIndex: index + 1 }));
}

const FALLBACK_ITEM_ATTRIBUTE_SCHEMAS: Record<string, CharacteristicField[]> = {
  iPhone: makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      colorField,
      phoneSimField,
      batteryField,
      selectField("biometric_state", "Face ID / Touch ID", [
        "Работает",
        "Не работает",
        "Не применимо",
        "Не проверялось",
      ]),
    ],
  }),
  "Samsung Galaxy": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      colorField,
      phoneSimField,
      batteryField,
      screenStateField,
    ],
  }),
  "Xiaomi/Redmi": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      colorField,
      phoneSimField,
      batteryField,
      screenStateField,
    ],
  }),
  "Google Pixel": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      colorField,
      phoneSimField,
      batteryField,
      screenStateField,
    ],
  }),
  "Складной смартфон": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      colorField,
      phoneSimField,
      batteryField,
      selectField("hinge_state", "Состояние шарнира", [
        "Без люфта",
        "Есть люфт",
        "После ремонта",
        "Не проверялось",
      ]),
      selectField("folding_screen_state", "Состояние складного экрана", [
        "Без дефектов",
        "Есть заломы",
        "Есть дефекты",
        "Не проверялось",
      ]),
    ],
  }),
  "Защищённый смартфон": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      colorField,
      phoneSimField,
      batteryField,
      textField("protection_class", "Класс защиты / IP"),
    ],
  }),

  MacBook: makeFallbackSchema({
    fields: [
      textField("cpu", "Процессор / чип"),
      textField("ram", "RAM"),
      textField("storage", "Накопитель"),
      numberField("screen_size", "Диагональ", { unit: "дюйм" }),
      batteryField,
      selectField("keyboard_layout", "Клавиатура", [
        "RU",
        "US",
        "EU",
        "Другая",
      ]),
    ],
  }),
  ThinkPad: makeFallbackSchema({
    fields: laptopFields,
  }),
  "Игровой ноутбук": makeFallbackSchema({ fields: laptopFields }),
  Ультрабук: makeFallbackSchema({ fields: laptopFields }),
  "Ноутбук Windows": makeFallbackSchema({ fields: laptopFields }),
  "Рабочая станция": makeFallbackSchema({ fields: laptopFields }),

  iPad: makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      numberField("screen_size", "Диагональ", { unit: "дюйм" }),
      selectField("connectivity", "Связь", [
        "Wi-Fi",
        "Wi-Fi + Cellular",
        "Не знаю",
      ]),
      batteryField,
      selectField("pencil_support", "Apple Pencil", [
        "Поддерживается",
        "Не поддерживается",
        "Не знаю",
      ]),
    ],
  }),
  "Android-планшет": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      numberField("screen_size", "Диагональ", { unit: "дюйм" }),
      selectField("connectivity", "Связь", [
        "Wi-Fi",
        "LTE/5G",
        "Wi-Fi + LTE/5G",
        "Не знаю",
      ]),
      batteryField,
    ],
  }),
  "Windows-планшет": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      numberField("screen_size", "Диагональ", { unit: "дюйм" }),
      selectField("connectivity", "Связь", [
        "Wi-Fi",
        "LTE/5G",
        "Wi-Fi + LTE/5G",
        "Не знаю",
      ]),
      batteryField,
    ],
  }),
  "Графический планшет": makeFallbackSchema({
    fields: [
      textField("active_area", "Рабочая область"),
      selectField("connection", "Подключение", [
        "USB",
        "Bluetooth",
        "USB + Bluetooth",
        "Не знаю",
      ]),
      selectField("pen_included", "Перо в комплекте", ["Да", "Нет", "Не знаю"]),
    ],
  }),

  Телевизор: makeFallbackSchema({
    fields: [
      numberField("diagonal", "Диагональ", { unit: "дюйм" }),
      textField("resolution", "Разрешение"),
      selectField("smart_tv", "Smart TV", ["Да", "Нет", "Не знаю"]),
      textField("matrix_type", "Тип матрицы"),
      selectField("remote_included", "Пульт", ["Есть", "Нет", "Не знаю"]),
    ],
  }),
  Монитор: makeFallbackSchema({
    fields: [
      numberField("diagonal", "Диагональ", { unit: "дюйм" }),
      textField("resolution", "Разрешение"),
      textField("refresh_rate", "Частота"),
      textField("matrix_type", "Тип матрицы"),
      selectField("dead_pixels", "Битые пиксели", [
        "Нет",
        "Есть",
        "Не проверялось",
      ]),
    ],
  }),
  Проектор: makeFallbackSchema({
    fields: [
      textField("resolution", "Разрешение"),
      textField("brightness", "Яркость"),
      textField("lamp_type", "Тип лампы / источника"),
      textField("lamp_hours", "Наработка"),
    ],
  }),
  "ТВ-приставка": makeFallbackSchema({
    fields: [
      textField("storage", "Память"),
      textField("resolution", "Разрешение"),
      textField("platform", "ОС / платформа"),
      selectField("remote_included", "Пульт", ["Есть", "Нет", "Не знаю"]),
    ],
  }),

  Наушники: makeFallbackSchema({
    fields: [
      textField("headphone_type", "Тип"),
      selectField("connection", "Подключение", [
        "Bluetooth",
        "Проводное",
        "Комбинированное",
        "Не знаю",
      ]),
      selectField("noise_canceling", "Шумоподавление", [
        "Есть",
        "Нет",
        "Не знаю",
      ]),
      batteryField,
    ],
  }),
  AirPods: makeFallbackSchema({
    fields: [
      textField("airpods_generation", "Поколение / модель"),
      selectField("case_type", "Кейс", [
        "Lightning",
        "USB-C",
        "MagSafe",
        "Беспроводной",
        "Не знаю",
      ]),
      batteryField,
      selectField("noise_canceling", "Шумоподавление", [
        "Есть",
        "Нет",
        "Не знаю",
      ]),
    ],
  }),
  "Портативная колонка": makeFallbackSchema({
    fields: [
      textField("power", "Мощность"),
      selectField("connection", "Подключение", [
        "Bluetooth",
        "Wi-Fi",
        "AUX",
        "Комбинированное",
        "Не знаю",
      ]),
      batteryField,
      textField("waterproof", "Влагозащита"),
    ],
  }),
  Саундбар: makeFallbackSchema({
    fields: [
      textField("channels", "Каналы"),
      textField("power", "Мощность"),
      textField("connection", "Подключение"),
      selectField("subwoofer", "Сабвуфер", ["Есть", "Нет", "Не знаю"]),
    ],
  }),
  Микрофон: makeFallbackSchema({
    fields: [
      textField("microphone_type", "Тип"),
      textField("connection", "Подключение"),
      textField("purpose", "Назначение"),
      selectField("mount_included", "Стойка / крепление", [
        "Есть",
        "Нет",
        "Не знаю",
      ]),
    ],
  }),

  "Настольный ПК": makeFallbackSchema({
    fields: [
      textField("cpu", "Процессор"),
      textField("ram", "RAM"),
      textField("storage", "Накопитель"),
      textField("gpu", "Видеокарта"),
      textField("psu", "Блок питания"),
    ],
  }),
  Моноблок: makeFallbackSchema({
    fields: [
      textField("cpu", "Процессор"),
      textField("ram", "RAM"),
      textField("storage", "Накопитель"),
      numberField("screen_size", "Диагональ", { unit: "дюйм" }),
      textField("gpu", "Видеокарта"),
    ],
  }),
  Видеокарта: makeFallbackSchema({
    fields: [
      textField("brand", "Бренд"),
      textField("model", "Модель"),
    ],
  }),
  Процессор: makeFallbackSchema({
    fields: [
      textField("socket", "Сокет"),
      numberField("cores", "Количество ядер", { min: 1 }),
      textField("generation", "Поколение / серия"),
    ],
  }),
  "Оперативная память": makeFallbackSchema({
    fields: [
      textField("capacity", "Объём"),
      textField("memory_type", "Тип памяти"),
      textField("frequency", "Частота"),
      numberField("module_count", "Количество модулей", { min: 1 }),
    ],
  }),
  "SSD/HDD": makeFallbackSchema({
    fields: [
      selectField("drive_type", "Тип накопителя", [
        "SSD",
        "HDD",
        "SSHD",
        "Не знаю",
      ]),
      textField("capacity", "Объём"),
      textField("interface", "Интерфейс"),
      textField("smart_state", "SMART / ресурс"),
    ],
  }),
  "Материнская плата": makeFallbackSchema({
    fields: [
      textField("socket", "Сокет"),
      textField("chipset", "Чипсет"),
      textField("form_factor", "Форм-фактор"),
      textField("memory_type", "Тип памяти"),
    ],
  }),
  "Блок питания": makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", [
        "AeroCool",
        "ASUS ROG",
        "be quiet!",
        "Chieftec",
        "Cooler Master",
        "Corsair",
        "Cougar",
        "DeepCool",
        "EVGA",
        "FSP",
        "Fractal Design",
        "Gigabyte",
        "MSI",
        "Seasonic",
        "SilverStone",
        "Super Flower",
        "Thermaltake",
        "XPG",
        "Zalman",
        "1STPLAYER",
        "GameMax",
        "HIPER",
        CUSTOM_VALUE_OPTION,
        "Не знаю",
      ]),
      numberField("power", "Мощность", { unit: "Вт", min: 150, max: 2000 }),
      selectField("form_factor", "Форм-фактор", [
        "ATX",
        "SFX",
        "SFX-L",
        "TFX",
        "Flex ATX",
        "Внешний адаптер",
        "Не знаю",
      ]),
      selectField("efficiency_certificate", "Сертификат эффективности", [
        "Нет сертификата",
        "80 PLUS",
        "80 PLUS Bronze",
        "80 PLUS Silver",
        "80 PLUS Gold",
        "80 PLUS Platinum",
        "80 PLUS Titanium",
        "Cybenetics Bronze",
        "Cybenetics Silver",
        "Cybenetics Gold",
        "Cybenetics Platinum",
        "Cybenetics Titanium",
        "Не знаю",
      ]),
      selectField("modularity", "Модульность", [
        "Модульный",
        "Полумодульный",
        "Немодульный",
        "Не знаю",
      ]),
      selectField("gpu_power_connector", "Питание видеокарты", [
        "Нет PCIe",
        "1x 6-pin",
        "1x 8-pin (6+2)",
        "2x 8-pin (6+2)",
        "3x 8-pin (6+2)",
        "12VHPWR / 12V-2x6",
        "8-pin + 12VHPWR / 12V-2x6",
        "Не знаю",
      ]),
      selectField(
        "cpu_power_connector",
        "Питание процессора",
        [
          "4-pin ATX12V",
          "8-pin EPS",
          "4+4-pin EPS",
          "8-pin + 4-pin EPS",
          "2x 8-pin EPS",
          "Не знаю",
        ],
        { required: false },
      ),
      selectField(
        "atx_version",
        "Стандарт ATX",
        ["ATX 2.x", "ATX 3.0", "ATX 3.1", "Не знаю"],
        { required: false },
      ),
      selectField(
        "cable_set",
        "Комплект кабелей",
        [
          "Полный комплект",
          "Нет части модульных кабелей",
          "Только основные кабели",
          "Не знаю",
        ],
        { required: false },
      ),
      numberField("warranty_months_left", "Остаток гарантии", {
        unit: "мес.",
        min: 0,
        max: 120,
        required: false,
      }),
    ],
  }),

  PlayStation: makeFallbackSchema({
    fields: consoleFields,
  }),
  Xbox: makeFallbackSchema({
    fields: consoleFields,
  }),
  "Nintendo Switch": makeFallbackSchema({
    fields: consoleFields,
  }),
  Геймпад: makeFallbackSchema({
    fields: [
      textField("platform", "Платформа"),
      selectField("connection", "Подключение", [
        "Bluetooth",
        "USB",
        "2.4 ГГц",
        "Комбинированное",
        "Не знаю",
      ]),
      selectField("stick_state", "Состояние стиков", [
        "Без дрифта",
        "Есть дрифт",
        "Не проверялось",
      ]),
      textField("power_type", "Аккумулятор / питание"),
    ],
  }),

  "Apple Watch": makeFallbackSchema({
    fields: [
      textField("case_size", "Размер"),
      selectField("connectivity", "GPS / Cellular", [
        "GPS",
        "GPS + Cellular",
        "Не знаю",
      ]),
      textField("case_material_color", "Материал / цвет корпуса"),
      batteryField,
    ],
  }),
  "Умные часы": makeFallbackSchema({
    fields: [
      textField("platform", "ОС / совместимость"),
      textField("case_size", "Размер"),
      textField("connectivity", "Связь"),
      batteryField,
      textField("sensors", "Датчики"),
    ],
  }),
  "Фитнес-браслет": makeFallbackSchema({
    fields: [
      textField("compatibility", "Совместимость"),
      textField("sensors", "Датчики"),
      batteryField,
      textField("waterproof", "Влагозащита"),
    ],
  }),
  "Электронная книга": makeFallbackSchema({
    fields: [
      numberField("screen_size", "Диагональ", { unit: "дюйм" }),
      textField("storage", "Память"),
      selectField("backlight", "Подсветка", ["Есть", "Нет", "Не знаю"]),
      textField("platform", "Формат / ОС"),
    ],
  }),

  "Wi-Fi роутер": makeFallbackSchema({
    fields: [
      textField("wifi_standard", "Стандарт Wi-Fi"),
      textField("bands", "Диапазоны"),
      textField("ports", "Порты"),
      textField("speed", "Скорость"),
    ],
  }),
  "Mesh-система": makeFallbackSchema({
    fields: [
      numberField("module_count", "Количество модулей", { min: 1 }),
      textField("wifi_standard", "Стандарт Wi-Fi"),
      textField("coverage_area", "Площадь покрытия"),
    ],
  }),
  Коммутатор: makeFallbackSchema({
    fields: [
      numberField("ports_count", "Количество портов", { min: 1 }),
      textField("port_speed", "Скорость портов"),
      selectField("poe", "PoE", ["Есть", "Нет", "Не знаю"]),
    ],
  }),
  Модем: makeFallbackSchema({
    fields: [
      textField("network_type", "Тип сети"),
      selectField("sim_support", "SIM / eSIM", [
        "SIM",
        "eSIM",
        "SIM + eSIM",
        "Нет",
        "Не знаю",
      ]),
      textField("standards", "Поддерживаемые стандарты"),
    ],
  }),

  Фотоаппарат: makeFallbackSchema({
    fields: [
      textField("camera_type", "Тип"),
      textField("mount", "Байонет"),
      textField("shutter_count", "Пробег / счётчик"),
      selectField("lens_included", "Объектив в комплекте", [
        "Есть",
        "Нет",
        "Не знаю",
      ]),
    ],
  }),
  Объектив: makeFallbackSchema({
    fields: [
      textField("mount", "Байонет"),
      textField("focal_length", "Фокусное расстояние"),
      textField("aperture", "Светосила"),
      selectField("stabilization", "Стабилизация", ["Есть", "Нет", "Не знаю"]),
    ],
  }),
  Видеокамера: makeFallbackSchema({
    fields: [
      textField("resolution", "Разрешение"),
      selectField("stabilization", "Стабилизация", ["Есть", "Нет", "Не знаю"]),
      textField("storage_media", "Носитель"),
      batteryField,
    ],
  }),
  "Экшн-камера": makeFallbackSchema({
    fields: [
      textField("resolution", "Разрешение"),
      selectField("stabilization", "Стабилизация", ["Есть", "Нет", "Не знаю"]),
      textField("waterproof", "Влагозащита"),
      textField("mounts", "Комплект креплений"),
    ],
  }),

  "Умная колонка": makeFallbackSchema({
    fields: [
      textField("ecosystem", "Экосистема"),
      textField("assistant", "Ассистент"),
      textField("connection", "Подключение"),
      textField("power_type", "Питание"),
    ],
  }),
  "Камера видеонаблюдения": makeFallbackSchema({
    fields: [
      textField("resolution", "Разрешение"),
      textField("connection", "Подключение"),
      selectField("placement", "Помещение / улица", [
        "Помещение",
        "Улица",
        "Универсальная",
        "Не знаю",
      ]),
      textField("power_type", "Питание"),
    ],
  }),
  "Датчик умного дома": makeFallbackSchema({
    fields: [
      textField("sensor_type", "Тип датчика"),
      textField("ecosystem", "Экосистема"),
      textField("power_type", "Питание"),
    ],
  }),
  "Умная лампа": makeFallbackSchema({
    fields: [
      textField("socket", "Цоколь"),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("ecosystem", "Экосистема"),
      textField("color_mode", "Цветность"),
    ],
  }),

  Кофемашина: makeFallbackSchema({
    fields: [
      textField("coffee_machine_type", "Тип"),
      textField("power_pressure", "Мощность / давление"),
      textField("cups_count", "Пробег / чашки"),
      textField("tank_volume", "Резервуар"),
    ],
  }),
  "Микроволновая печь": makeFallbackSchema({
    fields: [
      numberField("volume", "Объём", { unit: "л" }),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("control_type", "Тип управления"),
      selectField("grill", "Гриль", ["Есть", "Нет", "Не знаю"]),
    ],
  }),
  "Посудомоечная машина": makeFallbackSchema({
    fields: [
      textField("installation_type", "Тип установки"),
      numberField("width", "Ширина", { unit: "см" }),
      textField("capacity", "Вместимость"),
      textField("programs", "Класс / режимы"),
    ],
  }),
  Холодильник: makeFallbackSchema({
    fields: [
      textField("fridge_type", "Тип"),
      numberField("height", "Высота", { unit: "см" }),
      numberField("volume", "Объём", { unit: "л" }),
      selectField("no_frost", "No Frost", ["Да", "Нет", "Не знаю"]),
    ],
  }),
  "Духовой шкаф": makeFallbackSchema({
    fields: [
      textField("oven_type", "Тип"),
      numberField("volume", "Объём", { unit: "л" }),
      numberField("width", "Ширина", { unit: "см" }),
      textField("connection_type", "Способ подключения"),
    ],
  }),
  "Варочная панель": makeFallbackSchema({
    fields: [
      textField("hob_type", "Тип"),
      numberField("burners_count", "Количество конфорок", { min: 1 }),
      numberField("width", "Ширина", { unit: "см" }),
      textField("connection_type", "Подключение"),
    ],
  }),
  Мультиварка: makeFallbackSchema({
    fields: [
      numberField("volume", "Объём", { unit: "л" }),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("programs", "Программы"),
    ],
  }),
  "Блендер/миксер": makeFallbackSchema({
    fields: [
      textField("device_type", "Тип"),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("attachments", "Насадки"),
    ],
  }),

  "Стиральная машина": makeFallbackSchema({
    fields: [
      numberField("load_kg", "Загрузка", { unit: "кг" }),
      textField("load_type", "Тип загрузки"),
      numberField("depth", "Глубина", { unit: "см" }),
      textField("extra_modes", "Инвертор / сушка"),
    ],
  }),
  "Сушильная машина": makeFallbackSchema({
    fields: [
      numberField("load_kg", "Загрузка", { unit: "кг" }),
      textField("drying_type", "Тип сушки"),
      numberField("depth", "Глубина", { unit: "см" }),
    ],
  }),
  Утюг: makeFallbackSchema({
    fields: [
      textField("iron_type", "Тип"),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("soleplate", "Подошва"),
      textField("steam", "Пар"),
    ],
  }),
  Отпариватель: makeFallbackSchema({
    fields: [
      textField("steamer_type", "Тип"),
      numberField("power", "Мощность", { unit: "Вт" }),
      numberField("tank_volume", "Объём бака", { unit: "л" }),
    ],
  }),

  Кондиционер: makeFallbackSchema({
    fields: [
      textField("ac_type", "Тип"),
      textField("room_area", "Площадь помещения"),
      textField("installation_state", "Монтаж / демонтаж"),
      textField("power", "Мощность"),
    ],
  }),
  Обогреватель: makeFallbackSchema({
    fields: [
      textField("heater_type", "Тип"),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("room_area", "Площадь помещения"),
    ],
  }),
  "Очиститель воздуха": makeFallbackSchema({
    fields: [
      textField("room_area", "Площадь помещения"),
      textField("filter_state", "Состояние фильтра"),
      textField("filter_type", "Тип фильтра"),
    ],
  }),
  Увлажнитель: makeFallbackSchema({
    fields: [
      numberField("tank_volume", "Объём бака", { unit: "л" }),
      textField("room_area", "Площадь помещения"),
      textField("humidifier_type", "Тип"),
    ],
  }),
  Вентилятор: makeFallbackSchema({
    fields: [
      textField("fan_type", "Тип"),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("fan_size", "Диаметр / размер"),
    ],
  }),

  "Робот-пылесос": makeFallbackSchema({
    fields: [
      textField("navigation", "Навигация"),
      selectField("wet_cleaning", "Влажная уборка", ["Есть", "Нет", "Не знаю"]),
      batteryField,
      textField("base", "База"),
    ],
  }),
  "Вертикальный пылесос": makeFallbackSchema({
    fields: [
      textField("power", "Мощность"),
      batteryField,
      textField("container_volume", "Объём контейнера"),
    ],
  }),
  "Моющий пылесос": makeFallbackSchema({
    fields: [
      textField("power", "Мощность"),
      textField("tank_volume", "Объём бака"),
      textField("cleaning_modes", "Режимы уборки"),
    ],
  }),
  Пароочиститель: makeFallbackSchema({
    fields: [
      numberField("power", "Мощность", { unit: "Вт" }),
      numberField("tank_volume", "Объём бака", { unit: "л" }),
      textField("attachments", "Насадки"),
    ],
  }),

  Фен: makeFallbackSchema({
    fields: [
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("attachments", "Насадки"),
      textField("modes", "Режимы"),
    ],
  }),
  Электробритва: makeFallbackSchema({
    fields: [
      textField("shaving_type", "Тип бритья"),
      batteryField,
      selectField("wet_shaving", "Влажное бритьё", ["Есть", "Нет", "Не знаю"]),
    ],
  }),
  "Электрическая зубная щётка": makeFallbackSchema({
    fields: [
      textField("technology", "Технология"),
      textField("modes", "Режимы"),
      batteryField,
      textField("attachments", "Насадки"),
    ],
  }),
  Весы: makeFallbackSchema({
    fields: [
      textField("scale_type", "Тип"),
      numberField("max_weight", "Максимальный вес", { unit: "кг" }),
      textField("smart_features", "Smart-функции"),
    ],
  }),

  Водонагреватель: makeFallbackSchema({
    fields: [
      textField("heater_type", "Тип"),
      numberField("volume", "Объём", { unit: "л" }),
      numberField("power", "Мощность", { unit: "Вт" }),
      textField("installation_type", "Установка"),
    ],
  }),
  "Фильтр для воды": makeFallbackSchema({
    fields: [
      textField("filter_type", "Тип фильтра"),
      textField("cartridges", "Совместимые картриджи"),
      textField("resource", "Ресурс"),
    ],
  }),
};

Object.assign(FALLBACK_ITEM_ATTRIBUTE_SCHEMAS, {
  iPhone: makeFallbackSchema({
    fields: [
      selectField("model", "Модель", [
        "iPhone 11",
        "iPhone 12",
        "iPhone 13",
        "iPhone 14",
        "iPhone 15",
        "iPhone 16",
        "iPhone SE",
        CUSTOM_VALUE_OPTION,
      ]),
      selectField("storage", "Память", ["64 ГБ", "128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ", "Не знаю"]),
      phoneSimField,
      batteryField,
      selectField("face_id_state", "Face ID", ["Работает", "Не работает", "Не проверялось"]),
      screenStateField,
      colorField,
    ],
  }),
  Ноутбук: makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", brandOptions([
        "Apple",
        "ASUS",
        "Acer",
        "Dell",
        "HP",
        "Lenovo",
        "MSI",
        "Huawei",
        "Honor",
        "Xiaomi",
        "Samsung",
      ])),
      textField("model", "Модель"),
      selectField("cpu_family", "Процессор / чип", [
        "Apple M1/M2/M3/M4",
        "Intel Core i3/i5/i7/i9",
        "Intel Core Ultra",
        "AMD Ryzen 3/5/7/9",
        CUSTOM_VALUE_OPTION,
        "Не знаю",
      ]),
      selectField("ram", "Оперативная память", ["8 ГБ", "16 ГБ", "24 ГБ", "32 ГБ", "64 ГБ", "128 ГБ", "Не знаю"]),
      selectField("storage", "Накопитель", ["128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ", "2 ТБ", "4 ТБ", CUSTOM_VALUE_OPTION, "Не знаю"]),
      numberField("screen_size", "Диагональ", { unit: "дюйм", min: 10, max: 18 }),
      selectField("gpu_type", "Графика", [
        "Встроенная",
        "NVIDIA GeForce RTX",
        "NVIDIA GeForce GTX",
        "AMD Radeon",
        "Apple GPU",
        CUSTOM_VALUE_OPTION,
        "Не знаю",
      ]),
      batteryField,
      selectField("keyboard_layout", "Клавиатура", ["RU", "US", "EU", "Не знаю"]),
    ],
  }),
  "Apple Watch": makeFallbackSchema({
    fields: [
      selectField("series", "Серия", ["Series 6", "Series 7", "Series 8", "Series 9", "Series 10", "SE", "Ultra", "Ultra 2", CUSTOM_VALUE_OPTION, "Не знаю"]),
      selectField("case_size", "Размер корпуса", ["40 мм", "41 мм", "44 мм", "45 мм", "46 мм", "49 мм", "Не знаю"]),
      selectField("connectivity", "GPS / Cellular", ["GPS", "GPS + Cellular", "Не знаю"]),
      selectField("case_material", "Материал корпуса", ["Алюминий", "Нержавеющая сталь", "Титан", "Не знаю"]),
      batteryField,
      screenStateField,
    ],
  }),
  Холодильник: makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", brandOptions(["Atlant", "Beko", "Bosch", "Haier", "Hisense", "Indesit", "LG", "Liebherr", "Samsung", "Siemens", "Weissgauff"])),
      textField("model", "Модель"),
      selectField("fridge_type", "Тип", ["Однокамерный", "Двухкамерный", "Side-by-Side", "French Door", "Встраиваемый", "Морозильник", "Не знаю"]),
      numberField("height", "Высота", { unit: "см", min: 50, max: 230 }),
      numberField("total_volume", "Общий объём", { unit: "л", min: 40, max: 800 }),
      selectField("no_frost", "No Frost", yesNoUnknown),
      selectField("compressor_type", "Компрессор", ["Обычный", "Инверторный", "Не знаю"]),
    ],
  }),
  "Стиральная машина": makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", brandOptions(["Beko", "Bosch", "Candy", "Haier", "Indesit", "LG", "Samsung", "Siemens", "Weissgauff", "Whirlpool"])),
      textField("model", "Модель"),
      selectField("load_type", "Тип загрузки", ["Фронтальная", "Вертикальная", "Не знаю"]),
      numberField("load_kg", "Загрузка", { unit: "кг", min: 3, max: 14 }),
      numberField("depth", "Глубина", { unit: "см", min: 30, max: 75 }),
      selectField("dryer", "Сушка", yesNoUnknown),
      selectField("motor_type", "Инверторный мотор", yesNoUnknown),
    ],
  }),
  "Духовой шкаф": makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", brandOptions(["Bosch", "Electrolux", "Gorenje", "Hansa", "Hotpoint", "Kuppersberg", "Samsung", "Siemens", "Weissgauff", "Zigmund & Shtain"])),
      textField("model", "Модель"),
      selectField("oven_type", "Тип", ["Электрический", "Газовый", "Комбинированный", "Не знаю"]),
      selectField("install_type", "Установка", ["Встраиваемый", "Отдельностоящий", "Не знаю"]),
      numberField("volume", "Объём", { unit: "л", min: 20, max: 120 }),
      numberField("width", "Ширина", { unit: "см", min: 45, max: 90 }),
      selectField("cleaning_type", "Очистка", ["Традиционная", "Каталитическая", "Пиролитическая", "Гидролизная", "Не знаю"]),
    ],
  }),
  Кофемашина: makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", brandOptions(["DeLonghi", "Jura", "Krups", "Nivona", "Philips", "Saeco", "Siemens", "Bosch", "Melitta", "Gaggia"])),
      textField("model", "Модель"),
      selectField("coffee_machine_type", "Тип", ["Автоматическая", "Рожковая", "Капсульная", "Капельная", "Гейзерная электрическая", "Не знаю"]),
      numberField("pressure_bar", "Давление", { unit: "бар", min: 2, max: 20, required: false }),
      numberField("cups_count", "Пробег", { unit: "чашек", min: 0, max: 100000, required: false }),
      selectField("milk_system", "Капучинатор", ["Автоматический", "Ручной", "Нет", "Не знаю"]),
      numberField("water_tank_l", "Резервуар воды", { unit: "л", min: 0.2, max: 5, required: false }),
    ],
  }),
  "Робот-пылесос": makeFallbackSchema({
    fields: [
      selectField("manufacturer", "Производитель / бренд", brandOptions(["iRobot", "Roborock", "Dreame", "Xiaomi", "Ecovacs", "Samsung", "LG", "Tefal", "Polaris", "Kitfort"])),
      textField("model", "Модель"),
      selectField("navigation", "Навигация", ["Лидар", "Камера", "Гироскоп", "Хаотичная", "Не знаю"]),
      selectField("wet_cleaning", "Влажная уборка", yesNoUnknown),
      selectField("base", "База", ["Без базы", "Зарядная база", "Самоочистка", "Самоочистка и мойка салфеток", "Не знаю"]),
      numberField("suction_power_pa", "Мощность всасывания", { unit: "Па", min: 500, max: 25000, required: false }),
      batteryField,
    ],
  }),
});

FALLBACK_ITEM_ATTRIBUTE_SCHEMAS.Видеокарта = [
  textField("brand", "Бренд"),
  textField("model", "Модель"),
].map((field, index) => ({ ...field, orderIndex: index + 1 }));
FALLBACK_ITEM_ATTRIBUTE_SCHEMAS.Видеокарты =
  FALLBACK_ITEM_ATTRIBUTE_SCHEMAS.Видеокарта;

function schemasFor(items: string[]): Record<string, CharacteristicField[]> {
  return Object.fromEntries(
    items
      .map((item) => [item, FALLBACK_ITEM_ATTRIBUTE_SCHEMAS[item]] as const)
      .filter((entry): entry is readonly [string, CharacteristicField[]] =>
        Boolean(entry[1]),
      ),
  );
}

function catalogSubcategory(
  id: string,
  name: string,
  items: string[],
): CatalogCategoryDto["subcategories"][number] {
  return { id, name, items, itemAttributeSchemas: schemasFor(items) };
}

const PARTNER_CATALOG: Record<ListingType, CatalogCategoryDto[]> = {
  products: [
    {
      id: "partner-products-electronics",
      name: "Электроника",
      subcategories: [
        catalogSubcategory("partner-products-smartphones", "Смартфоны", ["iPhone"]),
        catalogSubcategory("partner-products-laptops", "Ноутбуки", ["Ноутбук"]),
        catalogSubcategory(
          "partner-products-computer-parts",
          "Компьютеры и комплектующие",
          ["Видеокарта", "Блок питания"],
        ),
        catalogSubcategory("partner-products-wearables", "Носимая электроника", ["Apple Watch"]),
      ],
    },
    {
      id: "partner-products-appliances",
      name: "Бытовая техника",
      subcategories: [
        catalogSubcategory("partner-products-kitchen", "Кухонная техника", [
          "Кофемашина",
          "Холодильник",
          "Духовой шкаф",
        ]),
        catalogSubcategory("partner-products-laundry", "Стирка и уход", ["Стиральная машина"]),
        catalogSubcategory("partner-products-cleaning", "Уборка", ["Робот-пылесос"]),
      ],
    },
  ],
};
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function getMinImagesForType(type: ListingType): number {
  return PRODUCT_MIN_IMAGES;
}

function choiceButtonClass(active: boolean, extra = ""): string {
  return [
    "min-h-12 rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
    active
      ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
      : "border-gray-200 bg-white text-gray-900 hover:border-blue-200 hover:bg-blue-50/40",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

async function findDuplicatePhotoPair(
  images: string[],
): Promise<{ sourceIndex: number; duplicateIndex: number } | null> {
  const exactImages = new Map<string, number>();
  for (let i = 0; i < images.length; i += 1) {
    const previousIndex = exactImages.get(images[i]);
    if (previousIndex !== undefined)
      return { sourceIndex: previousIndex, duplicateIndex: i };
    exactImages.set(images[i], i);
  }

  return null;
}

async function validateImageDuplicates(
  images: string[],
): Promise<string | null> {
  const duplicate = await findDuplicatePhotoPair(images);
  if (duplicate) {
    return `Фото ${duplicate.duplicateIndex + 1} повторяет фото ${duplicate.sourceIndex + 1}. Загрузите разные файлы.`;
  }

  return null;
}

async function validateImages(
  type: ListingType,
  images: string[],
): Promise<string | null> {
  const minImages = getMinImagesForType(type);
  if (images.length < minImages) return `Добавьте минимум ${minImages} фото`;
  return validateImageDuplicates(images);
}

function getMetaAttribute(
  attrs: ListingAttribute[] | undefined,
  key: string,
): string {
  const normalizedKey = key.toLocaleLowerCase("ru-RU");
  return (
    attrs?.find((x) => x.key.toLocaleLowerCase("ru-RU") === normalizedKey)
      ?.value ?? ""
  );
}

function normalizeFieldOptions(
  options: string[] | undefined,
): string[] | undefined {
  if (!options || options.length === 0) return undefined;
  return Array.from(
    new Set(options.map((option) => option.trim()).filter(Boolean)),
  );
}

function normalizeField(field: CharacteristicField): CharacteristicField {
  return {
    ...field,
    inputType: field.inputType ?? (field.options?.length ? "select" : "text"),
    options: normalizeFieldOptions(field.options),
    orderIndex: field.orderIndex ?? 0,
  };
}

function isSystemBackedCharacteristicField(field: CharacteristicField): boolean {
  const key = field.key.trim().toLocaleLowerCase("ru-RU");
  const label = field.label.trim().toLocaleLowerCase("ru-RU");
  return key === "condition_grade" || (key === "condition" && label === "состояние");
}

function sortFields(fields: CharacteristicField[]): CharacteristicField[] {
  return fields
    .filter((field) => !isSystemBackedCharacteristicField(field))
    .map(normalizeField)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

function getCharacteristicFields(
  type: ListingType,
  subcategory: string,
  selectedSubcategory?: CatalogCategoryDto["subcategories"][number] | null,
  catalogItem?: string,
): CharacteristicField[] {
  if (catalogItem === CUSTOM_OPTION) return [];
  if (
    type === "products" &&
    (catalogItem === "Видеокарта" || catalogItem === "Видеокарты")
  ) {
    return sortFields(FALLBACK_ITEM_ATTRIBUTE_SCHEMAS.Видеокарты);
  }
  if (type === "products") return [];

  if (selectedSubcategory) {
    if (catalogItem && catalogItem !== CUSTOM_OPTION) {
      const itemSchema =
        selectedSubcategory.itemAttributeSchemas?.[catalogItem];
      if (itemSchema && itemSchema.length > 0) return sortFields(itemSchema);
      const fallbackSchema = FALLBACK_ITEM_ATTRIBUTE_SCHEMAS[catalogItem];
      if (fallbackSchema && fallbackSchema.length > 0) {
        return sortFields(fallbackSchema);
      }
      return [];
    }
  }
  return [];
}

function normalizeCharacteristics(
  fields: CharacteristicField[],
  values: Record<string, string>,
): Record<string, string> {
  const allowed = new Set(fields.map((field) => field.key));
  for (const field of fields) {
    if (field.options?.includes(CUSTOM_VALUE_OPTION)) {
      allowed.add(`__custom_${field.key}`);
    }
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    next[key] = value;
  }
  for (const field of fields) {
    if (!next[field.key] && field.defaultValue) {
      next[field.key] = field.defaultValue;
    }
  }
  return next;
}

function getAttributeValue(
  attrs: ListingAttribute[] | undefined,
  keys: string[],
): string {
  if (!attrs) return "";
  const normalizedKeys = keys.map((key) => key.toLocaleLowerCase("ru-RU"));
  return (
    attrs.find((attribute) =>
      normalizedKeys.includes(attribute.key.toLocaleLowerCase("ru-RU")),
    )?.value ?? ""
  );
}

function referenceCharacteristicsFromAttributes(
  attrs: ListingAttribute[] | undefined,
): Record<string, string> {
  return {
    brand: getAttributeValue(attrs, [
      "brand",
      "Бренд",
      "manufacturer",
      "Производитель / бренд",
    ]),
    model: getAttributeValue(attrs, ["model", "Модель"]),
  };
}

function attributesToCharacteristics(
  attrs: ListingAttribute[] | undefined,
  fields: CharacteristicField[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = getAttributeValue(attrs, [field.label, field.key]);
    if (
      field.options?.includes(CUSTOM_OPTION) &&
      value &&
      !field.options.includes(value)
    ) {
      result[field.key] = "";
      continue;
    }
    result[field.key] = value || field.defaultValue || "";
  }
  return result;
}

function characteristicsToAttributes(
  values: Record<string, string>,
  fields: CharacteristicField[],
): ListingAttribute[] {
  const attributes: ListingAttribute[] = [];
  for (const field of fields) {
    const selectedValue = (values[field.key] ?? "").trim();
    if (!selectedValue) continue;
    if (selectedValue === CUSTOM_VALUE_OPTION) {
      const customValue = (values[`__custom_${field.key}`] ?? "").trim();
      if (customValue) {
        attributes.push({ key: `__custom_${field.key}`, value: customValue });
      }
      continue;
    }
    attributes.push({ key: field.label, value: selectedValue });
  }
  return attributes;
}

function catalogRequestFieldsFromAttributes(
  attrs: ListingAttribute[] | undefined,
): Pick<FormState, "catalogRequestAttributes" | "catalogRequestComment"> {
  const currentAttributes = getAttributeValue(attrs, [
    META_ATTR_CATALOG_REQUEST_ATTRIBUTES,
  ]);
  const legacyDetails = [
    getAttributeValue(attrs, ["__catalog_request_brand"]) &&
      `Бренд: ${getAttributeValue(attrs, ["__catalog_request_brand"])}`,
    getAttributeValue(attrs, ["__catalog_request_model"]) &&
      `Модель: ${getAttributeValue(attrs, ["__catalog_request_model"])}`,
  ].filter(Boolean);

  return {
    catalogRequestAttributes: [currentAttributes, ...legacyDetails]
      .filter(Boolean)
      .join("\n"),
    catalogRequestComment: getAttributeValue(attrs, [
      META_ATTR_CATALOG_REQUEST_COMMENT,
    ]),
  };
}

function catalogRequestDefaults(): Pick<
  FormState,
  "catalogRequestAttributes" | "catalogRequestComment"
> {
  return {
    catalogRequestAttributes: "",
    catalogRequestComment: "",
  };
}

function buildCatalogRequestAttributes(
  formState: FormState,
): ListingAttribute[] {
  if (
    !isCustomCatalogBranch(formState) &&
    !formState.catalogRequestAttributes.trim() &&
    !formState.catalogRequestComment.trim()
  ) {
    return [];
  }
  return [
    {
      key: META_ATTR_CATALOG_REQUEST_ATTRIBUTES,
      value: formState.catalogRequestAttributes.trim(),
    },
    {
      key: META_ATTR_CATALOG_REQUEST_COMMENT,
      value: formState.catalogRequestComment.trim(),
    },
  ].filter((attribute) => attribute.value);
}

function getDefectsLabel(value: DefectsValue): string {
  if (value === "yes") return "Есть дефекты";
  if (value === "no") return "Без дефектов";
  return "";
}

function getResolvedCatalogItem(formState: FormState): string {
  return formState.catalogItem === CUSTOM_OPTION
    ? formState.customCatalogItem.trim()
    : formState.catalogItem.trim();
}

function getResolvedCategoryRoot(formState: FormState): string {
  return formState.categoryRoot === CUSTOM_OPTION
    ? formState.customCategoryRoot.trim()
    : formState.categoryRoot.trim();
}

function getResolvedSubcategory(formState: FormState): string {
  return formState.subcategory === CUSTOM_OPTION
    ? formState.customSubcategory.trim()
    : formState.subcategory.trim();
}

function isCustomCatalogBranch(formState: FormState): boolean {
  return (
    formState.categoryRoot === CUSTOM_OPTION ||
    formState.subcategory === CUSTOM_OPTION ||
    formState.catalogItem === CUSTOM_OPTION
  );
}

function catalogItemOptions(
  selectedSubcategory: CatalogCategoryDto["subcategories"][number] | null,
): string[] {
  return Array.from(
    new Set([...(selectedSubcategory?.items ?? []), CUSTOM_OPTION]),
  );
}

function getUniqueComboboxOptions(options: string[]): string[] {
  return Array.from(
    new Set(options.map((option) => option.trim()).filter(Boolean)),
  );
}

function getComboboxMatches(options: string[], query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const uniqueOptions = getUniqueComboboxOptions(options);
  if (!normalizedQuery) return uniqueOptions;
  return uniqueOptions.filter((option) =>
    option.toLocaleLowerCase("ru-RU").includes(normalizedQuery),
  );
}

function CharacteristicCombobox({
  value,
  options,
  placeholder,
  readOnly = false,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  readOnly?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const uniqueOptions = useMemo(() => getUniqueComboboxOptions(options), [options]);
  const isLocked = readOnly || (uniqueOptions.length === 1 && value === uniqueOptions[0]);
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(
    () => getComboboxMatches(uniqueOptions, query),
    [uniqueOptions, query],
  );

  useEffect(() => {
    if (!isOpen) setQuery(value);
  }, [isOpen, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, options]);

  const selectOption = (option: string) => {
    setQuery(option);
    onChange(option);
    setIsOpen(false);
  };

  const clearValue = () => {
    setQuery("");
    onChange("");
    setIsOpen(false);
  };

  return (
    <div className="listing-create-suggest">
      <input
        value={query}
        readOnly={isLocked}
        onFocus={() => {
          if (!isLocked) setIsOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (isLocked) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) =>
              matches.length ? Math.min(index + 1, matches.length - 1) : 0,
            );
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && isOpen && matches[activeIndex]) {
            event.preventDefault();
            selectOption(matches[activeIndex]);
          }
          if (event.key === "Escape") {
            setQuery(value);
            setIsOpen(false);
          }
        }}
        className={`${FIELD_CLASS} listing-create-combobox__input${
          isLocked ? " listing-create-readonly-field listing-create-combobox__input--locked" : ""
        }`}
        placeholder={placeholder ?? "Выберите из списка"}
        autoComplete="off"
      />
      {!isLocked && value && (
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            clearValue();
          }}
          className="listing-create-combobox__clear"
          aria-label="Очистить"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {!isLocked && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
            setIsOpen((open) => !open);
          }}
          className="listing-create-combobox__chevron"
          aria-label="Показать варианты"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
      {isOpen && !isLocked && (
        <div className="listing-create-suggest__menu listing-create-suggest__menu--combobox">
          {matches.length > 0 ? (
            matches.map((option, index) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`listing-create-suggest__option ${
                  index === activeIndex
                    ? "listing-create-suggest__option--active"
                    : ""
                }`}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="listing-create-suggest__empty">
              Ничего не найдено
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CharacteristicEditor({
  field,
  values,
  onChange,
}: {
  field: CharacteristicField;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const value = values[field.key] ?? field.defaultValue ?? "";
  const customValueKey = `__custom_${field.key}`;
  const customValue = values[customValueKey] ?? "";
  const update = (key: string, nextValue: string) => {
    onChange({ ...values, [key]: nextValue });
  };
  const uniqueFieldOptions = useMemo(
    () => getUniqueComboboxOptions(field.options ?? []),
    [field.options],
  );

  useEffect(() => {
    if (uniqueFieldOptions.length !== 1) return;
    const onlyOption = uniqueFieldOptions[0];
    if (!onlyOption || value === onlyOption) return;
    onChange({ ...values, [field.key]: onlyOption });
  }, [field.key, onChange, uniqueFieldOptions, value, values]);

  return (
    <label className="space-y-1">
      <span className={FIELD_LABEL_CLASS}>
        {field.label}
        {field.required ? "" : " (необязательно)"}
      </span>
      {field.options?.length ? (
        <>
          <CharacteristicCombobox
            value={value}
            options={uniqueFieldOptions}
            placeholder="Выберите из списка"
            readOnly={field.locked}
            onChange={(nextValue) => update(field.key, nextValue)}
          />
          {value === CUSTOM_VALUE_OPTION && (
            <input
              value={customValue}
              onChange={(e) => update(customValueKey, e.target.value)}
              className={`${FIELD_CLASS} mt-2`}
              placeholder="Предложите значение для модерации"
            />
          )}
        </>
      ) : field.inputType === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => update(field.key, e.target.value)}
          className="field-control min-h-24 resize-y"
          placeholder={field.required ? "Обязательно" : "Необязательно"}
        />
      ) : (
        <div className="flex gap-2">
          <input
            type={field.inputType === "number" ? "number" : "text"}
            value={value}
            min={field.min ?? undefined}
            max={field.max ?? undefined}
            onChange={(e) => update(field.key, e.target.value)}
            className={FIELD_CLASS}
            placeholder={field.required ? "Обязательно" : "Необязательно"}
          />
          {field.unit && (
            <span className="inline-flex min-h-12 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
              {field.unit}
            </span>
          )}
        </div>
      )}
    </label>
  );
}

function CatalogReferenceCascadeEditor({
  values,
  brands,
  models,
  fields,
  onChange,
}: {
  values: Record<string, string>;
  brands: string[];
  models: string[];
  fields: CharacteristicField[];
  onChange: (next: Record<string, string>) => void;
}) {
  const brand = values.brand ?? "";
  const model = values.model ?? "";
  const isBrandConfirmed = brands.includes(brand);
  const isModelConfirmed = models.includes(model);
  const characteristicFields = fields.filter(
    (field) => field.key !== "brand" && field.key !== "model",
  );

  const selectBrand = (item: string) => {
    onChange({
      brand: item,
      model: "",
    });
  };

  const selectModel = (item: string) => {
    onChange({
      ...values,
      model: item,
    });
  };

  return (
    <div className="grid gap-4">
      <label className="space-y-1">
        <span className={FIELD_LABEL_CLASS}>Бренд</span>
        <CharacteristicCombobox
          value={brand}
          options={brands}
          placeholder="Например, ASUS"
          onChange={selectBrand}
        />
      </label>
      {isBrandConfirmed && (
        <label className="space-y-1">
          <span className={FIELD_LABEL_CLASS}>Модель</span>
          <CharacteristicCombobox
            value={model}
            options={models}
            placeholder="Начните вводить цифры из названия модели"
            onChange={selectModel}
          />
        </label>
      )}
      {isBrandConfirmed && isModelConfirmed && characteristicFields.length > 0 && (
        <div className="grid gap-3">
          {characteristicFields.map((field) => (
            <CharacteristicEditor
              key={field.key}
              field={field}
              values={values}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogRequestEditor({
  value,
  onChange,
}: {
  value: Pick<FormState, "catalogRequestAttributes" | "catalogRequestComment">;
  onChange: (
    next: Partial<
      Pick<FormState, "catalogRequestAttributes" | "catalogRequestComment">
    >,
  ) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div>
        <div className="text-sm font-semibold text-blue-950">
          Мы пока не знаем шаблон для этого вида
        </div>
        <p className="mt-1 text-sm text-blue-900">
          Характеристики для объявления опишите в тексте ниже, а здесь оставьте
          заявку на расширение каталога. После проверки модератором этот вид
          можно будет выбрать как обычный.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2">
          <span className={FIELD_LABEL_CLASS}>Важные характеристики</span>
          <textarea
            value={value.catalogRequestAttributes}
            onChange={(e) =>
              onChange({ catalogRequestAttributes: e.target.value })
            }
            className="field-control min-h-24 resize-y"
            placeholder="Опишите бренд, модель, размеры, мощность, комплект, дефекты или другие важные параметры"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className={FIELD_LABEL_CLASS}>
            Комментарий модератору (необязательно)
          </span>
          <textarea
            value={value.catalogRequestComment}
            onChange={(e) =>
              onChange({ catalogRequestComment: e.target.value })
            }
            className="field-control min-h-20 resize-y"
            placeholder="Что именно нужно добавить в каталог"
          />
        </label>
      </div>
    </div>
  );
}

type CatalogRequestModalPayload = {
  category: string;
  subcategory: string;
  item: string;
  brand: string;
  model: string;
  details: string;
  link: string;
  email: string;
  photoName: string;
  photoLabel: string;
};

function CatalogRequestModal({
  open,
  mode,
  form,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: CatalogRequestMode;
  form: FormState;
  onClose: () => void;
  onSubmit: (value: CatalogRequestModalPayload) => Promise<void> | void;
}) {
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [item, setItem] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [details, setDetails] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoLabel, setPhotoLabel] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(getResolvedCategoryRoot(form));
    setSubcategory(getResolvedSubcategory(form));
    setItem(getResolvedCatalogItem(form));
    setBrand(form.characteristics.brand ?? "");
    setModel(form.characteristics.model ?? "");
    setDetails(form.catalogRequestAttributes);
    setLink("");
    setEmail("");
    setPhotoName("");
    setPhotoLabel("");
    setValidationError("");
    setIsSubmitting(false);
  }, [form, open]);

  if (!open) return null;

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setValidationError("Выберите файл изображения.");
      return;
    }
    if (file.size > CATALOG_REQUEST_MAX_PHOTO_SIZE_BYTES) {
      setValidationError("Фото должно быть не больше 2 МБ.");
      return;
    }
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setPhotoName(dataUrl);
      setPhotoLabel(file.name);
      setValidationError("");
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Не удалось прочитать фото.");
    }
  };

  const submitRequest = async () => {
    if (isSubmitting) return;
    const missing = [
      mode === "catalog" && category.trim().length < 2 ? "категория" : "",
      mode === "catalog" && subcategory.trim().length < 2 ? "подкатегория" : "",
      mode === "catalog" && item.trim().length < 2 ? "вид товара" : "",
      brand.trim() ? "" : "бренд",
      model.trim() ? "" : "модель",
      details.trim().length >= 10 ? "" : "важные характеристики",
      photoName.trim() ? "" : "фото товара",
      link.trim() ? "" : "ссылка на описание",
      email.trim() ? "" : "почта продавца",
    ].filter(Boolean);
    if (missing.length > 0) {
      setValidationError(`Заполните обязательные поля: ${missing.join(", ")}.`);
      return;
    }
    if (!isValidCatalogRequestUrl(link)) {
      setValidationError("Укажите корректную ссылку на сайт, например example.com или https://example.ru.");
      return;
    }
    if (!isValidCatalogRequestEmail(email)) {
      setValidationError("Укажите корректную почту, например seller@example.ru.");
      return;
    }
    try {
      setIsSubmitting(true);
      await onSubmit({
        category,
        subcategory,
        item,
        brand,
        model,
        details,
        link,
        email,
        photoName,
        photoLabel,
      });
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Не удалось отправить запрос.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={
        mode === "catalog"
          ? "Запрос на добавление новой категории"
          : "Запрос на добавление техники"
      }
      subtitle="Укажите максимум характеристик — это поможет нам быстрее обновить каталог."
      size="lg"
      footer={
        <button
          type="button"
          className="catalog-modal__button catalog-modal__button--primary"
          disabled={isSubmitting}
          onClick={() => void submitRequest()}
        >
          {isSubmitting ? "Отправляем..." : "Отправить запрос"}
        </button>
      }
    >
        <div className="listing-create-request-modal__grid">
          <label className="listing-create-request-modal__field">
            <span>Категория</span>
            <input
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setValidationError("");
              }}
              placeholder="Например, Компьютерные комплектующие"
            />
          </label>
          <label className="listing-create-request-modal__field">
            <span>Подкатегория</span>
            <input
              value={subcategory}
              onChange={(e) => {
                setSubcategory(e.target.value);
                setValidationError("");
              }}
              placeholder="Например, Видеокарты"
            />
          </label>
          <label className="listing-create-request-modal__field listing-create-request-modal__field--full">
            <span>Вид товара</span>
            <input
              value={item}
              onChange={(e) => {
                setItem(e.target.value);
                setValidationError("");
              }}
              placeholder="Например, внешняя видеокарта"
            />
          </label>
          <label className="listing-create-request-modal__field">
            <span>Производитель (Бренд)</span>
            <input
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setValidationError("");
              }}
            />
          </label>
          <label className="listing-create-request-modal__field">
            <span>Модель</span>
            <input
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setValidationError("");
              }}
            />
          </label>
          <label className="listing-create-request-modal__field listing-create-request-modal__field--full">
            <span>Важные характеристики этой модели</span>
            <textarea
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                setValidationError("");
              }}
            />
          </label>

          <div className="listing-create-request-modal__field listing-create-request-modal__field--full">
            <span>Фото товара, упаковки или маркировки</span>
            <label className="listing-create-request-modal__photo">
              {!photoName ? <Camera className="h-7 w-7" /> : null}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handlePhotoChange(e.target.files?.[0])}
              />
              {photoName ? (
                <img
                  src={photoName}
                  alt="Фото заявки"
                  className="listing-create-request-modal__photo-preview"
                />
              ) : null}
            </label>
            {photoName && (
              <small className="listing-create-request-modal__photo-name">
                {photoLabel || "Фото прикреплено"}
              </small>
              )}
            <small>
              Фото помогает понять точную модель, комплектацию или новую характеристику.
            </small>
          </div>

          <label className="listing-create-request-modal__field listing-create-request-modal__field--full">
            <span>Ссылка на описание на другом сайте</span>
            <input
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setValidationError("");
              }}
              placeholder="https://example.ru/product"
            />
            <small>Так нам будет проще искать информацию.</small>
          </label>
          <label className="listing-create-request-modal__field listing-create-request-modal__field--full">
            <span>Почта продавца</span>
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setValidationError("");
              }}
              placeholder="seller@example.ru"
            />
            <small>
              На эту почту мы отправим ответ по вашему запросу. Политика
              конфиденциальности
            </small>
          </label>
        </div>

        {validationError ? (
          <div className="listing-create-request-modal__error">{validationError}</div>
        ) : null}
    </AppModal>
  );
}

function buildInitialForm(type: ListingType): FormState {
  return {
    title: "",
    price: "",
    condition: "new",
    description: "",
    category: "",
    categoryRoot: "",
    customCategoryRoot: "",
    subcategory: "",
    customSubcategory: "",
    catalogItem: "",
    customCatalogItem: "",
    ...catalogRequestDefaults(),
    type,
    meetingAddress: "",
    images: [],
    hasDefects: "",
    characteristics: {},
    hasMultipleStock: false,
  };
}

function normalizeProfileAddresses(addresses: ProfileAddressDto[]) {
  return addresses
    .map((address) => ({
      ...address,
      name: address.name?.trim() || "Адрес самовывоза",
      fullAddress: address.fullAddress?.trim() ?? "",
      city: address.city?.trim() ?? "",
      region: address.region?.trim() ?? "",
      street: address.street?.trim() ?? "",
      house: address.house?.trim() ?? "",
      building: address.building?.trim() ?? "",
      postalCode: address.postalCode?.trim() ?? "",
    }))
    .filter((address) => address.fullAddress);
}

export function PartnerListingsPage({
  onOpenListing,
  onOpenCreateListing,
  onExitCreate,
  createMode = false,
}: PartnerListingsPageProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive" | "moderation"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [listingTypeFilter, setListingTypeFilter] =
    useState<ListingType>("products");
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [creationScreen, setCreationScreen] =
    useState<CreationScreen>("start");

  const [catalogCategories, setCatalogCategories] = useState<
    CatalogCategoryDto[]
  >([]);
  const [profileAddresses, setProfileAddresses] = useState<
    ProfileAddressDto[]
  >([]);
  const [addressBook, setAddressBook] = useState<string[]>([]);
  const [defaultProfileAddress, setDefaultProfileAddress] =
    useState<ProfileAddressDto | null>(null);
  const [selectedMeetingAddressId, setSelectedMeetingAddressId] =
    useState<string>("");
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] =
    useState<AddressFormState>(createEmptyAddressForm);
  const [addressMapHint, setAddressMapHint] = useState("");
  const [, setAddressSuggestions] = useState<AddressSuggestionOption[]>([]);
  const [, setIsAddressInputFocused] = useState(false);
  const [, setAddressSuggestionActiveIndex] = useState(-1);
  const [, setIsNativeAddressSuggestEnabled] = useState(true);
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [createSuggestionMatches, setCreateSuggestionMatches] = useState<
    CreateSuggestionMatch[]
  >([]);
  const [listingDrafts, setListingDrafts] = useState<ListingDraftDto[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [catalogReferenceBrands, setCatalogReferenceBrands] = useState<string[]>([]);
  const [catalogReferenceModels, setCatalogReferenceModels] = useState<string[]>([]);
  const [catalogReferenceDnsFields, setCatalogReferenceDnsFields] =
    useState<CatalogReferenceFieldDto[]>([]);
  const [catalogReferenceSupported, setCatalogReferenceSupported] =
    useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isGuessingCategory, setIsGuessingCategory] = useState(false);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [isDeleteBusy, setIsDeleteBusy] = useState(false);
  const [titlePickedFromSuggestion, setTitlePickedFromSuggestion] =
    useState(false);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<FormState | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [isInlineSaving, setIsInlineSaving] = useState(false);
  const [isCreateSaving, setIsCreateSaving] = useState(false);
  const [formIssue, setFormIssue] = useState<string | null>(null);
  const [inlineIssue, setInlineIssue] = useState<string | null>(null);
  const [isCharacteristicRequestOpen, setIsCharacteristicRequestOpen] =
    useState(false);
  const [catalogRequestMode, setCatalogRequestMode] =
    useState<CatalogRequestMode>("characteristic");

  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm("products"),
  );
  const createRouteInitializedRef = useRef(false);
  const addressInputBlurTimeoutRef = useRef<number | null>(null);
  const isSelectingAddressSuggestionRef = useRef(false);
  const addressFullInputRef = useRef<HTMLInputElement | null>(null);
  const nativeAddressSuggestViewRef = useRef<any>(null);
  const applyFullAddressValueRef = useRef<(value: string) => Promise<void>>(
    async () => {},
  );
  const isCreateOpen = createMode || showModal;
  const isEditingListing = Boolean(editingListing);

  const showNotice = useCallback(
    (message: string, tone: AppNotice["tone"] = "info") => {
      const id = Date.now() + Math.floor(Math.random() * 1_000);
      setNotices((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => {
        setNotices((prev) => prev.filter((item) => item.id !== id));
      }, 4500);
    },
    [],
  );

  const closeNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const reportFormIssue = useCallback(
    (message: string) => {
      setFormIssue(message);
      showNotice(message, "error");
    },
    [showNotice],
  );

  const reportInlineIssue = useCallback(
    (message: string) => {
      setInlineIssue(message);
      showNotice(message, "error");
    },
    [showNotice],
  );

  const openListingPage = useCallback(
    (listingId: string) => {
      if (onOpenListing) {
        onOpenListing(listingId);
        return;
      }
      window.location.assign(`/products/${encodeURIComponent(listingId)}`);
    },
    [onOpenListing],
  );

  const loadListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<Listing[]>(
        `/partner/listings?type=${listingTypeFilter}`,
      );
      setListings(data);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить объявления",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [listingTypeFilter, showNotice]);

  const loadDrafts = useCallback(async (type: ListingType) => {
    try {
      const data = await apiGet<ListingDraftDto[]>(
        `/partner/listing-drafts?type=${type}`,
      );
      setListingDrafts(data);
    } catch {
      setListingDrafts([]);
    }
  }, []);

  const loadCategories = useCallback(async (type: ListingType) => {
    try {
      const data = await apiGet<CatalogCategoryDto[]>(
        `/catalog/categories?type=${type}`,
      );
      const nextCatalog = data;
      setCatalogCategories(nextCatalog);
      setForm((prev) => {
        if (prev.type !== type) return prev;
        if (!prev.categoryRoot) return prev;
        if (nextCatalog.some((category) => category.name === prev.categoryRoot))
          return prev;
        return {
          ...prev,
          category: "",
          categoryRoot: "",
          customCategoryRoot: "",
          subcategory: "",
          customSubcategory: "",
          catalogItem: "",
          customCatalogItem: "",
          ...catalogRequestDefaults(),
          characteristics: {},
        };
      });
    } catch {
      setCatalogCategories(PARTNER_CATALOG[type]);
      setForm((prev) => ({
        ...prev,
        category: "",
        categoryRoot: "",
        customCategoryRoot: "",
        subcategory: "",
        customSubcategory: "",
        catalogItem: "",
        customCatalogItem: "",
        ...catalogRequestDefaults(),
        characteristics: {},
      }));
    }
  }, []);

  const loadProfileAddresses = useCallback(async () => {
    try {
      const addressesData =
        await apiGet<ProfileAddressDto[]>("/profile/addresses");
      const normalizedAddresses = normalizeProfileAddresses(addressesData);
      const defaultAddress =
        normalizedAddresses.find((address) => address.isDefault) ??
        normalizedAddresses[0] ??
        null;

      setProfileAddresses(normalizedAddresses);
      setAddressBook(
        Array.from(
          new Set(normalizedAddresses.map((address) => address.fullAddress)),
        ),
      );
      setDefaultProfileAddress(defaultAddress);
      setSelectedMeetingAddressId((currentId) => {
        if (
          currentId &&
          normalizedAddresses.some((address) => address.id === currentId)
        ) {
          return currentId;
        }
        return defaultAddress?.id ?? "";
      });
      return normalizedAddresses;
    } catch {
      setProfileAddresses([]);
      setAddressBook([]);
      setDefaultProfileAddress(null);
      setSelectedMeetingAddressId("");
      return [];
    }
  }, []);

  useEffect(() => {
    void loadProfileAddresses();
  }, [loadProfileAddresses]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; message?: string }>).detail;
      const text = `${detail?.url ?? ""} ${detail?.message ?? ""}`.toLocaleLowerCase("ru-RU");
      if (text.includes("объявлен") || text.includes("listing") || text.includes("partner")) {
        void loadListings();
      }
    };
    window.addEventListener("app-notification-received", handleNotification);
    return () => window.removeEventListener("app-notification-received", handleNotification);
  }, [loadListings]);

  useEffect(() => {
    void loadDrafts(listingTypeFilter);
  }, [listingTypeFilter, loadDrafts]);

  useEffect(() => {
    if (!isCreateOpen) return;
    if (isEditingListing) return;
    if (creationScreen !== "details") return;
    const hasMeaningfulDraft =
      form.title.trim() ||
      form.categoryRoot ||
      form.subcategory ||
      form.catalogItem ||
      form.description.trim() ||
      form.price.trim() ||
      form.images.length > 0;
    if (!hasMeaningfulDraft) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const payload = {
        type: form.type,
        title: form.title,
        currentScreen: creationScreen,
        payload: form,
      };
      try {
        if (activeDraftId) {
          await apiPatch<ListingDraftDto>(
            `/partner/listing-drafts/${activeDraftId}`,
            payload,
          );
        } else {
          const created = await apiPost<ListingDraftDto>(
            "/partner/listing-drafts",
            payload,
          );
          if (!cancelled) setActiveDraftId(created.id);
        }
        if (!cancelled) await loadDrafts(form.type);
      } catch {
        // Draft autosave is helpful, but should not block listing creation.
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDraftId, creationScreen, form, isCreateOpen, isEditingListing, loadDrafts]);

  useEffect(() => {
    if (!isCreateOpen) return;
    void loadCategories(form.type);
  }, [isCreateOpen, form.type, loadCategories]);

  useEffect(() => {
    if (!isCreateOpen) return;
    const defaultAddressValue = defaultProfileAddress?.fullAddress?.trim();
    if (!defaultAddressValue) return;
    setSelectedMeetingAddressId((currentId) => currentId || defaultProfileAddress?.id || "");
    setForm((prev) => {
      if (prev.meetingAddress.trim()) return prev;
      return { ...prev, meetingAddress: defaultAddressValue };
    });
  }, [defaultProfileAddress, isCreateOpen]);

  const selectMeetingAddress = useCallback((address: ProfileAddressDto) => {
    setSelectedMeetingAddressId(address.id);
    setForm((prev) => ({
      ...prev,
      meetingAddress: address.fullAddress.trim(),
    }));
  }, []);

  const geocodeAddressWithTimeout = useCallback(
    async (query: string, timeoutMs = 900) => {
      let timeoutId = 0;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
      });

      const result = await Promise.race([
        geocodeProfileAddress(query),
        timeoutPromise,
      ]);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      return result;
    },
    [],
  );

  const applyFullAddressValue = useCallback(
    async (inputValue: string) => {
      const rawInput = inputValue.trim();
      if (!rawInput) return;

      const geocodeSeed = rawInput.includes(",")
        ? rawInput
        : normalizeFreeformAddressForGeocode(rawInput);
      const parsed =
        (await geocodeAddressWithTimeout(rawInput, 900)) ||
        (geocodeSeed !== rawInput
          ? await geocodeAddressWithTimeout(geocodeSeed, 900)
          : null);

      if (!parsed) {
        setAddressForm((prev) => ({
          ...prev,
          fullAddress: normalizeAddressDisplay(rawInput),
        }));
        setAddressMapHint(
          "Не удалось определить координаты. Выберите подсказку или точку на карте.",
        );
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
          apartment: apartmentFromInput,
          entrance: entranceFromInput,
          postalCode: parsed.postalCode || "",
          lat: typeof parsed.lat === "number" ? parsed.lat : prev.lat,
          lon: typeof parsed.lon === "number" ? parsed.lon : prev.lon,
        };
      });

      setAddressMapHint("");
      setMapCenterQuery(nextCenterQuery);
    },
    [geocodeAddressWithTimeout],
  );

  useEffect(() => {
    applyFullAddressValueRef.current = applyFullAddressValue;
  }, [applyFullAddressValue]);

  useEffect(() => {
    if (!addressModalOpen) return;
    return mountNativeAddressSuggest({
      addressInputRef: addressFullInputRef,
      suggestViewRef: nativeAddressSuggestViewRef,
      geosuggestApiKey: YANDEX_GEOSUGGEST_API_KEY,
      bounds: RUSSIA_BOUNDS,
      onSuggestEnabled: setIsNativeAddressSuggestEnabled,
      onSelectValue: async (selectedValue) => {
        if (addressInputBlurTimeoutRef.current) {
          window.clearTimeout(addressInputBlurTimeoutRef.current);
          addressInputBlurTimeoutRef.current = null;
        }
        isSelectingAddressSuggestionRef.current = false;
        setAddressForm((prev) => ({ ...prev, fullAddress: selectedValue }));
        setAddressSuggestions([]);
        setAddressSuggestionActiveIndex(-1);
        await applyFullAddressValueRef.current(selectedValue);
        setIsAddressInputFocused(true);
      },
    });
  }, [addressModalOpen]);

  useEffect(() => {
    if (!addressModalOpen) return;
    return scheduleAddressAutofill({
      fullAddress: addressForm.fullAddress,
      geocodeAddressWithTimeout,
      setAddressForm,
    });
  }, [addressModalOpen, addressForm.fullAddress, geocodeAddressWithTimeout]);

  useEffect(() => {
    void loadCategories(listingTypeFilter);
  }, [listingTypeFilter, loadCategories]);

  useEffect(() => {
    if (
      !isCreateOpen ||
      creationScreen !== "titleSearch" ||
      titlePickedFromSuggestion
    ) {
      setTitleSuggestions([]);
      setCreateSuggestionMatches([]);
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
        const res = await apiGet<CreateSuggestionsDto>(
          `/partner/listings/create-suggestions?q=${encodeURIComponent(q)}&type=${encodeURIComponent(form.type)}`,
        );
        const normalized = q.toLocaleLowerCase("ru-RU");
        const rawTitleSuggestions = res.titleSuggestions ?? res.chips;
        const next = Array.from(
          new Set(rawTitleSuggestions.map((x) => x.trim()).filter(Boolean)),
        )
          .filter((x) => x.toLocaleLowerCase("ru-RU") !== normalized)
          .slice(0, 8);
        if (!cancelled) {
          setTitleSuggestions(next);
          setCreateSuggestionMatches(res.matches ?? []);
        }
      } catch {
        if (!cancelled) {
          setTitleSuggestions([]);
          setCreateSuggestionMatches([]);
        }
      } finally {
        if (!cancelled) setIsSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [creationScreen, form.title, form.type, isCreateOpen, titlePickedFromSuggestion]);

  const guessCategoryByTitle = useCallback(
    async (title: string, type: ListingType) => {
      try {
        setIsGuessingCategory(true);
        const guessed = await apiGet<CategoryGuessDto>(
          `/partner/listings/category-guess?title=${encodeURIComponent(title)}&type=${encodeURIComponent(type)}`,
        );
        if (!guessed.category) return;
        const normalized = guessed.category.trim().toLocaleLowerCase("ru-RU");
        if (!normalized) return;
        setForm((prev) => {
          const matched = catalogCategories.find(
            (option) => option.name.toLocaleLowerCase("ru-RU") === normalized,
          );
          if (!matched) return prev;
          return {
            ...prev,
            categoryRoot: matched.name,
            category: matched.name,
            customCategoryRoot: "",
            subcategory: "",
            customSubcategory: "",
            catalogItem: "",
            customCatalogItem: "",
            ...catalogRequestDefaults(),
            characteristics: {},
          };
        });
      } catch {
        // Ignore guess errors silently - user can select category manually.
      } finally {
        setIsGuessingCategory(false);
      }
    },
    [catalogCategories],
  );

  const applyCatalogPath = useCallback(
    (path: {
      categoryName: string;
      subcategoryName: string;
      itemName: string;
    }) => {
      const category = catalogCategories.find(
        (item) => item.name === path.categoryName,
      );
      const subcategory = category?.subcategories.find(
        (item) => item.name === path.subcategoryName,
      );
      setForm((prev) => ({
        ...prev,
        type: "products",
        categoryRoot: path.categoryName,
        category: path.itemName,
        subcategory: path.subcategoryName,
        catalogItem: path.itemName,
        customCategoryRoot: "",
        customSubcategory: "",
        customCatalogItem: "",
        ...catalogRequestDefaults(),
        characteristics: normalizeCharacteristics(
          getCharacteristicFields(
            "products",
            path.subcategoryName,
            subcategory,
            path.itemName,
          ),
          {},
        ),
      }));
    },
    [catalogCategories],
  );

  const applyCreateSuggestion = (match: CreateSuggestionMatch) => {
    applyCatalogPath({
      categoryName: match.categoryName,
      subcategoryName: match.subcategoryName,
      itemName: match.itemName,
    });
    setCreationScreen("details");
  };

  const startFromDraft = (draft: ListingDraftDto) => {
    const draftForm =
      draft.payload && typeof draft.payload === "object"
        ? ({ ...buildInitialForm(draft.type), ...draft.payload } as FormState)
        : buildInitialForm(draft.type);
    setForm(draftForm);
    const draftAddress = draftForm.meetingAddress.trim();
    setSelectedMeetingAddressId(
      profileAddresses.find((address) => address.fullAddress === draftAddress)
        ?.id ?? "",
    );
    setActiveDraftId(draft.id);
    setCreationScreen(
      ["start", "titleSearch", "manualCategory", "details"].includes(
        draft.currentScreen,
      )
        ? (draft.currentScreen as CreationScreen)
        : "details",
    );
  };

  const startTitleSearch = (categoryName?: string) => {
    if (categoryName) {
      setForm((prev) => ({
        ...prev,
        type: "products",
        categoryRoot: categoryName,
        category: categoryName,
        subcategory: "",
        catalogItem: "",
        characteristics: {},
      }));
    }
    setCreationScreen("titleSearch");
  };

  const filteredListings = useMemo(
    () =>
      listings.filter((listing) => {
        const statusOk =
          statusFilter === "all" || listing.status === statusFilter;
        return statusOk && matchesSearch(listing, searchQuery);
      }),
    [listings, searchQuery, statusFilter],
  );

  const stats = useMemo(
    () => ({
      total: listings.length,
      active: listings.filter((x) => x.status === "active").length,
      moderation: listings.filter((x) => x.status === "moderation").length,
      inactive: listings.filter((x) => x.status === "inactive").length,
    }),
    [listings],
  );

  const selectedCategory = useMemo(
    () =>
      catalogCategories.find(
        (category) => category.name === form.categoryRoot,
      ) ?? null,
    [catalogCategories, form.categoryRoot],
  );
  const selectedSubcategory = useMemo(
    () =>
      selectedCategory?.subcategories.find(
        (subcategory) => subcategory.name === form.subcategory,
      ) ?? null,
    [selectedCategory, form.subcategory],
  );
  const manualCategoryColumnCount = selectedSubcategory
    ? 3
    : selectedCategory
      ? 2
      : 1;
  const characteristicFields = useMemo(
    () =>
      getCharacteristicFields(
        form.type,
        form.subcategory,
        selectedSubcategory,
        form.catalogItem,
      ),
    [form.type, form.subcategory, selectedSubcategory, form.catalogItem],
  );
  const isCatalogReferenceCandidate =
    form.type === "products" &&
    Boolean(form.catalogItem) &&
    form.catalogItem !== CUSTOM_OPTION;
  const isCatalogReferenceCreation =
    isCatalogReferenceCandidate && catalogReferenceSupported;
  const catalogReferenceFields = useMemo<CharacteristicField[]>(
    () => [
      {
        key: "brand",
        label: "Бренд",
        required: true,
        inputType: "text",
        orderIndex: 1,
      },
      {
        key: "model",
        label: "Модель",
        required: true,
        inputType: "text",
        orderIndex: 2,
      },
      ...catalogReferenceDnsFields.map((field) => ({
        key: field.key,
        label: field.label,
        required: true,
        inputType: "select" as const,
        options: field.options,
        defaultValue: field.defaultValue,
        orderIndex: field.orderIndex,
        locked: field.locked,
        source: field.source,
      })),
    ],
    [catalogReferenceDnsFields],
  );
  const effectiveCharacteristicFields = isCatalogReferenceCreation
    ? catalogReferenceFields
    : characteristicFields;

  useEffect(() => {
    if (!isCreateOpen || !isCatalogReferenceCandidate) {
      setCatalogReferenceSupported(false);
      setCatalogReferenceBrands([]);
      setCatalogReferenceModels([]);
      setCatalogReferenceDnsFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<CatalogReferenceDto>(
          `/partner/listings/catalog-reference?item=${encodeURIComponent(form.catalogItem)}`,
        );
        if (!cancelled) {
          const supported = Boolean(data.supported);
          setCatalogReferenceSupported(supported);
          setCatalogReferenceBrands(supported ? (data.brands ?? []) : []);
          if (!supported) {
            setCatalogReferenceModels([]);
            setCatalogReferenceDnsFields([]);
          }
        }
      } catch {
        if (!cancelled) {
          setCatalogReferenceSupported(false);
          setCatalogReferenceBrands([]);
          setCatalogReferenceModels([]);
          setCatalogReferenceDnsFields([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.catalogItem, isCreateOpen, isCatalogReferenceCandidate]);

  useEffect(() => {
    if (!isCreateOpen || !isCatalogReferenceCreation) return;
    const brand = form.characteristics.brand?.trim() ?? "";
    if (!brand) {
      setCatalogReferenceModels([]);
      setCatalogReferenceDnsFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<CatalogReferenceDto>(
          `/partner/listings/catalog-reference?item=${encodeURIComponent(form.catalogItem)}&brand=${encodeURIComponent(brand)}`,
        );
        if (!cancelled) setCatalogReferenceModels(data.models ?? []);
      } catch {
        if (!cancelled) setCatalogReferenceModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.catalogItem, form.characteristics.brand, isCreateOpen, isCatalogReferenceCreation]);

  useEffect(() => {
    if (!isCreateOpen || !isCatalogReferenceCreation) return;
    const brand = form.characteristics.brand?.trim() ?? "";
    const model = form.characteristics.model?.trim() ?? "";
    if (!brand || !model) {
      setCatalogReferenceDnsFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const query = new URLSearchParams({
          item: form.catalogItem,
          brand,
          model,
        });
        const data = await apiGet<CatalogReferenceDto>(
          `/partner/listings/catalog-reference?${query.toString()}`,
        );
        if (!cancelled) {
          const nextFields = (data.fields ?? []).filter(
            (field) => !/^Характеристика\s+\d+$/iu.test(field.label),
          );
          setCatalogReferenceDnsFields(nextFields);
          const defaults = Object.fromEntries(
            nextFields
              .filter((field) => field.defaultValue)
              .map((field) => [field.key, field.defaultValue as string]),
          );
          const existingReferenceValues = editingListing
            ? Object.fromEntries(
                nextFields
                  .map((field) => [
                    field.key,
                    getAttributeValue(editingListing.attributes, [
                      field.label,
                      field.key,
                    ]),
                  ])
                  .filter((entry): entry is [string, string] => Boolean(entry[1])),
              )
            : {};
          const allowedKeys = new Set([
            "brand",
            "model",
            ...nextFields.map((field) => field.key),
          ]);
          setForm((prev) => ({
            ...prev,
            characteristics: {
              ...Object.fromEntries(
                Object.entries(prev.characteristics).filter(([key]) =>
                  allowedKeys.has(key),
                ),
              ),
              ...defaults,
              ...existingReferenceValues,
            },
          }));
        }
      } catch {
        if (!cancelled) {
          setCatalogReferenceDnsFields([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    form.catalogItem,
    form.characteristics.brand,
    form.characteristics.model,
    editingListing,
    isCreateOpen,
    isCatalogReferenceCreation,
  ]);

  const hasMeetingAddress = form.meetingAddress.trim().length >= 5;
  const resetCreateFlow = useCallback(() => {
    setInlineEditingId(null);
    setInlineForm(null);
    setEditingListing(null);
    setFormIssue(null);
    setInlineIssue(null);
    setIsCharacteristicRequestOpen(false);
    setCatalogRequestMode("characteristic");
    const defaultAddressValue =
      defaultProfileAddress?.fullAddress?.trim() ?? "";
    setSelectedMeetingAddressId(defaultProfileAddress?.id ?? "");
    setForm({
      ...buildInitialForm(listingTypeFilter),
      meetingAddress: defaultAddressValue,
    });
    setActiveDraftId(null);
    setTitlePickedFromSuggestion(false);
    setTitleSuggestions([]);
    setCreateSuggestionMatches([]);
    setCreationScreen("start");
    void loadDrafts(listingTypeFilter);
  }, [defaultProfileAddress, listingTypeFilter, loadDrafts]);

  const closeCreateFlow = useCallback(() => {
    setCreationScreen("start");
    setTitleSuggestions([]);
    setTitlePickedFromSuggestion(false);
    setCreateSuggestionMatches([]);
    setIsCharacteristicRequestOpen(false);
    setCatalogRequestMode("characteristic");
    setEditingListing(null);
    if (createMode && onExitCreate) {
      onExitCreate();
      return;
    }
    setShowModal(false);
  }, [createMode, onExitCreate]);

  useEffect(() => {
    if (!createMode) {
      createRouteInitializedRef.current = false;
      return;
    }
    if (createRouteInitializedRef.current) return;
    createRouteInitializedRef.current = true;
    resetCreateFlow();
  }, [createMode, resetCreateFlow]);

  const openCreate = () => {
    if (onOpenCreateListing) {
      onOpenCreateListing();
      return;
    }
    setEditingListing(null);
    resetCreateFlow();
    setShowModal(true);
  };

  const resetAddressModalState = useCallback(() => {
    resetAddressModalStateHandler({
      addressInputBlurTimeoutRef,
      isSelectingAddressSuggestionRef,
      setAddressMapHint,
      setAddressSuggestions,
      setAddressSuggestionActiveIndex,
      setIsAddressInputFocused,
      setMapCenterQuery,
      setAddressForm,
    });
  }, []);

  const openAddressCreateModal = useCallback(() => {
    openAddressCreateModalHandler({
      addresses: profileAddresses,
      profile: null,
      resetAddressModalState,
      setIsNativeAddressSuggestEnabled,
      setMapCenterQuery,
      setAddressModalOpen,
    });
  }, [profileAddresses, resetAddressModalState]);

  const closeAddressCreateModal = useCallback(() => {
    closeAddressCreateModalHandler({
      resetAddressModalState,
      setAddressModalOpen,
    });
  }, [resetAddressModalState]);

  const onAddressFullAddressChange = useCallback((value: string) => {
    handleAddressFullAddressChangeHandler({
      value,
      setAddressMapHint,
      setIsAddressInputFocused,
      setAddressForm,
    });
  }, []);

  const addressFullInputHandlers = useMemo(
    () =>
      createAddressInputHandlers({
        fullAddress: addressForm.fullAddress,
        addressInputBlurTimeoutRef,
        isSelectingAddressSuggestionRef,
        applyFullAddressValueRef,
        setAddressMapHint,
        setIsAddressInputFocused,
        setAddressSuggestionActiveIndex,
        setAddressSuggestions,
      }),
    [addressForm.fullAddress],
  );

  const handleAddressSelectFromMap = useCallback(
    (address: AddressMapSelection) => {
      setAddressForm((prev) => mergeAddressFromMap(prev, address));
      setAddressMapHint("");
      setMapCenterQuery(resolveMapCenterQuery(address));
    },
    [],
  );

  const createAddress = useCallback(async () => {
    const prepared = await prepareCreateAddressPayload({
      addressForm,
      currentAddressCount: profileAddresses.length,
      geocodeAddress: geocodeProfileAddress,
    });

    if ("error" in prepared) {
      setAddressMapHint(prepared.error);
      return;
    }

    try {
      const created = await apiPost<Address>("/profile/addresses", prepared.payload);
      resetAddressModalState();
      setAddressModalOpen(false);

      const refreshedAddresses = await loadProfileAddresses();
      const selectedAddress =
        refreshedAddresses.find((address) => address.id === created.id) ??
        normalizeProfileAddresses([created])[0] ??
        null;
      if (selectedAddress) {
        selectMeetingAddress(selectedAddress);
      }
      showNotice("Адрес самовывоза добавлен", "success");
    } catch (error) {
      setAddressMapHint(
        error instanceof Error ? error.message : "Не удалось добавить адрес",
      );
    }
  }, [
    addressForm,
    loadProfileAddresses,
    profileAddresses.length,
    resetAddressModalState,
    selectMeetingAddress,
    showNotice,
  ]);

  const openEdit = (listing: Listing) => {
    setInlineIssue(null);
    setFormIssue(null);
    setInlineEditingId(null);
    setInlineForm(null);
    const normalizedImages =
      listing.images && listing.images.length > 0
        ? listing.images
        : listing.image
          ? [listing.image]
          : [];
    const categoryRoot =
      getMetaAttribute(listing.attributes, META_ATTR_CATEGORY_ROOT) ||
      listing.category ||
      "";
    const subcategory = getMetaAttribute(
      listing.attributes,
      META_ATTR_SUBCATEGORY,
    );
    const customCatalogItem = getMetaAttribute(
      listing.attributes,
      META_ATTR_CATALOG_ITEM_CUSTOM,
    );
    const catalogItem = customCatalogItem
      ? CUSTOM_OPTION
      : getMetaAttribute(listing.attributes, META_ATTR_CATALOG_ITEM);
    const inlineSelectedCategory =
      catalogCategories.find((category) => category.name === categoryRoot) ??
      null;
    const inlineSelectedSubcategory =
      inlineSelectedCategory?.subcategories.find(
        (item) => item.name === subcategory,
      ) ?? null;
    const fields = getCharacteristicFields(
      listingTypeFilter,
      subcategory,
      inlineSelectedSubcategory,
      catalogItem,
    );
    setEditingListing(listing);
    setForm({
      title: listing.title,
      price: String(listing.price),
      condition: listing.condition === "new" ? "new" : "used",
      description: listing.description ?? "",
      category: catalogItem || subcategory || categoryRoot,
      categoryRoot,
      customCategoryRoot: "",
      subcategory,
      customSubcategory: "",
      catalogItem,
      customCatalogItem,
      ...catalogRequestFieldsFromAttributes(listing.attributes),
      type: listingTypeFilter,
      meetingAddress: getMetaAttribute(
        listing.attributes,
        META_ATTR_MEETING_ADDRESS,
      ),
      images: normalizedImages,
      hasDefects:
        (getMetaAttribute(
          listing.attributes,
          META_ATTR_HAS_DEFECTS,
        ) as DefectsValue) || "",
      characteristics: {
        ...attributesToCharacteristics(listing.attributes, fields),
        ...referenceCharacteristicsFromAttributes(listing.attributes),
      },
      hasMultipleStock:
        getMetaAttribute(listing.attributes, "Несколько штук в наличии") ===
        "Да",
    });
    setTitleSuggestions([]);
    setCreateSuggestionMatches([]);
    setActiveDraftId(null);
    setCreationScreen("details");
    setShowModal(true);
  };

  const onFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        reportFormIssue(`Файл ${file.name} не является изображением`);
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        reportFormIssue(`Файл ${file.name} больше 3 МБ`);
        return;
      }
    }

    const encoded = await Promise.all(files.map((file) => fileToDataUrl(file)));
    const images = [...form.images, ...encoded].slice(0, MAX_IMAGES);
    const imageError = await validateImageDuplicates(images);
    if (imageError) {
      reportFormIssue(imageError);
      return;
    }

    setFormIssue(null);
    setForm((prev) => ({ ...prev, images }));
  };

  const removeImage = (index: number) => {
    const minImages = getMinImagesForType(form.type);
    if (form.images.length <= minImages) {
      reportFormIssue(`Нужно оставить минимум ${minImages} фото`);
      return;
    }
    setForm((prev) => {
      const images = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images,
      };
    });
  };

  const validateCatalogSelection = (): string | null => {
    if (!form.categoryRoot) return "Выберите категорию";
    if (form.categoryRoot === CUSTOM_OPTION && getResolvedCategoryRoot(form).length < 2)
      return "Укажите свою категорию";
    if (!form.subcategory) return "Выберите подкатегорию";
    if (form.subcategory === CUSTOM_OPTION && getResolvedSubcategory(form).length < 2)
      return "Укажите свою подкатегорию";
    if (!form.catalogItem) return "Выберите вид товара";
    if (isCustomCatalogBranch(form) && getResolvedCatalogItem(form).length < 2)
      return "Укажите свой вид товара";
    return null;
  };

  const validateDetails = async (): Promise<string | null> => {
    const catalogError = validateCatalogSelection();
    if (catalogError) return catalogError;
    if (form.title.trim().length < 2) return "Укажите название объявления";
    const imageError = await validateImages(form.type, form.images);
    if (imageError) return imageError;
    if (form.description.trim().length < 10)
      return "Описание должно быть не короче 10 символов";
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) return "Укажите корректную цену";
    if (form.meetingAddress.trim().length < 5) {
      return "Выберите или добавьте адрес самовывоза";
    }
    if (isCatalogReferenceCreation) {
      if (!form.characteristics.brand?.trim()) return "Заполните характеристику: Бренд";
      if (!catalogReferenceBrands.includes(form.characteristics.brand.trim())) {
        return "Выберите бренд из подсказки";
      }
      if (!form.characteristics.model?.trim()) return "Заполните характеристику: Модель";
      if (!catalogReferenceModels.includes(form.characteristics.model.trim())) {
        return "Выберите модель из подсказки";
      }
      for (const field of effectiveCharacteristicFields) {
        const selectedValue = form.characteristics[field.key]?.trim() ?? "";
        if (field.required && !selectedValue) {
          return `Заполните характеристику: ${field.label}`;
        }
        if (
          field.options?.length &&
          selectedValue &&
          !field.options.includes(selectedValue)
        ) {
          return field.locked
            ? `Характеристика «${field.label}» зафиксирована DNS`
            : `Выберите значение из подсказки: ${field.label}`;
        }
      }
    } else if (isCustomCatalogBranch(form)) {
      if (form.catalogRequestAttributes.trim().length < 10) {
        return "Опишите важные характеристики для заявки на добавление вида";
      }
    } else {
      for (const field of effectiveCharacteristicFields) {
        const selectedValue = form.characteristics[field.key]?.trim() ?? "";
        if (field.required && !selectedValue) {
          return `Заполните характеристику: ${field.label}`;
        }
        if (
          field.options?.length &&
          selectedValue &&
          !field.options.includes(selectedValue)
        ) {
          return `Выберите значение из подсказки: ${field.label}`;
        }
        if (
          selectedValue === CUSTOM_VALUE_OPTION &&
          (form.characteristics[`__custom_${field.key}`]?.trim().length ?? 0) < 2
        ) {
          return `Предложите значение: ${field.label}`;
        }
      }
    }
    return null;
  };

  const prevStep = () => {
    if (editingListing && creationScreen === "details") {
      closeCreateFlow();
      return;
    }
    if (creationScreen === "details") {
      setCreationScreen("titleSearch");
      return;
    }
    if (creationScreen === "manualCategory") {
      setCreationScreen("start");
      return;
    }
    if (creationScreen === "titleSearch") {
      if (form.categoryRoot) {
        setCreationScreen("manualCategory");
        return;
      }
      setCreationScreen("start");
      return;
    }
    closeCreateFlow();
  };

  const save = async () => {
    if (isCreateSaving) return;

    const err = await validateDetails();
    if (err) {
      reportFormIssue(err);
      return;
    }
    setFormIssue(null);
    const snapshotForm = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      meetingAddress: form.meetingAddress.trim(),
      customCategoryRoot: form.customCategoryRoot.trim(),
      customSubcategory: form.customSubcategory.trim(),
      customCatalogItem: form.customCatalogItem.trim(),
      catalogRequestAttributes: form.catalogRequestAttributes.trim(),
      catalogRequestComment: form.catalogRequestComment.trim(),
      price: String(Math.round(Number(form.price))),
      images: [...form.images],
      characteristics: normalizeCharacteristics(
        effectiveCharacteristicFields,
        form.characteristics,
      ),
    };
    const resolvedCatalogItem = getResolvedCatalogItem(snapshotForm);
    const resolvedCategoryRoot = getResolvedCategoryRoot(snapshotForm);
    const resolvedSubcategory = getResolvedSubcategory(snapshotForm);
    const imageModerationSignals = await analyzeListingImagesForModeration(
      snapshotForm.images,
    );

    const attributes: ListingAttribute[] = [
      ...characteristicsToAttributes(
        snapshotForm.characteristics,
        effectiveCharacteristicFields,
      ),
      ...(isCustomCatalogBranch(snapshotForm)
        ? [
            { key: "brand", value: snapshotForm.characteristics.brand ?? "" },
            { key: "model", value: snapshotForm.characteristics.model ?? "" },
          ]
        : []),
      { key: META_ATTR_CATEGORY_ROOT, value: resolvedCategoryRoot },
      { key: META_ATTR_SUBCATEGORY, value: resolvedSubcategory },
      { key: META_ATTR_CATALOG_ITEM, value: resolvedCatalogItem },
      {
        key: META_ATTR_CATALOG_ITEM_CUSTOM,
        value:
          isCustomCatalogBranch(snapshotForm) ? resolvedCatalogItem : "",
      },
      ...buildCatalogRequestAttributes(snapshotForm),
      ...(isCustomCatalogBranch(snapshotForm)
        ? []
        : isCatalogReferenceCreation
          ? []
          : [
            { key: META_ATTR_HAS_DEFECTS, value: snapshotForm.hasDefects },
            { key: "Дефекты", value: getDefectsLabel(snapshotForm.hasDefects) },
          ]),
      ...(snapshotForm.hasMultipleStock
        ? [{ key: "Несколько штук в наличии", value: "Да" }]
        : []),
      { key: META_ATTR_MEETING_ADDRESS, value: snapshotForm.meetingAddress },
    ].filter((attribute) => attribute.value.trim());

    const payload = {
      title: snapshotForm.title,
      price: Number(snapshotForm.price),
      condition: snapshotForm.condition,
      description: snapshotForm.description,
      category: resolvedCatalogItem || resolvedSubcategory || resolvedCategoryRoot,
      images: snapshotForm.images,
      imageModerationSignals,
      attributes,
    };

    setIsCreateSaving(true);
    try {
      if (editingListing) {
        const updated = await apiPatch<Listing>(
          `/partner/listings/${editingListing.id}`,
          payload,
        );
        showNotice("Изменения сохранены", "success");
        if (listingTypeFilter !== snapshotForm.type) {
          setListingTypeFilter(snapshotForm.type);
        } else {
          setListings((prev) =>
            prev.map((listing) =>
              listing.id === updated.id ? updated : listing,
            ),
          );
          await loadListings();
        }
        closeCreateFlow();
        return;
      }

      const created = await apiPost<Listing>("/partner/listings", {
        ...payload,
        type: snapshotForm.type,
        draftId: activeDraftId,
      });

      showNotice("Объявление отправлено на модерацию", "success");

      if (listingTypeFilter !== snapshotForm.type) {
        setListingTypeFilter(snapshotForm.type);
      } else {
        setListings((prev) => [
          created,
          ...prev.filter((listing) => listing.id !== created.id),
        ]);
        await loadListings();
      }

      await loadDrafts(snapshotForm.type);
      closeCreateFlow();
    } catch (error) {
      reportFormIssue(
        error instanceof Error ? error.message : "Не удалось сохранить объявление",
      );
    } finally {
      setIsCreateSaving(false);
    }
  };

  const remove = (id: string) => {
    setDeleteCandidateId(id);
  };

  const confirmRemove = async () => {
    if (!deleteCandidateId) return;
    setIsDeleteBusy(true);
    try {
      await apiDelete<{ success: boolean }>(
        `/partner/listings/${deleteCandidateId}`,
      );
      await loadListings();
      showNotice("Объявление удалено", "success");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Не удалось удалить объявление",
        "error",
      );
    } finally {
      setIsDeleteBusy(false);
      setDeleteCandidateId(null);
    }
  };

  const toggleStatus = async (listing: Listing) => {
    try {
      await apiPost<{ success: boolean }>(
        `/partner/listings/${listing.id}/toggle-status`,
      );
      await loadListings();
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Не удалось сменить статус",
        "error",
      );
    }
  };

  const inlineAddressSuggestions = useMemo(() => {
    if (!inlineForm) return [];
    const q = inlineForm.meetingAddress.trim().toLocaleLowerCase("ru-RU");
    if (!q) return addressBook.slice(0, 8);
    return addressBook
      .filter((x) => x.toLocaleLowerCase("ru-RU").includes(q))
      .slice(0, 8);
  }, [addressBook, inlineForm]);

  const cancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineForm(null);
    setInlineIssue(null);
  };

  const onInlineFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!inlineForm || !files.length) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        reportInlineIssue(`Файл ${file.name} не является изображением`);
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        reportInlineIssue(`Файл ${file.name} больше 3 МБ`);
        return;
      }
    }

    const encoded = await Promise.all(files.map((file) => fileToDataUrl(file)));
    const images = [...inlineForm.images, ...encoded].slice(0, MAX_IMAGES);
    const imageError = await validateImageDuplicates(images);
    if (imageError) {
      reportInlineIssue(imageError);
      return;
    }

    setInlineIssue(null);
    setInlineForm((prev) => (prev ? { ...prev, images } : prev));
  };

  const removeInlineImage = (index: number) => {
    if (!inlineForm) return;
    const minImages = getMinImagesForType(inlineForm.type);
    if (inlineForm.images.length <= minImages) {
      reportInlineIssue(`Нужно оставить минимум ${minImages} фото`);
      return;
    }
    setInlineForm((prev) => {
      if (!prev) return prev;
      const images = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images,
      };
    });
  };

  const saveInlineEdit = async (listing: Listing) => {
    if (!inlineForm) return;

    const title = inlineForm.title.trim();
    const description = inlineForm.description.trim();
    const meetingAddress = inlineForm.meetingAddress.trim();
    const price = Math.round(Number(inlineForm.price));
    const inlineSelectedCategory =
      catalogCategories.find(
        (category) => category.name === inlineForm.categoryRoot,
      ) ?? null;
    const inlineSelectedSubcategory =
      inlineSelectedCategory?.subcategories.find(
        (subcategory) => subcategory.name === inlineForm.subcategory,
      ) ?? null;
    const inlineCharacteristicFields = getCharacteristicFields(
      inlineForm.type,
      inlineForm.subcategory,
      inlineSelectedSubcategory,
      inlineForm.catalogItem,
    );
    const inlineCharacteristics = normalizeCharacteristics(
      inlineCharacteristicFields,
      inlineForm.characteristics,
    );
    const resolvedInlineCatalogItem = getResolvedCatalogItem(inlineForm);
    const resolvedInlineCategoryRoot = getResolvedCategoryRoot(inlineForm);
    const resolvedInlineSubcategory = getResolvedSubcategory(inlineForm);

    if (title.length < 2) {
      reportInlineIssue("Укажите название объявления");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      reportInlineIssue("Укажите корректную цену");
      return;
    }
    if (
      !inlineForm.categoryRoot ||
      !inlineForm.subcategory ||
      !inlineForm.catalogItem
    ) {
      reportInlineIssue("Выберите категорию");
      return;
    }
    if (
      inlineForm.categoryRoot === CUSTOM_OPTION &&
      resolvedInlineCategoryRoot.length < 2
    ) {
      reportInlineIssue("Укажите свою категорию");
      return;
    }
    if (
      inlineForm.subcategory === CUSTOM_OPTION &&
      resolvedInlineSubcategory.length < 2
    ) {
      reportInlineIssue("Укажите свою подкатегорию");
      return;
    }
    if (
      isCustomCatalogBranch(inlineForm) &&
      resolvedInlineCatalogItem.length < 2
    ) {
      reportInlineIssue("Укажите свой вид товара");
      return;
    }
    if (description.length < 10) {
      reportInlineIssue("Описание должно быть не короче 10 символов");
      return;
    }
    if (meetingAddress.length < 5) {
      reportInlineIssue("Укажите адрес");
      return;
    }
    const minImages = getMinImagesForType(inlineForm.type);
    if (inlineForm.images.length < minImages) {
      reportInlineIssue(`Добавьте минимум ${minImages} фото`);
      return;
    }
    const imageError = await validateImages(inlineForm.type, inlineForm.images);
    if (imageError) {
      reportInlineIssue(imageError);
      return;
    }
    const imageModerationSignals = await analyzeListingImagesForModeration(
      inlineForm.images,
    );
    if (!isCustomCatalogBranch(inlineForm) && !inlineForm.hasDefects) {
      reportInlineIssue("Укажите, есть ли дефекты");
      return;
    }
    if (
      isCustomCatalogBranch(inlineForm) &&
      inlineForm.catalogRequestAttributes.trim().length < 10
    ) {
      reportInlineIssue(
        "Опишите важные характеристики для заявки на добавление вида",
      );
      return;
    }
    for (const field of inlineCharacteristicFields) {
      const selectedValue = inlineCharacteristics[field.key]?.trim() ?? "";
      if (field.required && !selectedValue) {
        reportInlineIssue(`Заполните характеристику: ${field.label}`);
        return;
      }
      if (
        field.options?.length &&
        selectedValue &&
        !field.options.includes(selectedValue)
      ) {
        reportInlineIssue(`Выберите значение из подсказки: ${field.label}`);
        return;
      }
      if (
        selectedValue === CUSTOM_VALUE_OPTION &&
        (inlineCharacteristics[`__custom_${field.key}`]?.trim().length ?? 0) < 2
      ) {
        reportInlineIssue(`Предложите значение: ${field.label}`);
        return;
      }
    }

    const attributes: ListingAttribute[] = [
      ...characteristicsToAttributes(
        inlineCharacteristics,
        inlineCharacteristicFields,
      ),
      ...(isCustomCatalogBranch(inlineForm)
        ? [
            { key: "brand", value: inlineForm.characteristics.brand ?? "" },
            { key: "model", value: inlineForm.characteristics.model ?? "" },
          ]
        : []),
      { key: META_ATTR_CATEGORY_ROOT, value: resolvedInlineCategoryRoot },
      { key: META_ATTR_SUBCATEGORY, value: resolvedInlineSubcategory },
      { key: META_ATTR_CATALOG_ITEM, value: resolvedInlineCatalogItem },
      {
        key: META_ATTR_CATALOG_ITEM_CUSTOM,
        value:
          isCustomCatalogBranch(inlineForm)
            ? resolvedInlineCatalogItem
            : "",
      },
      ...buildCatalogRequestAttributes(inlineForm),
      ...(isCustomCatalogBranch(inlineForm)
        ? []
        : [
            { key: META_ATTR_HAS_DEFECTS, value: inlineForm.hasDefects },
            { key: "Дефекты", value: getDefectsLabel(inlineForm.hasDefects) },
          ]),
    ].filter((attribute) => attribute.value.trim());
    attributes.push({ key: META_ATTR_MEETING_ADDRESS, value: meetingAddress });

    const payload = {
      title,
      price,
      condition: inlineForm.condition,
      description,
      category:
        resolvedInlineCatalogItem ||
        resolvedInlineSubcategory ||
        resolvedInlineCategoryRoot,
      images: inlineForm.images,
      imageModerationSignals,
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
              category: payload.category,
              city: optimisticCity,
              image: inlineForm.images[0] ?? item.image,
              images: inlineForm.images,
              status: "moderation",
            }
          : item,
      ),
    );

    setIsInlineSaving(true);
    setInlineIssue(null);
    cancelInlineEdit();
    try {
      await apiPatch<Listing>(`/partner/listings/${listing.id}`, payload);
      await loadListings();
      showNotice("Изменения сохранены", "success");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить изменения",
        "error",
      );
      await loadListings();
    } finally {
      setIsInlineSaving(false);
    }
  };

  const getStatusLabel = (status: Listing["status"]) => {
    if (status === "active")
      return { label: "Активно", color: "bg-green-100 text-green-700" };
    if (status === "moderation")
      return { label: "На модерации", color: "bg-yellow-100 text-yellow-700" };
    return { label: "Неактивно", color: "bg-gray-100 text-gray-700" };
  };

  const openCatalogRequest = () => {
    setCatalogRequestMode("catalog");
    setIsCharacteristicRequestOpen(true);
  };

  const openCharacteristicRequest = () => {
    setCatalogRequestMode("characteristic");
    setIsCharacteristicRequestOpen(true);
  };

  const submitCharacteristicRequest = async (
    request: CatalogRequestModalPayload,
  ) => {
    const comment = [
      request.link ? `Ссылка: ${request.link.trim()}` : "",
      request.email ? `Почта: ${request.email.trim()}` : "",
      request.photoName ? `Фото товара: ${request.photoName}` : "",
      request.photoLabel ? `Файл фото: ${request.photoLabel}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await apiPost("/partner/listings/catalog-requests", {
        mode: catalogRequestMode,
        categoryName: request.category.trim(),
        subcategoryName: request.subcategory.trim(),
        itemName: request.item.trim(),
        brand: request.brand.trim(),
        model: request.model.trim(),
        importantAttributes: request.details.trim(),
        comment,
        link: request.link.trim(),
        email: request.email.trim(),
        photoName: request.photoName,
        photoLabel: request.photoLabel.trim(),
        title: form.title.trim(),
      });
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Не удалось отправить запрос",
        "error",
      );
      throw error;
    }

    setForm((prev) => ({
      ...prev,
      ...(catalogRequestMode === "catalog"
        ? {
            categoryRoot: CUSTOM_OPTION,
            customCategoryRoot: request.category.trim(),
            subcategory: CUSTOM_OPTION,
            customSubcategory: request.subcategory.trim(),
            catalogItem: CUSTOM_OPTION,
            customCatalogItem: request.item.trim(),
            category: request.item.trim(),
          }
        : {}),
      catalogRequestAttributes: request.details.trim(),
      catalogRequestComment: comment,
      characteristics: {
        ...prev.characteristics,
        brand: request.brand.trim(),
        model: request.model.trim(),
      },
    }));
    setIsCharacteristicRequestOpen(false);
    if (catalogRequestMode === "catalog") {
      setCreationScreen("details");
    }
    showNotice(
      catalogRequestMode === "catalog"
        ? "Запрос добавлен, заполните объявление"
        : "Запрос добавлен к объявлению",
      "success",
    );
    setCatalogRequestMode("characteristic");
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
      <ProfileAddressCreateModal
        open={addressModalOpen}
        addressForm={addressForm}
        addressMapHint={addressMapHint}
        mapCenterQuery={mapCenterQuery}
        addressFullInputRef={addressFullInputRef}
        onClose={closeAddressCreateModal}
        onAddressNameChange={(value) => {
          setAddressForm((prev) => ({ ...prev, name: value }));
        }}
        onAddressFullAddressChange={onAddressFullAddressChange}
        onAddressFullAddressFocus={addressFullInputHandlers.onFocus}
        onAddressFullAddressBlur={addressFullInputHandlers.onBlur}
        onAddressFullAddressEnter={addressFullInputHandlers.onEnter}
        onAddressFullAddressEscape={addressFullInputHandlers.onEscape}
        onAddressSelectFromMap={handleAddressSelectFromMap}
        onCreateAddress={() => {
          void createAddress();
        }}
      />
      <CatalogRequestModal
        open={isCharacteristicRequestOpen}
        mode={catalogRequestMode}
        form={form}
        onClose={() => {
          setIsCharacteristicRequestOpen(false);
          setCatalogRequestMode("characteristic");
        }}
        onSubmit={submitCharacteristicRequest}
      />

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="dashboard-title">Мои объявления</h2>
          <p className="dashboard-subtitle">
            Управляйте карточками, статусами и видимостью
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2.5"
        >
          <Plus className="h-4 w-4" /> Создать
        </button>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Активные</div>
          <div className="dashboard-stat__value">{stats.active}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">На модерации</div>
          <div className="dashboard-stat__value">{stats.moderation}</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Неактивные</div>
          <div className="dashboard-stat__value">{stats.inactive}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, описанию и категории..."
            className="dashboard-search__input"
          />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            className="dashboard-select"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
            <option value="moderation">На модерации</option>
          </select>
          <select
            value={listingTypeFilter}
            onChange={() => setListingTypeFilter("products")}
            className="dashboard-select"
          >
            <option value="products">Товары</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {filteredListings.map((listing) => {
            const status = getStatusLabel(listing.status);
            const rejectionReason =
              listing.moderation?.status === "rejected"
                ? listing.moderation.reasonNote?.trim() ||
                  listing.moderation.reasonCode
                    ?.toLocaleLowerCase("ru-RU")
                    .replace(/[_-]+/g, " ")
                    .replace(/\s+/g, " ")
                : "";
            const inlineSelectedCategory = inlineForm
              ? (catalogCategories.find(
                  (category) => category.name === inlineForm.categoryRoot,
                ) ?? null)
              : null;
            const inlineSelectedSubcategory =
              inlineSelectedCategory && inlineForm
                ? (inlineSelectedCategory.subcategories.find(
                    (subcategory) =>
                      subcategory.name === inlineForm.subcategory,
                  ) ?? null)
                : null;
            const inlineCharacteristicFields = inlineForm
              ? getCharacteristicFields(
                  inlineForm.type,
                  inlineForm.subcategory,
                  inlineSelectedSubcategory,
                  inlineForm.catalogItem,
                )
              : [];
            return (
              <article key={listing.id} className="dashboard-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => openListingPage(listing.id)}
                    className="h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition hover:border-blue-300"
                    title="Открыть карточку объявления"
                  >
                    <img
                      src={listing.image || FALLBACK_IMAGE}
                      alt={listing.title}
                      className="h-full w-full object-contain"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openListingPage(listing.id)}
                      className="block max-w-full truncate text-left text-sm font-semibold text-gray-900 transition hover:text-blue-700 hover:underline md:text-base"
                      title="Открыть карточку объявления"
                    >
                      {listing.title}
                    </button>
                    <div className="text-sm text-gray-600">
                      {listing.price.toLocaleString("ru-RU")} ₽
                    </div>
                    <div className="text-xs text-gray-500">
                      Просмотры: {listing.views}
                    </div>
                    {listing.city && (
                      <div className="text-xs text-gray-500">
                        {listing.city}
                      </div>
                    )}
                    {rejectionReason ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                        Причина отказа: {rejectionReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${status.color}`}
                    >
                      {status.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openListingPage(listing.id)}
                        title="Открыть карточку"
                        className="rounded-lg p-2 hover:bg-gray-100"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleStatus(listing)}
                        disabled={isInlineSaving}
                        title={
                          listing.status === "inactive"
                            ? "Отправить повторно на проверку"
                            : "Снять с публикации"
                        }
                        className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {listing.status === "inactive" ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(listing)}
                        className="rounded-lg p-2 hover:bg-gray-100"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(listing.id)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                        <InlineIssue message={inlineIssue} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <label className={FIELD_LABEL_CLASS}>
                              Название
                            </label>
                            <input
                              value={inlineForm.title}
                              onChange={(e) =>
                                setInlineForm((prev) =>
                                  prev
                                    ? { ...prev, title: e.target.value }
                                    : prev,
                                )
                              }
                              className={FIELD_CLASS}
                              placeholder="Название объявления"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className={FIELD_LABEL_CLASS}>Цена</label>
                            <input
                              type="number"
                              value={inlineForm.price}
                              onChange={(e) =>
                                setInlineForm((prev) =>
                                  prev
                                    ? { ...prev, price: e.target.value }
                                    : prev,
                                )
                              }
                              className={FIELD_CLASS}
                              placeholder="Цена, ₽"
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-1">
                            <label className={FIELD_LABEL_CLASS}>
                              Категория
                            </label>
                            <select
                              value={inlineForm.categoryRoot}
                              onChange={(e) =>
                                setInlineForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        categoryRoot: e.target.value,
                                        customCategoryRoot:
                                          e.target.value === CUSTOM_OPTION
                                            ? prev.customCategoryRoot
                                            : "",
                                        subcategory: "",
                                        customSubcategory: "",
                                        catalogItem: "",
                                        customCatalogItem: "",
                                        ...catalogRequestDefaults(),
                                        category: e.target.value,
                                        characteristics: {},
                                      }
                                    : prev,
                                )
                              }
                              className={FIELD_CLASS}
                            >
                              <option value="">Выберите категорию</option>
                              {catalogCategories.map((x) => (
                                <option key={x.id} value={x.name}>
                                  {x.name}
                                </option>
                              ))}
                              <option value={CUSTOM_OPTION}>
                                {CUSTOM_CATEGORY_OPTION}
                              </option>
                            </select>
                          </div>
                          {inlineForm.categoryRoot === CUSTOM_OPTION && (
                            <div className="space-y-1 md:col-span-2">
                              <label className={FIELD_LABEL_CLASS}>
                                Своя категория
                              </label>
                              <input
                                value={inlineForm.customCategoryRoot}
                                onChange={(e) =>
                                  setInlineForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          customCategoryRoot: e.target.value,
                                          category: e.target.value,
                                        }
                                      : prev,
                                  )
                                }
                                className={FIELD_CLASS}
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className={FIELD_LABEL_CLASS}>
                              Подкатегория
                            </label>
                            <select
                              value={inlineForm.subcategory}
                              onChange={(e) =>
                                setInlineForm((prev) => {
                                  if (!prev) return prev;
                                  const nextSubcategory = e.target.value;
                                  const nextSelectedSubcategory =
                                    inlineSelectedCategory?.subcategories.find(
                                      (item) => item.name === nextSubcategory,
                                    ) ?? null;
                                  return {
                                    ...prev,
                                    subcategory: nextSubcategory,
                                    customSubcategory:
                                      nextSubcategory === CUSTOM_OPTION
                                        ? prev.customSubcategory
                                        : "",
                                    catalogItem: "",
                                    customCatalogItem: "",
                                    ...catalogRequestDefaults(),
                                    category: nextSubcategory,
                                    characteristics: normalizeCharacteristics(
                                      getCharacteristicFields(
                                        prev.type,
                                        nextSubcategory,
                                        nextSelectedSubcategory,
                                        "",
                                      ),
                                      prev.characteristics,
                                    ),
                                  };
                                })
                              }
                              className={FIELD_CLASS}
                            >
                              <option value="">Выберите подкатегорию</option>
                              {inlineSelectedCategory?.subcategories.map(
                                (x) => (
                                  <option key={x.id} value={x.name}>
                                    {x.name}
                                  </option>
                                ),
                              )}
                              <option value={CUSTOM_OPTION}>
                                {CUSTOM_SUBCATEGORY_OPTION}
                              </option>
                            </select>
                          </div>
                          {inlineForm.subcategory === CUSTOM_OPTION && (
                            <div className="space-y-1 md:col-span-2">
                              <label className={FIELD_LABEL_CLASS}>
                                Своя подкатегория
                              </label>
                              <input
                                value={inlineForm.customSubcategory}
                                onChange={(e) =>
                                  setInlineForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          customSubcategory: e.target.value,
                                          category: e.target.value,
                                        }
                                      : prev,
                                  )
                                }
                                className={FIELD_CLASS}
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className={FIELD_LABEL_CLASS}>Вид</label>
                            <select
                              value={inlineForm.catalogItem}
                              onChange={(e) =>
                                setInlineForm((prev) => {
                                  if (!prev) return prev;
                                  const nextCatalogItem = e.target.value;
                                  return {
                                    ...prev,
                                    catalogItem: nextCatalogItem,
                                    customCatalogItem:
                                      nextCatalogItem === CUSTOM_OPTION
                                        ? prev.customCatalogItem
                                        : "",
                                    ...(nextCatalogItem === CUSTOM_OPTION
                                      ? {}
                                      : catalogRequestDefaults()),
                                    category: nextCatalogItem,
                                    characteristics: normalizeCharacteristics(
                                      getCharacteristicFields(
                                        prev.type,
                                        prev.subcategory,
                                        inlineSelectedSubcategory,
                                        nextCatalogItem,
                                      ),
                                      prev.characteristics,
                                    ),
                                  };
                                })
                              }
                              className={FIELD_CLASS}
                            >
                              <option value="">Выберите вид</option>
                              {catalogItemOptions(
                                inlineSelectedSubcategory,
                              ).map((x) => (
                                <option key={x} value={x}>
                                  {x === CUSTOM_OPTION ? CUSTOM_ITEM_OPTION : x}
                                </option>
                              ))}
                            </select>
                          </div>
                          {inlineForm.catalogItem === CUSTOM_OPTION && (
                            <div className="space-y-1 md:col-span-3">
                              <label className={FIELD_LABEL_CLASS}>
                                Свой вид
                              </label>
                              <input
                                value={inlineForm.customCatalogItem}
                                onChange={(e) =>
                                  setInlineForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          customCatalogItem: e.target.value,
                                          category: e.target.value,
                                        }
                                      : prev,
                                  )
                                }
                                className={FIELD_CLASS}
                                placeholder="Например: умная колонка с экраном"
                              />
                            </div>
                          )}
                        </div>

                        {!isCustomCatalogBranch(inlineForm) && (
                          <>
                            <div className="space-y-2">
                              <label className={FIELD_LABEL_CLASS}>
                                Состояние
                              </label>
                              <div className="grid gap-2 md:grid-cols-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineForm((prev) =>
                                      prev
                                        ? { ...prev, condition: "new" }
                                        : prev,
                                    )
                                  }
                                  className={choiceButtonClass(
                                    inlineForm.condition === "new",
                                  )}
                                >
                                  Новое
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineForm((prev) =>
                                      prev
                                        ? { ...prev, condition: "restored" }
                                        : prev,
                                    )
                                  }
                                  className={choiceButtonClass(
                                    inlineForm.condition === "restored",
                                  )}
                                >
                                  Восстановленное
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineForm((prev) =>
                                      prev
                                        ? { ...prev, condition: "used" }
                                        : prev,
                                    )
                                  }
                                  className={choiceButtonClass(
                                    inlineForm.condition === "used",
                                  )}
                                >
                                  Б/у
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className={FIELD_LABEL_CLASS}>Дефекты</label>
                              <div className="grid gap-2 md:grid-cols-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineForm((prev) =>
                                      prev
                                        ? { ...prev, hasDefects: "no" }
                                        : prev,
                                    )
                                  }
                                  className={choiceButtonClass(
                                    inlineForm.hasDefects === "no",
                                  )}
                                >
                                  Без дефектов
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineForm((prev) =>
                                      prev
                                        ? { ...prev, hasDefects: "yes" }
                                        : prev,
                                    )
                                  }
                                  className={choiceButtonClass(
                                    inlineForm.hasDefects === "yes",
                                  )}
                                >
                                  Есть дефекты
                                </button>
                              </div>
                            </div>
                          </>
                        )}

                        {isCustomCatalogBranch(inlineForm) ? (
                          <CatalogRequestEditor
                            value={inlineForm}
                            onChange={(next) =>
                              setInlineForm((prev) =>
                                prev ? { ...prev, ...next } : prev,
                              )
                            }
                          />
                        ) : (
                          <div className="grid gap-3">
                            {inlineCharacteristicFields.map((field) => (
                              <CharacteristicEditor
                                key={field.key}
                                field={field}
                                values={inlineForm.characteristics}
                                onChange={(next) =>
                                  setInlineForm((prev) =>
                                    prev
                                      ? { ...prev, characteristics: next }
                                      : prev,
                                  )
                                }
                              />
                            ))}
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className={FIELD_LABEL_CLASS}>Описание</label>
                          <textarea
                            value={inlineForm.description}
                            onChange={(e) =>
                              setInlineForm((prev) =>
                                prev
                                  ? { ...prev, description: e.target.value }
                                  : prev,
                              )
                            }
                            className={TEXTAREA_CLASS}
                            rows={5}
                            placeholder="Описание товара"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className={FIELD_LABEL_CLASS}>
                            Адрес встречи
                          </label>
                          <input
                            value={inlineForm.meetingAddress}
                            onChange={(e) =>
                              setInlineForm((prev) =>
                                prev
                                  ? { ...prev, meetingAddress: e.target.value }
                                  : prev,
                              )
                            }
                            className={FIELD_CLASS}
                            list={`address-suggest-${listing.id}`}
                            placeholder="Например: ул. Ленина, 15"
                          />
                          <datalist id={`address-suggest-${listing.id}`}>
                            {inlineAddressSuggestions.map((a) => (
                              <option key={a} value={a} />
                            ))}
                          </datalist>
                        </div>

                        <div className="space-y-2">
                          <label className={FIELD_LABEL_CLASS}>
                            Фотографии
                          </label>
                          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
                            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                              <Upload className="h-4 w-4" />
                              Добавить фото
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={onInlineFilesSelected}
                              />
                            </label>
                            <div className="text-xs text-gray-500">
                              {PHOTO_RECOMMENDATION_TEXT}
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                              Для товара требуется минимум {PRODUCT_MIN_IMAGES}{" "}
                              фото. Один и тот же файл нельзя загружать
                              повторно.
                            </div>

                            {inlineForm.images.length > 0 ? (
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {inlineForm.images.map((img, i) => (
                                  <div
                                    key={`${listing.id}-${i}-${img.slice(0, 20)}`}
                                    className="relative h-44 overflow-hidden rounded-xl border border-gray-200 bg-slate-100"
                                  >
                                    <img
                                      src={img}
                                      alt={`Фото ${i + 1}`}
                                      className="h-full w-full object-contain"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeInlineImage(i)}
                                      disabled={
                                        inlineForm.images.length <=
                                        getMinImagesForType(inlineForm.type)
                                      }
                                      className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                                      title={
                                        inlineForm.images.length <=
                                        getMinImagesForType(inlineForm.type)
                                          ? `Нужно оставить минимум ${getMinImagesForType(inlineForm.type)} фото`
                                          : "Удалить фото"
                                      }
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
                          <button
                            type="button"
                            onClick={cancelInlineEdit}
                            className="btn-secondary px-4 py-2"
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveInlineEdit(listing)}
                            disabled={isInlineSaving}
                            className="btn-primary px-4 py-2 disabled:opacity-60"
                          >
                            {isInlineSaving
                              ? "Сохраняем..."
                              : "Сохранить изменения"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {filteredListings.length === 0 && (
            <div className="dashboard-empty">Объявления не найдены</div>
          )}
        </div>
      )}

      {isCreateOpen && (
        <div
          className={
            createMode
              ? "listing-create-page"
              : "listing-create-modal"
          }
        >
          <div
            className={
              createMode
                ? `listing-create-shell listing-create-shell--${creationScreen}${
                    creationScreen === "start" ||
                    creationScreen === "manualCategory" ||
                    creationScreen === "titleSearch"
                      ? " listing-create-shell--centered"
                      : ""
                  }`
                : `listing-create-modal__panel listing-create-modal__panel--${creationScreen}`
            }
          >
            {!(createMode && (creationScreen === "start" || creationScreen === "manualCategory")) && (
              <div className={createMode ? "listing-create-controls" : "listing-create-modal__bar"}>
                <button
                  type="button"
                  onClick={prevStep}
                  className={createMode ? "listing-create-icon-button" : "listing-create-modal__icon-button"}
                  aria-label="Назад"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={closeCreateFlow}
                  className={createMode ? "listing-create-close" : "listing-create-modal__close"}
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}

            <div className={createMode ? "listing-create-content" : "listing-create-modal__content"}>
              <InlineIssue message={formIssue} />

              {(creationScreen === "start" || creationScreen === "manualCategory") && (
                <div
                  className={`listing-create-start${
                    creationScreen === "manualCategory"
                      ? ` listing-create-start--wide listing-create-start--cols-${manualCategoryColumnCount}`
                      : ""
                  }`}
                >
                  {createMode && (
                    <button
                      type="button"
                      onClick={closeCreateFlow}
                      className="listing-create-profile-back"
                    >
                      <ArrowLeft className="h-5 w-5" />
                      <span>В профиль</span>
                    </button>
                  )}

                  <div className="listing-create-heading">
                    <h2>Размещение Товаров</h2>
                  </div>

                  {listingDrafts.length > 0 && (
                    <section className="listing-create-section">
                      <h3>Черновик</h3>
                      <div className="listing-create-drafts">
                        {listingDrafts.slice(0, 3).map((draft) => {
                          const payload = draft.payload ?? {};
                          const price = typeof payload.price === "string" ? payload.price.trim() : "";
                          const images = Array.isArray(payload.images) ? payload.images : [];
                          const firstImage = typeof images[0] === "string" ? images[0] : "";
                          return (
                            <button
                              key={draft.id}
                              type="button"
                              onClick={() => startFromDraft(draft)}
                              className="listing-create-draft-card"
                            >
                              <div className="listing-create-draft-card__media">
                                {firstImage ? (
                                  <img src={firstImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="listing-create-draft-card__empty" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                )}
                              </div>
                              <div className="listing-create-draft-card__body">
                                <div className="listing-create-draft-card__price">
                                  {price ? `${Number(price).toLocaleString("ru-RU")} ₽` : "Цена не указана"}
                                </div>
                                <div className="listing-create-draft-card__title">{draft.title || "Без названия"}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  <section
                    className={`listing-create-section${
                      creationScreen === "manualCategory"
                        ? ` listing-create-section--wide listing-create-section--cols-${manualCategoryColumnCount}`
                        : ""
                    }`}
                  >
                    <h3>Новое объявление</h3>
                    {creationScreen === "start" ? (
                      <div className="listing-create-category-list">
                        {catalogCategories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => startTitleSearch(category.name)}
                            className="listing-create-category-row"
                          >
                            <span>{category.name}</span>
                            <span aria-hidden="true">›</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={openCatalogRequest}
                          className="listing-create-characteristic-request text-left"
                        >
                          Оставить запрос на добавление новой категории
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`listing-create-category-picker listing-create-category-picker--cols-${manualCategoryColumnCount}`}
                      >
                        <div className="listing-create-category-list">
                          {catalogCategories.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => {
                                if (form.categoryRoot === category.name) {
                                  startTitleSearch(category.name);
                                  return;
                                }
                                setForm((p) => ({
                                  ...p,
                                  type: "products",
                                  categoryRoot: category.name,
                                  category: category.name,
                                  subcategory: "",
                                  catalogItem: "",
                                  characteristics: {},
                                }));
                              }}
                              className={`listing-create-category-row${
                                form.categoryRoot === category.name
                                  ? " listing-create-category-row--active"
                                  : ""
                              }`}
                            >
                              <span>{category.name}</span>
                              <span aria-hidden="true">›</span>
                            </button>
                          ))}
                        </div>

                        {selectedCategory && (
                          <div className="listing-create-category-list">
                            {selectedCategory.subcategories
                              .filter((subcategory) => subcategory.items.length > 0)
                              .map((subcategory) => (
                                <button
                                  key={subcategory.id}
                                  type="button"
                                  onClick={() =>
                                    setForm((p) => ({
                                      ...p,
                                      subcategory: subcategory.name,
                                      category: subcategory.name,
                                      catalogItem: "",
                                      characteristics: {},
                                    }))
                                  }
                                  className={`listing-create-category-row${
                                    form.subcategory === subcategory.name
                                      ? " listing-create-category-row--active"
                                      : ""
                                  }`}
                                >
                                  <span>{subcategory.name}</span>
                                  <span aria-hidden="true">›</span>
                                </button>
                              ))}
                          </div>
                        )}

                        {selectedSubcategory && (
                          <div className="listing-create-category-list">
                            {selectedSubcategory.items.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => {
                                  applyCatalogPath({
                                    categoryName: form.categoryRoot,
                                    subcategoryName: form.subcategory,
                                    itemName: item,
                                  });
                                  setCreationScreen("details");
                                }}
                                className="listing-create-category-row"
                              >
                                <span>{item}</span>
                                <span aria-hidden="true">›</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="listing-create-category-list">
                          <button
                            type="button"
                            onClick={openCatalogRequest}
                            className="listing-create-characteristic-request text-left"
                          >
                            Оставить запрос на добавление новой категории
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {creationScreen === "titleSearch" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-950">
                      {isEditingListing ? "Редактирование объявления" : "Новое объявление"}
                    </h2>
                    <div className="mt-2 text-sm text-gray-500">
                      {form.categoryRoot ? `Товары › ${form.categoryRoot}` : "Товары"}
                    </div>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm font-bold text-gray-950">Название объявления</span>
                    <div className="relative">
                      <input
                        value={form.title}
                        onChange={(e) => {
                          setTitlePickedFromSuggestion(false);
                          setForm((p) => ({ ...p, title: e.target.value }));
                        }}
                        className="h-14 w-full rounded-xl border-0 bg-gray-100 px-4 pr-12 text-base outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="Например, Видеокарта ASUS RTX 5070 Ti"
                      />
                      {form.title && (
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, title: "" }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-gray-200"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </label>

                  {titleSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {titleSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setTitlePickedFromSuggestion(true);
                            setForm((p) => ({
                              ...p,
                              title: shouldReplaceTitleWithSuggestion(p.title, suggestion)
                                ? suggestion
                                : titleWithCompletion(p.title, suggestion),
                            }));
                          }}
                          className="listing-create-title-chip"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="text-base font-bold text-gray-950">Категория</div>
                    {isSuggestionsLoading && <div className="text-sm text-gray-500">Ищем подходящий вид товара...</div>}
                    {!isSuggestionsLoading && createSuggestionMatches.map((match) => (
                      <button
                        key={match.itemPublicId}
                        type="button"
                        onClick={() => applyCreateSuggestion(match)}
                        className="listing-create-category-chip block"
                      >
                        {`${match.itemName} · ${match.subcategoryName} · ${match.categoryName}`}
                      </button>
                    ))}
                    {!isSuggestionsLoading && createSuggestionMatches.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        Подходящий вид товара не найден.
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={openCatalogRequest}
                      className="listing-create-characteristic-request text-left"
                    >
                      Оставить запрос на добавление новой категории
                    </button>
                  </div>
                </div>
              )}

              {creationScreen === "details" && (
                <div className="listing-create-details space-y-10">
                  <div className="listing-create-details__hero">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-950">
                      {isEditingListing ? "Редактирование объявления" : "Новое объявление"}
                      </h2>
                      <div className="mt-2 text-sm text-gray-500">
                        Товары › {form.categoryRoot} › {form.subcategory} › {form.catalogItem}
                      </div>
                    </div>
                  </div>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-950">Параметры</h3>
                    <label className="block space-y-2">
                      <span className="text-sm font-bold text-gray-950">Название объявления</span>
                      <input
                        value={form.title}
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                        className="h-14 w-full rounded-xl border-0 bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="Видеокарта"
                      />
                    </label>
                    <div className="space-y-2">
                      <div className="text-sm font-bold text-gray-950">Состояние</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, condition: "new" }))}
                          className={choiceButtonClass(form.condition === "new", "w-full")}
                        >
                          Новое
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, condition: "used" }))}
                          className={choiceButtonClass(form.condition === "used", "w-full")}
                        >
                          Б/у
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-950">Характеристики</h3>
                    {isCatalogReferenceCreation ? (
                      <CatalogReferenceCascadeEditor
                        values={form.characteristics}
                        brands={catalogReferenceBrands}
                        models={catalogReferenceModels}
                        fields={catalogReferenceFields}
                        onChange={(next) => setForm((p) => ({ ...p, characteristics: next }))}
                      />
                    ) : characteristicFields.length > 0 ? (
                      <div className="grid gap-3">
                        {characteristicFields.map((field) => (
                          <CharacteristicEditor
                            key={field.key}
                            field={field}
                            values={form.characteristics}
                            onChange={(next) => setForm((p) => ({ ...p, characteristics: next }))}
                          />
                        ))}
                      </div>
                    ) : (
                      null
                    )}
                    <button
                      type="button"
                      onClick={openCharacteristicRequest}
                      className="listing-create-characteristic-request"
                    >
                      Оставить запрос на добавление характеристики
                    </button>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-950">Внешний вид</h3>
                    <div className="listing-create-photo-header">
                      <div className="listing-create-photo-title">Фотографии</div>
                      <div className="listing-create-photo-count">
                        {form.images.length} из {MAX_IMAGES}
                      </div>
                    </div>
                    <div className="listing-create-photo-grid">
                      {form.images.map((img, index) => (
                        <div
                          key={`${index}-${img.slice(0, 24)}`}
                          className="listing-create-photo-item"
                        >
                          <div className="listing-create-photo-frame">
                            <img src={img} alt={`Фото ${index + 1}`} />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="listing-create-photo-remove"
                              aria-label="Удалить фото"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {index === 0 && (
                            <div className="listing-create-photo-main-label">
                              Основное фото
                            </div>
                          )}
                        </div>
                      ))}
                      {form.images.length < MAX_IMAGES && (
                        <label className="listing-create-photo-add">
                          <Camera className="h-8 w-8" />
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={onFilesSelected}
                          />
                        </label>
                      )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-950">Подробности</h3>
                    <label className="block space-y-2">
                      <span className="text-sm font-bold text-gray-950">Описание объявления</span>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                        className="min-h-36 w-full resize-y rounded-xl border-0 bg-gray-100 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </label>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-950">Местоположение</h3>
                    {profileAddresses.length > 0 ? (
                      <div className="listing-create-address-list">
                        {profileAddresses.map((address) => {
                          const isSelected =
                            selectedMeetingAddressId === address.id ||
                            (!selectedMeetingAddressId &&
                              form.meetingAddress.trim() === address.fullAddress);
                          return (
                            <button
                              key={address.id}
                              type="button"
                              onClick={() => selectMeetingAddress(address)}
                              className={`listing-create-address-card${isSelected ? " listing-create-address-card--active" : ""}`}
                            >
                              <span className="listing-create-address-card__top">
                                <span className="listing-create-address-card__name">
                                  {address.name}
                                </span>
                                {address.isDefault && (
                                  <span className="listing-create-address-card__badge">
                                    По умолчанию
                                  </span>
                                )}
                              </span>
                              <span className="listing-create-address-card__line">
                                {address.fullAddress}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : hasMeetingAddress ? (
                      <div className="listing-create-address-card listing-create-address-card--active">
                        <span className="listing-create-address-card__top">
                          <span className="listing-create-address-card__name">
                            Адрес самовывоза
                          </span>
                        </span>
                        <span className="listing-create-address-card__line">
                          {form.meetingAddress}
                        </span>
                      </div>
                    ) : (
                      <div className="listing-create-address-empty">
                        Добавьте адрес самовывоза, чтобы покупатель понимал, где забрать товар.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={openAddressCreateModal}
                      className="listing-create-address-add"
                    >
                      Добавить адрес
                    </button>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-950">Условия продажи</h3>
                    <label className="block space-y-2">
                      <span className="text-sm font-bold text-gray-950">Цена</span>
                      <input
                        type="number"
                        value={form.price}
                        onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                        className="h-14 w-full rounded-xl border-0 bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="₽"
                      />
                    </label>
                    <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
                      <input
                        type="checkbox"
                        checked={form.hasMultipleStock}
                        onChange={(e) => setForm((p) => ({ ...p, hasMultipleStock: e.target.checked }))}
                        className="h-5 w-5 rounded border-gray-300"
                      />
                      Несколько штук в наличии
                    </label>
                  </section>

                  <div className="listing-create-modal__submit-row">
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={isCreateSaving}
                      className="btn-primary flex-1 px-5 py-3 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreateSaving
                        ? isEditingListing
                          ? "Сохраняем изменения..."
                          : "Отправляем на модерацию..."
                        : isEditingListing
                          ? "Сохранить изменения"
                          : "Разместить объявление"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
