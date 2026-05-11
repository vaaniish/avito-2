import type { CartItem, FilterState, Product, Review } from "../../shared/types";
import type { CatalogCategory } from "../../widgets/FilterPanel";

export type SellerProfile = {
  id: string;
  name: string;
  avatar: string | null;
  city: string;
  isVerified: boolean;
  responseTime: string | null;
  rating: number;
  reviewsCount: number;
  listingsCount: number;
  joinedAt: string;
};

export type SellerStorefrontResponse = {
  seller: SellerProfile;
  reviews?: Review[];
  items: Product[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type SellerStorePageProps = {
  sellerId: string;
  categories: CatalogCategory[];
  onBack: () => void;
  onOpenListing: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  cartItems: CartItem[];
  wishlistProductIds: Set<string>;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
};

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest";

export type SellerStoreQueryState = {
  filters: FilterState;
  sortBy: string;
};
