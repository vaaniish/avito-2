import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Users } from "lucide-react";
import { apiGet, apiPatch } from "../../../shared/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../../shared/ui/notifications";

type CommissionTier = {
  id: string;
  name: string;
  minSales: number;
  maxSales: number | null;
  commissionRate: number;
  description: string;
  sellersCount: number;
};

type TierDraft = {
  id: string;
  minSales: string;
  maxSales: string;
  commissionRate: string;
};

function toDraft(tier: CommissionTier): TierDraft {
  return {
    id: tier.id,
    minSales: String(tier.minSales),
    maxSales: tier.maxSales === null ? "" : String(tier.maxSales),
    commissionRate: String(tier.commissionRate),
  };
}

function parseDraftNumber(value: string): number | null {
  const normalized = value.trim().replace(/\s+/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(amount: number | null) {
  if (amount === null) return "∞";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function CommissionsPage() {
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TierDraft>>({});
  const [isSaving, setIsSaving] = useState(false);

  const loadTiers = async () => {
    try {
      const result = await apiGet<CommissionTier[]>("/admin/commission-tiers");
      setTiers(result);
      setDrafts(Object.fromEntries(result.map((tier) => [tier.id, toDraft(tier)])));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить комиссии");
    }
  };

  useEffect(() => {
    void loadTiers();
  }, []);

  const updateDraft = (tierId: string, field: keyof Omit<TierDraft, "id">, value: string) => {
    const nextValue =
      field === "commissionRate"
        ? value.replace(/[^\d.,]/g, "")
        : value.replace(/[^\d]/g, "");
    setDrafts((prev) => ({
      ...prev,
      [tierId]: {
        ...(prev[tierId] ?? { id: tierId, minSales: "", maxSales: "", commissionRate: "" }),
        [field]: nextValue,
      },
    }));
  };

  const resetDrafts = () => {
    setDrafts(Object.fromEntries(tiers.map((tier) => [tier.id, toDraft(tier)])));
  };

  const parsedTiers = useMemo(
    () =>
      tiers.map((tier) => {
        const draft = drafts[tier.id] ?? toDraft(tier);
        return {
          tier,
          draft,
          minSales: parseDraftNumber(draft.minSales),
          maxSales: draft.maxSales.trim() === "" ? null : parseDraftNumber(draft.maxSales),
          commissionRate: parseDraftNumber(draft.commissionRate),
        };
      }),
    [drafts, tiers],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    parsedTiers.forEach((item, index) => {
      const previous = parsedTiers[index - 1];
      const next = parsedTiers[index + 1];

      if (item.minSales === null || !Number.isInteger(item.minSales) || item.minSales < 0) {
        errors.push(`Уровень «${item.tier.name}»: укажите целое минимальное значение продаж`);
      }

      if (
        item.maxSales !== null &&
        (!Number.isInteger(item.maxSales) || item.maxSales < 0)
      ) {
        errors.push(`Уровень «${item.tier.name}»: укажите целое максимальное значение продаж`);
      }

      if (
        item.commissionRate === null ||
        item.commissionRate <= 0 ||
        item.commissionRate > 100
      ) {
        errors.push(`Уровень «${item.tier.name}»: комиссия должна быть от 0 до 100%`);
      }

      if (
        item.minSales !== null &&
        item.maxSales !== null &&
        item.minSales > item.maxSales
      ) {
        errors.push(`Уровень «${item.tier.name}»: минимум не может быть больше максимума`);
      }

      if (
        previous &&
        previous.maxSales !== null &&
        item.minSales !== null &&
        item.minSales < previous.maxSales
      ) {
        errors.push(
          `Уровень «${item.tier.name}»: минимум не может быть меньше максимума предыдущего уровня (${formatCurrency(previous.maxSales)})`,
        );
      }

      if (
        next &&
        item.maxSales !== null &&
        next.minSales !== null &&
        item.maxSales > next.minSales
      ) {
        errors.push(
          `Уровень «${item.tier.name}»: максимум не может быть больше минимума следующего уровня (${formatCurrency(next.minSales)})`,
        );
      }
    });

    return errors;
  }, [parsedTiers]);

  const changedTiers = parsedTiers.filter((item) => {
    if (item.minSales === null || item.commissionRate === null) return false;
    return (
      item.minSales !== item.tier.minSales ||
      item.maxSales !== item.tier.maxSales ||
      item.commissionRate !== item.tier.commissionRate
    );
  });

  const hasChanges = changedTiers.length > 0;
  const canSave = hasChanges && validationErrors.length === 0 && !isSaving;

  const saveChanges = async () => {
    if (!hasChanges) {
      notifyInfo("Нет изменений для сохранения");
      return;
    }
    if (validationErrors.length > 0) {
      notifyInfo(validationErrors[0]);
      return;
    }

    try {
      setIsSaving(true);
      await apiPatch<{ success: boolean; updated: number }>("/admin/commission-tiers", {
        tiers: changedTiers.map((item) => ({
          id: item.tier.id,
          minSales: item.minSales,
          maxSales: item.maxSales,
          commissionRate: item.commissionRate,
        })),
      });
      notifySuccess("Изменения комиссий применены");
      await loadTiers();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось сохранить комиссии");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="dashboard-title">Комиссии и уровни</h1>
          <p className="dashboard-subtitle">Управление комиссионной моделью для продавцов</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={resetDrafts}
            className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
            disabled={!hasChanges || isSaving}
          >
            <RotateCcw className="h-4 w-4" /> Сбросить
          </button>
          <button
            type="button"
            onClick={() => void saveChanges()}
            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
            disabled={!canSave}
          >
            <Check className="h-4 w-4" />
            {isSaving ? "Сохраняем..." : "Применить изменения"}
          </button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {validationErrors[0]}
        </div>
      )}

      <div className="space-y-3 md:space-y-4">
        {parsedTiers.map((item, index) => (
          <div key={item.tier.id} className="dashboard-card transition-all hover:border-gray-400 md:p-6">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[rgb(58,103,161)] to-[rgb(38,83,141)] text-sm font-bold text-white md:h-10 md:w-10 md:rounded-xl">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-base font-bold md:text-xl">{item.tier.name}</h3>
                  <p className="text-xs text-gray-600 md:text-sm">{item.tier.description}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="rounded-lg bg-gray-50 p-3">
                  <span className="mb-1 block text-xs text-gray-500">Мин. продажи</span>
                  <input
                    inputMode="numeric"
                    value={item.draft.minSales}
                    onChange={(event) => updateDraft(item.tier.id, "minSales", event.target.value)}
                    className="w-full rounded-md border border-transparent bg-transparent py-1 text-center pr-1 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:px-2 focus:ring-4 focus:ring-blue-100"
                    aria-label={`Минимальные продажи ${item.tier.name}`}
                  />
                </label>

                <label className="rounded-lg bg-gray-50 p-3">
                  <span className="mb-1 block text-xs text-gray-500">Макс. продажи</span>
                  <input
                    inputMode="numeric"
                    value={item.draft.maxSales}
                    onChange={(event) => updateDraft(item.tier.id, "maxSales", event.target.value)}
                    placeholder="∞"
                    className="w-full rounded-md border border-transparent bg-transparent py-1 text-center pr-1 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:px-2 focus:ring-4 focus:ring-blue-100"
                    aria-label={`Максимальные продажи ${item.tier.name}`}
                  />
                </label>

                <label className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <span className="mb-1 block text-xs text-blue-700">Комиссия</span>
                  <div className="flex items-center gap-1">
                    <input
                      inputMode="decimal"
                      value={item.draft.commissionRate}
                      onChange={(event) => updateDraft(item.tier.id, "commissionRate", event.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent py-1 text-center pr-1 text-lg font-bold text-blue-700 outline-none transition focus:border-blue-300 focus:bg-white focus:pl-3 focus:pr-2 focus:ring-4 focus:ring-blue-100"
                      aria-label={`Комиссия ${item.tier.name}`}
                    />
                    <span className="text-lg font-bold text-blue-700">%</span>
                  </div>
                </label>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs text-slate-700">
                    <Users className="h-3 w-3" /> Продавцов
                  </div>
                  <div className="text-lg font-bold text-slate-700">{item.tier.sellersCount}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
