import type { PrismaClient } from "@prisma/client";
import type { ProfileListingReviewRepositoryPort } from "../../domain/profile-engagement.types";

export class ProfileListingReviewRepository
  implements ProfileListingReviewRepositoryPort
{
  constructor(private readonly prisma: PrismaClient) {}

  findListingForReview(listingPublicId: string) {
    return this.prisma.marketplaceListing.findUnique({
      where: { public_id: listingPublicId },
      select: { id: true, seller_id: true },
    });
  }

  countCompletedBuyerOrdersForListing(params: {
    buyerUserId: number;
    listingId: number;
  }) {
    return this.prisma.marketOrder.count({
      where: {
        buyer_id: params.buyerUserId,
        status: "COMPLETED",
        items: {
          some: {
            listing_id: params.listingId,
          },
        },
      },
    });
  }

  async hasExistingReview(params: { listingId: number; authorId: number }) {
    const existing = await this.prisma.listingReview.findUnique({
      where: {
        listing_id_author_id: {
          listing_id: params.listingId,
          author_id: params.authorId,
        },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  async createReviewAndRefreshSellerRating(params: {
    listingId: number;
    sellerId: number;
    authorId: number;
    rating: number;
    comment: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const newReview = await tx.listingReview.create({
        data: {
          listing_id: params.listingId,
          author_id: params.authorId,
          rating: params.rating,
          comment: params.comment,
        },
        include: {
          author: {
            select: {
              display_name: true,
              avatar: true,
            },
          },
        },
      });

      const sellerReviews = await tx.listingReview.findMany({
        where: {
          listing: {
            seller_id: params.sellerId,
          },
        },
        select: {
          rating: true,
        },
      });

      const sellerRating =
        sellerReviews.length === 0
          ? 0
          : Number(
              (
                sellerReviews.reduce((sum, item) => sum + item.rating, 0) /
                sellerReviews.length
              ).toFixed(1),
            );

      await tx.marketplaceListing.updateMany({
        where: { seller_id: params.sellerId },
        data: {
          rating: sellerRating,
        },
      });

      return newReview;
    });
  }
}
