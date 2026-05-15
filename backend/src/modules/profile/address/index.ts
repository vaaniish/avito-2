import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import {
  DELIVERY_PROVIDERS,
  getDeliveryPoints,
  loadLocationSuggestionsByYandex,
  parseDeliveryProviderFilter,
} from "../profile.delivery";
import { CreateProfileAddressService } from "./application/services/create-profile-address.service";
import { DeleteProfileAddressService } from "./application/services/delete-profile-address.service";
import { GetDeliveryPointsService } from "./application/services/get-delivery-points.service";
import { GetLocationSuggestionsService } from "./application/services/get-location-suggestions.service";
import { ListProfileAddressesService } from "./application/services/list-profile-addresses.service";
import { SetDefaultProfileAddressService } from "./application/services/set-default-profile-address.service";
import { UpdateProfileAddressService } from "./application/services/update-profile-address.service";
import { createProfileAddressHttpRouter } from "./http/profile-address.router";
import { ProfileAddressDeliveryGateway } from "./infrastructure/gateways/profile-address-delivery.gateway";
import { ProfileAddressLocationGateway } from "./infrastructure/gateways/profile-address-location.gateway";
import { ProfileAddressRepository } from "./infrastructure/repositories/profile-address.repository";

const repository = new ProfileAddressRepository(prisma);
const locationGateway = new ProfileAddressLocationGateway(
  loadLocationSuggestionsByYandex,
);
const deliveryGateway = new ProfileAddressDeliveryGateway(getDeliveryPoints);

export const profileAddressRouter = createProfileAddressHttpRouter({
  requireAnyRole,
  parseDeliveryProviderFilter,
  services: {
    listProfileAddresses: new ListProfileAddressesService(repository),
    createProfileAddress: new CreateProfileAddressService(repository),
    updateProfileAddress: new UpdateProfileAddressService(repository),
    deleteProfileAddress: new DeleteProfileAddressService(repository),
    setDefaultProfileAddress: new SetDefaultProfileAddressService(repository),
    getLocationSuggestions: new GetLocationSuggestionsService(locationGateway),
    getDeliveryPoints: new GetDeliveryPointsService(
      deliveryGateway,
      DELIVERY_PROVIDERS,
    ),
  },
});
