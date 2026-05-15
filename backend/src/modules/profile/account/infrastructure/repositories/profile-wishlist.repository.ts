import type { PrismaClient } from "@prisma/client";

export class ProfileWishlistRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listWishlist(userId: number) {
    return this.prisma.wishlistItem.findMany({
      where: { user_id: userId },
      include: {
        listing: {
          include: {
            seller: {
              include: {
                addresses: {
                  select: { city: true },
                  orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                  take: 1,
                },
              },
            },
            images: {
              orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            },
          },
        },
      },
      orderBy: [{ added_at: "desc" }],
    });
  }

  findListingByPublicId(listingPublicId: string) {
    return this.prisma.marketplaceListing.findUnique({
      where: { public_id: listingPublicId },
      select: { id: true },
    });
  }

  addWishlistItem(userId: number, listingId: number) {
    return this.prisma.wishlistItem.upsert({
      where: {
        user_id_listing_id: {
          user_id: userId,
          listing_id: listingId,
        },
      },
      create: {
        user_id: userId,
        listing_id: listingId,
      },
      update: {},
    });
  }

  removeWishlistItem(userId: number, listingId: number) {
    return this.prisma.wishlistItem.deleteMany({
      where: {
        user_id: userId,
        listing_id: listingId,
      },
    });
  }
}
