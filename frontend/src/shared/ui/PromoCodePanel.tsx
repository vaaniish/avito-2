import type { AppliedPromo } from "../types/promo";

type PromoCodePanelProps = {
  couponCode: string;
  appliedPromo: AppliedPromo | null;
  couponError: string | null;
  isApplyingCoupon: boolean;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => void | Promise<unknown>;
  onEditAppliedCoupon?: () => void;
  title?: string;
  description?: string;
};

export function PromoCodePanel({
  couponCode,
  appliedPromo,
  couponError,
  isApplyingCoupon,
  onCouponCodeChange,
  onApplyCoupon,
  onEditAppliedCoupon,
  title = "Есть купон?",
  description = "Введите ваш код для мгновенной скидки на корзину",
}: PromoCodePanelProps) {
  const isApplied = Boolean(appliedPromo);
  const statusMessageId = couponError ? "promo-code-error" : appliedPromo ? "promo-code-success" : undefined;
  const appliedInputStyle = isApplied
    ? {
        backgroundColor: "#ecfdf3",
        color: "#166534",
        borderColor: "#86efac",
        WebkitTextFillColor: "#166534",
        WebkitBoxShadow: "0 0 0 1000px #ecfdf3 inset",
      }
    : undefined;

  return (
    <div>
      <h3 className="mb-2 text-base md:text-lg">{title}</h3>
      <p className="mb-4 text-sm text-gray-500">{description}</p>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            type="text"
            value={couponCode}
            readOnly={isApplied}
            onChange={(event) => onCouponCodeChange(event.target.value)}
            onKeyDown={(event) => {
              if (isApplied) {
                event.preventDefault();
              }
            }}
            placeholder="Код купона"
            aria-readonly={isApplied}
            aria-invalid={Boolean(couponError)}
            aria-describedby={statusMessageId}
            style={appliedInputStyle}
            className={`w-full min-w-0 rounded-xl border px-3 py-3 text-sm transition-all focus:outline-none focus:ring-2 sm:px-4 sm:text-base ${
              isApplied ? "pr-12" : ""
            } ${
              isApplied
                ? "cursor-default border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[0_0_0_1px_rgba(110,231,183,0.25)] focus:ring-emerald-200"
                : couponError
                  ? "border-rose-300 bg-white text-gray-900 focus:ring-rose-200"
                  : "border-gray-200 bg-white text-gray-900 focus:ring-gray-900"
            }`}
          />
          {isApplied && onEditAppliedCoupon ? (
            <button
              type="button"
              onClick={onEditAppliedCoupon}
              className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition-colors hover:bg-white"
              aria-label="Изменить промокод"
              title="Изменить промокод"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
              </svg>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void onApplyCoupon()}
          disabled={isApplyingCoupon || isApplied}
          className={`w-full rounded-xl py-3 text-sm font-medium transition-colors sm:text-base ${
            isApplied
              ? "cursor-not-allowed bg-gray-300 text-gray-700"
              : "btn-primary"
          }`}
        >
          {isApplyingCoupon ? "Проверяем..." : isApplied ? "Применено" : "Применить"}
        </button>
      </div>

      {couponError ? (
        <p id="promo-code-error" className="mt-3 text-sm text-rose-600">{couponError}</p>
      ) : null}

      {appliedPromo ? (
        <p id="promo-code-success" className="mt-3 text-sm text-emerald-700">
          {appliedPromo.message}. Скидка {appliedPromo.discountPercent}% активна.
        </p>
      ) : null}
    </div>
  );
}
