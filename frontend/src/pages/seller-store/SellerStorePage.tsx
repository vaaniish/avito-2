import { SellerStoreHeader, SellerStoreListingsSection, SellerStoreReviewsModal } from "./seller-store.sections";
import { useSellerStorefront } from "./seller-store.hooks";
import type { SellerStorePageProps } from "./seller-store.types";

export function SellerStorePage(props: SellerStorePageProps) {
  const storefront = useSellerStorefront(props.sellerId);

  return (
    <div className="app-shell">
      <div className="page-container pb-10 md:pb-16">
        <SellerStoreHeader
          seller={storefront.seller}
          isLoading={storefront.isLoading}
          joinedYear={storefront.joinedYear}
          sellerRatingDisplay={storefront.sellerRatingDisplay}
          sellerRatingNumber={storefront.sellerRatingNumber}
          onBack={props.onBack}
          onOpenReviews={() => storefront.setIsReviewsModalOpen(true)}
        />

        <SellerStoreListingsSection
          categories={props.categories}
          filters={storefront.filters}
          sortBy={storefront.sortBy}
          items={storefront.items}
          cartItems={props.cartItems}
          wishlistProductIds={props.wishlistProductIds}
          hasMore={storefront.hasMore}
          isLoading={storefront.isLoading}
          isLoadingMore={storefront.isLoadingMore}
          onFilterChange={storefront.setFilters}
          onSortChange={storefront.setSortBy}
          onOpenListing={props.onOpenListing}
          onAddToCart={props.onAddToCart}
          onUpdateQuantity={props.onUpdateQuantity}
          onWishlistToggle={props.onWishlistToggle}
          onLoadMore={() => {
            if (!storefront.isLoadingMore) {
              void storefront.loadPage(storefront.nextOffset, true);
            }
          }}
        />
      </div>

      <SellerStoreReviewsModal
        isOpen={storefront.isReviewsModalOpen}
        onClose={() => storefront.setIsReviewsModalOpen(false)}
        isReviewsLoading={storefront.isReviewsLoading}
        reviewSort={storefront.reviewSort}
        onSortChange={storefront.setReviewSort}
        ratingDistribution={storefront.ratingDistribution}
        modalRatingTotal={storefront.modalRatingTotal}
        modalAverageRating={storefront.modalAverageRating}
        modalAverageRatingLabel={storefront.modalAverageRatingLabel}
        modalReviewsTotal={storefront.modalReviewsTotal}
        sortedSellerReviews={storefront.sortedSellerReviews}
        sellerReviewsCount={storefront.sellerReviewsCount}
      />
    </div>
  );
}
