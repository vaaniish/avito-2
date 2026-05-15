import {
  FALLBACK_LISTING_IMAGE,
  extractSellerCity,
  formatPublishDate,
  formatResponseTime,
  getListingUnavailableReason,
  listingBreadcrumbs,
  listingCatalogRefs,
  listingCategoryName,
  listingSpecifications,
  listingStatusToClient,
  moderationStatusToClient,
  normalizeDisplayText,
} from "../catalog.service";
import { toClientCondition } from "../../../../utils/format";
import { notFound, validationError } from "../../../../common/application-error";
import type { CatalogRepositoryPort } from "../catalog.types";

export class GetListingDetailsService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(input: {
    publicId: string;
    sessionUser: { id: number; role: string } | null;
  }) {
    const publicId = String(input.publicId ?? "").trim();
    if (!publicId) {
      throw validationError("Invalid listing ID");
    }

    const listing = await this.repository.findListingDetailsByPublicId(publicId);
    if (!listing) {
      throw notFound("Listing not found");
    }

    const isPubliclyAvailable =
      listing.status === "ACTIVE" && listing.moderation_status === "APPROVED";
    const isPubliclyAccessibleInactiveApproved =
      listing.status === "INACTIVE" && listing.moderation_status === "APPROVED";
    const isDirectlyAccessiblePublicly =
      isPubliclyAvailable || isPubliclyAccessibleInactiveApproved;

    let relatedOrderItemExists = false;

    if (!isDirectlyAccessiblePublicly) {
      if (!input.sessionUser) {
        throw notFound("Listing not found");
      }

      let hasRelatedAccess =
        input.sessionUser.role === "ADMIN" ||
        listing.seller_id === input.sessionUser.id;

      if (!hasRelatedAccess) {
        const relatedOrderItem = await this.repository.findBuyerAccessOrderItem(
          listing.id,
          input.sessionUser.id,
        );
        relatedOrderItemExists = Boolean(relatedOrderItem);
        hasRelatedAccess = relatedOrderItemExists;
      }

      if (!hasRelatedAccess) {
        throw notFound("Listing not found");
      }
    }

    let unavailableReason = getListingUnavailableReason(listing);
    if (
      !isPubliclyAvailable &&
      input.sessionUser &&
      listing.status === "INACTIVE" &&
      listing.moderation_status === "APPROVED"
    ) {
      if (listing.seller_id === input.sessionUser.id) {
        unavailableReason =
          "Товар уже находится в истории сделки и недоступен для повторной покупки.";
      } else if (relatedOrderItemExists) {
        unavailableReason =
          "Этот товар уже куплен и находится в вашей истории заказов.";
      } else if (input.sessionUser.role === "ADMIN") {
        unavailableReason =
          "Товар уже недоступен для покупки и открыт только для просмотра истории сделки.";
      }
    }

    const primaryImage = listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE;
    const salePrice =
      listing.sale_price !== null && listing.sale_price < listing.price
        ? listing.sale_price
        : null;
    const [sellerReviewMetricsBySellerId, sellerReviews] = await Promise.all([
      this.repository.loadSellerReviewMetrics([listing.seller_id]),
      this.repository.loadSellerReviews(listing.seller_id, 50),
    ]);
    const sellerReviewMetrics =
      sellerReviewMetricsBySellerId.get(listing.seller_id) ?? {
        rating: 0,
        reviewsCount: 0,
      };
    const catalogRefs = listingCatalogRefs(listing);

    return {
      id: listing.public_id,
      title: normalizeDisplayText(listing.title, "Без названия"),
      price: listing.price,
      salePrice,
      image: primaryImage,
      images: listing.images.map((image: any) => image.url),
      rating: sellerReviewMetrics.rating,
      sellerRating: sellerReviewMetrics.rating,
      sellerReviewsCount: sellerReviewMetrics.reviewsCount,
      seller: normalizeDisplayText(listing.seller.name, "Продавец"),
      sellerId: listing.seller.public_id,
      sellerAvatar: listing.seller.avatar,
      sellerJoinedAt: listing.seller.joined_at,
      category: listingCategoryName(listing),
      catalogCategoryId: catalogRefs.catalogCategoryId,
      catalogSubcategoryId: catalogRefs.catalogSubcategoryId,
      catalogItemId: catalogRefs.catalogItemId,
      sku: listing.sku,
      isNew: listing.condition === "NEW",
      isSale: salePrice !== null,
      isVerified: Boolean(listing.seller.seller_profile?.is_verified),
      description: normalizeDisplayText(listing.description ?? "", ""),
      shippingBySeller: listing.shipping_by_seller,
      location: extractSellerCity(listing.seller),
      city: extractSellerCity(listing.seller),
      publishDate: formatPublishDate(listing.created_at),
      views: listing.views,
      sellerListings: listing.seller._count.listings,
      sellerResponseTime: formatResponseTime(
        listing.seller.seller_profile?.average_response_minutes,
      ),
      breadcrumbs: listingBreadcrumbs(listing),
      condition: toClientCondition(listing.condition),
      specifications: listingSpecifications({
        attributes: listing.attributes,
        techGrade: listing.tech_grade,
        techBatteryHealth: listing.tech_battery_health,
        techDefects: listing.tech_defects,
        techIncluded: listing.tech_included,
      }),
      listingStatus: listingStatusToClient(listing.status),
      moderationStatus: moderationStatusToClient(listing.moderation_status),
      isAvailable: isPubliclyAvailable,
      unavailableReason,
      reviews: sellerReviews,
    };
  }
}
