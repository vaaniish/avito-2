const MOBILE_CARD_HEIGHT = 356;
const TABLET_CARD_HEIGHT = 392;
const DESKTOP_CARD_HEIGHT = 430;

export function getCatalogGridColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 4;
  if (viewportWidth >= 1024) return 3;
  if (viewportWidth >= 640) return 2;
  return 1;
}

export function getCatalogGridRowHeight(viewportWidth: number): number {
  if (viewportWidth >= 1024) return DESKTOP_CARD_HEIGHT;
  if (viewportWidth >= 640) return TABLET_CARD_HEIGHT;
  return MOBILE_CARD_HEIGHT;
}

export function getCatalogRowCount(itemCount: number, columns: number): number {
  if (itemCount <= 0) return 0;
  return Math.ceil(itemCount / columns);
}

export function getCatalogRenderWindow(params: {
  viewportWidth: number;
  scrollY: number;
  viewportHeight: number;
  gridTop: number;
  leadingItemCount: number;
  loadedItemCount: number;
  overscanRows?: number;
}) {
  const {
    viewportWidth,
    scrollY,
    viewportHeight,
    gridTop,
    leadingItemCount,
    loadedItemCount,
    overscanRows = 3,
  } = params;

  const columns = getCatalogGridColumnCount(viewportWidth);
  const rowHeight = getCatalogGridRowHeight(viewportWidth);
  const totalLogicalItemCount = leadingItemCount + loadedItemCount;
  const totalLogicalRowCount = getCatalogRowCount(totalLogicalItemCount, columns);

  if (loadedItemCount === 0) {
    return {
      columns,
      rowHeight,
      visibleStartIndex: 0,
      visibleEndIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const relativeViewportTop = Math.max(0, scrollY - gridTop);
  const relativeViewportBottom = relativeViewportTop + viewportHeight;

  const startRow = Math.max(0, Math.floor(relativeViewportTop / rowHeight) - overscanRows);
  const endRow = Math.min(
    Math.max(totalLogicalRowCount - 1, 0),
    Math.ceil(relativeViewportBottom / rowHeight) + overscanRows,
  );

  const requestedStartIndex = startRow * columns;
  const requestedEndIndex = Math.min(totalLogicalItemCount, (endRow + 1) * columns);
  const loadedStartIndex = leadingItemCount;
  const loadedEndIndex = leadingItemCount + loadedItemCount;
  const clampedStartIndex = Math.max(requestedStartIndex, loadedStartIndex);
  const clampedEndIndex = Math.min(requestedEndIndex, loadedEndIndex);
  const safeVisibleEndIndex = Math.max(clampedEndIndex, clampedStartIndex);
  const hiddenLeadingItems = Math.max(0, clampedStartIndex - loadedStartIndex);
  const hiddenTrailingItems = Math.max(0, loadedEndIndex - safeVisibleEndIndex);

  return {
    columns,
    rowHeight,
    visibleStartIndex: clampedStartIndex - loadedStartIndex,
    visibleEndIndex: safeVisibleEndIndex - loadedStartIndex,
    topSpacerHeight:
      (getCatalogRowCount(leadingItemCount + hiddenLeadingItems, columns) -
        getCatalogRowCount(leadingItemCount, columns)) *
      rowHeight,
    bottomSpacerHeight: getCatalogRowCount(hiddenTrailingItems, columns) * rowHeight,
  };
}
