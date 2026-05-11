import { CheckCircle, ChevronRight, Plus, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { AppModal } from "../../../shared/ui/app-modal";
import { CatalogRequestPhotoPreview } from "./catalog-suggestions.components";
import { catalogKindLabels } from "./catalog-suggestions.constants";
import type {
  ApprovalForm,
  CatalogEditTarget,
  CatalogNodeKind,
  CatalogReferenceBrand,
  CatalogReferenceCharacteristic,
  CatalogSuggestion,
  DeleteTarget,
} from "./catalog-suggestions.types";
import {
  catalogRequestPhotoItems,
  catalogRequestPhotoLabel,
  catalogRequestReview,
  catalogSuggestionEntityLabel,
  displayValue,
  isCatalogTreeSuggestion,
  isCharacteristicCatalogRequest,
  isFullCatalogApprovalRequest,
  payloadValue,
} from "./catalog-suggestions.utils";

export type CatalogIconOption = {
  key: string;
  label: string;
  Icon: LucideIcon;
};

export function CatalogSuggestionReviewModal({
  suggestion,
  rejectNote,
  onRejectNoteChange,
  onClose,
  onReject,
  onApprove,
}: {
  suggestion: CatalogSuggestion | null;
  rejectNote: string;
  onRejectNoteChange: (value: string) => void;
  onClose: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  if (!suggestion) return null;

  const review = catalogRequestReview(suggestion);
  const isCharacteristicRequest = isCharacteristicCatalogRequest(suggestion);
  const photos = catalogRequestPhotoItems(review.photoName);
  const details = [
    review.comment ? { label: "Комментарий продавца", value: review.comment, wide: true } : null,
    review.link ? { label: "Ссылка на описание", value: review.link, wide: true } : null,
    review.email ? { label: "Почта продавца", value: review.email, wide: false } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; wide: boolean }>;

  return (
    <AppModal
      open
      onClose={onClose}
      size="xl"
      bodyClassName="catalog-request-review-modal__body"
      footer={
        <>
          {suggestion.status === "pending" ? (
            <label className="catalog-request-review-modal__reject">
              <span>Причина отклонения</span>
              <textarea
                value={rejectNote}
                onChange={(event) => onRejectNoteChange(event.target.value)}
                placeholder="Коротко укажите, почему заявку нельзя принять"
              />
            </label>
          ) : null}
          <div className="catalog-request-review-modal__actions">
            <button
              type="button"
              className="catalog-modal__button catalog-modal__button--secondary"
              onClick={onClose}
            >
              Закрыть
            </button>
            {suggestion.status === "pending" ? (
              <>
                <button
                  type="button"
                  className="catalog-modal__button catalog-modal__button--danger"
                  onClick={onReject}
                >
                  <XCircle className="h-4 w-4" /> Отклонить
                </button>
                <button
                  type="button"
                  className="catalog-modal__button catalog-modal__button--primary"
                  onClick={onApprove}
                >
                  <CheckCircle className="h-4 w-4" /> Одобрить
                </button>
              </>
            ) : null}
          </div>
        </>
      }
    >
      <header className="catalog-request-review-modal__hero">
        <h2>{catalogSuggestionEntityLabel(suggestion.entityType, suggestion.reason)}</h2>
        <div className="catalog-request-review-modal__breadcrumb">
          <span>Товары</span>
          <ChevronRight className="h-4 w-4" />
          <span>{review.categoryName}</span>
          <ChevronRight className="h-4 w-4" />
          <span>{review.subcategoryName}</span>
          <ChevronRight className="h-4 w-4" />
          <strong>{review.itemName}</strong>
        </div>
      </header>

      <section className="catalog-request-review-modal__section">
        <h3>Параметры заявки</h3>
        <div className="catalog-request-review-modal__grid">
          <div className="catalog-request-review-modal__field">
            <span>{isCharacteristicRequest ? "Категория" : "Категория предложенная"}</span>
            <strong>{displayValue(review.categoryName)}</strong>
          </div>
          <div className="catalog-request-review-modal__field">
            <span>{isCharacteristicRequest ? "Подкатегория" : "Подкатегория предложенная"}</span>
            <strong>{displayValue(review.subcategoryName)}</strong>
          </div>
          <div className="catalog-request-review-modal__field catalog-request-review-modal__field--full">
            <span>{isCharacteristicRequest ? "Вид товара" : "Вид товара предложенный"}</span>
            <strong>{displayValue(review.itemName)}</strong>
          </div>
          <div className="catalog-request-review-modal__field">
            <span>Бренд</span>
            <strong>{displayValue(review.brand)}</strong>
          </div>
          <div className="catalog-request-review-modal__field">
            <span>Модель</span>
            <strong>{displayValue(review.model)}</strong>
          </div>
        </div>
      </section>

      <section className="catalog-request-review-modal__section">
        <h3>Характеристики</h3>
        <div className="catalog-request-review-modal__field catalog-request-review-modal__field--text">
          <span>Важные характеристики этой модели</span>
          <strong>{displayValue(review.importantAttributes)}</strong>
        </div>
      </section>

      {photos.length > 0 ? (
        <section className="catalog-request-review-modal__section">
          <div className="catalog-request-review-modal__section-header">
            <h3>Внешний вид</h3>
            <span>{photos.length} фото</span>
          </div>
          <div className="catalog-request-review-modal__photos">
            {photos.map((photo, index) => (
              <div key={`${photo}-${index}`} className="catalog-request-review-modal__photo">
                <CatalogRequestPhotoPreview src={photo} alt={`Фото заявки ${index + 1}`} />
                <small>{catalogRequestPhotoLabel(photo, review.photoLabel)}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {details.length > 0 ? (
        <section className="catalog-request-review-modal__section">
          <h3>Подробности</h3>
          <div className="catalog-request-review-modal__grid">
            {details.map((detail) => (
              <div
                key={detail.label}
                className={`catalog-request-review-modal__field${
                  detail.wide ? " catalog-request-review-modal__field--full" : ""
                }`}
              >
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppModal>
  );
}

export function CatalogSuggestionApprovalModal({
  target,
  form,
  onClose,
  onBack,
  onSubmit,
  onChange,
}: {
  target: CatalogSuggestion | null;
  form: ApprovalForm | null;
  onClose: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onChange: (updater: (prev: ApprovalForm) => ApprovalForm) => void;
}) {
  if (!target || !form) return null;

  return (
    <AppModal
      open
      onClose={onClose}
      onBack={onBack}
      size="xl"
      panelClassName="catalog-approval-editor-modal"
      bodyClassName="catalog-request-review-modal__body"
      footer={
        <div className="catalog-request-review-modal__actions">
          <button
            type="button"
            className="catalog-modal__button catalog-modal__button--secondary"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="catalog-modal__button catalog-modal__button--primary"
            onClick={onSubmit}
          >
            Сохранить и одобрить
          </button>
        </div>
      }
    >
      <header className="catalog-request-review-modal__hero">
        <h2>Одобрить и добавить справочник</h2>
        <div className="catalog-request-review-modal__breadcrumb">
          <span>Товары</span>
          <ChevronRight className="h-4 w-4" />
          <span>{form.categoryName}</span>
          {target.entityType !== "category" ? (
            <>
              <ChevronRight className="h-4 w-4" />
              <span>{form.subcategoryName}</span>
            </>
          ) : null}
          {target.entityType === "item" ? (
            <>
              <ChevronRight className="h-4 w-4" />
              <strong>{form.itemName}</strong>
            </>
          ) : null}
        </div>
      </header>

      {isCatalogTreeSuggestion(target) ? (
        <section className="catalog-request-review-modal__section">
          <div>
            <h3>Что добавить в каталог</h3>
            <p className="catalog-approval-editor-modal__hint">
              Проверьте предложенные названия и поправьте их перед созданием справочника.
            </p>
          </div>

          <div className="catalog-request-review-modal__grid">
            <label className="catalog-field">
              <span>Предложенная категория</span>
              <input
                className="catalog-modal__input"
                value={form.categoryName}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    categoryId: "",
                    categoryName: event.target.value,
                  }))
                }
                placeholder="Например, Бытовая техника"
              />
            </label>

            <label className="catalog-field">
              <span>Предложенная подкатегория</span>
              <input
                className="catalog-modal__input"
                value={form.subcategoryName}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    subcategoryId: "",
                    subcategoryName: event.target.value,
                  }))
                }
                placeholder="Например, Техника для кухни"
              />
            </label>

            <label className="catalog-field catalog-request-review-modal__field--full">
              <span>Предложенный вид товара</span>
              <input
                className="catalog-modal__input"
                value={form.itemName}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    itemName: event.target.value,
                  }))
                }
                placeholder="Например, Робот-пылесос"
              />
            </label>
          </div>
        </section>
      ) : null}

      {isFullCatalogApprovalRequest(target) ? (
        <section className="catalog-request-review-modal__section">
          <div>
            <h3>Справочник для продавцов</h3>
            <p className="catalog-approval-editor-modal__hint">
              Бренд, модель и характеристики появятся в подсказках при создании объявления.
            </p>
          </div>

          <div className="catalog-request-review-modal__grid">
            <label className="catalog-field">
              <span>Бренд</span>
              <input
                className="catalog-modal__input"
                value={form.brandName}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    brandName: event.target.value,
                  }))
                }
                placeholder="Например, ASUS"
              />
            </label>

            <label className="catalog-field">
              <span>Модель</span>
              <input
                className="catalog-modal__input"
                value={form.modelName}
                onChange={(event) =>
                  onChange((prev) => ({
                    ...prev,
                    modelName: event.target.value,
                  }))
                }
                placeholder="Например, RTX 4070"
              />
            </label>
          </div>
        </section>
      ) : null}

      {isFullCatalogApprovalRequest(target) ? (
        <section className="catalog-request-review-modal__section">
          <div className="catalog-approval-characteristics__top">
            <h3>Характеристики</h3>
          </div>

          <div className="catalog-approval-workspace">
            <div className="catalog-source-note catalog-source-note--sticky">
              <span>Важные характеристики, как указал продавец</span>
              <strong>{displayValue(payloadValue(target.payload, "importantAttributes"))}</strong>
            </div>

            <div className="catalog-approval-characteristics">
              {form.characteristics.map((characteristic, index) => (
                <div key={index} className="catalog-reference-characteristic-row">
                  <input
                    className="catalog-modal__input"
                    value={characteristic.label}
                    onChange={(event) =>
                      onChange((prev) => ({
                        ...prev,
                        characteristics: prev.characteristics.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, label: event.target.value } : entry,
                        ),
                      }))
                    }
                    placeholder="Название характеристики"
                  />
                  <div className="catalog-approval-characteristic-value">
                    <input
                      className="catalog-modal__input"
                      value={characteristic.value}
                      onChange={(event) =>
                        onChange((prev) => ({
                          ...prev,
                          characteristics: prev.characteristics.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, value: event.target.value } : entry,
                          ),
                        }))
                      }
                      placeholder="Значение"
                    />
                    <button
                      type="button"
                      className="catalog-tree-icon-button catalog-tree-icon-button--danger"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          characteristics:
                            prev.characteristics.length > 1
                              ? prev.characteristics.filter((_, entryIndex) => entryIndex !== index)
                              : [{ label: "", value: "" }],
                        }))
                      }
                      aria-label="Удалить характеристику"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="catalog-modal__button catalog-modal__button--secondary catalog-approval-characteristics__add"
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    characteristics: prev.characteristics.concat({ label: "", value: "" }),
                  }))
                }
              >
                <Plus className="h-4 w-4" /> Характеристика
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </AppModal>
  );
}

export function CatalogReferenceEditor({
  loading,
  brands,
  brandName,
  modelNames,
  productDrafts,
  onBrandNameChange,
  onCreateBrand,
  onModelNameChange,
  onCreateModel,
  onDeleteReferenceEntity,
  onDeleteReferenceCharacteristic,
  onUpdateProductDraft,
  onDeleteDraftCharacteristic,
  onCreateProduct,
}: {
  loading: boolean;
  brands: CatalogReferenceBrand[];
  brandName: string;
  modelNames: Record<string, string>;
  productDrafts: Record<string, { characteristics: CatalogReferenceCharacteristic[] }>;
  onBrandNameChange: (value: string) => void;
  onCreateBrand: () => void;
  onModelNameChange: (brandId: string, value: string) => void;
  onCreateModel: (brandId: string) => void;
  onDeleteReferenceEntity: (path: string) => void;
  onDeleteReferenceCharacteristic: (id: number) => void;
  onUpdateProductDraft: (
    modelId: string,
    updater: (draft: { characteristics: CatalogReferenceCharacteristic[] }) => {
      characteristics: CatalogReferenceCharacteristic[];
    },
  ) => void;
  onDeleteDraftCharacteristic: (modelId: string, index: number) => void;
  onCreateProduct: (modelId: string) => void;
}) {
  return (
    <div className="catalog-reference-editor">
      <div className="catalog-reference-editor__header">
        <div>
          <h3>Справочник для этого вида товара</h3>
          <p>Бренды, модели и характеристики будут доступны продавцу в подсказках.</p>
        </div>
      </div>

      <div className="catalog-reference-create">
        <input
          className="catalog-modal__input"
          value={brandName}
          onChange={(event) => onBrandNameChange(event.target.value)}
          placeholder="Новый бренд, например Apple"
        />
        <button
          type="button"
          className="catalog-modal__button catalog-modal__button--secondary"
          onClick={onCreateBrand}
        >
          <Plus className="h-4 w-4" /> Бренд
        </button>
      </div>

      {loading ? <div className="catalog-tree-loading">Загружаю справочник...</div> : null}

      {!loading && brands.length === 0 ? (
        <div className="catalog-tree-empty">
          Брендов пока нет. Добавьте первый бренд, затем модель и характеристики.
        </div>
      ) : null}

      <div className="catalog-reference-list">
        {brands.map((brand) => (
          <section key={brand.id} className="catalog-reference-card">
            <div className="catalog-reference-card__top">
              <strong>{brand.name}</strong>
              <button
                type="button"
                className="catalog-tree-icon-button catalog-tree-icon-button--danger"
                onClick={() =>
                  onDeleteReferenceEntity(
                    `/admin/catalog/reference/brands/${encodeURIComponent(brand.id)}`,
                  )
                }
                aria-label="Удалить бренд"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="catalog-reference-create">
              <input
                className="catalog-modal__input"
                value={modelNames[brand.id] ?? ""}
                onChange={(event) => onModelNameChange(brand.id, event.target.value)}
                placeholder="Модель, например iPhone 15"
              />
              <button
                type="button"
                className="catalog-modal__button catalog-modal__button--secondary"
                onClick={() => onCreateModel(brand.id)}
              >
                <Plus className="h-4 w-4" /> Модель
              </button>
            </div>

            {brand.models.map((model) => {
              const draft = productDrafts[model.id] ?? {
                characteristics: [{ label: "", value: "" }],
              };
              const savedCharacteristics = model.products.flatMap((product) =>
                product.characteristics.map((characteristic, index) => ({
                  ...characteristic,
                  renderKey: `${product.id}-${characteristic.id ?? index}`,
                })),
              );
              return (
                <div key={model.id} className="catalog-reference-model">
                  <div className="catalog-reference-model__title">
                    <span>{model.name}</span>
                    <button
                      type="button"
                      className="catalog-tree-icon-button catalog-tree-icon-button--danger"
                      onClick={() =>
                        onDeleteReferenceEntity(
                          `/admin/catalog/reference/models/${encodeURIComponent(model.id)}`,
                        )
                      }
                      aria-label="Удалить модель"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="catalog-reference-products">
                    <div className="catalog-reference-product">
                      <div className="catalog-reference-product__top">
                        <span>Характеристики</span>
                      </div>

                      {savedCharacteristics.length > 0 ? (
                        <div className="catalog-reference-characteristics">
                          {savedCharacteristics.map((characteristic) => (
                            <span key={characteristic.renderKey}>
                              <span>
                                {characteristic.label}: {characteristic.value}
                              </span>
                              {characteristic.id !== undefined ? (
                                <button
                                  type="button"
                                  onClick={() => onDeleteReferenceCharacteristic(characteristic.id!)}
                                  aria-label="Удалить характеристику"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="catalog-tree-empty">Характеристик пока нет.</div>
                      )}
                    </div>
                  </div>

                  <div className="catalog-reference-product-form">
                    {draft.characteristics.map((characteristic, index) => (
                      <div key={index} className="catalog-reference-characteristic-row">
                        <input
                          className="catalog-modal__input"
                          value={characteristic.label}
                          onChange={(event) =>
                            onUpdateProductDraft(model.id, (current) => ({
                              ...current,
                              characteristics: current.characteristics.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, label: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                          placeholder="Характеристика"
                        />
                        <input
                          className="catalog-modal__input"
                          value={characteristic.value}
                          onChange={(event) =>
                            onUpdateProductDraft(model.id, (current) => ({
                              ...current,
                              characteristics: current.characteristics.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, value: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                          placeholder="Значение"
                        />
                        <button
                          type="button"
                          className="catalog-tree-icon-button catalog-tree-icon-button--danger"
                          onClick={() => onDeleteDraftCharacteristic(model.id, index)}
                          aria-label="Удалить характеристику"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="catalog-reference-actions">
                      <button
                        type="button"
                        className="catalog-modal__button catalog-modal__button--secondary"
                        onClick={() =>
                          onUpdateProductDraft(model.id, (current) => ({
                            ...current,
                            characteristics: current.characteristics.concat({
                              label: "",
                              value: "",
                            }),
                          }))
                        }
                      >
                        <Plus className="h-4 w-4" /> Характеристика
                      </button>
                      <button
                        type="button"
                        className="catalog-modal__button catalog-modal__button--primary"
                        onClick={() => onCreateProduct(model.id)}
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

export function CatalogEditModal({
  target,
  editName,
  editIconKey,
  editEmoji,
  iconOptions,
  referenceLoading,
  referenceBrands,
  referenceBrandName,
  referenceModelNames,
  referenceProductDrafts,
  onClose,
  onEditNameChange,
  onEditIconKeyChange,
  onEditEmojiChange,
  onSave,
  onReferenceBrandNameChange,
  onCreateReferenceBrand,
  onReferenceModelNameChange,
  onCreateReferenceModel,
  onDeleteReferenceEntity,
  onDeleteReferenceCharacteristic,
  onUpdateProductDraft,
  onDeleteDraftCharacteristic,
  onCreateReferenceProduct,
}: {
  target: CatalogEditTarget | null;
  editName: string;
  editIconKey: string;
  editEmoji: string;
  iconOptions: CatalogIconOption[];
  referenceLoading: boolean;
  referenceBrands: CatalogReferenceBrand[];
  referenceBrandName: string;
  referenceModelNames: Record<string, string>;
  referenceProductDrafts: Record<string, { characteristics: CatalogReferenceCharacteristic[] }>;
  onClose: () => void;
  onEditNameChange: (value: string) => void;
  onEditIconKeyChange: (value: string) => void;
  onEditEmojiChange: (value: string) => void;
  onSave: () => void;
  onReferenceBrandNameChange: (value: string) => void;
  onCreateReferenceBrand: () => void;
  onReferenceModelNameChange: (brandId: string, value: string) => void;
  onCreateReferenceModel: (brandId: string) => void;
  onDeleteReferenceEntity: (path: string) => void;
  onDeleteReferenceCharacteristic: (id: number) => void;
  onUpdateProductDraft: (
    modelId: string,
    updater: (draft: { characteristics: CatalogReferenceCharacteristic[] }) => {
      characteristics: CatalogReferenceCharacteristic[];
    },
  ) => void;
  onDeleteDraftCharacteristic: (modelId: string, index: number) => void;
  onCreateReferenceProduct: (modelId: string) => void;
}) {
  if (!target) return null;

  return (
    <AppModal
      open
      onClose={onClose}
      eyebrow="Редактор дерева"
      title={
        target.kind === "category"
          ? target.category
            ? "Изменить категорию"
            : "Добавить категорию"
          : target.kind === "subcategory"
            ? target.subcategory
              ? "Изменить подкатегорию"
              : "Добавить подкатегорию"
            : target.item
              ? "Изменить вид товара"
              : "Добавить вид товара"
      }
      subtitle="Название можно изменить в любой момент."
      size={target.kind === "item" ? "xl" : "md"}
      footer={
        <>
          <button
            type="button"
            className="catalog-modal__button catalog-modal__button--secondary"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="catalog-modal__button catalog-modal__button--primary"
            onClick={onSave}
          >
            Сохранить
          </button>
        </>
      }
    >
      <label className="catalog-field">
        <span>Название</span>
        <input
          className="catalog-modal__input"
          value={editName}
          onChange={(event) => onEditNameChange(event.target.value)}
          autoFocus
        />
      </label>

      {target.kind === "category" ? (
        <div className="catalog-field">
          <span>Иконка категории</span>
          <p className="catalog-field__hint">
            Иконки взяты из Lucide React. Если нужной нет в списке, можно найти название на{" "}
            <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer">
              lucide.dev/icons
            </a>{" "}
            или выбрать эмодзи ниже.
          </p>
          <div className="catalog-icon-picker" role="listbox" aria-label="Иконка категории">
            {iconOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`catalog-icon-option ${
                  editIconKey === option.key ? "catalog-icon-option--active" : ""
                }`}
                onClick={() => onEditIconKeyChange(option.key)}
              >
                <option.Icon className="h-5 w-5" />
                <span>{option.label}</span>
              </button>
            ))}
            <button
              type="button"
              className={`catalog-icon-option ${
                editIconKey === "emoji" ? "catalog-icon-option--active" : ""
              }`}
              onClick={() => onEditIconKeyChange("emoji")}
            >
              <span className="catalog-icon-option__emoji">{editEmoji || "🙂"}</span>
              <span>Эмодзи</span>
            </button>
          </div>
          {editIconKey === "emoji" ? (
            <input
              className="catalog-modal__input"
              value={editEmoji}
              onChange={(event) => onEditEmojiChange(event.target.value)}
              placeholder="Вставьте один эмодзи, например 📱"
            />
          ) : null}
        </div>
      ) : null}

      {target.kind === "item" && target.item ? (
        <CatalogReferenceEditor
          loading={referenceLoading}
          brands={referenceBrands}
          brandName={referenceBrandName}
          modelNames={referenceModelNames}
          productDrafts={referenceProductDrafts}
          onBrandNameChange={onReferenceBrandNameChange}
          onCreateBrand={onCreateReferenceBrand}
          onModelNameChange={onReferenceModelNameChange}
          onCreateModel={onCreateReferenceModel}
          onDeleteReferenceEntity={onDeleteReferenceEntity}
          onDeleteReferenceCharacteristic={onDeleteReferenceCharacteristic}
          onUpdateProductDraft={onUpdateProductDraft}
          onDeleteDraftCharacteristic={onDeleteDraftCharacteristic}
          onCreateProduct={onCreateReferenceProduct}
        />
      ) : target.kind === "item" ? (
        <div className="catalog-tree-empty">
          Справочник брендов, моделей и характеристик появится после создания вида товара.
        </div>
      ) : null}
    </AppModal>
  );
}

export function CatalogDeleteModal({
  target,
  deleteConfirm,
  onDeleteConfirmChange,
  onClose,
  onDelete,
}: {
  target: DeleteTarget | null;
  deleteConfirm: string;
  onDeleteConfirmChange: (value: string) => void;
  onClose: () => void;
  onDelete: (kind: CatalogNodeKind, id: string) => void;
}) {
  if (!target) return null;

  return (
    <AppModal
      open
      onClose={onClose}
      eyebrow="Каскадное удаление"
      title={`Удалить ${catalogKindLabels[target.kind]}`}
      subtitle={
        target.kind === "category"
          ? "Категория удалится вместе со всеми подкатегориями и видами товаров."
          : target.kind === "subcategory"
            ? "Подкатегория удалится вместе со всеми видами товаров."
            : "Вид товара будет удалён из каталога."
      }
      size="md"
      danger
      footer={
        <>
          <button
            type="button"
            className="catalog-modal__button catalog-modal__button--secondary"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="catalog-modal__button catalog-modal__button--danger"
            disabled={deleteConfirm.trim().toLowerCase() !== "удалить"}
            onClick={() => onDelete(target.kind, target.id)}
          >
            <Trash2 className="h-4 w-4" /> Удалить
          </button>
        </>
      }
    >
      <div className="catalog-modal__warning">
        <div className="catalog-modal__warning-title">{target.name}</div>
        <div className="catalog-modal__warning-text">
          Для подтверждения введите слово «удалить».
        </div>
      </div>

      <label className="catalog-field">
        <span>Контрольное слово</span>
        <input
          className="catalog-modal__input"
          value={deleteConfirm}
          onChange={(event) => onDeleteConfirmChange(event.target.value)}
          placeholder="удалить"
          autoFocus
        />
      </label>
    </AppModal>
  );
}
