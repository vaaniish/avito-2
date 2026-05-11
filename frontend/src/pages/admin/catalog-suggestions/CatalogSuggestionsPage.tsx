import { useState } from "react";
import {
  BookOpen,
  Box,
  Camera,
  Cpu,
  Gamepad2,
  Headphones,
  Home,
  Laptop,
  Monitor,
  Plus,
  Search,
  Shirt,
  Smartphone,
  Sparkles,
  Tv,
  WashingMachine,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import {
  CatalogDeleteModal,
  CatalogEditModal,
  CatalogSuggestionApprovalModal,
  CatalogSuggestionReviewModal,
} from "./catalog-suggestions.modals";
import {
  CatalogEditorTreeSection,
  CatalogSuggestionsListSection,
} from "./catalog-suggestions.sections";
import {
  useCatalogSuggestionsActions,
  useCatalogReferenceEditor,
  useCatalogSuggestionsData,
} from "./catalog-suggestions.hooks";
import { catalogKindLabels } from "./catalog-suggestions.constants";
import type { StatusFilter } from "./catalog-suggestions.types";

const iconOptions: Array<{ key: string; label: string; Icon: LucideIcon }> = [
  { key: "monitor", label: "Экраны", Icon: Monitor },
  { key: "smartphone", label: "Телефоны", Icon: Smartphone },
  { key: "laptop", label: "Ноутбуки", Icon: Laptop },
  { key: "cpu", label: "Комплектующие", Icon: Cpu },
  { key: "washing_machine", label: "Бытовая техника", Icon: WashingMachine },
  { key: "wifi", label: "Сеть", Icon: Wifi },
  { key: "gamepad", label: "Игры", Icon: Gamepad2 },
  { key: "headphones", label: "Аудио", Icon: Headphones },
  { key: "camera", label: "Фото", Icon: Camera },
  { key: "tv", label: "ТВ", Icon: Tv },
  { key: "home", label: "Дом", Icon: Home },
  { key: "shirt", label: "Одежда", Icon: Shirt },
  { key: "book", label: "Книги", Icon: BookOpen },
  { key: "box", label: "Товары", Icon: Box },
  { key: "sparkles", label: "Другое", Icon: Sparkles },
];

export function CatalogSuggestionsPage() {
  const [tab, setTab] = useState<"suggestions" | "editor">("suggestions");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [categoryQuery, setCategoryQuery] = useState("");
  const {
    items,
    categoryNodes,
    subcategoriesByCategory,
    itemsBySubcategory,
    loadingBranches,
    editorLoading,
    setCategoryNodes,
    setSubcategoriesByCategory,
    setItemsBySubcategory,
    loadSuggestions,
    loadCatalog,
    loadCategoryNodes,
    loadSubcategoriesForCategory,
    loadItemsForSubcategory,
  } = useCatalogSuggestionsData({ tab, categoryQuery });

  const {
    referenceItemId,
    referenceBrands,
    referenceLoading,
    referenceBrandName,
    referenceModelNames,
    referenceProductDrafts,
    setReferenceItemId,
    setReferenceBrands,
    setReferenceBrandName,
    setReferenceModelNames,
    setReferenceProductDrafts,
    loadReferenceForItem,
    createReferenceBrand,
    deleteReferenceEntity,
    deleteReferenceCharacteristic,
    createReferenceModel,
    updateProductDraft,
    createReferenceProduct,
    deleteDraftCharacteristic,
  } = useCatalogReferenceEditor();

  const {
    selectedSuggestion,
    rejectNote,
    approvalTarget,
    approvalForm,
    editTarget,
    editName,
    editIconKey,
    editEmoji,
    expandedCategoryIds,
    expandedSubcategoryIds,
    deleteTarget,
    deleteConfirm,
    setApprovalForm,
    setEditName,
    setEditIconKey,
    setEditEmoji,
    setRejectNote,
    setDeleteConfirm,
    setSelectedSuggestion,
    setApprovalTarget,
    setEditTarget,
    setDeleteTarget,
    openSuggestion,
    rejectSelectedSuggestion,
    openApproval,
    submitApproval,
    toggleCategory,
    toggleSubcategory,
    openDelete,
    openEdit,
    saveCatalogEdit,
    deleteCatalogEntity,
    reorderCategories,
    reorderSubcategories,
    reorderItems,
  } = useCatalogSuggestionsActions({
    subcategoriesByCategory,
    itemsBySubcategory,
    setCategoryNodes,
    setSubcategoriesByCategory,
    setItemsBySubcategory,
    loadSuggestions,
    loadCatalog,
    loadCategoryNodes,
    loadSubcategoriesForCategory,
    loadItemsForSubcategory,
    setReferenceItemId,
    setReferenceBrands,
    setReferenceBrandName,
    setReferenceModelNames,
    setReferenceProductDrafts,
    loadReferenceForItem,
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Каталог товаров</h1>
        <p className="dashboard-subtitle">
          Заявки продавцов и ручное управление категориями, подкатегориями и видами товаров
        </p>
      </div>

      <div className="dashboard-chip-row">
        <button
          type="button"
          onClick={() => setTab("suggestions")}
          className={`dashboard-chip ${tab === "suggestions" ? "dashboard-chip--active" : ""}`}
        >
          Заявки
        </button>
        <button
          type="button"
          onClick={() => setTab("editor")}
          className={`dashboard-chip ${tab === "editor" ? "dashboard-chip--active" : ""}`}
        >
          Редактор каталога
        </button>
      </div>

      {tab === "suggestions" ? (
        <CatalogSuggestionsListSection
          items={items}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          onSearchQueryChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onOpenSuggestion={openSuggestion}
        />
      ) : (
        <CatalogEditorTreeSection
          categoryQuery={categoryQuery}
          categoryNodes={categoryNodes}
          editorLoading={editorLoading}
          expandedCategoryIds={expandedCategoryIds}
          expandedSubcategoryIds={expandedSubcategoryIds}
          subcategoriesByCategory={subcategoriesByCategory}
          itemsBySubcategory={itemsBySubcategory}
          loadingBranches={loadingBranches}
          onCategoryQueryChange={setCategoryQuery}
          onToggleCategory={toggleCategory}
          onToggleSubcategory={toggleSubcategory}
          onOpenEdit={openEdit}
          onOpenDelete={openDelete}
          onReorderCategories={reorderCategories}
          onReorderSubcategories={reorderSubcategories}
          onReorderItems={reorderItems}
        />
      )}

      <CatalogSuggestionReviewModal
        suggestion={selectedSuggestion}
        rejectNote={rejectNote}
        onRejectNoteChange={setRejectNote}
        onClose={() => setSelectedSuggestion(null)}
        onReject={() => {
          void rejectSelectedSuggestion();
        }}
        onApprove={() => {
          if (!selectedSuggestion) return;
          openApproval(selectedSuggestion);
        }}
      />

      <CatalogSuggestionApprovalModal
        target={approvalTarget}
        form={approvalForm}
        onClose={() => setApprovalTarget(null)}
        onBack={() => {
          if (!approvalTarget) return;
          setSelectedSuggestion(approvalTarget);
          setApprovalTarget(null);
          setApprovalForm(null);
        }}
        onSubmit={() => {
          void (async () => {
            const approvedItemName = await submitApproval();
            if (!approvedItemName) return;
            setTab("editor");
            setCategoryQuery(approvedItemName);
          })();
        }}
        onChange={(updater) => setApprovalForm((prev) => (prev ? updater(prev) : prev))}
      />

      <CatalogEditModal
        target={editTarget}
        editName={editName}
        editIconKey={editIconKey}
        editEmoji={editEmoji}
        iconOptions={iconOptions}
        referenceLoading={referenceLoading}
        referenceBrands={referenceBrands}
        referenceBrandName={referenceBrandName}
        referenceModelNames={referenceModelNames}
        referenceProductDrafts={referenceProductDrafts}
        onClose={() => setEditTarget(null)}
        onEditNameChange={setEditName}
        onEditIconKeyChange={setEditIconKey}
        onEditEmojiChange={setEditEmoji}
        onSave={() => void saveCatalogEdit()}
        onReferenceBrandNameChange={setReferenceBrandName}
        onCreateReferenceBrand={() => void createReferenceBrand()}
        onReferenceModelNameChange={(brandId, value) =>
          setReferenceModelNames((current) => ({
            ...current,
            [brandId]: value,
          }))
        }
        onCreateReferenceModel={(brandId) => void createReferenceModel(brandId)}
        onDeleteReferenceEntity={(path) => void deleteReferenceEntity(path)}
        onDeleteReferenceCharacteristic={(id) => void deleteReferenceCharacteristic(id)}
        onUpdateProductDraft={updateProductDraft}
        onDeleteDraftCharacteristic={deleteDraftCharacteristic}
        onCreateReferenceProduct={(modelId) => void createReferenceProduct(modelId)}
      />

      <CatalogDeleteModal
        target={deleteTarget}
        deleteConfirm={deleteConfirm}
        onDeleteConfirmChange={setDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
        onDelete={(kind, id) => void deleteCatalogEntity(kind, id)}
      />
    </div>
  );
}
