import type { PrismaClient } from "@prisma/client";

const APPROVED_PARTNERSHIP_STATUSES = ["APPROVED", "APPROVED_LIMITED"] as const;

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
                partnership_requests: {
                  where: {
                    status: {
                      in: [...APPROVED_PARTNERSHIP_STATUSES],
                    },
                  },
                  orderBy: [{ created_at: "desc" }],
                  take: 1,
                  select: {
                    onboarding_profile: {
                      select: {
                        support_phone: true,
                        support_email: true,
                        service_hours: true,
                      },
                    },
                  },
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
      select: { id: true, role: true, password: true, email: true, work_email: true },
    });
  }

  updateUser(params: {
    userId: number;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email?: string;
    workEmail?: string | null;
    password?: string;
  }) {
    return this.prisma.appUser.update({
      where: { id: params.userId },
      data: {
        first_name: params.firstName ?? undefined,
        last_name: params.lastName ?? undefined,
        display_name: params.displayName ?? undefined,
        email: params.email ?? undefined,
        work_email: params.workEmail !== undefined ? params.workEmail : undefined,
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
        work_email: true,
        name: true,
      },
    });
  }
}
