import type {
  AppUser,
  ListingImage,
  MarketplaceListing,
  UserAddress,
  WishlistItem,
} from "@prisma/client";
import { notFound, validationError } from "../../../../common/application-error";
import { mapBuyerOrder } from "../../orders/domain/profile-orders.helpers";
import type { BuyerOrderWithRelations as BuyerOrderWithRelationsView } from "../../orders/domain/profile-orders.types";
import type { ProfileAddressDto } from "../../profile.shared";

export type ProfileUserViewHelpers = {
  fallbackListingImage: string;
  toClientRole: (role: string) => "regular" | "partner" | "admin";
  toProfileOrderStatus: (
    status: string,
  ) => "processing" | "prepared" | "completed" | "cancelled" | "shipped";
  toClientCondition: (condition: string) => "new" | "used";
  toLocalizedDeliveryDate: (date: Date) => string;
  stripPickupPointTag: (address: string | null) => string;
  extractPrimaryCityFromAddresses: (
    addresses: Array<{ city: string | null | undefined }>,
  ) => string | null;
  mapUserAddressToDto: (address: UserAddress) => ProfileAddressDto;
};

export type ProfileOverviewUser = AppUser & {
  addresses: UserAddress[];
  orders_as_buyer: BuyerOrderWithRelationsView[];
  wishlist_items: (WishlistItem & {
    listing: MarketplaceListing & {
      seller: AppUser & { addresses: Array<{ city: string }> };
      images: ListingImage[];
    };
  })[];
};

export function buildProfileOverviewDto(
  user: ProfileOverviewUser,
  reviewedListingIds: Set<number>,
  helpers: ProfileUserViewHelpers,
) {
  const clientRole = helpers.toClientRole(user.role);
  const isPartner = user.role === "SELLER";

  return {
    user: {
      id: user.id,
      public_id: user.public_id,
      role: clientRole,
      firstName: user.first_name ?? "",
      lastName: user.last_name ?? "",
      displayName: user.display_name ?? user.name,
      name: user.name,
      email: user.email,
      workEmail: isPartner ? user.work_email : null,
      avatar: user.avatar,
      city: helpers.extractPrimaryCityFromAddresses(user.addresses),
      joinDate: user.joined_at.getFullYear().toString(),
    },
    addresses: user.addresses.map((address) => helpers.mapUserAddressToDto(address)),
    orders: user.orders_as_buyer.map((order) =>
      mapBuyerOrder(order, reviewedListingIds, {
        stripPickupPointTag: helpers.stripPickupPointTag,
        toLocalizedDeliveryDate: helpers.toLocalizedDeliveryDate,
        extractPrimaryCityFromAddresses:
          helpers.extractPrimaryCityFromAddresses,
        toProfileOrderStatus: helpers.toProfileOrderStatus,
      }),
    ),
    wishlist: user.wishlist_items.map((item) => ({
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
    })),
  };
}

export function assertProfileUserExists<T>(user: T | null): T {
  if (!user) {
    throw notFound("User not found");
  }
  return user;
}

export function parseProfileUserUpdate(body: {
  firstName?: unknown;
  lastName?: unknown;
  displayName?: unknown;
  email?: unknown;
  workEmail?: unknown;
  oldPassword?: unknown;
  newPassword?: unknown;
}) {
  return {
    firstName:
      typeof body.firstName === "string" ? body.firstName.trim() : undefined,
    lastName:
      typeof body.lastName === "string" ? body.lastName.trim() : undefined,
    displayName:
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : undefined,
    email:
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : undefined,
    workEmail:
      typeof body.workEmail === "string"
        ? body.workEmail.trim().toLowerCase()
        : undefined,
    oldPassword: typeof body.oldPassword === "string" ? body.oldPassword : "",
    newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
  };
}

export function validatePasswordChangeInput(input: {
  oldPassword: string;
  newPassword: string;
}) {
  if (input.newPassword && !input.oldPassword) {
    throw validationError("Укажите текущий пароль");
  }
}
