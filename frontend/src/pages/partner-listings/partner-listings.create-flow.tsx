import React, { type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, Camera, Trash2, X } from "lucide-react";
import { MAX_IMAGES } from "./partner-listings.constants";
import type {
  CatalogCategoryDto,
  CharacteristicField,
  CreationScreen,
  CreateSuggestionMatch,
  FormState,
  ListingDraftDto,
  ProfileAddressDto,
} from "./partner-listings.types";
import {
  CatalogReferenceCascadeEditor,
  CharacteristicEditor,
  InlineIssue,
  ListingDraftCards,
} from "./partner-listings.components";
import {
  choiceButtonClass,
  shouldReplaceTitleWithSuggestion,
  titleWithCompletion,
} from "./partner-listings.utils";

type CatalogSubcategory = CatalogCategoryDto["subcategories"][number];

export function PartnerListingCreateFlow({
  createMode,
  creationScreen,
  form,
  formIssue,
  listingDrafts,
  catalogCategories,
  selectedCategory,
  selectedSubcategory,
  manualCategoryColumnCount,
  isEditingListing,
  titleSuggestions,
  isSuggestionsLoading,
  createSuggestionMatches,
  characteristicFields,
  isCatalogReferenceCreation,
  catalogReferenceBrands,
  catalogReferenceModels,
  catalogReferenceFields,
  profileAddresses,
  selectedMeetingAddressId,
  hasMeetingAddress,
  isCreateSaving,
  setForm,
  setCreationScreen,
  setTitlePickedFromSuggestion,
  onPrevStep,
  onClose,
  onStartFromDraft,
  onStartTitleSearch,
  onOpenCatalogRequest,
  onApplyCatalogPath,
  onApplyCreateSuggestion,
  onOpenCharacteristicRequest,
  onFilesSelected,
  onRemoveImage,
  onSelectMeetingAddress,
  onOpenAddressCreateModal,
  onSave,
}: {
  createMode: boolean;
  creationScreen: CreationScreen;
  form: FormState;
  formIssue: string | null;
  listingDrafts: ListingDraftDto[];
  catalogCategories: CatalogCategoryDto[];
  selectedCategory: CatalogCategoryDto | null;
  selectedSubcategory: CatalogSubcategory | null;
  manualCategoryColumnCount: number;
  isEditingListing: boolean;
  titleSuggestions: string[];
  isSuggestionsLoading: boolean;
  createSuggestionMatches: CreateSuggestionMatch[];
  characteristicFields: CharacteristicField[];
  isCatalogReferenceCreation: boolean;
  catalogReferenceBrands: string[];
  catalogReferenceModels: string[];
  catalogReferenceFields: CharacteristicField[];
  profileAddresses: ProfileAddressDto[];
  selectedMeetingAddressId: string;
  hasMeetingAddress: boolean;
  isCreateSaving: boolean;
  setForm: Dispatch<SetStateAction<FormState>>;
  setCreationScreen: Dispatch<SetStateAction<CreationScreen>>;
  setTitlePickedFromSuggestion: Dispatch<SetStateAction<boolean>>;
  onPrevStep: () => void;
  onClose: () => void;
  onStartFromDraft: (draft: ListingDraftDto) => void;
  onStartTitleSearch: (categoryName: string) => void;
  onOpenCatalogRequest: () => void;
  onApplyCatalogPath: (path: {
    categoryName: string;
    subcategoryName: string;
    itemName: string;
  }) => void;
  onApplyCreateSuggestion: (match: CreateSuggestionMatch) => void;
  onOpenCharacteristicRequest: () => void;
  onFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onSelectMeetingAddress: (address: ProfileAddressDto) => void;
  onOpenAddressCreateModal: () => void;
  onSave: () => void;
}) {
  const isCentered =
    creationScreen === "start" ||
    creationScreen === "manualCategory" ||
    creationScreen === "titleSearch";

  return (
    <div className={createMode ? "listing-create-page" : "listing-create-modal"}>
      <div
        className={
          createMode
            ? `listing-create-shell listing-create-shell--${creationScreen}${
                isCentered ? " listing-create-shell--centered" : ""
              }`
            : `listing-create-modal__panel listing-create-modal__panel--${creationScreen}`
        }
      >
        {!(createMode && (creationScreen === "start" || creationScreen === "manualCategory")) && (
          <div className={createMode ? "listing-create-controls" : "listing-create-modal__bar"}>
            <button
              type="button"
              onClick={onPrevStep}
              className={createMode ? "listing-create-icon-button" : "listing-create-modal__icon-button"}
              aria-label="Назад"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
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
                  onClick={onClose}
                  className="listing-create-profile-back"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>В профиль</span>
                </button>
              )}

              <div className="listing-create-heading">
                <h2>Размещение Товаров</h2>
              </div>

              <ListingDraftCards
                drafts={listingDrafts}
                onStartFromDraft={onStartFromDraft}
              />

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
                        onClick={() => onStartTitleSearch(category.name)}
                        className="listing-create-category-row"
                      >
                        <span>{category.name}</span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={onOpenCatalogRequest}
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
                              onStartTitleSearch(category.name);
                              return;
                            }
                            setForm((prev) => ({
                              ...prev,
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
                                setForm((prev) => ({
                                  ...prev,
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
                              onApplyCatalogPath({
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
                        onClick={onOpenCatalogRequest}
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
                    onChange={(event) => {
                      setTitlePickedFromSuggestion(false);
                      setForm((prev) => ({ ...prev, title: event.target.value }));
                    }}
                    className="h-14 w-full rounded-xl border-0 bg-gray-100 px-4 pr-12 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Например, Видеокарта ASUS RTX 5070 Ti"
                  />
                  {form.title && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, title: "" }))}
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
                        setForm((prev) => ({
                          ...prev,
                          title: shouldReplaceTitleWithSuggestion(
                            prev.title,
                            suggestion,
                          )
                            ? suggestion
                            : titleWithCompletion(prev.title, suggestion),
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
                {isSuggestionsLoading && (
                  <div className="text-sm text-gray-500">
                    Ищем подходящий вид товара...
                  </div>
                )}
                {!isSuggestionsLoading &&
                  createSuggestionMatches.map((match) => (
                    <button
                      key={match.itemPublicId}
                      type="button"
                      onClick={() => onApplyCreateSuggestion(match)}
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
                  onClick={onOpenCatalogRequest}
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
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    className="h-14 w-full rounded-xl border-0 bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Видеокарта"
                  />
                </label>
                <div className="space-y-2">
                  <div className="text-sm font-bold text-gray-950">Состояние</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, condition: "new" }))}
                      className={choiceButtonClass(form.condition === "new", "w-full")}
                    >
                      Новое
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, condition: "used" }))}
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
                    onChange={(next) =>
                      setForm((prev) => ({ ...prev, characteristics: next }))
                    }
                  />
                ) : characteristicFields.length > 0 ? (
                  <div className="grid gap-3">
                    {characteristicFields.map((field) => (
                      <CharacteristicEditor
                        key={field.key}
                        field={field}
                        values={form.characteristics}
                        onChange={(next) =>
                          setForm((prev) => ({ ...prev, characteristics: next }))
                        }
                      />
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenCharacteristicRequest}
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
                          onClick={() => onRemoveImage(index)}
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
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
                          onClick={() => onSelectMeetingAddress(address)}
                          className={`listing-create-address-card${
                            isSelected ? " listing-create-address-card--active" : ""
                          }`}
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
                  onClick={onOpenAddressCreateModal}
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
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, price: event.target.value }))
                    }
                    className="h-14 w-full rounded-xl border-0 bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="₽"
                  />
                </label>
                <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    checked={form.hasMultipleStock}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        hasMultipleStock: event.target.checked,
                      }))
                    }
                    className="h-5 w-5 rounded border-gray-300"
                  />
                  Несколько штук в наличии
                </label>
              </section>

              <div className="listing-create-modal__submit-row">
                <button
                  type="button"
                  onClick={onSave}
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
  );
}
