import { requireAnyRole } from "../../../lib/session";
import { prisma } from "../../../lib/prisma";
import { CreateListingDraftService } from "./application/services/create-listing-draft.service";
import { DeleteListingDraftService } from "./application/services/delete-listing-draft.service";
import { ListListingDraftsService } from "./application/services/list-listing-drafts.service";
import { UpdateListingDraftService } from "./application/services/update-listing-draft.service";
import { createPartnerDraftsRouter } from "./http/partner-drafts.router";
import { PartnerDraftsRepository } from "./infrastructure/repositories/partner-drafts.repository";

const repository = new PartnerDraftsRepository(prisma);

export const partnerDraftsRouter = createPartnerDraftsRouter({
  requireAnyRole,
  services: {
    listListingDrafts: new ListListingDraftsService(repository),
    createListingDraft: new CreateListingDraftService(repository),
    updateListingDraft: new UpdateListingDraftService(repository),
    deleteListingDraft: new DeleteListingDraftService(repository),
  },
});
