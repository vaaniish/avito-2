import { CreateListingComplaintService } from "./application/services/create-listing-complaint.service";
import { CreateListingQuestionService } from "./application/services/create-listing-question.service";
import { GetCategoriesService } from "./application/services/get-categories.service";
import { GetListingDetailsService } from "./application/services/get-listing-details.service";
import { GetListingQuestionsService } from "./application/services/get-listing-questions.service";
import { GetListingsService } from "./application/services/get-listings.service";
import { GetSellerListingsService } from "./application/services/get-seller-listings.service";
import { GetSuggestionsService } from "./application/services/get-suggestions.service";
import { RecordListingViewService } from "./application/services/record-listing-view.service";
import { createCatalogRouter } from "./http/catalog.router";
import { CatalogCircumventionGateway } from "./infrastructure/gateways/catalog-circumvention.gateway";
import { CatalogNotificationGateway } from "./infrastructure/gateways/catalog-notification.gateway";
import { CatalogRepository } from "./infrastructure/repositories/catalog.repository";

const repository = new CatalogRepository();
const notificationWriter = new CatalogNotificationGateway();
const circumventionGateway = new CatalogCircumventionGateway();

export const catalogRouter = createCatalogRouter({
  services: {
    getCategories: new GetCategoriesService(repository),
    getListings: new GetListingsService(repository),
    getListingDetails: new GetListingDetailsService(repository),
    recordListingView: new RecordListingViewService(repository),
    getSellerListings: new GetSellerListingsService(repository),
    getSuggestions: new GetSuggestionsService(repository),
    getListingQuestions: new GetListingQuestionsService(repository),
    createListingQuestion: new CreateListingQuestionService(
      repository,
      notificationWriter,
      circumventionGateway,
    ),
    createListingComplaint: new CreateListingComplaintService(
      repository,
      notificationWriter,
    ),
  },
});
