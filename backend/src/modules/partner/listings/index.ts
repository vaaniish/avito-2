import { requireAnyRole } from "../../../lib/session";
import { CreateCatalogRequestService } from "./application/services/create-catalog-request.service";
import { CreatePartnerListingService } from "./application/services/create-partner-listing.service";
import { DeletePartnerListingService } from "./application/services/delete-partner-listing.service";
import { GetCatalogReferenceService } from "./application/services/get-catalog-reference.service";
import { GetListingCreateSuggestionsService } from "./application/services/get-listing-create-suggestions.service";
import { GetListingTitleSuggestionsService } from "./application/services/get-listing-title-suggestions.service";
import { GuessListingCategoryService } from "./application/services/guess-listing-category.service";
import { ListPartnerListingsService } from "./application/services/list-partner-listings.service";
import { ProcessPartnerListingModerationService } from "./application/services/process-partner-listing-moderation.service";
import { SetPartnerListingStatusService } from "./application/services/set-partner-listing-status.service";
import { TogglePartnerListingStatusService } from "./application/services/toggle-partner-listing-status.service";
import { UpdatePartnerListingService } from "./application/services/update-partner-listing.service";
import { createPartnerListingsRouter } from "./http/partner-listings.router";
import { PartnerListingsNotificationGateway } from "./infrastructure/gateways/partner-listings-notification.gateway";
import { PartnerListingsCatalogRepository } from "./infrastructure/repositories/partner-listings-catalog.repository";
import { PartnerListingsReadRepository } from "./infrastructure/repositories/partner-listings-read.repository";
import { PartnerListingsSearchRepository } from "./infrastructure/repositories/partner-listings-search.repository";
import { PartnerListingsWriteRepository } from "./infrastructure/repositories/partner-listings-write.repository";

const readRepository = new PartnerListingsReadRepository();
const searchRepository = new PartnerListingsSearchRepository();
const catalogRepository = new PartnerListingsCatalogRepository();
const notifications = new PartnerListingsNotificationGateway();
const writeRepository = new PartnerListingsWriteRepository();
const moderation = new ProcessPartnerListingModerationService(
  writeRepository,
  notifications,
);

export const partnerListingsRouter = createPartnerListingsRouter({
  requireAnyRole,
  services: {
    listPartnerListings: new ListPartnerListingsService(readRepository),
    getListingTitleSuggestions: new GetListingTitleSuggestionsService(searchRepository),
    getListingCreateSuggestions: new GetListingCreateSuggestionsService(searchRepository),
    createCatalogRequest: new CreateCatalogRequestService(catalogRepository),
    getCatalogReference: new GetCatalogReferenceService(catalogRepository),
    guessListingCategory: new GuessListingCategoryService(searchRepository),
    createPartnerListing: new CreatePartnerListingService(
      writeRepository,
      notifications,
      moderation,
    ),
    updatePartnerListing: new UpdatePartnerListingService(writeRepository, moderation),
    togglePartnerListingStatus: new TogglePartnerListingStatusService(
      writeRepository,
      moderation,
    ),
    setPartnerListingStatus: new SetPartnerListingStatusService(
      writeRepository,
      moderation,
    ),
    deletePartnerListing: new DeletePartnerListingService(writeRepository),
  },
});
