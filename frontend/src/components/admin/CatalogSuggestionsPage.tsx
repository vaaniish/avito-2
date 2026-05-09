import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Box,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Gamepad2,
  GripVertical,
  Headphones,
  Home,
  Laptop,
  Minus,
  Monitor,
  Pencil,
  Plus,
  Search,
  Shirt,
  Smartphone,
  Sparkles,
  Trash2,
  Tv,
  WashingMachine,
  Wifi,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { AppModal } from "../ui/app-modal";
import { notifyError, notifySuccess } from "../ui/notifications";

type CatalogSuggestionStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "merged";
type CatalogType = "products";
type StatusFilter = "all" | CatalogSuggestionStatus;
type CatalogNodeKind = "category" | "subcategory" | "item";
type CatalogEditorScope = "all" | "categories" | "subcategories" | "items";

type CatalogSuggestion = {
  id: string;
  entityType: "category" | "subcategory" | "item" | string;
  status: CatalogSuggestionStatus;
  type: CatalogType;
  rawValue: string;
  normalizedValue: string;
  reason: string | null;
  payload: unknown;
  adminNote: string | null;
  usageCount: number;
  mergedTargetPublicId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  category: { id: string; name: string; type: string } | null;
  subcategory: { id: string; name: string } | null;
  item: { id: string; name: string } | null;
  proposedBy: { id: string; name: string; email: string } | null;
};

type CatalogItem = {
  id: string;
  name: string;
  orderIndex: number;
  listingCount: number;
};

type CatalogSubcategory = {
  id: string;
  name: string;
  orderIndex: number;
  itemCount: number;
  items: CatalogItem[];
};

type CatalogCategory = {
  id: string;
  type: CatalogType;
  name: string;
  iconKey: string;
  orderIndex: number;
  subcategories: CatalogSubcategory[];
};

type ApprovalForm = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  itemName: string;
  brandName: string;
  modelName: string;
  characteristics: CatalogReferenceCharacteristic[];
  adminNote: string;
};

type CatalogEditTarget =
  | { kind: "category"; category?: { id: string; name: string; iconKey?: string } }
  | { kind: "subcategory"; categoryId: string; subcategory?: { id: string; name: string } }
  | { kind: "item"; subcategoryId: string; item?: { id: string; name: string } };

type CatalogNode = {
  kind: CatalogNodeKind;
  id: string;
  name: string;
  type: CatalogType;
  path: string;
  orderIndex: number;
  categoryId?: string;
  categoryName?: string;
  iconKey?: string;
  subcategoryId?: string;
  subcategoryName?: string;
  childCount?: number;
  listingCount?: number;
};

type CatalogReferenceCharacteristic = {
  id?: number;
  label: string;
  value: string;
};

type CatalogReferenceProduct = {
  id: string;
  title: string;
  characteristics: CatalogReferenceCharacteristic[];
};

type CatalogReferenceModel = {
  id: string;
  name: string;
  products: CatalogReferenceProduct[];
};

type CatalogReferenceBrand = {
  id: string;
  name: string;
  models: CatalogReferenceModel[];
};

type CatalogReferenceResponse = {
  item: { id: string; name: string };
  brands: CatalogReferenceBrand[];
};

type CatalogSearchResponse = {
  items: CatalogNode[];
  limit: number;
  query: string;
  scope: CatalogEditorScope;
};

type DeleteTarget = {
  kind: CatalogNodeKind;
  id: string;
  name: string;
};

const PRODUCT_TYPE: CatalogType = "products";
const CATALOG_ORDER_UPDATED_EVENT = "catalog-order-updated";

function notifyCatalogOrderUpdated() {
  window.dispatchEvent(new CustomEvent(CATALOG_ORDER_UPDATED_EVENT));
  try {
    window.localStorage.setItem(CATALOG_ORDER_UPDATED_EVENT, String(Date.now()));
  } catch (_error) {
    // The same-window event above is primary; localStorage only helps other open tabs.
  }
}

const statusLabels: Record<CatalogSuggestionStatus, string> = {
  pending: "Ожидает",
  auto_approved: "Авто-одобрено",
  approved: "Одобрено",
  rejected: "Отклонено",
  merged: "Объединено",
};

const payloadLabels: Record<string, string> = {
  categoryName: "Категория предложенная",
  subcategoryName: "Подкатегория предложенная",
  proposedItem: "Вид товара предложенный",
  importantAttributes: "Важные характеристики",
  comment: "Комментарий модератору",
  link: "Ссылка на описание",
  email: "Почта продавца",
  photoName: "Фото",
  photoLabel: "Файл фото",
  listingPublicId: "Объявление",
  title: "Название объявления",
  brand: "Бренд (legacy)",
  model: "Модель (legacy)",
  manufacturerCode: "Код производителя (legacy)",
};

const catalogKindLabels: Record<CatalogNodeKind, string> = {
  category: "категорию",
  subcategory: "подкатегорию",
  item: "вид товара",
};

function catalogSuggestionEntityLabel(value: string, reason?: string | null): string {
  if (reason === "seller_catalog_reference_request") {
    return "Запрос на характеристику";
  }
  const labels: Record<string, string> = {
    category: "Новая категория",
    subcategory: "Предложенная подкатегория",
    item: "Предложенный вид товара",
    manufacturer: "Предложенный производитель",
    model: "Предложенная модель",
    attribute_value: "Предложенное значение",
    attribute_schema: "Предложенная характеристика",
  };
  return labels[value] ?? value;
}

function isCharacteristicCatalogRequest(item: Pick<CatalogSuggestion, "reason">): boolean {
  return item.reason === "seller_catalog_reference_request";
}

function isFullCatalogApprovalRequest(
  item: Pick<CatalogSuggestion, "entityType" | "reason">,
): boolean {
  return (
    item.entityType === "category" ||
    item.entityType === "subcategory" ||
    item.entityType === "item"
  );
}

function isCatalogTreeSuggestion(
  item: Pick<CatalogSuggestion, "entityType" | "reason">,
): boolean {
  return isFullCatalogApprovalRequest(item) && !isCharacteristicCatalogRequest(item);
}

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

function emojiFromIconKey(value: string): string {
  return value.startsWith("emoji:") ? value.slice("emoji:".length) : "";
}

function statusBadge(status: CatalogSuggestionStatus) {
  const styles: Record<CatalogSuggestionStatus, string> = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-300",
    auto_approved: "bg-blue-100 text-blue-700 border-blue-300",
    approved: "bg-green-100 text-green-700 border-green-300",
    rejected: "bg-red-100 text-red-700 border-red-300",
    merged: "bg-gray-100 text-gray-700 border-gray-300",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function payloadEntries(payload: unknown): Array<[string, string]> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
    payloadLabels[key] ?? key,
    value === null || value === undefined || value === "" ? "Не указано" : String(value),
  ]);
}

function payloadValue(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function displayValue(value: string): string {
  return value.trim() || "Не указано";
}

function catalogCharacteristicKey(label: string): string {
  return (
    label
      .trim()
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/giu, "")
      .slice(0, 60) || "characteristic"
  );
}

function duplicateCatalogCharacteristicLabel(
  characteristics: Array<{ label: string }>,
): string | null {
  const seen = new Set<string>();
  for (const characteristic of characteristics) {
    const key = catalogCharacteristicKey(characteristic.label);
    if (seen.has(key)) return characteristic.label;
    seen.add(key);
  }
  return null;
}

function suggestionCategoryName(item: CatalogSuggestion): string {
  return payloadValue(item.payload, "categoryName") || item.category?.name || "";
}

function suggestionSubcategoryName(item: CatalogSuggestion): string {
  return payloadValue(item.payload, "subcategoryName") || item.subcategory?.name || "";
}

function suggestionItemName(item: CatalogSuggestion): string {
  return payloadValue(item.payload, "proposedItem") || item.item?.name || item.rawValue;
}

function catalogRequestCommentParts(value: string): {
  link: string;
  email: string;
  photoName: string;
  rest: string;
} {
  const result = { link: "", email: "", photoName: "", rest: "" };
  const rest: string[] = [];
  value
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const link = line.match(/^Ссылка:\s*(.+)$/iu);
      if (link) {
        result.link = link[1].trim();
        return;
      }
      const email = line.match(/^Почта:\s*(.+)$/iu);
      if (email) {
        result.email = email[1].trim();
        return;
      }
      const photo = line.match(
        /^Фото\s+(?:товара|наклейки|товара,\s*упаковки\s+или\s+маркировки):\s*(.+)$/iu,
      );
      if (photo) {
        result.photoName = photo[1].trim();
        return;
      }
      if (/^Файл\s+фото:\s*(.+)$/iu.test(line)) {
        return;
      }
      rest.push(line);
    });
  result.rest = rest.join("\n");
  return result;
}

function catalogRequestReview(item: CatalogSuggestion) {
  const comment = catalogRequestCommentParts(payloadValue(item.payload, "comment"));
  const payloadPhoto = payloadValue(item.payload, "photoName");
  return {
    categoryName: suggestionCategoryName(item),
    subcategoryName: suggestionSubcategoryName(item),
    itemName: suggestionItemName(item),
    brand: payloadValue(item.payload, "brand"),
    model: payloadValue(item.payload, "model"),
    importantAttributes: payloadValue(item.payload, "importantAttributes"),
    link: payloadValue(item.payload, "link") || comment.link,
    email: payloadValue(item.payload, "email") || comment.email || item.proposedBy?.email || "",
    photoName: payloadPhoto || comment.photoName,
    photoLabel: payloadValue(item.payload, "photoLabel"),
    comment: comment.rest,
  };
}

function catalogRequestPhotoItems(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/^data:image\//iu.test(trimmed)) return [trimmed];
  return trimmed
    .split(/\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPreviewableImage(value: string): boolean {
  return /^(https?:\/\/|data:image\/|blob:)/iu.test(value);
}

function catalogRequestPhotoLabel(value: string, fallback: string): string {
  if (fallback.trim()) return fallback.trim();
  return /^data:image\//iu.test(value) ? "Прикреплённое фото" : value;
}

function CatalogRequestPhotoPreview({ src, alt }: { src: string; alt: string }) {
  const [hasError, setHasError] = useState(false);
  const canPreview = isPreviewableImage(src) && !hasError;

  if (!canPreview) {
    return (
      <div className="catalog-request-review-modal__photo-fallback">
        <Camera className="h-7 w-7" />
        {isPreviewableImage(src) ? <span>Фото не удалось загрузить</span> : null}
      </div>
    );
  }

  return <img src={src} alt={alt} onError={() => setHasError(true)} />;
}

function parseImportantCharacteristics(value: string): CatalogReferenceCharacteristic[] {
  const text = value.trim();
  if (!text) return [{ label: "", value: "" }];

  const parsed: CatalogReferenceCharacteristic[] = [];
  const leftovers: string[] = [];
  const parts = text
    .split(/\n+|;+/g)
    .flatMap((part) => part.split(/,(?=\s*[^,;:=—-]{2,40}\s*(?::|=|—|-)\s*)/g))
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^(.{2,80}?)(?:\s*[:=]\s*|\s+[—-]\s+)(.{1,220})$/u);
    if (!match) {
      leftovers.push(part);
      continue;
    }
    const label = match[1].trim();
    const characteristicValue = match[2].trim();
    if (!label || !characteristicValue) {
      leftovers.push(part);
      continue;
    }
    parsed.push({ label, value: characteristicValue });
  }

  if (leftovers.length > 0) {
    parsed.push({
      label: "Важные характеристики",
      value: leftovers.join("; "),
    });
  }

  return parsed.length > 0 ? parsed : [{ label: "Важные характеристики", value: text }];
}

function approvalFormForSuggestion(item: CatalogSuggestion): ApprovalForm {
  const importantAttributes = payloadValue(item.payload, "importantAttributes");
  const brandName = payloadValue(item.payload, "brand");
  const modelName = payloadValue(item.payload, "model");
  const proposedItem = payloadValue(item.payload, "proposedItem") || item.rawValue;
  return {
    categoryId: item.category?.id ?? "",
    categoryName: payloadValue(item.payload, "categoryName") || item.category?.name || "",
    subcategoryId: item.subcategory?.id ?? "",
    subcategoryName:
      payloadValue(item.payload, "subcategoryName") || item.subcategory?.name || "",
    itemName: proposedItem,
    brandName,
    modelName,
    characteristics: parseImportantCharacteristics(importantAttributes),
    adminNote: item.adminNote ?? "",
  };
}

function sortByIds(nodes: CatalogNode[], orderedIds: string[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return orderedIds.map((id) => byId.get(id)).filter((node): node is CatalogNode => Boolean(node));
}

function SortableCatalogList({
  nodes,
  onReorder,
  children,
  sortable = true,
}: {
  nodes: CatalogNode[];
  onReorder: (orderedIds: string[]) => void;
  children: (node: CatalogNode, sortable: boolean) => ReactNode;
  sortable?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const ids = nodes.map((node) => node.id);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!sortable) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {nodes.map((node) => children(node, sortable))}
      </SortableContext>
    </DndContext>
  );
}

function SortableCatalogNode({
  node,
  depth,
  expanded,
  expandable,
  meta,
  onToggle,
  onEdit,
  onDelete,
  children,
  sortable = true,
}: {
  node: CatalogNode;
  depth: number;
  expanded?: boolean;
  expandable?: boolean;
  meta: string;
  onToggle?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children?: ReactNode;
  sortable?: boolean;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled: !sortable });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`catalog-tree-item ${isDragging ? "catalog-tree-item--dragging" : ""}`}
    >
      <div className={`catalog-tree-node catalog-tree-node--depth-${depth}`}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="catalog-tree-node__handle"
          aria-label={
            sortable
              ? "Перетащить для изменения порядка"
              : "Перетаскивание недоступно в поиске"
          }
          disabled={!sortable}
          {...(sortable ? attributes : {})}
          {...(sortable ? listeners : {})}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <button
          type="button"
          className="catalog-tree-node__main"
          onClick={onToggle}
          disabled={!expandable}
        >
          {expandable ? (
            expanded ? (
              <ChevronDown className="h-5 w-5 text-slate-500" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-500" />
            )
          ) : (
            <span className="catalog-tree-node__leaf" />
          )}
          <span className="min-w-0">
            <span className="catalog-tree-node__title">{node.name}</span>
            <span className="catalog-tree-node__meta">{meta}</span>
          </span>
        </button>

        <div className="catalog-tree-node__actions">
          <button type="button" onClick={onEdit} className="catalog-tree-icon-button">
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="catalog-tree-icon-button catalog-tree-icon-button--danger"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CatalogSuggestionsPage() {
  const [tab, setTab] = useState<"suggestions" | "editor">("suggestions");
  const [items, setItems] = useState<CatalogSuggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [selectedSuggestion, setSelectedSuggestion] = useState<CatalogSuggestion | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [approvalTarget, setApprovalTarget] = useState<CatalogSuggestion | null>(null);
  const [approvalForm, setApprovalForm] = useState<ApprovalForm | null>(null);
  const [editTarget, setEditTarget] = useState<CatalogEditTarget | null>(null);
  const [editName, setEditName] = useState("");
  const [editIconKey, setEditIconKey] = useState("monitor");
  const [editEmoji, setEditEmoji] = useState("");
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
  const [editorLoading, setEditorLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [referenceItemId, setReferenceItemId] = useState("");
  const [referenceBrands, setReferenceBrands] = useState<CatalogReferenceBrand[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceBrandName, setReferenceBrandName] = useState("");
  const [referenceModelNames, setReferenceModelNames] = useState<Record<string, string>>({});
  const [referenceProductDrafts, setReferenceProductDrafts] = useState<
    Record<string, { characteristics: CatalogReferenceCharacteristic[] }>
  >({});

  const loadSuggestions = async () => {
    try {
      const response = await apiGet<CatalogSuggestion[]>("/admin/catalog-suggestions");
      setItems(response);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить заявки каталога");
    }
  };

  const loadCatalog = async () => {
    try {
      const response = await apiGet<CatalogCategory[]>("/admin/catalog?type=products");
      setCatalog(response);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить каталог");
    }
  };

  const fetchCatalogNodes = async (options: {
    query?: string;
    scope: CatalogEditorScope;
    categoryId?: string;
    subcategoryId?: string;
  }): Promise<CatalogNode[]> => {
    const params = new URLSearchParams();
    params.set("type", PRODUCT_TYPE);
    params.set("q", options.query ?? "");
    params.set("scope", options.scope);
    params.set("limit", "80");
    if (options.categoryId) params.set("categoryId", options.categoryId);
    if (options.subcategoryId) params.set("subcategoryId", options.subcategoryId);

    const response = await apiGet<CatalogSearchResponse>(
      `/admin/catalog/search?${params.toString()}`,
    );
    return response.items;
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
      const query = categoryQuery.trim();
      const nodes = await fetchCatalogNodes({
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
      const nodes = await fetchCatalogNodes({ scope: "subcategories", categoryId });
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
      const nodes = await fetchCatalogNodes({ scope: "items", subcategoryId });
      setItemsBySubcategory((current) => ({ ...current, [subcategoryId]: nodes }));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить виды товаров");
    } finally {
      setBranchLoading(key, false);
    }
  };

  const loadReferenceForItem = async (itemId: string) => {
    try {
      setReferenceLoading(true);
      const response = await apiGet<CatalogReferenceResponse>(
        `/admin/catalog/items/${encodeURIComponent(itemId)}/reference`,
      );
      setReferenceItemId(itemId);
      setReferenceBrands(response.brands);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить справочник товара");
    } finally {
      setReferenceLoading(false);
    }
  };

  const refreshReference = async () => {
    if (!referenceItemId) return;
    await loadReferenceForItem(referenceItemId);
  };

  const createReferenceBrand = async () => {
    const name = referenceBrandName.trim();
    if (!referenceItemId || name.length < 1) {
      notifyError("Укажите бренд.");
      return;
    }
    try {
      await apiPost(`/admin/catalog/items/${encodeURIComponent(referenceItemId)}/reference/brands`, {
        name,
      });
      setReferenceBrandName("");
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось добавить бренд");
    }
  };

  const deleteReferenceEntity = async (path: string) => {
    try {
      await apiDelete(path);
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить запись");
    }
  };

  const deleteReferenceCharacteristic = async (id: number) => {
    try {
      await apiDelete(`/admin/catalog/reference/characteristics/${encodeURIComponent(String(id))}`);
      await refreshReference();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить характеристику");
    }
  };

  const createReferenceModel = async (brandId: string) => {
    const name = (referenceModelNames[brandId] ?? "").trim();
    if (name.length < 1) {
      notifyError("Укажите модель.");
      return;
    }
    try {
      await apiPost(`/admin/catalog/reference/brands/${encodeURIComponent(brandId)}/models`, {
        name,
      });
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

  const createReferenceProduct = async (modelId: string) => {
    const draft =
      referenceProductDrafts[modelId] ?? {
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
      await apiPost(`/admin/catalog/reference/models/${encodeURIComponent(modelId)}/products`, {
        title,
        characteristics,
      });
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

  useEffect(() => {
    void loadSuggestions();
  }, []);

  useEffect(() => {
    if (tab !== "editor") return;
    const timeout = window.setTimeout(() => {
      void loadCategoryNodes();
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [tab, categoryQuery]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        return matchesStatus && matchesSearch(item, searchQuery);
      }),
    [items, searchQuery, statusFilter],
  );

  const stats = {
    total: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    merged: items.filter((item) => item.status === "merged").length,
  };
  const isCatalogSearch = categoryQuery.trim().length > 0;

  const selectedApprovalCategory = approvalForm
    ? catalog.find((category) => category.id === approvalForm.categoryId)
    : null;
  const approvalSubcategories = selectedApprovalCategory?.subcategories ?? [];

  const updateSuggestion = async (
    item: CatalogSuggestion,
    status: "approved" | "rejected" | "merged",
    approval?: ApprovalForm,
  ) => {
    const adminNote =
      status === "rejected"
        ? rejectNote.trim()
        : approval?.adminNote.trim() || actionNotes[item.id]?.trim() || "";
    const mergedTargetPublicId = mergeTargets[item.id]?.trim() ?? "";

    if (status === "rejected" && adminNote.length < 3) {
      notifyError("Для отклонения укажите короткую причину.");
      return;
    }
    if (status === "merged" && mergedTargetPublicId.length < 3) {
      notifyError("Для объединения укажите ID существующего вида/значения.");
      return;
    }

    try {
      await apiPatch<{ success: boolean }>(
        `/admin/catalog-suggestions/${encodeURIComponent(item.id)}`,
        {
          status,
          adminNote: adminNote || undefined,
          mergedTargetPublicId: mergedTargetPublicId || undefined,
          approval: approval
            ? {
                type: PRODUCT_TYPE,
                categoryId: approval.categoryId || undefined,
                categoryName: approval.categoryName || undefined,
                subcategoryId: approval.subcategoryId || undefined,
                subcategoryName: approval.subcategoryName || undefined,
                itemName: approval.itemName || undefined,
              }
            : undefined,
        },
      );
      notifySuccess("Заявка каталога обновлена.");
      setSelectedSuggestion(null);
      setRejectNote("");
      setApprovalTarget(null);
      setApprovalForm(null);
      await Promise.all([loadSuggestions(), loadCatalog(), loadCategoryNodes()]);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось обновить заявку каталога");
    }
  };

  const openApproval = (item: CatalogSuggestion) => {
    setSelectedSuggestion(null);
    setRejectNote("");
    setApprovalTarget(item);
    setApprovalForm(approvalFormForSuggestion(item));
    void loadCatalog();
  };

  const toggleCategory = (node: CatalogNode) => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else {
        next.add(node.id);
        void loadSubcategoriesForCategory(node.id);
      }
      return next;
    });
  };

  const toggleSubcategory = (node: CatalogNode) => {
    setExpandedSubcategoryIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else {
        next.add(node.id);
        void loadItemsForSubcategory(node.id);
      }
      return next;
    });
  };

  const openDelete = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteConfirm("");
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
    const duplicateApprovalLabel =
      duplicateCatalogCharacteristicLabel(approvalCharacteristics);
    if (duplicateApprovalLabel) {
      notifyError(`Характеристика «${duplicateApprovalLabel}» уже добавлена.`);
      return;
    }
    try {
      const response = await apiPost<{
        success: boolean;
        suggestionStatus: CatalogSuggestionStatus;
        item: { id: string; name: string };
        brand: { id: string; name: string };
        model: { id: string; name: string };
        product: { id: string; title: string };
      }>(
        `/admin/catalog-suggestions/${encodeURIComponent(approvalTarget.id)}/approve-reference`,
        {
          approval: {
            type: PRODUCT_TYPE,
            categoryId: approvalForm.categoryId || undefined,
            categoryName: approvalForm.categoryName || undefined,
            subcategoryId: approvalForm.subcategoryId || undefined,
            subcategoryName: approvalForm.subcategoryName || undefined,
            itemName: approvalForm.itemName,
          },
          reference: {
            brandName: approvalForm.brandName,
            modelName: approvalForm.modelName,
            productTitle: approvalForm.modelName,
            characteristics: approvalCharacteristics,
          },
          adminNote: approvalForm.adminNote || undefined,
        },
      );

      notifySuccess("Заявка одобрена, справочник обновлён.");
      setApprovalTarget(null);
      setApprovalForm(null);
      setTab("editor");
      setCategoryQuery(response.item.name);
      setReferenceItemId(response.item.id);
      await Promise.all([loadSuggestions(), loadCatalog(), loadCategoryNodes()]);
      await loadReferenceForItem(response.item.id);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось одобрить заявку");
    }
  };

  const openEdit = (target: CatalogEditTarget) => {
    setEditTarget(target);
    setReferenceBrands([]);
    setReferenceBrandName("");
    setReferenceModelNames({});
    setReferenceProductDrafts({});
    setReferenceItemId(target.kind === "item" ? target.item?.id ?? "" : "");
    if (target.kind === "category") {
      setEditName(target.category?.name ?? "");
      const iconKey = target.category?.iconKey ?? "monitor";
      setEditIconKey(iconKey.startsWith("emoji:") ? "emoji" : iconKey);
      setEditEmoji(emojiFromIconKey(iconKey));
    } else if (target.kind === "subcategory") {
      setEditName(target.subcategory?.name ?? "");
      setEditIconKey("monitor");
      setEditEmoji("");
    } else {
      setEditName(target.item?.name ?? "");
      setEditIconKey("monitor");
      setEditEmoji("");
      if (target.item?.id) void loadReferenceForItem(target.item.id);
    }
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
        if (editTarget.category) {
          await apiPatch(`/admin/catalog/categories/${encodeURIComponent(editTarget.category.id)}`, {
            name,
            iconKey,
          });
        } else {
          await apiPost("/admin/catalog/categories", {
            type: PRODUCT_TYPE,
            name,
            iconKey,
          });
        }
        await loadCategoryNodes();
      } else if (editTarget.kind === "subcategory") {
        if (editTarget.subcategory) {
          await apiPatch(
            `/admin/catalog/subcategories/${encodeURIComponent(editTarget.subcategory.id)}`,
            { name, categoryId: editTarget.categoryId },
          );
        } else {
          await apiPost("/admin/catalog/subcategories", {
            categoryId: editTarget.categoryId,
            name,
          });
          setExpandedCategoryIds((current) => new Set(current).add(editTarget.categoryId));
        }
        await loadSubcategoriesForCategory(editTarget.categoryId, true);
      } else if (editTarget.item) {
        await apiPatch(`/admin/catalog/items/${encodeURIComponent(editTarget.item.id)}`, {
          name,
          subcategoryId: editTarget.subcategoryId,
        });
        await loadItemsForSubcategory(editTarget.subcategoryId, true);
      } else {
        await apiPost("/admin/catalog/items", {
          subcategoryId: editTarget.subcategoryId,
          name,
        });
        setExpandedSubcategoryIds((current) => new Set(current).add(editTarget.subcategoryId));
        await loadItemsForSubcategory(editTarget.subcategoryId, true);
      }

      notifySuccess("Каталог обновлён.");
      setEditTarget(null);
      await loadCatalog();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось сохранить каталог");
    }
  };

  const deleteCatalogEntity = async (kind: CatalogNodeKind, id: string) => {
    if (deleteConfirm.trim().toLowerCase() !== "удалить") {
      notifyError("Чтобы удалить элемент, введите слово «удалить».");
      return;
    }

    try {
      const path =
        kind === "category"
          ? `/admin/catalog/categories/${encodeURIComponent(id)}`
          : kind === "subcategory"
            ? `/admin/catalog/subcategories/${encodeURIComponent(id)}`
            : `/admin/catalog/items/${encodeURIComponent(id)}`;
      await apiDelete(path);
      notifySuccess("Элемент каталога удалён.");
      setDeleteTarget(null);
      setDeleteConfirm("");

      if (kind === "category") {
        setExpandedCategoryIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setSubcategoriesByCategory((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        await loadCategoryNodes();
      } else if (kind === "subcategory") {
        setExpandedSubcategoryIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setItemsBySubcategory((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        const parentCategoryId = Object.entries(subcategoriesByCategory).find(([, nodes]) =>
          nodes.some((node) => node.id === id),
        )?.[0];
        if (parentCategoryId) await loadSubcategoriesForCategory(parentCategoryId, true);
      } else {
        const parentSubcategoryId = Object.entries(itemsBySubcategory).find(([, nodes]) =>
          nodes.some((node) => node.id === id),
        )?.[0];
        if (parentSubcategoryId) await loadItemsForSubcategory(parentSubcategoryId, true);
      }
      await loadCatalog();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить элемент каталога");
    }
  };

  const persistCatalogOrder = async (kind: CatalogNodeKind, orderedIds: string[]) => {
    try {
      await apiPatch("/admin/catalog/reorder", { kind, orderedIds });
      notifyCatalogOrderUpdated();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось изменить порядок");
      if (kind === "category") await loadCategoryNodes();
    }
  };

  const reorderCategories = (orderedIds: string[]) => {
    setCategoryNodes((current) => sortByIds(current, orderedIds));
    void persistCatalogOrder("category", orderedIds);
  };

  const reorderSubcategories = (categoryId: string, orderedIds: string[]) => {
    setSubcategoriesByCategory((current) => ({
      ...current,
      [categoryId]: sortByIds(current[categoryId] ?? [], orderedIds),
    }));
    void persistCatalogOrder("subcategory", orderedIds);
  };

  const reorderItems = (subcategoryId: string, orderedIds: string[]) => {
    setItemsBySubcategory((current) => ({
      ...current,
      [subcategoryId]: sortByIds(current[subcategoryId] ?? [], orderedIds),
    }));
    void persistCatalogOrder("item", orderedIds);
  };

  const renderItemNodes = (subcategory: CatalogNode) => {
    const nodes = itemsBySubcategory[subcategory.id] ?? [];
    const isLoading = loadingBranches.has(`subcategory:${subcategory.id}`);

    return (
      <div className="catalog-tree-children catalog-tree-children--items">
        {isLoading ? <div className="catalog-tree-loading">Загружаю виды товаров...</div> : null}
        <SortableCatalogList
          nodes={nodes}
          onReorder={(orderedIds) => reorderItems(subcategory.id, orderedIds)}
        >
          {(item) => (
            <SortableCatalogNode
              key={item.id}
              node={item}
              depth={2}
              meta={`${item.listingCount ?? 0} объявлений`}
              onEdit={() =>
                openEdit({
                  kind: "item",
                  subcategoryId: subcategory.id,
                  item: { id: item.id, name: item.name },
                })
              }
              onDelete={() => openDelete({ kind: "item", id: item.id, name: item.name })}
            />
          )}
        </SortableCatalogList>
        {!isLoading && nodes.length === 0 ? (
          <div className="catalog-tree-empty">Видов товаров пока нет.</div>
        ) : null}
        <button
          type="button"
          className="catalog-tree-add catalog-tree-add--depth-2"
          onClick={() => openEdit({ kind: "item", subcategoryId: subcategory.id })}
        >
          <Plus className="h-4 w-4" /> Добавить вид товара
        </button>
      </div>
    );
  };

  const renderSubcategoryNodes = (category: CatalogNode) => {
    const nodes = subcategoriesByCategory[category.id] ?? [];
    const isLoading = loadingBranches.has(`category:${category.id}`);

    return (
      <div className="catalog-tree-children">
        {isLoading ? <div className="catalog-tree-loading">Загружаю подкатегории...</div> : null}
        <SortableCatalogList
          nodes={nodes}
          onReorder={(orderedIds) => reorderSubcategories(category.id, orderedIds)}
        >
          {(subcategory) => {
            const expanded = expandedSubcategoryIds.has(subcategory.id);
            return (
              <SortableCatalogNode
                key={subcategory.id}
                node={subcategory}
                depth={1}
                expanded={expanded}
                expandable
                meta={`${subcategory.childCount ?? 0} видов товаров`}
                onToggle={() => toggleSubcategory(subcategory)}
                onEdit={() =>
                  openEdit({
                    kind: "subcategory",
                    categoryId: category.id,
                    subcategory: { id: subcategory.id, name: subcategory.name },
                  })
                }
                onDelete={() =>
                  openDelete({ kind: "subcategory", id: subcategory.id, name: subcategory.name })
                }
              >
                {expanded ? renderItemNodes(subcategory) : null}
              </SortableCatalogNode>
            );
          }}
        </SortableCatalogList>
        {!isLoading && nodes.length === 0 ? (
          <div className="catalog-tree-empty">Подкатегорий пока нет.</div>
        ) : null}
        <button
          type="button"
          className="catalog-tree-add catalog-tree-add--depth-1"
          onClick={() => openEdit({ kind: "subcategory", categoryId: category.id })}
        >
          <Plus className="h-4 w-4" /> Добавить подкатегорию
        </button>
      </div>
    );
  };

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
        <>
          <div className="dashboard-grid-stats dashboard-grid-stats--5">
            <div className="dashboard-stat">
              <div className="dashboard-stat__label">Всего</div>
              <div className="dashboard-stat__value">{stats.total}</div>
            </div>
            <div className="dashboard-stat dashboard-stat--warn">
              <div className="dashboard-stat__label">Ожидают</div>
              <div className="dashboard-stat__value">{stats.pending}</div>
            </div>
            <div className="dashboard-stat dashboard-stat--ok">
              <div className="dashboard-stat__label">Одобрено</div>
              <div className="dashboard-stat__value">{stats.approved}</div>
            </div>
            <div className="dashboard-stat dashboard-stat--info">
              <div className="dashboard-stat__label">Объединено</div>
              <div className="dashboard-stat__value">{stats.merged}</div>
            </div>
            <div className="dashboard-stat dashboard-stat--danger">
              <div className="dashboard-stat__label">Отклонено</div>
              <div className="dashboard-stat__value">{stats.rejected}</div>
            </div>
          </div>

          <div className="dashboard-toolbar space-y-3">
            <div className="dashboard-search">
              <Search className="dashboard-search__icon" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="dashboard-search__input"
                placeholder="Поиск по заявкам каталога"
              />
            </div>

            <div className="dashboard-chip-row">
              {[
                { value: "pending", label: "Ожидают" },
                { value: "approved", label: "Одобрено" },
                { value: "merged", label: "Объединено" },
                { value: "rejected", label: "Отклонено" },
                { value: "all", label: "Все" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value as StatusFilter)}
                  className={`dashboard-chip ${
                    statusFilter === option.value ? "dashboard-chip--active" : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredItems.map((item) => {
              const importantPreview = payloadValue(item.payload, "importantAttributes");
              const proposedCategory = suggestionCategoryName(item);
              const proposedSubcategory = suggestionSubcategoryName(item);
              const proposedItem = suggestionItemName(item);
              const isCharacteristicRequest = isCharacteristicCatalogRequest(item);
              return (
                <article
                  key={item.id}
                  className="dashboard-card catalog-suggestion-card p-4 md:p-5"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedSuggestion(item);
                    setRejectNote(item.adminNote ?? "");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedSuggestion(item);
                    setRejectNote(item.adminNote ?? "");
                  }}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{item.rawValue}</span>
                        {statusBadge(item.status)}
                        <span className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500">
                          {catalogSuggestionEntityLabel(item.entityType, item.reason)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {isCharacteristicRequest ? (
                          <>
                            Каталог: {displayValue(proposedCategory)} →{" "}
                            {displayValue(proposedSubcategory)} → {displayValue(proposedItem)}
                          </>
                        ) : (
                          <>
                            Категория предложенная: {displayValue(proposedCategory)} →{" "}
                            Подкатегория предложенная: {displayValue(proposedSubcategory)} →{" "}
                            Вид товара предложенный: {displayValue(proposedItem)}
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        Предложил: {item.proposedBy?.name ?? "Не указано"} (
                        {item.proposedBy?.email ?? "email не указан"}) · {formatDate(item.createdAt)}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 lg:text-right">
                      Использований: <span className="font-semibold">{item.usageCount}</span>
                    </div>
                  </div>

                  {importantPreview ? (
                    <div className="catalog-suggestion-card__preview">
                      {importantPreview.length > 180
                        ? `${importantPreview.slice(0, 180).trim()}...`
                        : importantPreview}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {filteredItems.length === 0 ? (
              <div className="dashboard-empty">Заявок каталога пока нет.</div>
            ) : null}
          </div>
        </>
      ) : (
        <section className="catalog-tree-shell">
          <div className="catalog-tree-toolbar">
            <div>
              <h2 className="catalog-tree-toolbar__title">Дерево товарного каталога</h2>
            </div>
          </div>

          <div className="catalog-tree-search">
            <Search className="h-5 w-5 text-slate-400" />
            <input
              value={categoryQuery}
              onChange={(event) => setCategoryQuery(event.target.value)}
              placeholder="Поиск по категориям, подкатегориям и видам товаров"
            />
          </div>

          <div className="catalog-tree-list">
            {editorLoading ? <div className="catalog-tree-loading">Загружаю категории...</div> : null}
            {!editorLoading && categoryNodes.length === 0 ? (
              <div className="catalog-tree-empty">Категорий пока нет.</div>
            ) : null}
            {isCatalogSearch ? (
              <SortableCatalogList
                nodes={categoryNodes}
                sortable={false}
                onReorder={() => undefined}
              >
                {(node, sortable) => (
                  <SortableCatalogNode
                    key={node.id}
                    node={node}
                    sortable={sortable}
                    depth={node.kind === "category" ? 0 : node.kind === "subcategory" ? 1 : 2}
                    meta={
                      node.kind === "category"
                        ? `${node.childCount ?? 0} подкатегорий`
                        : node.kind === "subcategory"
                          ? `${node.path} · ${node.childCount ?? 0} видов товаров`
                          : `${node.path} · ${node.listingCount ?? 0} объявлений`
                    }
                    onEdit={() => {
                      if (node.kind === "category") {
                        openEdit({
                          kind: "category",
                          category: { id: node.id, name: node.name, iconKey: node.iconKey },
                        });
                      } else if (node.kind === "subcategory" && node.categoryId) {
                        openEdit({
                          kind: "subcategory",
                          categoryId: node.categoryId,
                          subcategory: { id: node.id, name: node.name },
                        });
                      } else if (node.kind === "item" && node.subcategoryId) {
                        openEdit({
                          kind: "item",
                          subcategoryId: node.subcategoryId,
                          item: { id: node.id, name: node.name },
                        });
                      }
                    }}
                    onDelete={() => openDelete({ kind: node.kind, id: node.id, name: node.name })}
                  />
                )}
              </SortableCatalogList>
            ) : (
              <>
                <SortableCatalogList nodes={categoryNodes} onReorder={reorderCategories}>
                  {(category) => {
                    const expanded = expandedCategoryIds.has(category.id);
                    return (
                      <SortableCatalogNode
                        key={category.id}
                        node={category}
                        depth={0}
                        expanded={expanded}
                        expandable
                        meta={`${category.childCount ?? 0} подкатегорий`}
                        onToggle={() => toggleCategory(category)}
                        onEdit={() =>
                          openEdit({
                            kind: "category",
                            category: {
                              id: category.id,
                              name: category.name,
                              iconKey: category.iconKey,
                            },
                          })
                        }
                        onDelete={() =>
                          openDelete({ kind: "category", id: category.id, name: category.name })
                        }
                      >
                        {expanded ? renderSubcategoryNodes(category) : null}
                      </SortableCatalogNode>
                    );
                  }}
                </SortableCatalogList>
                <button
                  type="button"
                  className="catalog-tree-add"
                  onClick={() => openEdit({ kind: "category" })}
                >
                  <Plus className="h-4 w-4" /> Добавить категорию
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {selectedSuggestion
        ? (() => {
            const review = catalogRequestReview(selectedSuggestion);
            const isCharacteristicRequest = isCharacteristicCatalogRequest(selectedSuggestion);
            const photos = catalogRequestPhotoItems(review.photoName);
            const details = [
              review.comment
                ? { label: "Комментарий продавца", value: review.comment, wide: true }
                : null,
              review.link ? { label: "Ссылка на описание", value: review.link, wide: true } : null,
              review.email ? { label: "Почта продавца", value: review.email, wide: false } : null,
            ].filter(Boolean) as Array<{ label: string; value: string; wide: boolean }>;

            return (
              <AppModal
                open={Boolean(selectedSuggestion)}
                onClose={() => setSelectedSuggestion(null)}
                size="xl"
                bodyClassName="catalog-request-review-modal__body"
                footer={
                  <>
                    {selectedSuggestion.status === "pending" ? (
                      <label className="catalog-request-review-modal__reject">
                        <span>Причина отклонения</span>
                        <textarea
                          value={rejectNote}
                          onChange={(event) => setRejectNote(event.target.value)}
                          placeholder="Коротко укажите, почему заявку нельзя принять"
                        />
                      </label>
                    ) : null}
                    <div className="catalog-request-review-modal__actions">
                      <button
                        type="button"
                        className="catalog-modal__button catalog-modal__button--secondary"
                        onClick={() => setSelectedSuggestion(null)}
                      >
                        Закрыть
                      </button>
                      {selectedSuggestion.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            className="catalog-modal__button catalog-modal__button--danger"
                            onClick={() => void updateSuggestion(selectedSuggestion, "rejected")}
                          >
                            <XCircle className="h-4 w-4" /> Отклонить
                          </button>
                          <button
                            type="button"
                            className="catalog-modal__button catalog-modal__button--primary"
                            onClick={() => openApproval(selectedSuggestion)}
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
                        <h2>
                          {catalogSuggestionEntityLabel(
                            selectedSuggestion.entityType,
                            selectedSuggestion.reason,
                          )}
                        </h2>
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
                            <span>
                              {isCharacteristicRequest ? "Категория" : "Категория предложенная"}
                            </span>
                            <strong>{displayValue(review.categoryName)}</strong>
                          </div>
                          <div className="catalog-request-review-modal__field">
                            <span>
                              {isCharacteristicRequest
                                ? "Подкатегория"
                                : "Подкатегория предложенная"}
                            </span>
                            <strong>{displayValue(review.subcategoryName)}</strong>
                          </div>
                          <div className="catalog-request-review-modal__field catalog-request-review-modal__field--full">
                            <span>
                              {isCharacteristicRequest
                                ? "Вид товара"
                                : "Вид товара предложенный"}
                            </span>
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
                              <div
                                key={`${photo}-${index}`}
                                className="catalog-request-review-modal__photo"
                              >
                                <CatalogRequestPhotoPreview
                                  src={photo}
                                  alt={`Фото заявки ${index + 1}`}
                                />
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
          })()
        : null}

      {approvalTarget && approvalForm ? (
        <AppModal
          open={Boolean(approvalTarget && approvalForm)}
          onClose={() => setApprovalTarget(null)}
          onBack={() => {
            setSelectedSuggestion(approvalTarget);
            setApprovalTarget(null);
            setApprovalForm(null);
          }}
          size="xl"
          panelClassName="catalog-approval-editor-modal"
          bodyClassName="catalog-request-review-modal__body"
          footer={
            <div className="catalog-request-review-modal__actions">
              <button
                type="button"
                className="catalog-modal__button catalog-modal__button--secondary"
                onClick={() => setApprovalTarget(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="catalog-modal__button catalog-modal__button--primary"
                onClick={() => void submitApproval()}
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
                    <span>{approvalForm.categoryName}</span>
                    {approvalTarget.entityType !== "category" ? (
                      <>
                        <ChevronRight className="h-4 w-4" />
                        <span>{approvalForm.subcategoryName}</span>
                      </>
                    ) : null}
                    {approvalTarget.entityType === "item" ? (
                      <>
                        <ChevronRight className="h-4 w-4" />
                        <strong>{approvalForm.itemName}</strong>
                      </>
                    ) : null}
                  </div>
                </header>

                {isCatalogTreeSuggestion(approvalTarget) ? (
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
                          value={approvalForm.categoryName}
                          onChange={(event) =>
                            setApprovalForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    categoryId: "",
                                    categoryName: event.target.value,
                                  }
                                : prev,
                            )
                          }
                          placeholder="Например, Бытовая техника"
                        />
                      </label>

                      <label className="catalog-field">
                        <span>Предложенная подкатегория</span>
                        <input
                          className="catalog-modal__input"
                          value={approvalForm.subcategoryName}
                          onChange={(event) =>
                            setApprovalForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    subcategoryId: "",
                                    subcategoryName: event.target.value,
                                  }
                                : prev,
                            )
                          }
                          placeholder="Например, Техника для кухни"
                        />
                      </label>

                      <label className="catalog-field catalog-request-review-modal__field--full">
                        <span>Предложенный вид товара</span>
                        <input
                          className="catalog-modal__input"
                          value={approvalForm.itemName}
                          onChange={(event) =>
                            setApprovalForm((prev) =>
                              prev ? { ...prev, itemName: event.target.value } : prev,
                            )
                          }
                          placeholder="Например, Робот-пылесос"
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                {isFullCatalogApprovalRequest(approvalTarget) ? (
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
                          value={approvalForm.brandName}
                          onChange={(event) =>
                            setApprovalForm((prev) =>
                              prev ? { ...prev, brandName: event.target.value } : prev,
                            )
                          }
                          placeholder="Например, ASUS"
                        />
                      </label>

                      <label className="catalog-field">
                        <span>Модель</span>
                        <input
                          className="catalog-modal__input"
                          value={approvalForm.modelName}
                          onChange={(event) =>
                            setApprovalForm((prev) =>
                              prev ? { ...prev, modelName: event.target.value } : prev,
                            )
                          }
                          placeholder="Например, RTX 4070"
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                {isFullCatalogApprovalRequest(approvalTarget) ? (
                  <section className="catalog-request-review-modal__section">
                    <div className="catalog-approval-characteristics__top">
                      <h3>Характеристики</h3>
                    </div>

                    <div className="catalog-approval-workspace">
                      <div className="catalog-source-note catalog-source-note--sticky">
                        <span>Важные характеристики, как указал продавец</span>
                        <strong>
                          {displayValue(payloadValue(approvalTarget.payload, "importantAttributes"))}
                        </strong>
                      </div>

                      <div className="catalog-approval-characteristics">
                        {approvalForm.characteristics.map((characteristic, index) => (
                          <div key={index} className="catalog-reference-characteristic-row">
                            <input
                              className="catalog-modal__input"
                              value={characteristic.label}
                              onChange={(event) =>
                                setApprovalForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        characteristics: prev.characteristics.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, label: event.target.value }
                                            : entry,
                                        ),
                                      }
                                    : prev,
                                )
                              }
                              placeholder="Название характеристики"
                            />
                            <div className="catalog-approval-characteristic-value">
                              <input
                                className="catalog-modal__input"
                                value={characteristic.value}
                                onChange={(event) =>
                                  setApprovalForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          characteristics: prev.characteristics.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? { ...entry, value: event.target.value }
                                              : entry,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                                placeholder="Значение"
                              />
                              <button
                                type="button"
                                className="catalog-tree-icon-button catalog-tree-icon-button--danger"
                                onClick={() =>
                                  setApprovalForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          characteristics:
                                            prev.characteristics.length > 1
                                              ? prev.characteristics.filter((_, entryIndex) => entryIndex !== index)
                                              : [{ label: "", value: "" }],
                                        }
                                      : prev,
                                  )
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
                            setApprovalForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    characteristics: prev.characteristics.concat({
                                      label: "",
                                      value: "",
                                    }),
                                  }
                                : prev,
                            )
                          }
                        >
                          <Plus className="h-4 w-4" /> Характеристика
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
        </AppModal>
      ) : null}

      {editTarget ? (
        <AppModal
          open={Boolean(editTarget)}
          onClose={() => setEditTarget(null)}
          eyebrow="Редактор дерева"
          title={
            editTarget.kind === "category"
              ? editTarget.category
                ? "Изменить категорию"
                : "Добавить категорию"
              : editTarget.kind === "subcategory"
                ? editTarget.subcategory
                  ? "Изменить подкатегорию"
                  : "Добавить подкатегорию"
                : editTarget.item
                  ? "Изменить вид товара"
                  : "Добавить вид товара"
          }
          subtitle="Название можно изменить в любой момент."
          size={editTarget.kind === "item" ? "xl" : "md"}
          footer={
            <>
              <button type="button" className="catalog-modal__button catalog-modal__button--secondary" onClick={() => setEditTarget(null)}>
                Отмена
              </button>
              <button type="button" className="catalog-modal__button catalog-modal__button--primary" onClick={() => void saveCatalogEdit()}>
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
                  onChange={(event) => setEditName(event.target.value)}
                  autoFocus
                />
              </label>

              {editTarget.kind === "category" ? (
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
                        onClick={() => setEditIconKey(option.key)}
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
                      onClick={() => setEditIconKey("emoji")}
                    >
                      <span className="catalog-icon-option__emoji">{editEmoji || "🙂"}</span>
                      <span>Эмодзи</span>
                    </button>
                  </div>
                  {editIconKey === "emoji" ? (
                    <input
                      className="catalog-modal__input"
                      value={editEmoji}
                      onChange={(event) => setEditEmoji(event.target.value)}
                      placeholder="Вставьте один эмодзи, например 📱"
                    />
                  ) : null}
                </div>
              ) : null}

              {editTarget.kind === "item" && editTarget.item ? (
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
                      value={referenceBrandName}
                      onChange={(event) => setReferenceBrandName(event.target.value)}
                      placeholder="Новый бренд, например Apple"
                    />
                    <button
                      type="button"
                      className="catalog-modal__button catalog-modal__button--secondary"
                      onClick={() => void createReferenceBrand()}
                    >
                      <Plus className="h-4 w-4" /> Бренд
                    </button>
                  </div>

                  {referenceLoading ? (
                    <div className="catalog-tree-loading">Загружаю справочник...</div>
                  ) : null}

                  {!referenceLoading && referenceBrands.length === 0 ? (
                    <div className="catalog-tree-empty">
                      Брендов пока нет. Добавьте первый бренд, затем модель и характеристики.
                    </div>
                  ) : null}

                  <div className="catalog-reference-list">
                    {referenceBrands.map((brand) => (
                      <section key={brand.id} className="catalog-reference-card">
                        <div className="catalog-reference-card__top">
                          <strong>{brand.name}</strong>
                          <button
                            type="button"
                            className="catalog-tree-icon-button catalog-tree-icon-button--danger"
                            onClick={() =>
                              void deleteReferenceEntity(
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
                            value={referenceModelNames[brand.id] ?? ""}
                            onChange={(event) =>
                              setReferenceModelNames((current) => ({
                                ...current,
                                [brand.id]: event.target.value,
                              }))
                            }
                            placeholder="Модель, например iPhone 15"
                          />
                          <button
                            type="button"
                            className="catalog-modal__button catalog-modal__button--secondary"
                            onClick={() => void createReferenceModel(brand.id)}
                          >
                            <Plus className="h-4 w-4" /> Модель
                          </button>
                        </div>

                        {brand.models.map((model) => {
                          const draft =
                            referenceProductDrafts[model.id] ?? {
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
                                    void deleteReferenceEntity(
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
                                          {characteristic.id ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void deleteReferenceCharacteristic(characteristic.id)
                                              }
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
                                        updateProductDraft(model.id, (current) => ({
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
                                        updateProductDraft(model.id, (current) => ({
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
                                      onClick={() => deleteDraftCharacteristic(model.id, index)}
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
                                      updateProductDraft(model.id, (current) => ({
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
                                    onClick={() => void createReferenceProduct(model.id)}
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
              ) : editTarget.kind === "item" ? (
                <div className="catalog-tree-empty">
                  Справочник брендов, моделей и характеристик появится после создания вида товара.
                </div>
              ) : null}
        </AppModal>
      ) : null}

      {deleteTarget ? (
        <AppModal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          eyebrow="Каскадное удаление"
          title={`Удалить ${catalogKindLabels[deleteTarget.kind]}`}
          subtitle={
            deleteTarget.kind === "category"
              ? "Категория удалится вместе со всеми подкатегориями и видами товаров."
              : deleteTarget.kind === "subcategory"
                ? "Подкатегория удалится вместе со всеми видами товаров."
                : "Вид товара будет удалён из каталога."
          }
          size="md"
          danger
          footer={
            <>
              <button type="button" className="catalog-modal__button catalog-modal__button--secondary" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="catalog-modal__button catalog-modal__button--danger"
                disabled={deleteConfirm.trim().toLowerCase() !== "удалить"}
                onClick={() => void deleteCatalogEntity(deleteTarget.kind, deleteTarget.id)}
              >
                <Trash2 className="h-4 w-4" /> Удалить
              </button>
            </>
          }
        >

            <div className="catalog-modal__warning">
              <div className="catalog-modal__warning-title">{deleteTarget.name}</div>
              <div className="catalog-modal__warning-text">Для подтверждения введите слово «удалить».</div>
            </div>

            <label className="catalog-field">
              <span>Контрольное слово</span>
              <input
                className="catalog-modal__input"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                placeholder="удалить"
                autoFocus
              />
            </label>
        </AppModal>
      ) : null}
    </div>
  );
}
