import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import {
  toClientCondition,
  toClientRole,
  toProfileOrderStatus,
} from "../../../utils/format";
import { createProfileUserRouter } from "./http/profile-user.router";
import { ProfilePasswordHasherGateway } from "./infrastructure/gateways/profile-password-hasher.gateway";
import { ProfileUserRepository } from "./infrastructure/repositories/profile-user.repository";
import {
  toLocalizedDeliveryDate,
  stripPickupPointTag,
} from "../profile.delivery";
import {
  extractPrimaryCityFromAddresses,
  mapUserAddressToDto,
} from "../profile.shared";
import { GetProfileOverviewService } from "./application/services/get-profile-overview.service";
import { UpdateProfileUserService } from "./application/services/update-profile-user.service";

const repository = new ProfileUserRepository(prisma);
const passwordHasher = new ProfilePasswordHasherGateway();
const profileRoles = ["BUYER", "SELLER", "ADMIN"];
const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

export const profileUserRouter = createProfileUserRouter({
  requireAnyRole,
  profileRoles,
  toClientRole,
  services: {
    getProfileOverview: new GetProfileOverviewService(repository, {
      fallbackListingImage: FALLBACK_LISTING_IMAGE,
      toClientRole,
      toProfileOrderStatus,
      toClientCondition,
      toLocalizedDeliveryDate,
      stripPickupPointTag,
      extractPrimaryCityFromAddresses,
      mapUserAddressToDto,
    }),
    updateProfileUser: new UpdateProfileUserService(repository, passwordHasher),
  },
});
