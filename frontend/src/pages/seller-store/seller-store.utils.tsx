import { Star, User } from "lucide-react";
import type { Review } from "../../shared/types";

export const PAGE_SIZE = 24;

export function formatReviewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

export function toDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

const REVIEW_MONTH_INDEX: Record<string, number> = {
  января: 0,
  февраль: 1,
  февраля: 1,
  март: 2,
  марта: 2,
  апрель: 3,
  апреля: 3,
  май: 4,
  мая: 4,
  июнь: 5,
  июня: 5,
  июль: 6,
  июля: 6,
  август: 7,
  августа: 7,
  сентябрь: 8,
  сентября: 8,
  октябрь: 9,
  октября: 9,
  ноябрь: 10,
  ноября: 10,
  декабрь: 11,
  декабря: 11,
};

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

export function extractJoinedYear(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return String(date.getFullYear());
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

export function ModalRatingStars({
  value,
  size = 16,
  gap = 1,
}: {
  value: number;
  size?: number;
  gap?: number;
}) {
  return (
    <span className="inline-flex items-center" style={{ gap }} aria-label={`Рейтинг ${value.toFixed(1)}`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.max(0, Math.min(1, value - index)) * 100;
        return (
          <span
            key={index}
            className="relative inline-block flex-shrink-0 overflow-hidden"
            style={{ width: size, height: size, fontSize: size, lineHeight: `${size}px` }}
            aria-hidden="true"
          >
            <span className="absolute inset-0 text-gray-300">★</span>
            <span className="absolute inset-0 overflow-hidden text-yellow-400" style={{ width: `${fillPercent}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function EmptyReviewAvatar({ author }: { author: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
      {author.trim().charAt(0).toUpperCase() || <User className="h-5 w-5" />}
    </div>
  );
}

export function RatingStars({ rating }: { rating: number }) {
  return (
    <>
      {[...Array(5)].map((_, index) => (
        <Star
          key={index}
          className={`h-4 w-4 ${
            index < Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
          }`}
        />
      ))}
    </>
  );
}
