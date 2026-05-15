import type { PrismaClient } from "@prisma/client";

export class ProfileUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  loadOverviewUser(userId: number) {
    return this.prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        addresses: {
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        },
        wishlist_items: {
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
        },
        orders_as_buyer: {
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
            items: {
              include: {
                listing: {
                  select: { public_id: true },
                },
              },
            },
          },
          orderBy: [{ created_at: "desc" }],
        },
      },
    });
  }

  findReviewedListingIds(userId: number, listingIds: number[]) {
    return this.prisma.listingReview.findMany({
      where: {
        author_id: userId,
        listing_id: {
          in: [...new Set(listingIds)],
        },
      },
      select: {
        listing_id: true,
      },
    });
  }

  loadUserForUpdate(userId: number) {
    return this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
  }

  updateUser(params: {
    userId: number;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email?: string;
    password?: string;
  }) {
    return this.prisma.appUser.update({
      where: { id: params.userId },
      data: {
        first_name: params.firstName ?? undefined,
        last_name: params.lastName ?? undefined,
        display_name: params.displayName ?? undefined,
        email: params.email ?? undefined,
        name:
          params.displayName ||
          [params.firstName, params.lastName].filter(Boolean).join(" ") ||
          undefined,
        password: params.password ?? undefined,
      },
      select: {
        id: true,
        public_id: true,
        role: true,
        first_name: true,
        last_name: true,
        display_name: true,
        email: true,
        name: true,
      },
    });
  }
}
