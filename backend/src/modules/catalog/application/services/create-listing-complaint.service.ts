import { notFound, validationError } from "../../../../common/application-error";
import {
  COMPLAINT_DEDUP_WINDOW_MINUTES,
  COMPLAINT_RATE_LIMIT_PER_HOUR,
  MAX_COMPLAINT_DESCRIPTION_LENGTH,
  makeComplaintEventPublicId,
  makeComplaintPublicId,
} from "../catalog.service";
import type {
  CatalogNotificationPort,
  CatalogRepositoryPort,
} from "../catalog.types";

export class CreateListingComplaintService {
  constructor(
    private readonly repository: CatalogRepositoryPort,
    private readonly notificationWriter: CatalogNotificationPort,
  ) {}

  async execute(input: {
    publicId: string;
    actorUserId: number;
    complaintType: string;
    description: string;
  }) {
    const listingPublicId = String(input.publicId ?? "").trim();
    if (!listingPublicId) {
      throw validationError("Invalid listing ID");
    }

    const complaintType =
      typeof input.complaintType === "string" ? input.complaintType.trim() : "";
    if (complaintType.length < 2 || complaintType.length > 80) {
      throw validationError("Invalid complaint type");
    }

    const description =
      typeof input.description === "string" ? input.description.trim() : "";
    if (
      description.length < 8 ||
      description.length > MAX_COMPLAINT_DESCRIPTION_LENGTH
    ) {
      throw validationError("Invalid complaint description");
    }

    const listing = await this.repository.findComplaintListing(listingPublicId);
    if (!listing) {
      throw notFound("Listing not found");
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const complaintsInHour = await this.repository.countComplaintsFromReporterSince(
      input.actorUserId,
      oneHourAgo,
    );

    if (complaintsInHour >= COMPLAINT_RATE_LIMIT_PER_HOUR) {
      throw validationError(
        "Too many complaints from this account. Please wait before submitting another one.",
      );
    }

    const dedupeWindowStart = new Date(
      Date.now() - COMPLAINT_DEDUP_WINDOW_MINUTES * 60 * 1000,
    );
    const existingDuplicate = await this.repository.findDuplicateComplaint({
      reporterId: input.actorUserId,
      listingId: listing.id,
      complaintType,
      since: dedupeWindowStart,
    });

    if (existingDuplicate) {
      return {
        id: existingDuplicate.public_id,
        status: existingDuplicate.status.toLowerCase(),
        deduplicated: true,
        createdAt: existingDuplicate.created_at,
        message: "Similar complaint already exists within the deduplication window.",
      };
    }

    const created = await this.repository.createComplaintWithEvent({
      publicId: makeComplaintPublicId(),
      eventPublicId: makeComplaintEventPublicId(),
      complaintType,
      listingId: listing.id,
      sellerId: listing.seller_id,
      reporterId: input.actorUserId,
      description,
    });

    await Promise.all([
      this.notificationWriter.notifyAdminsAboutComplaint({
        listingTitle: listing.title,
      }),
      this.notificationWriter.notifySellerAboutComplaint({
        sellerId: listing.seller_id,
        listingTitle: listing.title,
      }),
    ]);

    return {
      id: created.public_id,
      status: created.status.toLowerCase(),
      deduplicated: false,
      createdAt: created.created_at,
    };
  }
}
