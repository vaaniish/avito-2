import {
  CATALOG_CARD_MIN_HEIGHT_PX,
  CATALOG_CARD_WIDTH_PX,
  ProductCard,
} from "../../entities/ProductCard";
import type { CartItem, Product } from "../../shared/types";
import type { RecommendationItem } from "../../shared/types/recommendations";

type RecommendationShelfProps = {
  title: string;
  subtitle?: string;
  items: RecommendationItem[];
  cartItems: CartItem[];
  wishlistProductIds: Set<string>;
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onWishlistToggle: (productId: string, shouldAddToWishlist: boolean) => void;
  emptyMessage?: string;
  showHeader?: boolean;
};

export function RecommendationShelf({
  title,
  subtitle,
  items,
  cartItems,
  wishlistProductIds,
  onProductClick,
  onAddToCart,
  onUpdateQuantity,
  onWishlistToggle,
  emptyMessage,
  showHeader = true,
}: RecommendationShelfProps) {
  if (items.length === 0) {
    return emptyMessage ? (
      <section className="w-full max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-2.5 md:p-3">
        {showHeader ? (
          <>
            <h2 className="text-xl text-gray-900 md:text-2xl">{title}</h2>
            {subtitle ? <p className="mt-2 text-sm leading-6 text-gray-600">{subtitle}</p> : null}
          </>
        ) : null}
        <p className="mt-4 text-sm leading-6 text-gray-500">{emptyMessage}</p>
      </section>
    ) : null;
  }

  const cartItemsById = new Map(cartItems.map((item) => [item.id, item]));

  return (
    <section className="w-full max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-2.5 md:p-3">
      {showHeader ? (
        <div className="mb-4">
          <div>
            <h2 className="text-xl text-gray-900 md:text-2xl">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm leading-6 text-gray-600">{subtitle}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className="max-w-full overflow-x-auto overflow-y-hidden"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="pb-4">
          <div className="flex w-max snap-x snap-mandatory items-stretch gap-3">
            {items.map((item, index) => {
              const cartItem = cartItemsById.get(item.listing.id);
              return (
                <div
                  key={`${item.listing.id}-${item.source}-${index}`}
                  className="shrink-0 snap-start"
                  style={{
                    width: `${CATALOG_CARD_WIDTH_PX}px`,
                    minWidth: `${CATALOG_CARD_WIDTH_PX}px`,
                    height: `${CATALOG_CARD_MIN_HEIGHT_PX}px`,
                  }}
                >
                  <ProductCard
                    product={item.listing}
                    onClick={() => onProductClick(item.listing)}
                    onAddToCart={() => onAddToCart(item.listing)}
                    onUpdateQuantity={(quantity) => onUpdateQuantity(item.listing.id, quantity)}
                    cartQuantity={cartItem?.quantity ?? 0}
                    viewMode="products"
                    displayMode="grid"
                    isWishlisted={wishlistProductIds.has(item.listing.id)}
                    onWishlistToggle={onWishlistToggle}
                    className="h-full"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
