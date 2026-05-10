import { Plus, Search } from "lucide-react";
import { matchesSearch } from "../../lib/search";
import {
  CatalogSuggestionStatusBadge,
  SortableCatalogList,
  SortableCatalogNode,
} from "./catalog-suggestions.components";
import type {
  CatalogEditTarget,
  CatalogNode,
  CatalogNodeKind,
  CatalogSuggestion,
  DeleteTarget,
  StatusFilter,
} from "./catalog-suggestions.types";
import {
  catalogSuggestionEntityLabel,
  displayValue,
  formatDate,
  isCharacteristicCatalogRequest,
  payloadValue,
  suggestionCategoryName,
  suggestionItemName,
  suggestionSubcategoryName,
} from "./catalog-suggestions.utils";

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Ожидают" },
  { value: "approved", label: "Одобрено" },
  { value: "merged", label: "Объединено" },
  { value: "rejected", label: "Отклонено" },
  { value: "all", label: "Все" },
];

function nodeMeta(node: CatalogNode) {
  if (node.kind === "category") return `${node.childCount ?? 0} подкатегорий`;
  if (node.kind === "subcategory") return `${node.path} · ${node.childCount ?? 0} видов товаров`;
  return `${node.path} · ${node.listingCount ?? 0} объявлений`;
}

function nodeEditTarget(node: CatalogNode): CatalogEditTarget | null {
  if (node.kind === "category") {
    return {
      kind: "category",
      category: { id: node.id, name: node.name, iconKey: node.iconKey },
    };
  }
  if (node.kind === "subcategory" && node.categoryId) {
    return {
      kind: "subcategory",
      categoryId: node.categoryId,
      subcategory: { id: node.id, name: node.name },
    };
  }
  if (node.kind === "item" && node.subcategoryId) {
    return {
      kind: "item",
      subcategoryId: node.subcategoryId,
      item: { id: node.id, name: node.name },
    };
  }
  return null;
}

function nodeDeleteTarget(node: CatalogNode): DeleteTarget {
  return { kind: node.kind, id: node.id, name: node.name };
}

export function CatalogSuggestionsListSection({
  items,
  searchQuery,
  statusFilter,
  onSearchQueryChange,
  onStatusFilterChange,
  onOpenSuggestion,
}: {
  items: CatalogSuggestion[];
  searchQuery: string;
  statusFilter: StatusFilter;
  onSearchQueryChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onOpenSuggestion: (item: CatalogSuggestion) => void;
}) {
  const filteredItems = items.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesStatus && matchesSearch(item, searchQuery);
  });

  const stats = {
    total: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    merged: items.filter((item) => item.status === "merged").length,
  };

  return (
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
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="dashboard-search__input"
            placeholder="Поиск по заявкам каталога"
          />
        </div>

        <div className="dashboard-chip-row">
          {statusFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusFilterChange(option.value)}
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
              onClick={() => onOpenSuggestion(item)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onOpenSuggestion(item);
              }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{item.rawValue}</span>
                    <CatalogSuggestionStatusBadge status={item.status} />
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
                        Категория предложенная: {displayValue(proposedCategory)} → Подкатегория
                        предложенная: {displayValue(proposedSubcategory)} → Вид товара
                        предложенный: {displayValue(proposedItem)}
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
  );
}

function CatalogItemNodesSection({
  subcategory,
  nodes,
  isLoading,
  onOpenEdit,
  onOpenDelete,
  onReorder,
}: {
  subcategory: CatalogNode;
  nodes: CatalogNode[];
  isLoading: boolean;
  onOpenEdit: (target: CatalogEditTarget) => void;
  onOpenDelete: (target: DeleteTarget) => void;
  onReorder: (subcategoryId: string, orderedIds: string[]) => void;
}) {
  return (
    <div className="catalog-tree-children catalog-tree-children--items">
      {isLoading ? <div className="catalog-tree-loading">Загружаю виды товаров...</div> : null}
      <SortableCatalogList
        nodes={nodes}
        onReorder={(orderedIds) => onReorder(subcategory.id, orderedIds)}
      >
        {(item) => (
          <SortableCatalogNode
            key={item.id}
            node={item}
            depth={2}
            meta={`${item.listingCount ?? 0} объявлений`}
            onEdit={() =>
              onOpenEdit({
                kind: "item",
                subcategoryId: subcategory.id,
                item: { id: item.id, name: item.name },
              })
            }
            onDelete={() => onOpenDelete({ kind: "item", id: item.id, name: item.name })}
          />
        )}
      </SortableCatalogList>
      {!isLoading && nodes.length === 0 ? (
        <div className="catalog-tree-empty">Видов товаров пока нет.</div>
      ) : null}
      <button
        type="button"
        className="catalog-tree-add catalog-tree-add--depth-2"
        onClick={() => onOpenEdit({ kind: "item", subcategoryId: subcategory.id })}
      >
        <Plus className="h-4 w-4" /> Добавить вид товара
      </button>
    </div>
  );
}

function CatalogSubcategoryNodesSection({
  category,
  nodes,
  expandedSubcategoryIds,
  loadingBranches,
  itemsBySubcategory,
  onToggleSubcategory,
  onOpenEdit,
  onOpenDelete,
  onReorderSubcategories,
  onReorderItems,
}: {
  category: CatalogNode;
  nodes: CatalogNode[];
  expandedSubcategoryIds: Set<string>;
  loadingBranches: Set<string>;
  itemsBySubcategory: Record<string, CatalogNode[]>;
  onToggleSubcategory: (node: CatalogNode) => void;
  onOpenEdit: (target: CatalogEditTarget) => void;
  onOpenDelete: (target: DeleteTarget) => void;
  onReorderSubcategories: (categoryId: string, orderedIds: string[]) => void;
  onReorderItems: (subcategoryId: string, orderedIds: string[]) => void;
}) {
  const isLoading = loadingBranches.has(`category:${category.id}`);

  return (
    <div className="catalog-tree-children">
      {isLoading ? <div className="catalog-tree-loading">Загружаю подкатегории...</div> : null}
      <SortableCatalogList
        nodes={nodes}
        onReorder={(orderedIds) => onReorderSubcategories(category.id, orderedIds)}
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
              onToggle={() => onToggleSubcategory(subcategory)}
              onEdit={() =>
                onOpenEdit({
                  kind: "subcategory",
                  categoryId: category.id,
                  subcategory: { id: subcategory.id, name: subcategory.name },
                })
              }
              onDelete={() =>
                onOpenDelete({ kind: "subcategory", id: subcategory.id, name: subcategory.name })
              }
            >
              {expanded ? (
                <CatalogItemNodesSection
                  subcategory={subcategory}
                  nodes={itemsBySubcategory[subcategory.id] ?? []}
                  isLoading={loadingBranches.has(`subcategory:${subcategory.id}`)}
                  onOpenEdit={onOpenEdit}
                  onOpenDelete={onOpenDelete}
                  onReorder={onReorderItems}
                />
              ) : null}
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
        onClick={() => onOpenEdit({ kind: "subcategory", categoryId: category.id })}
      >
        <Plus className="h-4 w-4" /> Добавить подкатегорию
      </button>
    </div>
  );
}

export function CatalogEditorTreeSection({
  categoryQuery,
  categoryNodes,
  editorLoading,
  expandedCategoryIds,
  expandedSubcategoryIds,
  subcategoriesByCategory,
  itemsBySubcategory,
  loadingBranches,
  onCategoryQueryChange,
  onToggleCategory,
  onToggleSubcategory,
  onOpenEdit,
  onOpenDelete,
  onReorderCategories,
  onReorderSubcategories,
  onReorderItems,
}: {
  categoryQuery: string;
  categoryNodes: CatalogNode[];
  editorLoading: boolean;
  expandedCategoryIds: Set<string>;
  expandedSubcategoryIds: Set<string>;
  subcategoriesByCategory: Record<string, CatalogNode[]>;
  itemsBySubcategory: Record<string, CatalogNode[]>;
  loadingBranches: Set<string>;
  onCategoryQueryChange: (value: string) => void;
  onToggleCategory: (node: CatalogNode) => void;
  onToggleSubcategory: (node: CatalogNode) => void;
  onOpenEdit: (target: CatalogEditTarget) => void;
  onOpenDelete: (target: DeleteTarget) => void;
  onReorderCategories: (orderedIds: string[]) => void;
  onReorderSubcategories: (categoryId: string, orderedIds: string[]) => void;
  onReorderItems: (subcategoryId: string, orderedIds: string[]) => void;
}) {
  const isCatalogSearch = categoryQuery.trim().length > 0;

  return (
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
          onChange={(event) => onCategoryQueryChange(event.target.value)}
          placeholder="Поиск по категориям, подкатегориям и видам товаров"
        />
      </div>

      <div className="catalog-tree-list">
        {editorLoading ? <div className="catalog-tree-loading">Загружаю категории...</div> : null}
        {!editorLoading && categoryNodes.length === 0 ? (
          <div className="catalog-tree-empty">Категорий пока нет.</div>
        ) : null}
        {isCatalogSearch ? (
          <SortableCatalogList nodes={categoryNodes} sortable={false} onReorder={() => undefined}>
            {(node, sortable) => {
              const editTarget = nodeEditTarget(node);
              return (
                <SortableCatalogNode
                  key={node.id}
                  node={node}
                  sortable={sortable}
                  depth={node.kind === "category" ? 0 : node.kind === "subcategory" ? 1 : 2}
                  meta={nodeMeta(node)}
                  onEdit={() => {
                    if (editTarget) onOpenEdit(editTarget);
                  }}
                  onDelete={() => onOpenDelete(nodeDeleteTarget(node))}
                />
              );
            }}
          </SortableCatalogList>
        ) : (
          <>
            <SortableCatalogList nodes={categoryNodes} onReorder={onReorderCategories}>
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
                    onToggle={() => onToggleCategory(category)}
                    onEdit={() =>
                      onOpenEdit({
                        kind: "category",
                        category: {
                          id: category.id,
                          name: category.name,
                          iconKey: category.iconKey,
                        },
                      })
                    }
                    onDelete={() => onOpenDelete({ kind: "category", id: category.id, name: category.name })}
                  >
                    {expanded ? (
                      <CatalogSubcategoryNodesSection
                        category={category}
                        nodes={subcategoriesByCategory[category.id] ?? []}
                        expandedSubcategoryIds={expandedSubcategoryIds}
                        loadingBranches={loadingBranches}
                        itemsBySubcategory={itemsBySubcategory}
                        onToggleSubcategory={onToggleSubcategory}
                        onOpenEdit={onOpenEdit}
                        onOpenDelete={onOpenDelete}
                        onReorderSubcategories={onReorderSubcategories}
                        onReorderItems={onReorderItems}
                      />
                    ) : null}
                  </SortableCatalogNode>
                );
              }}
            </SortableCatalogList>
            <button
              type="button"
              className="catalog-tree-add"
              onClick={() => onOpenEdit({ kind: "category" })}
            >
              <Plus className="h-4 w-4" /> Добавить категорию
            </button>
          </>
        )}
      </div>
    </section>
  );
}
