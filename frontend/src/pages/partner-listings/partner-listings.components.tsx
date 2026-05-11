import React, {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AlertCircle,
  Camera,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AppModal } from "../../shared/ui/app-modal";
import {
  CATALOG_REQUEST_MAX_PHOTO_SIZE_BYTES,
  CUSTOM_CATEGORY_OPTION,
  CUSTOM_ITEM_OPTION,
  CUSTOM_OPTION,
  CUSTOM_SUBCATEGORY_OPTION,
  CUSTOM_VALUE_OPTION,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  PHOTO_RECOMMENDATION_TEXT,
  PRODUCT_MIN_IMAGES,
  TEXTAREA_CLASS,
} from "./partner-listings.constants";
import type {
  CatalogCategoryDto,
  CatalogRequestModalPayload,
  CatalogRequestMode,
  CharacteristicField,
  FormState,
  Listing,
  ListingDraftDto,
  ListingType,
} from "./partner-listings.types";
import {
  catalogItemOptions,
  catalogRequestDefaults,
  choiceButtonClass,
  getComboboxMatches,
  getCharacteristicFields,
  getMinImagesForType,
  getResolvedCatalogItem,
  getResolvedCategoryRoot,
  getResolvedSubcategory,
  getUniqueComboboxOptions,
  isCustomCatalogBranch,
  isValidCatalogRequestEmail,
  isValidCatalogRequestUrl,
  normalizeCharacteristics,
  readImageFileAsDataUrl,
} from "./partner-listings.utils";

export function InlineIssue({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function PartnerListingsHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="dashboard-title">Мои объявления</h2>
        <p className="dashboard-subtitle">
          Управляйте карточками, статусами и видимостью
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary inline-flex items-center gap-2 px-4 py-2.5"
      >
        <Plus className="h-4 w-4" /> Создать
      </button>
    </div>
  );
}

export function PartnerListingsStats({
  stats,
}: {
  stats: {
    total: number;
    active: number;
    moderation: number;
    inactive: number;
  };
}) {
  return (
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
  );
}

export function PartnerListingsToolbar({
  searchQuery,
  statusFilter,
  listingTypeFilter,
  onSearchQueryChange,
  onStatusFilterChange,
  onListingTypeFilterChange,
}: {
  searchQuery: string;
  statusFilter: "all" | "active" | "inactive" | "moderation";
  listingTypeFilter: ListingType;
  onSearchQueryChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "active" | "inactive" | "moderation") => void;
  onListingTypeFilterChange: (value: ListingType) => void;
}) {
  return (
    <div className="dashboard-toolbar space-y-3">
      <div className="dashboard-search">
        <Search className="dashboard-search__icon" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Поиск по названию, описанию и категории..."
          className="dashboard-search__input"
        />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(
              e.target.value as "all" | "active" | "inactive" | "moderation",
            )
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
          onChange={() => onListingTypeFilterChange("products")}
          className="dashboard-select"
        >
          <option value="products">Товары</option>
        </select>
      </div>
    </div>
  );
}

export function ListingDraftCards({
  drafts,
  onStartFromDraft,
}: {
  drafts: ListingDraftDto[];
  onStartFromDraft: (draft: ListingDraftDto) => void;
}) {
  if (drafts.length === 0) return null;

  return (
    <section className="listing-create-section">
      <h3>Черновик</h3>
      <div className="listing-create-drafts">
        {drafts.slice(0, 3).map((draft) => {
          const payload = draft.payload ?? {};
          const price = typeof payload.price === "string" ? payload.price.trim() : "";
          const images = Array.isArray(payload.images) ? payload.images : [];
          const firstImage = typeof images[0] === "string" ? images[0] : "";
          return (
            <button
              key={draft.id}
              type="button"
              onClick={() => onStartFromDraft(draft)}
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
                <div className="listing-create-draft-card__title">
                  {draft.title || "Без названия"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function InlineListingEditForm({
  listing,
  inlineForm,
  inlineIssue,
  catalogCategories,
  inlineAddressSuggestions,
  isInlineSaving,
  setInlineForm,
  onInlineFilesSelected,
  onRemoveImage,
  onCancel,
  onSave,
}: {
  listing: Listing;
  inlineForm: FormState;
  inlineIssue: string | null;
  catalogCategories: CatalogCategoryDto[];
  inlineAddressSuggestions: string[];
  isInlineSaving: boolean;
  setInlineForm: Dispatch<SetStateAction<FormState | null>>;
  onInlineFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onCancel: () => void;
  onSave: (listing: Listing) => void;
}) {
  const selectedCategory =
    catalogCategories.find(
      (category) => category.name === inlineForm.categoryRoot,
    ) ?? null;
  const selectedSubcategory =
    selectedCategory?.subcategories.find(
      (subcategory) => subcategory.name === inlineForm.subcategory,
    ) ?? null;
  const characteristicFields = getCharacteristicFields(
    inlineForm.type,
    inlineForm.subcategory,
    selectedSubcategory,
    inlineForm.catalogItem,
  );

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <InlineIssue message={inlineIssue} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className={FIELD_LABEL_CLASS}>Название</label>
          <input
            value={inlineForm.title}
            onChange={(e) =>
              setInlineForm((prev) =>
                prev ? { ...prev, title: e.target.value } : prev,
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
                prev ? { ...prev, price: e.target.value } : prev,
              )
            }
            className={FIELD_CLASS}
            placeholder="Цена, ₽"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className={FIELD_LABEL_CLASS}>Категория</label>
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
            {catalogCategories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
            <option value={CUSTOM_OPTION}>{CUSTOM_CATEGORY_OPTION}</option>
          </select>
        </div>
        {inlineForm.categoryRoot === CUSTOM_OPTION && (
          <div className="space-y-1 md:col-span-2">
            <label className={FIELD_LABEL_CLASS}>Своя категория</label>
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
          <label className={FIELD_LABEL_CLASS}>Подкатегория</label>
          <select
            value={inlineForm.subcategory}
            onChange={(e) =>
              setInlineForm((prev) => {
                if (!prev) return prev;
                const nextSubcategory = e.target.value;
                const nextSelectedSubcategory =
                  selectedCategory?.subcategories.find(
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
            {selectedCategory?.subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.name}>
                {subcategory.name}
              </option>
            ))}
            <option value={CUSTOM_OPTION}>{CUSTOM_SUBCATEGORY_OPTION}</option>
          </select>
        </div>
        {inlineForm.subcategory === CUSTOM_OPTION && (
          <div className="space-y-1 md:col-span-2">
            <label className={FIELD_LABEL_CLASS}>Своя подкатегория</label>
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
                      selectedSubcategory,
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
            {catalogItemOptions(selectedSubcategory).map((item) => (
              <option key={item} value={item}>
                {item === CUSTOM_OPTION ? CUSTOM_ITEM_OPTION : item}
              </option>
            ))}
          </select>
        </div>
        {inlineForm.catalogItem === CUSTOM_OPTION && (
          <div className="space-y-1 md:col-span-3">
            <label className={FIELD_LABEL_CLASS}>Свой вид</label>
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
            <label className={FIELD_LABEL_CLASS}>Состояние</label>
            <div className="grid gap-2 md:grid-cols-3">
              <button
                type="button"
                onClick={() =>
                  setInlineForm((prev) =>
                    prev ? { ...prev, condition: "new" } : prev,
                  )
                }
                className={choiceButtonClass(inlineForm.condition === "new")}
              >
                Новое
              </button>
              <button
                type="button"
                onClick={() =>
                  setInlineForm((prev) =>
                    prev ? { ...prev, condition: "restored" } : prev,
                  )
                }
                className={choiceButtonClass(inlineForm.condition === "restored")}
              >
                Восстановленное
              </button>
              <button
                type="button"
                onClick={() =>
                  setInlineForm((prev) =>
                    prev ? { ...prev, condition: "used" } : prev,
                  )
                }
                className={choiceButtonClass(inlineForm.condition === "used")}
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
                    prev ? { ...prev, hasDefects: "no" } : prev,
                  )
                }
                className={choiceButtonClass(inlineForm.hasDefects === "no")}
              >
                Без дефектов
              </button>
              <button
                type="button"
                onClick={() =>
                  setInlineForm((prev) =>
                    prev ? { ...prev, hasDefects: "yes" } : prev,
                  )
                }
                className={choiceButtonClass(inlineForm.hasDefects === "yes")}
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
            setInlineForm((prev) => (prev ? { ...prev, ...next } : prev))
          }
        />
      ) : (
        <div className="grid gap-3">
          {characteristicFields.map((field) => (
            <CharacteristicEditor
              key={field.key}
              field={field}
              values={inlineForm.characteristics}
              onChange={(next) =>
                setInlineForm((prev) =>
                  prev ? { ...prev, characteristics: next } : prev,
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
              prev ? { ...prev, description: e.target.value } : prev,
            )
          }
          className={TEXTAREA_CLASS}
          rows={5}
          placeholder="Описание товара"
        />
      </div>

      <div className="space-y-1">
        <label className={FIELD_LABEL_CLASS}>Адрес встречи</label>
        <input
          value={inlineForm.meetingAddress}
          onChange={(e) =>
            setInlineForm((prev) =>
              prev ? { ...prev, meetingAddress: e.target.value } : prev,
            )
          }
          className={FIELD_CLASS}
          list={`address-suggest-${listing.id}`}
          placeholder="Например: ул. Ленина, 15"
        />
        <datalist id={`address-suggest-${listing.id}`}>
          {inlineAddressSuggestions.map((address) => (
            <option key={address} value={address} />
          ))}
        </datalist>
      </div>

      <div className="space-y-2">
        <label className={FIELD_LABEL_CLASS}>Фотографии</label>
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
          <div className="text-xs text-gray-500">{PHOTO_RECOMMENDATION_TEXT}</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            Для товара требуется минимум {PRODUCT_MIN_IMAGES} фото. Один и тот же
            файл нельзя загружать повторно.
          </div>

          {inlineForm.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {inlineForm.images.map((img, index) => (
                <div
                  key={`${listing.id}-${index}-${img.slice(0, 20)}`}
                  className="relative h-44 overflow-hidden rounded-xl border border-gray-200 bg-slate-100"
                >
                  <img
                    src={img}
                    alt={`Фото ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
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
          onClick={onCancel}
          className="btn-secondary px-4 py-2"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => onSave(listing)}
          disabled={isInlineSaving}
          className="btn-primary px-4 py-2 disabled:opacity-60"
        >
          {isInlineSaving ? "Сохраняем..." : "Сохранить изменения"}
        </button>
      </div>
    </div>
  );
}

export function CharacteristicCombobox({
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

export function CharacteristicEditor({
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

export function CatalogReferenceCascadeEditor({
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

export function CatalogRequestEditor({
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

export function CatalogRequestModal({
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
