import {
  conflict,
  forbidden,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import { toListingReviewDto } from "../../domain/profile-engagement.helpers";
import type { ProfileListingReviewRepositoryPort } from "../../domain/profile-engagement.types";

export class CreateListingReviewService {
  constructor(
    private readonly repository: ProfileListingReviewRepositoryPort,
  ) {}

  async execute(input: {
    listingPublicId: string;
    buyerUserId: number;
    rating: unknown;
    comment: unknown;
  }) {
    const rating = Number(input.rating);
    const comment =
      typeof input.comment === "string" ? input.comment.trim() : "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw validationError("Rating must be an integer from 1 to 5");
    }

    if (comment.length < 3) {
      throw validationError("Comment is too short");
    }

    const listing = await this.repository.findListingForReview(
      input.listingPublicId,
    );
    if (!listing) {
      throw notFound("Listing not found");
    }

    const orderCount = await this.repository.countCompletedBuyerOrdersForListing({
      buyerUserId: input.buyerUserId,
      listingId: listing.id,
    });
    if (orderCount === 0) {
      throw forbidden("You can only review items you have purchased.");
    }

    const existingReview = await this.repository.hasExistingReview({
      listingId: listing.id,
      authorId: input.buyerUserId,
    });
    if (existingReview) {
      throw conflict("You have already reviewed this item.");
    }

    const created = await this.repository.createReviewAndRefreshSellerRating({
      listingId: listing.id,
      sellerId: listing.seller_id,
      authorId: input.buyerUserId,
      rating,
      comment,
    });

    return toListingReviewDto(created);
  }
}
