import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { notifyError, notifySuccess } from "../ui/notifications";
import {
  approveCatalogReferenceSuggestion,
  createCatalogReferenceBrand,
  createCatalogReferenceModel,
  createCatalogReferenceProduct,
  deleteCatalogEntity as deleteCatalogEntityRequest,
  deleteCatalogReferenceCharacteristic as deleteCatalogReferenceCharacteristicRequest,
  deleteCatalogReferenceEntity,
  fetchCatalogCategories,
  fetchCatalogReference,
  fetchCatalogSuggestions,
  reorderCatalogNodes,
  saveCatalogCategory,
  saveCatalogItem,
  saveCatalogSubcategory,
  searchCatalogNodes,
  updateCatalogSuggestion,
} from "./catalog-suggestions.api";
import type {
  ApprovalForm,
  CatalogEditTarget,
  CatalogCategory,
  CatalogNode,
  CatalogNodeKind,
  CatalogReferenceBrand,
  CatalogReferenceCharacteristic,
  CatalogSuggestion,
  DeleteTarget,
} from "./catalog-suggestions.types";
import {
  approvalFormForSuggestion,
  catalogCharacteristicKey,
  duplicateCatalogCharacteristicLabel,
  emojiFromIconKey,
  isFullCatalogApprovalRequest,
  notifyCatalogOrderUpdated,
  sortByIds,
} from "./catalog-suggestions.utils";

export function useCatalogSuggestionsData(params: {
  tab: "suggestions" | "editor";
  categoryQuery: string;
}) {
  const [items, setItems] = useState<CatalogSuggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [categoryNodes, setCategoryNodes] = useState<CatalogNode[]>([]);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<
    Record<string, CatalogNode[]>
  >({});
  const [itemsBySubcategory, setItemsBySubcategory] = useState<Record<string, CatalogNode[]>>({});
  const [loadingBranches, setLoadingBranches] = useState<Set<string>>(() => new Set());
  const [editorLoading, setEditorLoading] = useState(false);

  const loadSuggestions = async () => {
    try {
      const response = await fetchCatalogSuggestions();
      setItems(response);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить заявки каталога");
    }
  };

  const loadCatalog = async () => {
    try {
      const response = await fetchCatalogCategories();
      setCatalog(response);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить каталог");
    }
  };

  const setBranchLoading = (key: string, loading: boolean) => {
    setLoadingBranches((current) => {
      const next = new Set(current);
      if (loading) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const loadCategoryNodes = async () => {
    try {
      setEditorLoading(true);
      const query = params.categoryQuery.trim();
      const nodes = await searchCatalogNodes({
        query,
        scope: query ? "all" : "categories",
      });
      setCategoryNodes(nodes);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить категории");
    } finally {
      setEditorLoading(false);
    }
  };

  const loadSubcategoriesForCategory = async (categoryId: string, force = false) => {
    if (!force && subcategoriesByCategory[categoryId]) return;
    const key = `category:${categoryId}`;
    try {
      setBranchLoading(key, true);
      const nodes = await searchCatalogNodes({ scope: "subcategories", categoryId });
      setSubcategoriesByCategory((current) => ({ ...current, [categoryId]: nodes }));
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
      const nodes = await searchCatalogNodes({ scope: "items", subcategoryId });
      setItemsBySubcategory((current) => ({ ...current, [subcategoryId]: nodes }));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить виды товаров");
    } finally {
      setBranchLoading(key, false);
    }
  };

  useEffect(() => {
    void loadSuggestions();
  }, []);

  useEffect(() => {
    if (params.tab !== "editor") return;
    const timeout = window.setTimeout(() => {
      void loadCategoryNodes();
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [params.tab, params.categoryQuery]);

  return {
    items,
    catalog,
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
  };
}

export function useCatalogReferenceEditor() {
  const [referenceItemId, setReferenceItemId] = useState("");
  const [referenceBrands, setReferenceBrands] = useState<CatalogReferenceBrand[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceBrandName, setReferenceBrandName] = useState("");
  const [referenceModelNames, setReferenceModelNames] = useState<Record<string, string>>({});
  const [referenceProductDrafts, setReferenceProductDrafts] = useState<
    Record<string, { characteristics: CatalogReferenceCharacteristic[] }>
  >({});

  const loadReferenceForItem = async (itemId: string) => {
    try {
      setReferenceLoading(true);
      const response = await fetchCatalogReference(itemId);
      setReferenceItemId(itemId);
      setReferenceBrands(response.brands);
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : "Не удалось загрузить справочник товара",
      );
    } finally {
      setReferenceLoading(false);
    }
  };

  const refreshReference = async () => {
    if (!referenceItemId) return;
    await loadReferenceForItem(referenceItemId);
  };

  const createReferenceBrandAction = async () => {
    const name = referenceBrandName.trim();
    if (!referenceItemId || name.length < 1) {
      notifyError("Укажите бренд.");
      return;
    }
    try {
      await createCatalogReferenceBrand(referenceItemId, name);
      setReferenceBrandName("");
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось добавить бренд");
    }
  };

  const deleteReferenceEntityAction = async (path: string) => {
    try {
      await deleteCatalogReferenceEntity(path);
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить запись");
    }
  };

  const deleteReferenceCharacteristicAction = async (id: number) => {
    try {
      await deleteCatalogReferenceCharacteristicRequest(id);
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить характеристику");
    }
  };

  const createReferenceModelAction = async (brandId: string) => {
    const name = (referenceModelNames[brandId] ?? "").trim();
    if (name.length < 1) {
      notifyError("Укажите модель.");
      return;
    }
    try {
      await createCatalogReferenceModel(brandId, name);
      setReferenceModelNames((current) => ({ ...current, [brandId]: "" }));
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось добавить модель");
    }
  };

  const updateProductDraft = (
    modelId: string,
    updater: (draft: { characteristics: CatalogReferenceCharacteristic[] }) => {
      characteristics: CatalogReferenceCharacteristic[];
    },
  ) => {
    setReferenceProductDrafts((current) => ({
      ...current,
      [modelId]: updater(
        current[modelId] ?? {
          characteristics: [{ label: "", value: "" }],
        },
      ),
    }));
  };

  const createReferenceProductAction = async (modelId: string) => {
    const draft = referenceProductDrafts[modelId] ?? {
      characteristics: [{ label: "", value: "" }],
    };
    const model = referenceBrands
      .flatMap((brand) => brand.models)
      .find((entry) => entry.id === modelId);
    const title = model?.name.trim() || "Характеристики модели";
    const characteristics = draft.characteristics
      .map((characteristic) => ({
        label: characteristic.label.trim(),
        value: characteristic.value.trim(),
      }))
      .filter((characteristic) => characteristic.label && characteristic.value);

    if (characteristics.length < 1) {
      notifyError("Добавьте хотя бы одну характеристику.");
      return;
    }
    const duplicateDraftLabel = duplicateCatalogCharacteristicLabel(characteristics);
    if (duplicateDraftLabel) {
      notifyError(`Характеристика «${duplicateDraftLabel}» уже добавлена.`);
      return;
    }
    const existingKeys = new Set(
      (model?.products ?? []).flatMap((product) =>
        product.characteristics.map((characteristic) =>
          catalogCharacteristicKey(characteristic.label),
        ),
      ),
    );
    const duplicateExistingLabel = characteristics.find((characteristic) =>
      existingKeys.has(catalogCharacteristicKey(characteristic.label)),
    )?.label;
    if (duplicateExistingLabel) {
      notifyError(`Характеристика «${duplicateExistingLabel}» уже добавлена.`);
      return;
    }

    try {
      await createCatalogReferenceProduct({ modelId, title, characteristics });
      setReferenceProductDrafts((current) => ({
        ...current,
        [modelId]: { characteristics: [{ label: "", value: "" }] },
      }));
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось добавить характеристики");
    }
  };

  const deleteDraftCharacteristic = (modelId: string, index: number) => {
    updateProductDraft(modelId, (current) => ({
      ...current,
      characteristics:
        current.characteristics.length > 1
          ? current.characteristics.filter((_, entryIndex) => entryIndex !== index)
          : [{ label: "", value: "" }],
    }));
  };

  return {
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
    refreshReference,
    createReferenceBrand: createReferenceBrandAction,
    deleteReferenceEntity: deleteReferenceEntityAction,
    deleteReferenceCharacteristic: deleteReferenceCharacteristicAction,
    createReferenceModel: createReferenceModelAction,
    updateProductDraft,
    createReferenceProduct: createReferenceProductAction,
    deleteDraftCharacteristic,
  };
}

export function useCatalogSuggestionsActions(params: {
  subcategoriesByCategory: Record<string, CatalogNode[]>;
  itemsBySubcategory: Record<string, CatalogNode[]>;
  setCategoryNodes: Dispatch<SetStateAction<CatalogNode[]>>;
  setSubcategoriesByCategory: Dispatch<SetStateAction<Record<string, CatalogNode[]>>>;
  setItemsBySubcategory: Dispatch<SetStateAction<Record<string, CatalogNode[]>>>;
  loadSuggestions: () => Promise<void>;
  loadCatalog: () => Promise<void>;
  loadCategoryNodes: () => Promise<void>;
  loadSubcategoriesForCategory: (categoryId: string, force?: boolean) => Promise<void>;
  loadItemsForSubcategory: (subcategoryId: string, force?: boolean) => Promise<void>;
  setReferenceItemId: Dispatch<SetStateAction<string>>;
  setReferenceBrands: Dispatch<SetStateAction<CatalogReferenceBrand[]>>;
  setReferenceBrandName: Dispatch<SetStateAction<string>>;
  setReferenceModelNames: Dispatch<SetStateAction<Record<string, string>>>;
  setReferenceProductDrafts: Dispatch<
    SetStateAction<Record<string, { characteristics: CatalogReferenceCharacteristic[] }>>
  >;
  loadReferenceForItem: (itemId: string) => Promise<void>;
}) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<CatalogSuggestion | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [approvalTarget, setApprovalTarget] = useState<CatalogSuggestion | null>(null);
  const [approvalForm, setApprovalForm] = useState<ApprovalForm | null>(null);
  const [editTarget, setEditTarget] = useState<CatalogEditTarget | null>(null);
  const [editName, setEditName] = useState("");
  const [editIconKey, setEditIconKey] = useState("monitor");
  const [editEmoji, setEditEmoji] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const [expandedSubcategoryIds, setExpandedSubcategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const updateSuggestion = async (
    item: CatalogSuggestion,
    status: "approved" | "rejected" | "merged",
    approval?: ApprovalForm,
  ) => {
    const adminNote = status === "rejected" ? rejectNote.trim() : approval?.adminNote.trim() || "";
    const mergedTargetPublicId = item.mergedTargetPublicId?.trim() ?? "";

    if (status === "rejected" && adminNote.length < 3) {
      notifyError("Для отклонения укажите короткую причину.");
      return;
    }
    if (status === "merged" && mergedTargetPublicId.length < 3) {
      notifyError("Для объединения укажите ID существующего вида/значения.");
      return;
    }

    try {
      await updateCatalogSuggestion({
        id: item.id,
        status,
        adminNote,
        mergedTargetPublicId,
        approval,
      });
      setSelectedSuggestion(null);
      setRejectNote("");
      setApprovalTarget(null);
      setApprovalForm(null);
      await Promise.all([
        params.loadSuggestions(),
        params.loadCatalog(),
        params.loadCategoryNodes(),
      ]);
      notifySuccess("Заявка каталога обновлена.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось обновить заявку каталога");
      return;
    }
  };

  const openSuggestion = (item: CatalogSuggestion) => {
    setSelectedSuggestion(item);
    setRejectNote(item.adminNote ?? "");
  };

  const rejectSelectedSuggestion = async () => {
    if (!selectedSuggestion) return;
    await updateSuggestion(selectedSuggestion, "rejected");
  };

  const openApproval = (item: CatalogSuggestion) => {
    setSelectedSuggestion(null);
    setRejectNote("");
    setApprovalTarget(item);
    setApprovalForm(approvalFormForSuggestion(item));
    void params.loadCatalog();
  };

  const submitApproval = async () => {
    if (!approvalTarget || !approvalForm) return;
    if (!approvalForm.categoryId && approvalForm.categoryName.trim().length < 2) {
      notifyError("Выберите существующую категорию или укажите новую.");
      return;
    }
    if (
      approvalTarget.entityType !== "category" &&
      !approvalForm.subcategoryId &&
      approvalForm.subcategoryName.trim().length < 2
    ) {
      notifyError("Выберите существующую подкатегорию или укажите новую.");
      return;
    }
    if (isFullCatalogApprovalRequest(approvalTarget) && approvalForm.itemName.trim().length < 2) {
      notifyError("Укажите название вида товара.");
      return;
    }
    if (!isFullCatalogApprovalRequest(approvalTarget)) {
      await updateSuggestion(approvalTarget, "approved", approvalForm);
      return;
    }
    if (approvalForm.brandName.trim().length < 1) {
      notifyError("Укажите бренд.");
      return;
    }
    if (approvalForm.modelName.trim().length < 1) {
      notifyError("Укажите модель.");
      return;
    }

    const approvalCharacteristics = approvalForm.characteristics
      .map((characteristic) => ({
        label: characteristic.label.trim(),
        value: characteristic.value.trim(),
      }))
      .filter((characteristic) => characteristic.label && characteristic.value);
    const duplicateApprovalLabel = duplicateCatalogCharacteristicLabel(approvalCharacteristics);
    if (duplicateApprovalLabel) {
      notifyError(`Характеристика «${duplicateApprovalLabel}» уже добавлена.`);
      return;
    }

    try {
      const response = await approveCatalogReferenceSuggestion({
        suggestionId: approvalTarget.id,
        approval: approvalForm,
        characteristics: approvalCharacteristics,
      });
      setApprovalTarget(null);
      setApprovalForm(null);
      params.setReferenceItemId(response.item.id);
      await Promise.all([
        params.loadSuggestions(),
        params.loadCatalog(),
        params.loadCategoryNodes(),
      ]);
      await params.loadReferenceForItem(response.item.id);
      notifySuccess("Заявка одобрена, справочник обновлён.");
      return response.item.name;
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось одобрить заявку");
      return;
    }
  };

  const toggleCategory = (node: CatalogNode) => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
        void params.loadSubcategoriesForCategory(node.id);
      }
      return next;
    });
  };

  const toggleSubcategory = (node: CatalogNode) => {
    setExpandedSubcategoryIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
        void params.loadItemsForSubcategory(node.id);
      }
      return next;
    });
  };

  const openDelete = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteConfirm("");
  };

  const openEdit = (target: CatalogEditTarget) => {
    setEditTarget(target);
    params.setReferenceBrands([]);
    params.setReferenceBrandName("");
    params.setReferenceModelNames({});
    params.setReferenceProductDrafts({});
    params.setReferenceItemId(target.kind === "item" ? target.item?.id ?? "" : "");
    if (target.kind === "category") {
      setEditName(target.category?.name ?? "");
      const iconKey = target.category?.iconKey ?? "monitor";
      setEditIconKey(iconKey.startsWith("emoji:") ? "emoji" : iconKey);
      setEditEmoji(emojiFromIconKey(iconKey));
      return;
    }
    if (target.kind === "subcategory") {
      setEditName(target.subcategory?.name ?? "");
      setEditIconKey("monitor");
      setEditEmoji("");
      return;
    }
    setEditName(target.item?.name ?? "");
    setEditIconKey("monitor");
    setEditEmoji("");
    if (target.item?.id) void params.loadReferenceForItem(target.item.id);
  };

  const saveCatalogEdit = async () => {
    if (!editTarget) return;
    const name = editName.trim();
    if (name.length < 2) {
      notifyError("Название должно быть не короче 2 символов.");
      return;
    }

    try {
      if (editTarget.kind === "category") {
        const iconKey =
          editIconKey === "emoji" && editEmoji.trim()
            ? `emoji:${editEmoji.trim().slice(0, 8)}`
            : editIconKey === "emoji"
              ? "monitor"
              : editIconKey;
        await saveCatalogCategory({
          id: editTarget.category?.id,
          name,
          iconKey,
        });
        await params.loadCategoryNodes();
      } else if (editTarget.kind === "subcategory") {
        await saveCatalogSubcategory({
          id: editTarget.subcategory?.id,
          categoryId: editTarget.categoryId,
          name,
        });
        if (!editTarget.subcategory) {
          setExpandedCategoryIds((current) => new Set(current).add(editTarget.categoryId));
        }
        await params.loadSubcategoriesForCategory(editTarget.categoryId, true);
      } else if (editTarget.item) {
        await saveCatalogItem({
          id: editTarget.item.id,
          name,
          subcategoryId: editTarget.subcategoryId,
        });
        await params.loadItemsForSubcategory(editTarget.subcategoryId, true);
      } else {
        await saveCatalogItem({
          subcategoryId: editTarget.subcategoryId,
          name,
        });
        setExpandedSubcategoryIds((current) => new Set(current).add(editTarget.subcategoryId));
        await params.loadItemsForSubcategory(editTarget.subcategoryId, true);
      }

      setEditTarget(null);
      await params.loadCatalog();
      notifySuccess("Каталог обновлён.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось сохранить каталог");
      return;
    }
  };

  const deleteCatalogEntity = async (kind: CatalogNodeKind, id: string) => {
    if (deleteConfirm.trim().toLowerCase() !== "удалить") {
      notifyError("Чтобы удалить элемент, введите слово «удалить».");
      return;
    }

    try {
      await deleteCatalogEntityRequest(kind, id);
      setDeleteTarget(null);
      setDeleteConfirm("");

      if (kind === "category") {
        setExpandedCategoryIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        params.setSubcategoriesByCategory((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        await params.loadCategoryNodes();
      } else if (kind === "subcategory") {
        setExpandedSubcategoryIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        params.setItemsBySubcategory((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        const parentCategoryId = Object.entries(params.subcategoriesByCategory).find(([, nodes]) =>
          nodes.some((node) => node.id === id),
        )?.[0];
        if (parentCategoryId) await params.loadSubcategoriesForCategory(parentCategoryId, true);
      } else {
        const parentSubcategoryId = Object.entries(params.itemsBySubcategory).find(([, nodes]) =>
          nodes.some((node) => node.id === id),
        )?.[0];
        if (parentSubcategoryId) await params.loadItemsForSubcategory(parentSubcategoryId, true);
      }
      await params.loadCatalog();
      notifySuccess("Элемент каталога удалён.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить элемент каталога");
      return;
    }
  };

  const persistCatalogOrder = async (kind: CatalogNodeKind, orderedIds: string[]) => {
    try {
      await reorderCatalogNodes(kind, orderedIds);
      notifyCatalogOrderUpdated();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось изменить порядок");
      if (kind === "category") await params.loadCategoryNodes();
    }
  };

  const reorderCategories = (orderedIds: string[]) => {
    params.setCategoryNodes((current) => sortByIds(current, orderedIds));
    void persistCatalogOrder("category", orderedIds);
  };

  const reorderSubcategories = (categoryId: string, orderedIds: string[]) => {
    params.setSubcategoriesByCategory((current) => ({
      ...current,
      [categoryId]: sortByIds(current[categoryId] ?? [], orderedIds),
    }));
    void persistCatalogOrder("subcategory", orderedIds);
  };

  const reorderItems = (subcategoryId: string, orderedIds: string[]) => {
    params.setItemsBySubcategory((current) => ({
      ...current,
      [subcategoryId]: sortByIds(current[subcategoryId] ?? [], orderedIds),
    }));
    void persistCatalogOrder("item", orderedIds);
  };

  return {
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
  };
}
