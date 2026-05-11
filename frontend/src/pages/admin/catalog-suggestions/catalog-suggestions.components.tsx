import { useState, type ReactNode } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Minus,
  Pencil,
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
import { statusLabels } from "./catalog-suggestions.constants";
import type {
  CatalogNode,
  CatalogSuggestionStatus,
} from "./catalog-suggestions.types";
import { isPreviewableImage } from "./catalog-suggestions.utils";

export function CatalogSuggestionStatusBadge({
  status,
}: {
  status: CatalogSuggestionStatus;
}) {
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

export function CatalogRequestPhotoPreview({ src, alt }: { src: string; alt: string }) {
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

export function SortableCatalogList({
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

export function SortableCatalogNode({
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
