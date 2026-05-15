import type {
  AppUser,
  ListingImage,
  MarketplaceListing,
  Notification,
  WishlistItem,
} from "@prisma/client";
import { notFound } from "../../../../common/application-error";

export type WishlistViewHelpers = {
  fallbackListingImage: string;
  toClientCondition: (condition: string) => "new" | "used";
  extractPrimaryCityFromAddresses: (
    addresses: Array<{ city: string }>,
  ) => string | null;
};

export function assertListingExists<T>(listing: T | null): T {
  if (!listing) {
    throw notFound("Listing not found");
  }
  return listing;
}

export function mapWishlistItems(
  wishlist: (WishlistItem & {
    listing: MarketplaceListing & {
      seller: AppUser & { addresses: Array<{ city: string }> };
      images: ListingImage[];
    };
  })[],
  helpers: WishlistViewHelpers,
) {
  return wishlist.map((item) => ({
    id: item.listing.public_id,
    name: item.listing.title,
    price: item.listing.sale_price ?? item.listing.price,
    image: item.listing.images[0]?.url ?? helpers.fallbackListingImage,
    location:
      helpers.extractPrimaryCityFromAddresses(item.listing.seller.addresses) ??
      "",
    condition: helpers.toClientCondition(item.listing.condition),
    seller: item.listing.seller.name,
    addedDate: item.added_at.toISOString().split("T")[0],
  }));
}

export function parseNotificationsAfterId(value: unknown): number {
  const afterId = Number(value ?? 0);
  return Number.isFinite(afterId) && afterId > 0 ? afterId : 0;
}

export type NotificationRow = Notification;
