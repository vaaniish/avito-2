import type { Product, Review } from "../types";
import { REVIEW_MONTH_INDEX } from "./product-detail.constants";
import type { QuestionItem } from "./product-detail.types";

export function formatReviewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

export function formatViewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "просмотр";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "просмотра";
  return "просмотров";
}

export function extractLocationLabel(product: Product): string {
  if (product.location?.trim()) return product.location.trim();

  if (product.specifications) {
    for (const [key, value] of Object.entries(product.specifications)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("адрес") ||
        normalizedKey.includes("мест") ||
        normalizedKey.includes("location")
      ) {
        const normalizedValue = String(value ?? "").trim();
        if (normalizedValue) return normalizedValue;
      }
    }
  }

  return product.city?.trim() || "Москва";
}

function resolveCoordinatesByLocation(locationLabel: string): { lat: number; lon: number } | null {
  const label = locationLabel.toLowerCase();

  const cityCoordinates: Array<{ match: string; lat: number; lon: number }> = [
    { match: "москва", lat: 55.751244, lon: 37.618423 },
    { match: "санкт-петербург", lat: 59.93863, lon: 30.31413 },
    { match: "казань", lat: 55.796127, lon: 49.106414 },
    { match: "екатеринбург", lat: 56.838011, lon: 60.597465 },
    { match: "краснодар", lat: 45.03547, lon: 38.975313 },
    { match: "сочи", lat: 43.585472, lon: 39.723098 },
    { match: "нижний новгород", lat: 56.326887, lon: 44.005986 },
    { match: "новосибирск", lat: 55.030199, lon: 82.92043 },
    { match: "киров", lat: 58.603595, lon: 49.667919 },
    { match: "кириши", lat: 59.448078, lon: 32.008781 },
  ];

  for (const city of cityCoordinates) {
    if (label.includes(city.match)) {
      return { lat: city.lat, lon: city.lon };
    }
  }

  return null;
}

export function buildYandexMapWidgetUrl(locationLabel: string): string {
  const coordinates = resolveCoordinatesByLocation(locationLabel);
  if (!coordinates) {
    return `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(locationLabel)}&z=12`;
  }

  const ll = `${coordinates.lon},${coordinates.lat}`;
  const pt = `${coordinates.lon},${coordinates.lat},pm2blm`;
  return `https://yandex.ru/map-widget/v1/?ll=${encodeURIComponent(ll)}&z=15&pt=${encodeURIComponent(pt)}`;
}

export function toDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

function parseReviewDateLabel(value: string): number {
  const nativeTime = new Date(value).getTime();
  if (!Number.isNaN(nativeTime)) return nativeTime;

  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\s+([а-яё]+)(?:\s+|\s*,\s*| в )(\d{1,2}):(\d{2})/u);
  if (!match) return 0;

  const [, dayRaw, monthRaw, hourRaw, minuteRaw] = match;
  const month = REVIEW_MONTH_INDEX[monthRaw];
  if (month === undefined) return 0;

  const now = new Date();
  const parsed = new Date(
    now.getFullYear(),
    month,
    Number(dayRaw),
    Number(hourRaw),
    Number(minuteRaw),
  );
  return parsed.getTime();
}

export function toSortTime(review: Review): number {
  if (typeof review.sortTs === "number") return review.sortTs;
  return parseReviewDateLabel(review.date);
}

export function normalizeQuestions(items: QuestionItem[]): QuestionItem[] {
  return items.map((item) => ({
    ...item,
    sortTs: Number.isNaN(new Date(item.date).getTime()) ? 0 : new Date(item.date).getTime(),
    date: toDateLabel(item.date),
    answerDate: item.answerDate ? toDateLabel(item.answerDate) : null,
  }));
}

export function formatSpecificationLabel(rawKey: string): string {
  const cleaned = rawKey.replace(/^_+/, "").trim();
  const normalized = cleaned.toLowerCase();

  const dictionary: Record<string, string> = {
    meeting_address: "Адрес встречи",
    address: "Адрес",
    city: "Город",
    condition: "Состояние",
    grade: "Класс восстановления",
    battery_health_percent: "Здоровье батареи",
    defects: "Дефекты",
    included: "Комплектация",
    brand: "Бренд",
    model: "Модель",
    memory: "Память",
    color: "Цвет",
  };

  if (dictionary[normalized]) {
    return dictionary[normalized];
  }

  const words = cleaned
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!words) return "Параметр";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function extractJoinedYear(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

export function normalizeSpecificationEntry(
  rawKey: string,
  rawValue: string,
): { normalizedKey: string; label: string; value: string } | null {
  const key = rawKey.trim();
  let value = String(rawValue ?? "").trim();
  let normalizedKey = key;

  if (!value) {
    const mergedMatch = key.match(/^_*(meeting_address|address|city|condition)(.+)$/i);
    if (mergedMatch) {
      normalizedKey = mergedMatch[1];
      value = mergedMatch[2]?.trim() ?? "";
    }
  }

  if (!value) return null;
  return {
    normalizedKey: normalizedKey.replace(/^_+/, "").trim().toLowerCase(),
    label: formatSpecificationLabel(normalizedKey),
    value,
  };
}
