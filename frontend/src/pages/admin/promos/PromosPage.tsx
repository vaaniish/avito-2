import { useEffect, useMemo, useState } from "react";
import {
  searchCatalogNodes,
} from "../catalog-suggestions/catalog-suggestions.api";
import type {
  CatalogNode,
} from "../catalog-suggestions/catalog-suggestions.types";
import { AppModal } from "../../../shared/ui/app-modal";
import { notifyError, notifySuccess } from "../../../shared/ui/notifications";
import {
  createAdminPromo,
  fetchAdminPromo,
  fetchAdminPromos,
  updateAdminPromo,
} from "./promos.api";
import type {
  AdminPromoDetail,
  AdminPromoFormPayload,
  AdminPromoSummary,
} from "./promos.types";

type PromoTab = "current" | "expired";
type PromoModalMode = "create" | "edit" | "readonly";
type DiscountFieldConfig = {
  label: string;
  hint: string;
  placeholder: string;
  min: number;
  max?: number;
  suffix?: string;
  useNativeStepper: boolean;
};

const MAX_PROMO_PERCENT = 25;
const MAX_PROMO_FIXED_AMOUNT = 2500;

type PromoFormState = {
  code: string;
  discountType: "percent" | "fixed_amount";
  discountValue: string;
  minSubtotal: string;
  maxActivations: string;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
  allCatalog: boolean;
  categoryIds: string[];
  subcategoryIds: string[];
  itemIds: string[];
};

function uniqueIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatMoney(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

function buildDefaultForm(): PromoFormState {
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    code: "",
    discountType: "percent",
    discountValue: "10",
    minSubtotal: "0",
    maxActivations: "100",
    startsAt: toDatetimeLocalValue(now.toISOString()),
    endsAt: toDatetimeLocalValue(nextMonth.toISOString()),
    isEnabled: true,
    allCatalog: true,
    categoryIds: [],
    subcategoryIds: [],
    itemIds: [],
  };
}

function buildFormFromPromo(promo: AdminPromoDetail): PromoFormState {
  return {
    code: promo.code,
    discountType: promo.discountType,
    discountValue: String(promo.discountValue),
    minSubtotal: String(promo.minSubtotal),
    maxActivations: String(promo.maxActivations),
    startsAt: toDatetimeLocalValue(promo.startsAt),
    endsAt: toDatetimeLocalValue(promo.endsAt),
    isEnabled: promo.isEnabled,
    allCatalog: promo.scope.allCatalog,
    categoryIds: promo.scope.categoryIds,
    subcategoryIds: promo.scope.subcategoryIds,
    itemIds: promo.scope.itemIds,
  };
}

function buildPayload(form: PromoFormState): AdminPromoFormPayload {
  return {
    code: form.code.trim().toUpperCase(),
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    minSubtotal: Number(form.minSubtotal),
    maxActivations: Number(form.maxActivations),
    perUserLimit: 1,
    startsAt: fromDatetimeLocalValue(form.startsAt),
    endsAt: fromDatetimeLocalValue(form.endsAt),
    isEnabled: form.isEnabled,
    allCatalog: form.allCatalog,
    categoryIds: form.allCatalog ? [] : form.categoryIds,
    subcategoryIds: form.allCatalog ? [] : form.subcategoryIds,
    itemIds: form.allCatalog ? [] : form.itemIds,
  };
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

function clampNumericString(
  value: string,
  options: { min: number; max?: number },
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "";
  const clampedMin = Math.max(options.min, parsed);
  const clamped =
    options.max !== undefined ? Math.min(clampedMin, options.max) : clampedMin;
  return String(Math.trunc(clamped));
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

function readValidatedNumericString(
  value: string,
  options: { fieldLabel: string; min: number; max?: number },
): { ok: true; normalized: string } | { ok: false; message: string } {
  const digits = digitsOnly(value);
  if (!digits) {
    const rangeMessage =
      options.max !== undefined
        ? `от ${options.min} до ${options.max}`
        : `не меньше ${options.min}`;
    return {
      ok: false,
      message: `${options.fieldLabel} должно быть числом ${rangeMessage}`,
    };
  }

  const normalized = clampNumericString(digits, {
    min: options.min,
    max: options.max,
  });
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      message: `${options.fieldLabel} должно быть числом`,
    };
  }

  return { ok: true, normalized };
}

function scopeNodeMeta(node: CatalogNode): string {
  if (node.kind === "category") return `${node.childCount ?? 0} подкатегорий`;
  if (node.kind === "subcategory") return `${node.childCount ?? 0} видов товара`;
  return `${node.listingCount ?? 0} объявлений`;
}

function PromoCard(props: {
  promo: AdminPromoSummary;
  onOpen: () => void;
}) {
  const { promo, onOpen } = props;
  const progress =
    promo.maxActivations > 0
      ? Math.min(100, Math.round((promo.usedActivations / promo.maxActivations) * 100))
      : 0;
  const statusLabel =
    promo.status === "active"
      ? "Активен"
      : promo.status === "scheduled"
        ? "Запланирован"
        : promo.status === "paused"
          ? "Выключен"
          : promo.status === "exhausted"
            ? "Лимит исчерпан"
            : "Истёк";

  return (
    <article className="dashboard-card space-y-4 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{promo.code}</h3>
            <span className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-600">
              {statusLabel}
            </span>
            {promo.isSystem ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                Системный
              </span>
            ) : null}
            {promo.hasLegacyListingScope ? (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-700">
                Legacy scope
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {promo.discountType === "percent"
              ? `${promo.discountValue}% скидки`
              : `${formatMoney(promo.discountValue)} скидки`}
          </p>
        </div>

        <button type="button" onClick={onOpen} className="btn-secondary px-4 py-2 text-sm">
          {promo.readOnly ? "Открыть" : "Редактировать"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.12em] text-gray-500">Период</div>
          <div className="mt-1 text-sm text-gray-900">
            {formatDateTime(promo.startsAt)} - {formatDateTime(promo.endsAt)}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.12em] text-gray-500">Мин. корзина</div>
          <div className="mt-1 text-sm text-gray-900">{formatMoney(promo.minSubtotal)}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.12em] text-gray-500">Охват</div>
          <div className="mt-1 text-sm text-gray-900">{promo.scopeSummary.label}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.12em] text-gray-500">На пользователя</div>
          <div className="mt-1 text-sm text-gray-900">{promo.perUserLimit} активация</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-600">Активации</span>
          <span className="font-medium text-gray-900">
            {promo.usedActivations} / {promo.maxActivations}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-[rgb(38,83,141)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </article>
  );
}

export function PromosPage() {
  const [tab, setTab] = useState<PromoTab>("current");
  const [promos, setPromos] = useState<AdminPromoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<PromoModalMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activePromoId, setActivePromoId] = useState<string | null>(null);
  const [activePromo, setActivePromo] = useState<AdminPromoDetail | null>(null);
  const [form, setForm] = useState<PromoFormState>(buildDefaultForm);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryNodes, setCategoryNodes] = useState<CatalogNode[]>([]);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<
    Record<string, CatalogNode[]>
  >({});
  const [itemsBySubcategory, setItemsBySubcategory] = useState<Record<string, CatalogNode[]>>({});
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const [expandedSubcategoryIds, setExpandedSubcategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingBranches, setLoadingBranches] = useState<Set<string>>(() => new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const modalReadOnly = modalMode === "readonly";
  const canEditCode = modalMode === "create" || Boolean(activePromo?.canEditCode);
  const discountFieldConfig: DiscountFieldConfig =
    form.discountType === "percent"
      ? {
          label: "Размер скидки в процентах",
          hint: `Процентная скидка применяется к подходящим товарам. Разрешено от 1 до ${MAX_PROMO_PERCENT}%.`,
          placeholder: "Например, 15",
          min: 1,
          max: MAX_PROMO_PERCENT,
          suffix: "%",
          useNativeStepper: false,
        }
      : {
          label: "Размер скидки в рублях",
          hint: `Фиксированная скидка применяется только к подходящим товарам и не уводит сумму ниже нуля. Максимум ${MAX_PROMO_FIXED_AMOUNT.toLocaleString("ru-RU")} ₽.`,
          placeholder: "Например, 1000",
          min: 1,
          max: MAX_PROMO_FIXED_AMOUNT,
          useNativeStepper: true,
        };

  const selectionSummary = useMemo(() => {
    if (form.allCatalog) return "Весь каталог";
    const parts: string[] = [];
    if (form.categoryIds.length > 0) parts.push(`${form.categoryIds.length} категорий`);
    if (form.subcategoryIds.length > 0) parts.push(`${form.subcategoryIds.length} подкатегорий`);
    if (form.itemIds.length > 0) parts.push(`${form.itemIds.length} видов товара`);
    return parts.length > 0 ? parts.join(" • ") : "Таргетинг не выбран";
  }, [form]);

  const scopeLabelMaps = useMemo(() => {
    const categoryMap = new Map<string, string>();
    const subcategoryMap = new Map<string, string>();
    const itemMap = new Map<string, string>();

    for (const node of categoryNodes) {
      if (node.kind === "category") {
        categoryMap.set(node.id, node.name);
      } else if (node.kind === "subcategory") {
        subcategoryMap.set(node.id, node.name);
      } else {
        itemMap.set(node.id, node.name);
      }
    }

    Object.values(subcategoriesByCategory)
      .flat()
      .forEach((node) => {
        subcategoryMap.set(node.id, node.name);
      });

    Object.values(itemsBySubcategory)
      .flat()
      .forEach((node) => {
        itemMap.set(node.id, node.name);
      });

    activePromo?.scopeDetails.categories.forEach((node) => {
      categoryMap.set(node.id, node.name);
    });
    activePromo?.scopeDetails.subcategories.forEach((node) => {
      subcategoryMap.set(node.id, node.name);
    });
    activePromo?.scopeDetails.items.forEach((node) => {
      itemMap.set(node.id, node.name);
    });

    return { categoryMap, subcategoryMap, itemMap };
  }, [activePromo, categoryNodes, itemsBySubcategory, subcategoriesByCategory]);

  const selectedScopeChips = useMemo(
    () => [
      ...form.categoryIds.map((id) => ({
        kind: "category" as const,
        id,
        label: scopeLabelMaps.categoryMap.get(id) ?? id,
      })),
      ...form.subcategoryIds.map((id) => ({
        kind: "subcategory" as const,
        id,
        label: scopeLabelMaps.subcategoryMap.get(id) ?? id,
      })),
      ...form.itemIds.map((id) => ({
        kind: "item" as const,
        id,
        label: scopeLabelMaps.itemMap.get(id) ?? id,
      })),
    ],
    [form, scopeLabelMaps],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAdminPromos(tab)
      .then((response) => {
        if (!cancelled) {
          setPromos(response.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          notifyError(error instanceof Error ? error.message : "Не удалось загрузить промокоды");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  const setBranchLoading = (key: string, loadingState: boolean) => {
    setLoadingBranches((current) => {
      const next = new Set(current);
      if (loadingState) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const loadCategoryTree = async (query = categoryQuery) => {
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const trimmed = query.trim();
      const items = await searchCatalogNodes({
        query: trimmed,
        scope: trimmed ? "all" : "categories",
      });
      setCategoryNodes(items);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось загрузить дерево каталога";
      setCatalogError(message);
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadSubcategoriesForCategory = async (categoryId: string, force = false) => {
    if (!force && subcategoriesByCategory[categoryId]) return;
    const key = `category:${categoryId}`;
    try {
      setBranchLoading(key, true);
      const items = await searchCatalogNodes({ scope: "subcategories", categoryId });
      setSubcategoriesByCategory((current) => ({ ...current, [categoryId]: items }));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить подкатегории");
    } finally {
      setBranchLoading(key, false);
    }
  };

  const loadItemsForSubcategory = async (subcategoryId: string, force = false) => {
    if (!force && itemsBySubcategory[subcategoryId]) return;
    const key = `subcategory:${subcategoryId}`;
    try {
      setBranchLoading(key, true);
      const items = await searchCatalogNodes({ scope: "items", subcategoryId });
      setItemsBySubcategory((current) => ({ ...current, [subcategoryId]: items }));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить виды товара");
    } finally {
      setBranchLoading(key, false);
    }
  };

  useEffect(() => {
    if (!modalMode) return;
    const timeoutId = window.setTimeout(() => {
      void loadCategoryTree();
    }, 220);
    return () => window.clearTimeout(timeoutId);
  }, [categoryQuery, modalMode]);

  const refreshList = async (nextTab: PromoTab = tab) => {
    const response = await fetchAdminPromos(nextTab);
    setPromos(response.items);
  };

  const resetCatalogPicker = () => {
    setCategoryQuery("");
    setCategoryNodes([]);
    setSubcategoriesByCategory({});
    setItemsBySubcategory({});
    setExpandedCategoryIds(new Set());
    setExpandedSubcategoryIds(new Set());
    setLoadingBranches(new Set());
    setCatalogLoading(false);
    setCatalogError(null);
  };

  const openCreate = () => {
    setModalMode("create");
    setActivePromoId(null);
    setActivePromo(null);
    setForm(buildDefaultForm());
    resetCatalogPicker();
  };

  const openPromo = async (promo: AdminPromoSummary) => {
    setModalMode(promo.readOnly ? "readonly" : "edit");
    setActivePromoId(promo.id);
    setDetailLoading(true);
    resetCatalogPicker();
    try {
      const detail = await fetchAdminPromo(promo.id);
      setActivePromo(detail);
      setForm(buildFormFromPromo(detail));

      const preloadCategoryIds = uniqueIds([
        ...detail.scope.categoryIds,
        ...detail.scopeDetails.subcategories.map((node) => node.categoryId),
        ...detail.scopeDetails.items.map((node) => node.categoryId),
      ]);
      const preloadSubcategoryIds = uniqueIds([
        ...detail.scope.subcategoryIds,
        ...detail.scopeDetails.items.map((node) => node.subcategoryId),
      ]);

      setExpandedCategoryIds(new Set(preloadCategoryIds));
      setExpandedSubcategoryIds(new Set(preloadSubcategoryIds));

      await Promise.all([
        ...preloadCategoryIds.map((categoryId) =>
          loadSubcategoriesForCategory(categoryId, true),
        ),
        ...preloadSubcategoryIds.map((subcategoryId) =>
          loadItemsForSubcategory(subcategoryId, true),
        ),
      ]);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось открыть промокод");
      setModalMode(null);
      setActivePromoId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setActivePromoId(null);
    setActivePromo(null);
    setForm(buildDefaultForm());
    resetCatalogPicker();
  };

  const handleClone = () => {
    if (!activePromo) return;
    setModalMode("create");
    setActivePromoId(null);
    setForm({
      ...buildFormFromPromo(activePromo),
      code: "",
    });
  };

  const handleToggleAllCatalog = (nextValue: boolean) => {
    setForm((prev) => ({
      ...prev,
      allCatalog: nextValue,
      categoryIds: nextValue ? [] : prev.categoryIds,
      subcategoryIds: nextValue ? [] : prev.subcategoryIds,
      itemIds: nextValue ? [] : prev.itemIds,
    }));
  };

  const handleDiscountTypeChange = (nextType: PromoFormState["discountType"]) => {
    setForm((prev) => {
      const currentValue = Number(prev.discountValue);
      const normalizedValue =
        Number.isFinite(currentValue) && currentValue > 0
          ? nextType === "percent"
            ? Math.min(currentValue, MAX_PROMO_PERCENT)
            : Math.min(currentValue, MAX_PROMO_FIXED_AMOUNT)
          : nextType === "percent"
            ? 10
            : 1000;
      return {
        ...prev,
        discountType: nextType,
        discountValue: String(normalizedValue),
      };
    });
  };

  const handleNumericFieldChange = (
    field: "discountValue" | "minSubtotal" | "maxActivations",
    rawValue: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: digitsOnly(rawValue),
    }));
  };

  const handleScopeToggle = (node: CatalogNode) => {
    setForm((prev) => {
      if (node.kind === "category") {
        return { ...prev, categoryIds: toggleId(prev.categoryIds, node.id) };
      }
      if (node.kind === "subcategory") {
        return { ...prev, subcategoryIds: toggleId(prev.subcategoryIds, node.id) };
      }
      return { ...prev, itemIds: toggleId(prev.itemIds, node.id) };
    });
  };

  const handleRemoveScopeChip = (
    chip: { kind: "category" | "subcategory" | "item"; id: string },
  ) => {
    setForm((prev) => ({
      ...prev,
      categoryIds:
        chip.kind === "category"
          ? prev.categoryIds.filter((value) => value !== chip.id)
          : prev.categoryIds,
      subcategoryIds:
        chip.kind === "subcategory"
          ? prev.subcategoryIds.filter((value) => value !== chip.id)
          : prev.subcategoryIds,
      itemIds:
        chip.kind === "item"
          ? prev.itemIds.filter((value) => value !== chip.id)
          : prev.itemIds,
    }));
  };

  const handleSubmit = async () => {
    if (!modalMode || modalReadOnly) return;
    const validatedDiscount = readValidatedNumericString(form.discountValue, {
      fieldLabel: discountFieldConfig.label,
      min: discountFieldConfig.min,
      max: discountFieldConfig.max,
    });
    if (!validatedDiscount.ok) {
      notifyError(validatedDiscount.message);
      return;
    }

    const validatedMinSubtotal = readValidatedNumericString(form.minSubtotal || "0", {
      fieldLabel: "Минимальная сумма",
      min: 0,
    });
    if (!validatedMinSubtotal.ok) {
      notifyError(validatedMinSubtotal.message);
      return;
    }

    const validatedMaxActivations = readValidatedNumericString(form.maxActivations, {
      fieldLabel: "Лимит активаций",
      min: 1,
    });
    if (!validatedMaxActivations.ok) {
      notifyError(validatedMaxActivations.message);
      return;
    }

    setForm((prev) => ({
      ...prev,
      discountValue: validatedDiscount.normalized,
      minSubtotal: validatedMinSubtotal.normalized,
      maxActivations: validatedMaxActivations.normalized,
    }));
    setSaving(true);
    try {
      const payload = buildPayload({
        ...form,
        discountValue: validatedDiscount.normalized,
        minSubtotal: validatedMinSubtotal.normalized,
        maxActivations: validatedMaxActivations.normalized,
      });
      const saved =
        modalMode === "edit" && activePromoId
          ? await updateAdminPromo(activePromoId, payload)
          : await createAdminPromo(payload);
      notifySuccess(modalMode === "edit" ? "Промокод обновлён." : "Промокод создан.");
      await refreshList(saved.status === "expired" ? "expired" : tab);
      closeModal();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось сохранить промокод");
    } finally {
      setSaving(false);
    }
  };

  const renderScopeCheckbox = (node: CatalogNode, depth: 0 | 1 | 2) => {
    const checked =
      node.kind === "category"
        ? form.categoryIds.includes(node.id)
        : node.kind === "subcategory"
          ? form.subcategoryIds.includes(node.id)
          : form.itemIds.includes(node.id);

    return (
      <label
        key={node.id}
        className={`flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 ${
          depth === 0 ? "" : depth === 1 ? "ml-4" : "ml-8"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={form.allCatalog || modalReadOnly}
          onChange={() => handleScopeToggle(node)}
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{node.name}</div>
          <div className="text-xs text-gray-500">{scopeNodeMeta(node)}</div>
          {node.path && depth > 0 ? (
            <div className="mt-1 text-xs text-gray-400">{node.path}</div>
          ) : null}
        </div>
      </label>
    );
  };

  const renderCatalogTree = () => {
    if (catalogError && categoryNodes.length === 0) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="font-medium">Не удалось загрузить каталог</div>
          <div className="mt-1">{catalogError}</div>
          <button
            type="button"
            onClick={() => void loadCategoryTree()}
            className="btn-secondary mt-3 px-4 py-2 text-sm"
          >
            Повторить
          </button>
        </div>
      );
    }

    if (catalogLoading && categoryNodes.length === 0) {
      return <div className="text-sm text-gray-500">Загружаем дерево каталога...</div>;
    }

    if (!catalogLoading && categoryNodes.length === 0) {
      return <div className="text-sm text-gray-500">Каталог пока пуст.</div>;
    }

    if (categoryQuery.trim()) {
      return (
        <div className="space-y-3">
          {categoryNodes.map((node) =>
            renderScopeCheckbox(
              node,
              node.kind === "category" ? 0 : node.kind === "subcategory" ? 1 : 2,
            ),
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {categoryNodes.map((category) => {
          if (category.kind !== "category") return null;
          const isExpanded = expandedCategoryIds.has(category.id);
          const categoryBranchKey = `category:${category.id}`;

          return (
            <div key={category.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedCategoryIds((current) => {
                      const next = new Set(current);
                      if (next.has(category.id)) next.delete(category.id);
                      else {
                        next.add(category.id);
                        void loadSubcategoriesForCategory(category.id);
                      }
                      return next;
                    });
                  }}
                  className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-xs text-gray-700"
                >
                  {isExpanded ? "−" : "+"}
                </button>
                <div className="min-w-0 flex-1">
                  {renderScopeCheckbox(category, 0)}
                </div>
              </div>

              {isExpanded ? (
                <div className="mt-3 space-y-3">
                  {loadingBranches.has(categoryBranchKey) ? (
                    <div className="ml-10 text-sm text-gray-500">Загружаем подкатегории...</div>
                  ) : null}

                  {(subcategoriesByCategory[category.id] ?? []).map((subcategory) => {
                    const isSubExpanded = expandedSubcategoryIds.has(subcategory.id);
                    const subcategoryBranchKey = `subcategory:${subcategory.id}`;
                    return (
                      <div key={subcategory.id} className="space-y-3">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedSubcategoryIds((current) => {
                                const next = new Set(current);
                                if (next.has(subcategory.id)) next.delete(subcategory.id);
                                else {
                                  next.add(subcategory.id);
                                  void loadItemsForSubcategory(subcategory.id);
                                }
                                return next;
                              });
                            }}
                            className="ml-4 mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-xs text-gray-700"
                          >
                            {isSubExpanded ? "−" : "+"}
                          </button>
                          <div className="min-w-0 flex-1">
                            {renderScopeCheckbox(subcategory, 1)}
                          </div>
                        </div>

                        {isSubExpanded ? (
                          <div className="space-y-3">
                            {loadingBranches.has(subcategoryBranchKey) ? (
                              <div className="ml-20 text-sm text-gray-500">
                                Загружаем виды товара...
                              </div>
                            ) : null}
                            {(itemsBySubcategory[subcategory.id] ?? []).map((item) =>
                              renderScopeCheckbox(item, 2),
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="dashboard-title">Промокоды</h1>
          <p className="dashboard-subtitle">
            Активные и истекшие промокоды, условия применения и таргетинг по каталогу
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-primary inline-flex min-h-11 min-w-[13.5rem] items-center justify-center self-start whitespace-nowrap rounded-xl px-7 py-2.5 text-sm font-medium leading-none md:self-auto"
        >
          Создать промокод
        </button>
      </div>

      <div className="dashboard-chip-row">
        <button
          type="button"
          onClick={() => setTab("current")}
          className={`dashboard-chip ${tab === "current" ? "dashboard-chip--active" : ""}`}
        >
          Текущие
        </button>
        <button
          type="button"
          onClick={() => setTab("expired")}
          className={`dashboard-chip ${tab === "expired" ? "dashboard-chip--active" : ""}`}
        >
          Истёкшие
        </button>
      </div>

      {loading ? (
        <div className="dashboard-empty">Загружаем промокоды...</div>
      ) : promos.length === 0 ? (
        <div className="dashboard-empty">
          {tab === "expired"
            ? "Истекших промокодов пока нет."
            : "Промокоды еще не созданы."}
        </div>
      ) : (
        <div className="space-y-4">
          {promos.map((promo) => (
            <PromoCard key={promo.id} promo={promo} onOpen={() => void openPromo(promo)} />
          ))}
        </div>
      )}

      <AppModal
        open={Boolean(modalMode)}
        onClose={closeModal}
        size="xl"
        title={
          modalMode === "create"
            ? "Создать промокод"
            : modalMode === "readonly"
              ? "Просмотр промокода"
              : "Редактирование промокода"
        }
        subtitle={
          modalMode === "readonly"
            ? "Истекшие, системные и legacy-промокоды доступны только для просмотра. При необходимости создайте новый на их основе."
            : "Настройте код, ограничения, период действия и охват по каталогу."
        }
        footer={
          modalMode === "readonly" ? (
            <>
              <button
                type="button"
                onClick={closeModal}
                className="btn-secondary inline-flex min-h-11 min-w-[9rem] items-center justify-center whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-medium leading-none"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={handleClone}
                className="btn-primary inline-flex min-h-11 min-w-[11.5rem] items-center justify-center whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-medium leading-none"
              >
                Создать на основе
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={closeModal}
                className="btn-secondary inline-flex min-h-11 min-w-[9rem] items-center justify-center whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-medium leading-none"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving || detailLoading}
                className="btn-primary inline-flex min-h-11 min-w-[10.5rem] items-center justify-center whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-medium leading-none disabled:bg-gray-400"
              >
                {saving ? "Сохраняем..." : modalMode === "edit" ? "Сохранить" : "Создать"}
              </button>
            </>
          )
        }
      >
        {detailLoading ? (
          <div className="dashboard-empty">Загружаем настройки промокода...</div>
        ) : (
          <div className="space-y-6">
            {activePromo?.hasLegacyListingScope ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Этот промокод использует legacy-таргетинг по конкретным объявлениям. Его можно
                только просмотреть или создать новый на его основе с таргетингом по каталогу.
              </div>
            ) : null}

            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Промокоды финансируются площадкой и не уменьшают выплату партнёру.
              Комиссия и партнёрская выручка считаются от стоимости заказа до скидки.
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Код промокода</span>
                  <input
                    type="text"
                    value={form.code}
                    disabled={modalReadOnly || !canEditCode}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        code: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Например, START15"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Тип скидки</span>
                  <select
                    value={form.discountType}
                    disabled={modalReadOnly}
                    onChange={(event) =>
                      handleDiscountTypeChange(
                        event.target.value as PromoFormState["discountType"],
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                  >
                    <option value="percent">Процент</option>
                    <option value="fixed_amount">Фиксированная сумма</option>
                  </select>
                </label>

                <label className="space-y-2 xl:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    {discountFieldConfig.label}
                  </span>
                  <div className="relative">
                    <input
                      type={discountFieldConfig.useNativeStepper ? "number" : "text"}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={discountFieldConfig.min}
                      max={discountFieldConfig.max}
                      value={form.discountValue}
                      disabled={modalReadOnly}
                      onChange={(event) =>
                        handleNumericFieldChange("discountValue", event.target.value)
                      }
                      onBlur={(event) => {
                        const nextValue = clampNumericString(event.target.value, {
                          min: discountFieldConfig.min,
                          max: discountFieldConfig.max,
                        });
                        setForm((prev) => ({
                          ...prev,
                          discountValue: nextValue,
                        }));
                      }}
                      placeholder={discountFieldConfig.placeholder}
                      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)] ${
                        discountFieldConfig.suffix ? "pr-14" : "pr-4"
                      }`}
                    />
                    {discountFieldConfig.suffix ? (
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                        {discountFieldConfig.suffix}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">{discountFieldConfig.hint}</p>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Минимальная сумма</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={0}
                    value={form.minSubtotal}
                    disabled={modalReadOnly}
                    onChange={(event) =>
                      handleNumericFieldChange("minSubtotal", event.target.value)
                    }
                    onBlur={(event) => {
                      const nextValue = clampNumericString(event.target.value || "0", {
                        min: 0,
                      });
                      setForm((prev) => ({
                        ...prev,
                        minSubtotal: nextValue,
                      }));
                    }}
                    placeholder="0"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Лимит активаций</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    value={form.maxActivations}
                    disabled={modalReadOnly}
                    onChange={(event) =>
                      handleNumericFieldChange("maxActivations", event.target.value)
                    }
                    onBlur={(event) => {
                      const nextValue = clampNumericString(event.target.value, {
                        min: 1,
                      });
                      setForm((prev) => ({
                        ...prev,
                        maxActivations: nextValue,
                      }));
                    }}
                    placeholder="100"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Начало</span>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    disabled={modalReadOnly}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        startsAt: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Окончание</span>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    disabled={modalReadOnly}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        endsAt: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Условия применения</h3>
                  <p className="text-sm text-gray-500">
                    Один пользователь может активировать промокод только один раз.
                  </p>
                </div>
                <label className="inline-flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isEnabled}
                    disabled={modalReadOnly}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isEnabled: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Промокод включён
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Охват каталога</h3>
                  <p className="text-sm text-gray-500">{selectionSummary}</p>
                </div>
                <label className="inline-flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.allCatalog}
                    disabled={modalReadOnly}
                    onChange={(event) => handleToggleAllCatalog(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Весь каталог
                </label>
              </div>

              {!form.allCatalog ? (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">Поиск по каталогу</h4>
                        <p className="text-sm text-gray-500">
                          Выбирайте категории, подкатегории и отдельные виды товара.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <input
                        type="search"
                        value={categoryQuery}
                        disabled={modalReadOnly}
                        onChange={(event) => setCategoryQuery(event.target.value)}
                        placeholder="Поиск по категориям, подкатегориям и видам товара"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[rgb(38,83,141)]"
                      />
                    </div>

                    {selectedScopeChips.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedScopeChips.map((chip) => (
                          <span
                            key={`${chip.kind}:${chip.id}`}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                          >
                            {chip.label}
                            {!modalReadOnly ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveScopeChip(chip)}
                                className="text-slate-400 transition-colors hover:text-slate-700"
                                aria-label={`Убрать ${chip.label}`}
                              >
                                ×
                              </button>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 max-h-[28rem] overflow-y-auto pr-1">
                      {renderCatalogTree()}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Скидка будет действовать на весь каталог без дополнительных ограничений по
                  категориям и видам товара.
                </div>
              )}
            </div>
          </div>
        )}
      </AppModal>
    </div>
  );
}
