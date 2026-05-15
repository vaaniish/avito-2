import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import { toClientCondition } from "../../../utils/format";
import { extractPrimaryCityFromAddresses } from "../profile.shared";
import { createProfileAccountRouter } from "./http/profile-account.router";
import { ProfileNotificationsRepository } from "./infrastructure/repositories/profile-notifications.repository";
import { ProfileWishlistRepository } from "./infrastructure/repositories/profile-wishlist.repository";
import {
  AddWishlistItemService,
  ListWishlistService,
  RemoveWishlistItemService,
} from "./application/services/list-wishlist.service";
import {
  DeleteNotificationsService,
  ListNotificationsService,
  ListNotificationsSinceService,
  MarkNotificationsReadService,
} from "./application/services/notifications.service";

const profileRoles = ["BUYER", "SELLER", "ADMIN"];
const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

const wishlistRepository = new ProfileWishlistRepository(prisma);
const notificationsRepository = new ProfileNotificationsRepository(prisma);

export const profileAccountRouter = createProfileAccountRouter({
  requireAnyRole,
  profileRoles,
  services: {
    listWishlist: new ListWishlistService(wishlistRepository, {
      fallbackListingImage: FALLBACK_LISTING_IMAGE,
      toClientCondition,
      extractPrimaryCityFromAddresses,
    }),
    addWishlistItem: new AddWishlistItemService(wishlistRepository),
    removeWishlistItem: new RemoveWishlistItemService(wishlistRepository),
    listNotifications: new ListNotificationsService(notificationsRepository),
    listNotificationsSince: new ListNotificationsSinceService(
      notificationsRepository,
    ),
    markNotificationsRead: new MarkNotificationsReadService(
      notificationsRepository,
    ),
    deleteNotifications: new DeleteNotificationsService(notificationsRepository),
  },
});
