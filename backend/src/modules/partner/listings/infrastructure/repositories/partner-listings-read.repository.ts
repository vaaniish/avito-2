import { prisma } from "../../../../../lib/prisma";
import { toPartnerListingStatus } from "../../../../../utils/format";
import type { PartnerListingsReadRepositoryPort } from "../../domain/partner-listings.types";
import {
  extractSellerCity,
  listingCategoryNameForClient,
  listingImageUrl,
  parseListingType,
  toClientListingState,
  toClientTechState,
  type ListingConditionValue,
} from "../../domain/partner-listings.helpers";

export class PartnerListingsReadRepository
  implements PartnerListingsReadRepositoryPort
{
  async listListings(params: { sellerId: number; type?: unknown }) {
    const type = parseListingType(params.type);
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        seller_id: params.sellerId,
        type,
      },
      include: {
        item: {
          include: {
            subcategory: {
              include: {
                category: true,
              },
            },
          },
        },
        seller: {
          select: {
            addresses: {
              select: {
                city: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        attributes: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
        moderation_events: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    return listings.map((listing) => {
      const latestModeration = listing.moderation_events[0] ?? null;
      return {
        id: listing.public_id,
        title: listing.title,
        price: listing.price,
        condition: toClientListingState({
          condition: listing.condition as ListingConditionValue,
          attributes: listing.attributes,
        }),
        status: toPartnerListingStatus(listing.status),
        moderationStatus: listing.moderation_status.toLowerCase(),
        moderation: {
          status: listing.moderation_status.toLowerCase(),
          reasonCode: latestModeration?.reason_code ?? null,
          reasonNote: latestModeration?.reason_note ?? null,
          decidedAt: latestModeration?.created_at ?? null,
        },
        views: listing.views,
        created_at: listing.created_at,
        image: listingImageUrl(listing.images),
        images: listing.images.map((image) => image.url),
        description: listing.description,
        city: extractSellerCity(listing.seller),
        category: listingCategoryNameForClient(listing.item, listing.attributes),
        techState: toClientTechState({
          grade: listing.tech_grade,
          batteryHealth: listing.tech_battery_health,
          defects: listing.tech_defects,
          included: listing.tech_included,
        }),
        attributes: listing.attributes.map((attribute) => ({
          key: attribute.key,
          value: attribute.value,
        })),
      };
    });
  }
}
