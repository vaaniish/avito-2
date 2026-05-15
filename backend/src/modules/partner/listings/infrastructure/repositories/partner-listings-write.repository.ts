import {
  conflict,
  forbidden,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import { prisma } from "../../../../../lib/prisma";
import { toPartnerListingStatus } from "../../../../../utils/format";
import { normalizeListingTechState, validateListingQuality } from "../../../listing-quality";
import type {
  PartnerListingModerationJob,
  PartnerListingsWriteRepositoryPort,
} from "../../domain/partner-listings.types";
import {
  FALLBACK_LISTING_IMAGE,
  LISTING_ACTIVE,
  LISTING_MODERATION,
  ROLE_ADMIN,
  applyCatalogAttributeDefaults,
  extractSellerCity,
  filterAttributesForCatalogSelection,
  listingCategoryNameForClient,
  listingImageUrl,
  mergeListingStateAttributes,
  normalizeAttributes,
  normalizeImageArray,
  normalizeImageModerationSignals,
  parseListingState,
  parseListingStatus,
  parseListingType,
  resolveSellerStatusTransition,
  toClientListingState,
  toClientTechState,
  toDbCondition,
  type ListingAttributeInput,
  type ListingConditionValue,
  type PartnerCatalogSelection,
  validateAttributesAgainstSchema,
} from "../../domain/partner-listings.helpers";
import { syncListingSearchKeywords } from "../../../../catalog/catalog-search.shared";
import {
  createCatalogSuggestionsForListing,
  resolvePartnerCatalogSelection,
  validateItemSchemaConstraints,
} from "./partner-listings-catalog.repository-helper";
import {
  loadSellerModerationContext,
  hasBlockingOrderForListing,
  applyAutoModerationDecision,
  validateSellerOnboardingForListing,
  writeListingModerationEvent,
} from "./partner-listings-write.repository-helper";

export class PartnerListingsWriteRepository
  implements PartnerListingsWriteRepositoryPort
{
  private toListingResponse(listing: {
    id: number;
    public_id: string;
    title: string;
    price: number;
    condition: unknown;
    status: unknown;
    moderation_status: string;
    views: number;
    created_at: Date;
    description: string | null;
    tech_grade: string | null;
    tech_battery_health: number | null;
    tech_defects: string | null;
    tech_included: string | null;
    seller: { addresses: Array<{ city: string }> };
    images: Array<{ url: string }>;
    item: any;
    attributes: Array<{ key: string; value: string }>;
  }) {
    return {
      id: listing.public_id,
      title: listing.title,
      price: listing.price,
      condition: toClientListingState({
        condition: listing.condition as ListingConditionValue,
        attributes: listing.attributes,
      }),
      status: toPartnerListingStatus(listing.status as any),
      moderationStatus: listing.moderation_status.toLowerCase(),
      views: listing.views,
      created_at: listing.created_at,
      image: listingImageUrl(listing.images),
      images: listing.images.map((listingImage) => listingImage.url),
      description: listing.description,
      category: listingCategoryNameForClient(listing.item, listing.attributes),
      city: extractSellerCity(listing.seller),
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
  }

  private buildModerationJob(params: {
    listingId: number;
    listingPublicId: string;
    sellerId: number;
    title: string;
    description: string;
    category: string;
    price: number;
    imageUrl?: string | null;
    imageModerationSignals?: string[];
  }): PartnerListingModerationJob {
    return {
      listingId: params.listingId,
      listingPublicId: params.listingPublicId,
      sellerId: params.sellerId,
      title: params.title,
      description: params.description,
      category: params.category,
      price: params.price,
      imageUrl: params.imageUrl,
      imageModerationSignals: params.imageModerationSignals ?? [],
    };
  }

  async createListing(params: {
    sellerId: number;
    sellerRole: string;
    body: {
      title?: unknown;
      price?: unknown;
      condition?: unknown;
      description?: unknown;
      category?: unknown;
      image?: unknown;
      images?: unknown;
      imageModerationSignals?: unknown;
      attributes?: unknown;
      techState?: unknown;
      type?: unknown;
      draftId?: unknown;
    };
  }) {
    const title = typeof params.body.title === "string" ? params.body.title.trim() : "";
    const price = Number(params.body.price ?? 0);
    const listingState = parseListingState(params.body.condition);
    const condition = toDbCondition(listingState);
    const description =
      typeof params.body.description === "string" ? params.body.description.trim() : "";
    const category =
      typeof params.body.category === "string" ? params.body.category.trim() : "No category";
    const legacyImage = typeof params.body.image === "string" ? params.body.image.trim() : "";
    const imagesFromArray = normalizeImageArray(params.body.images);
    const images = imagesFromArray.length > 0 ? imagesFromArray : legacyImage ? [legacyImage] : [];
    const imageModerationSignals = normalizeImageModerationSignals(
      params.body.imageModerationSignals,
    );
    const type = parseListingType(params.body.type);
    const draftId =
      typeof params.body.draftId === "string" ? params.body.draftId.trim() : "";
    let attributes = normalizeAttributes(params.body.attributes);
    const techState = normalizeListingTechState(params.body.techState);

    if (!title || !Number.isFinite(price) || price <= 0) {
      throw validationError("Provide valid title and price");
    }

    const catalogSelection = await resolvePartnerCatalogSelection({
      type,
      rawCategory: category,
      attributes,
    });
    if (!catalogSelection.ok) {
      throw validationError(catalogSelection.error, { reasonCode: catalogSelection.reasonCode });
    }

    attributes = applyCatalogAttributeDefaults(
      attributes,
      catalogSelection.selection.attributeDefinitions,
    );
    const attributeValidation = validateAttributesAgainstSchema(
      attributes,
      catalogSelection.selection.attributeDefinitions,
    );
    if (!attributeValidation.ok) {
      throw validationError(attributeValidation.error, { reasonCode: attributeValidation.reasonCode });
    }
    const constraintValidation = await validateItemSchemaConstraints(
      attributes,
      catalogSelection.selection,
    );
    if (!constraintValidation.ok) {
      throw validationError(constraintValidation.error, { reasonCode: constraintValidation.reasonCode });
    }
    const suggestionAttributes = attributes;
    attributes = filterAttributesForCatalogSelection(attributes, catalogSelection.selection);

    if (params.sellerRole !== ROLE_ADMIN) {
      const onboardingAccess = await validateSellerOnboardingForListing({
        sellerId: params.sellerId,
        category: catalogSelection.selection.categoryName,
      });
      if (!onboardingAccess.ok) {
        throw forbidden(onboardingAccess.error);
      }
    }

    const qualityValidation = validateListingQuality({
      type,
      images,
      techState,
    });
    if (!qualityValidation.ok) {
      throw validationError(qualityValidation.error, { reasonCode: qualityValidation.reasonCode });
    }

    const imageUrl = images[0];
    const roundedPrice = Math.round(price);
    const persistedAttributes = mergeListingStateAttributes({
      attributes,
      listingState,
    });

    const createdRow = await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.create({
        data: {
          public_id: `LSTTMP-${Date.now()}`,
          seller_id: params.sellerId,
          type,
          title,
          description: description || null,
          item_id: catalogSelection.selection.itemId,
          price: roundedPrice,
          condition,
          tech_grade: techState?.grade ?? null,
          tech_battery_health: techState?.batteryHealthPercent ?? null,
          tech_defects: techState?.defects ?? null,
          tech_included: techState?.included ?? null,
          photo_count: images.length,
          photo_front_present: false,
          photo_back_present: false,
          photo_left_present: false,
          photo_right_present: false,
          status: LISTING_MODERATION,
          moderation_status: "PENDING",
        },
        select: {
          id: true,
          public_id: true,
          title: true,
          price: true,
        },
      });

      await tx.listingImage.createMany({
        data: images.map((url, index) => ({
          listing_id: listing.id,
          url,
          sort_order: index,
        })),
      });

      if (persistedAttributes.length > 0) {
        await tx.listingAttribute.createMany({
          data: persistedAttributes.map((attribute, index) => ({
            listing_id: listing.id,
            key: attribute.key,
            value: attribute.value,
            sort_order: index,
          })),
        });
      }

      return tx.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          public_id: `LST-${String(listing.id).padStart(4, "0")}`,
        },
        select: {
          id: true,
          public_id: true,
          title: true,
          price: true,
        },
      });
    });

    const created = await prisma.marketplaceListing.findUnique({
      where: { id: createdRow.id },
      include: {
        seller: {
          select: {
            addresses: {
              select: { city: true },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
        item: {
          include: {
            subcategory: {
              include: { category: true },
            },
          },
        },
        attributes: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!created) {
      throw notFound("Created listing not found after transaction");
    }

    await syncListingSearchKeywords({
      prismaClient: prisma,
      listingId: created.id,
    });

    await createCatalogSuggestionsForListing({
      type,
      sellerId: params.sellerId,
      attributes: suggestionAttributes,
      selection: catalogSelection.selection,
      listingPublicId: created.public_id,
      title: created.title,
    }).catch((error) => {
      console.error("Error saving catalog suggestion:", error);
    });

    await writeListingModerationEvent({
      listingId: created.id,
      actorUserId: null,
      actorType: "SYSTEM",
      decision: "QUEUED",
      reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
      reasonNote: "Listing queued for automatic moderation",
      metadata: {
        source: "partner.create",
        imageModerationSignals,
      },
    });

    if (draftId) {
      await prisma.listingDraft.deleteMany({
        where: {
          public_id: draftId,
          seller_id: params.sellerId,
        },
      }).catch((error) => {
        console.error("Error deleting submitted draft:", error);
      });
    }

    return {
      response: {
        ...this.toListingResponse(created),
        moderation: {
          status: "pending",
          reason: "queued_for_background_moderation",
          riskScore: null,
          signals: [],
          aiUsed: false,
        },
      },
      moderationJob: this.buildModerationJob({
        listingId: created.id,
        listingPublicId: created.public_id,
        sellerId: params.sellerId,
        title,
        description,
        category: catalogSelection.selection.itemName || category,
        price: roundedPrice,
        imageUrl,
        imageModerationSignals,
      }),
    };
  }

  async updateListing(params: {
    sellerId: number;
    sellerRole: string;
    publicId: string;
    body: {
      title?: unknown;
      price?: unknown;
      condition?: unknown;
      description?: unknown;
      category?: unknown;
      image?: unknown;
      images?: unknown;
      imageModerationSignals?: unknown;
      attributes?: unknown;
      techState?: unknown;
    };
  }) {
    const existing = await prisma.marketplaceListing.findFirst({
      where: {
        public_id: String(params.publicId),
        seller_id: params.sellerId,
      },
      include: {
        item: { include: { subcategory: { include: { category: true } } } },
        images: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        attributes: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        seller: {
          select: {
            addresses: {
              select: { city: true },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
      },
    });

    if (!existing) {
      throw notFound("Listing not found");
    }

    const price = params.body.price === undefined ? undefined : Number(params.body.price);
    if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
      throw validationError("Invalid price");
    }

    const nextCategory =
      typeof params.body.category === "string" ? params.body.category.trim() : undefined;
    const existingAttributeInputs = existing.attributes.map((attribute) => ({
      key: attribute.key,
      value: attribute.value,
    }));
    let nextAttributes =
      params.body.attributes === undefined ? undefined : normalizeAttributes(params.body.attributes);
    let catalogSelection: PartnerCatalogSelection | null = null;
    let nextItemId: number | null | undefined = undefined;
    let nextCategoryForModeration = listingCategoryNameForClient(existing.item, existing.attributes);
    if (nextCategory !== undefined || nextAttributes !== undefined) {
      const selectionAttributes = nextAttributes ?? existingAttributeInputs;
      const selectionResult = await resolvePartnerCatalogSelection({
        type: existing.type as any,
        rawCategory: nextCategory ?? nextCategoryForModeration,
        attributes: selectionAttributes,
      });
      if (!selectionResult.ok) {
        throw validationError(selectionResult.error, { reasonCode: selectionResult.reasonCode });
      }

      catalogSelection = selectionResult.selection;
      nextItemId = catalogSelection.itemId;
      nextCategoryForModeration = catalogSelection.itemName;

      nextAttributes = applyCatalogAttributeDefaults(
        selectionAttributes,
        catalogSelection.attributeDefinitions,
      );
      const attributeValidation = validateAttributesAgainstSchema(
        nextAttributes,
        catalogSelection.attributeDefinitions,
      );
      if (!attributeValidation.ok) {
        throw validationError(attributeValidation.error, { reasonCode: attributeValidation.reasonCode });
      }
      const constraintValidation = await validateItemSchemaConstraints(
        nextAttributes,
        catalogSelection,
      );
      if (!constraintValidation.ok) {
        throw validationError(constraintValidation.error, { reasonCode: constraintValidation.reasonCode });
      }
      const suggestionAttributes = nextAttributes;
      nextAttributes = filterAttributesForCatalogSelection(nextAttributes, catalogSelection);
      (catalogSelection as PartnerCatalogSelection & {
        suggestionAttributes?: ListingAttributeInput[];
      }).suggestionAttributes = suggestionAttributes;

      if (params.sellerRole !== ROLE_ADMIN) {
        const onboardingAccess = await validateSellerOnboardingForListing({
          sellerId: params.sellerId,
          category: catalogSelection.categoryName,
        });
        if (!onboardingAccess.ok) {
          throw forbidden(onboardingAccess.error);
        }
      }
    }

    const nextImagesFromBody =
      params.body.images === undefined ? undefined : normalizeImageArray(params.body.images);
    const legacyImage =
      typeof params.body.image === "string" ? params.body.image.trim() : undefined;
    const nextImages =
      nextImagesFromBody !== undefined
        ? nextImagesFromBody
        : legacyImage !== undefined
          ? legacyImage
            ? [legacyImage]
            : []
          : undefined;
    const imageModerationSignals = normalizeImageModerationSignals(
      params.body.imageModerationSignals,
    );
    if (nextImages !== undefined && nextImages.length === 0) {
      throw validationError("Provide at least one image");
    }
    const incomingListingState =
      params.body.condition === undefined ? undefined : parseListingState(params.body.condition);
    const incomingTechState =
      params.body.techState === undefined ? undefined : normalizeListingTechState(params.body.techState);
    if (params.body.techState !== undefined && !incomingTechState) {
      throw validationError("Invalid techState payload", {
        reasonCode: "QUALITY_TECH_FIELDS_INCOMPLETE",
      });
    }
    const normalizedExistingTechState = normalizeListingTechState({
      grade: existing.tech_grade,
      batteryHealthPercent: existing.tech_battery_health,
      defects: existing.tech_defects,
      included: existing.tech_included,
    });
    const nextTechState = incomingTechState ?? normalizedExistingTechState;
    const nextTitle =
      typeof params.body.title === "string" ? params.body.title.trim() : existing.title;
    const nextDescription =
      typeof params.body.description === "string"
        ? params.body.description.trim()
        : existing.description ?? "";
    const nextPrice = price === undefined ? existing.price : Math.round(price);
    const nextImageForModeration =
      nextImages === undefined ? existing.images[0]?.url ?? FALLBACK_LISTING_IMAGE : nextImages[0];
    const qualityValidation = validateListingQuality({
      type: existing.type as any,
      images: nextImages ?? existing.images.map((image) => image.url),
      techState: nextTechState,
    });
    if (!qualityValidation.ok) {
      throw validationError(qualityValidation.error, { reasonCode: qualityValidation.reasonCode });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextListingState =
        incomingListingState ??
        toClientListingState({
          condition: existing.condition as ListingConditionValue,
          attributes: existing.attributes,
        });
      const listing = await tx.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          title: typeof params.body.title === "string" ? params.body.title.trim() : undefined,
          price: price === undefined ? undefined : Math.round(price),
          condition:
            params.body.condition === undefined ? undefined : toDbCondition(nextListingState),
          description:
            typeof params.body.description === "string"
              ? params.body.description.trim()
              : undefined,
          item_id: nextItemId,
          tech_grade: nextTechState?.grade ?? null,
          tech_battery_health: nextTechState?.batteryHealthPercent ?? null,
          tech_defects: nextTechState?.defects ?? null,
          tech_included: nextTechState?.included ?? null,
          photo_count: nextImages?.length ?? existing.images.length,
          photo_front_present: false,
          photo_back_present: false,
          photo_left_present: false,
          photo_right_present: false,
          status: LISTING_MODERATION,
          moderation_status: "PENDING",
        },
      });

      if (nextImages !== undefined) {
        await tx.listingImage.deleteMany({ where: { listing_id: listing.id } });
        await tx.listingImage.createMany({
          data: nextImages.map((url, index) => ({
            listing_id: listing.id,
            url,
            sort_order: index,
          })),
        });
      }

      const shouldReplaceAttributes = nextAttributes !== undefined || incomingListingState !== undefined;
      if (shouldReplaceAttributes) {
        const baseAttributes = nextAttributes ?? existingAttributeInputs;
        const mergedAttributes = mergeListingStateAttributes({
          attributes: baseAttributes,
          listingState: nextListingState,
        });
        await tx.listingAttribute.deleteMany({ where: { listing_id: listing.id } });
        if (mergedAttributes.length > 0) {
          await tx.listingAttribute.createMany({
            data: mergedAttributes.map((attribute, index) => ({
              listing_id: listing.id,
              key: attribute.key,
              value: attribute.value,
              sort_order: index,
            })),
          });
        }
      }

      return listing;
    });

    if (catalogSelection && nextAttributes) {
      await createCatalogSuggestionsForListing({
        type: existing.type as any,
        sellerId: params.sellerId,
        attributes:
          (catalogSelection as PartnerCatalogSelection & {
            suggestionAttributes?: ListingAttributeInput[];
          }).suggestionAttributes ?? nextAttributes,
        selection: catalogSelection,
        listingPublicId: updated.public_id,
        title: updated.title,
      }).catch((error) => {
        console.error("Error saving catalog suggestion:", error);
      });
    }

    const reloaded = await prisma.marketplaceListing.findUnique({
      where: { id: updated.id },
      include: {
        item: { include: { subcategory: { include: { category: true } } } },
        attributes: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        images: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        seller: {
          select: {
            addresses: {
              select: { city: true },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
      },
    });

    if (!reloaded) {
      throw notFound("Listing not found after update");
    }

    await syncListingSearchKeywords({
      prismaClient: prisma,
      listingId: reloaded.id,
    });

    await writeListingModerationEvent({
      listingId: reloaded.id,
      actorUserId: null,
      actorType: "SYSTEM",
      decision: "QUEUED",
      reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
      reasonNote: "Listing re-queued after partner update",
      metadata: {
        source: "partner.update",
        imageModerationSignals,
      },
    });

    return {
      response: {
        ...this.toListingResponse(reloaded),
        moderation: {
          status: "pending",
          reason: "queued_for_background_moderation",
          riskScore: null,
          signals: [],
          aiUsed: false,
        },
      },
      moderationJob: this.buildModerationJob({
        listingId: reloaded.id,
        listingPublicId: reloaded.public_id,
        sellerId: params.sellerId,
        title: nextTitle,
        description: nextDescription,
        category: nextCategoryForModeration,
        price: nextPrice,
        imageUrl: nextImageForModeration,
        imageModerationSignals,
      }),
    };
  }

  async toggleListingStatus(params: { sellerId: number; publicId: string }) {
    const existing = await prisma.marketplaceListing.findFirst({
      where: {
        public_id: String(params.publicId),
        seller_id: params.sellerId,
      },
    });

    if (!existing) {
      throw notFound("Listing not found");
    }

    const currentStatus = existing.status as any;
    const requestedStatus = currentStatus === "INACTIVE" ? "MODERATION" : "INACTIVE";
    const transition = resolveSellerStatusTransition(currentStatus, requestedStatus as any);
    if (!transition) {
      throw conflict("Unsupported status transition", {
        status: toPartnerListingStatus(existing.status),
      });
    }

    if (transition.nextStatus === LISTING_MODERATION && (await hasBlockingOrderForListing(existing.id))) {
      throw conflict(
        "Нельзя повторно активировать объявление: по нему уже есть неотмененный заказ.",
        { status: toPartnerListingStatus(existing.status) },
      );
    }

    const updated = await prisma.marketplaceListing.update({
      where: { id: existing.id },
      data: {
        status: transition.nextStatus,
        moderation_status: transition.nextModerationStatus,
      },
    });

    let moderationJob: PartnerListingModerationJob | null = null;
    if (transition.nextStatus === LISTING_MODERATION) {
      const reloaded = await prisma.marketplaceListing.findUnique({
        where: { id: existing.id },
        include: {
          item: { include: { subcategory: { include: { category: true } } } },
          attributes: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
          images: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        },
      });

      if (reloaded) {
        await writeListingModerationEvent({
          listingId: reloaded.id,
          actorUserId: null,
          actorType: "SYSTEM",
          decision: "QUEUED",
          reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
          reasonNote: "Listing re-queued after status toggle",
          metadata: {
            source: "partner.toggle_status",
            imageModerationSignals: [],
          },
        });
        moderationJob = this.buildModerationJob({
          listingId: reloaded.id,
          listingPublicId: reloaded.public_id,
          sellerId: params.sellerId,
          title: reloaded.title,
          description: reloaded.description ?? "",
          category: listingCategoryNameForClient(reloaded.item, reloaded.attributes),
          price: reloaded.price,
          imageUrl: reloaded.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          imageModerationSignals: [],
        });
      }
    }

    return {
      response: {
        success: true,
        status: toPartnerListingStatus(updated.status),
      },
      moderationJob,
    };
  }

  async setListingStatus(params: { sellerId: number; publicId: string; status: unknown }) {
    const nextStatus = parseListingStatus(params.status);
    if (!nextStatus) {
      throw validationError("Invalid listing status");
    }

    const existing = await prisma.marketplaceListing.findFirst({
      where: {
        public_id: String(params.publicId),
        seller_id: params.sellerId,
      },
      select: {
        id: true,
        status: true,
        moderation_status: true,
      },
    });

    if (!existing) {
      throw notFound("Listing not found");
    }

    if (nextStatus === LISTING_ACTIVE) {
      throw validationError("Direct activation is not allowed for seller", {
        status: toPartnerListingStatus(existing.status),
      });
    }

    const transition = resolveSellerStatusTransition(existing.status as any, nextStatus);
    if (!transition) {
      throw conflict("Unsupported status transition", {
        status: toPartnerListingStatus(existing.status),
      });
    }

    if (transition.nextStatus === LISTING_MODERATION && (await hasBlockingOrderForListing(existing.id))) {
      throw conflict(
        "Нельзя повторно активировать объявление: по нему уже есть неотмененный заказ.",
        { status: toPartnerListingStatus(existing.status) },
      );
    }

    const updated = await prisma.marketplaceListing.update({
      where: { id: existing.id },
      data: {
        status: transition.nextStatus,
        moderation_status: transition.nextModerationStatus,
      },
    });

    let moderationJob: PartnerListingModerationJob | null = null;
    if (transition.nextStatus === LISTING_MODERATION) {
      const reloaded = await prisma.marketplaceListing.findUnique({
        where: { id: existing.id },
        include: {
          item: { include: { subcategory: { include: { category: true } } } },
          attributes: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
          images: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] },
        },
      });

      if (reloaded) {
        await writeListingModerationEvent({
          listingId: reloaded.id,
          actorUserId: null,
          actorType: "SYSTEM",
          decision: "QUEUED",
          reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
          reasonNote: "Listing re-queued after explicit status change",
          metadata: {
            source: "partner.set_status",
            imageModerationSignals: [],
          },
        });
        moderationJob = this.buildModerationJob({
          listingId: reloaded.id,
          listingPublicId: reloaded.public_id,
          sellerId: params.sellerId,
          title: reloaded.title,
          description: reloaded.description ?? "",
          category: listingCategoryNameForClient(reloaded.item, reloaded.attributes),
          price: reloaded.price,
          imageUrl: reloaded.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          imageModerationSignals: [],
        });
      }
    }

    return {
      response: {
        success: true,
        status: toPartnerListingStatus(updated.status),
        moderationStatus: updated.moderation_status.toLowerCase(),
      },
      moderationJob,
    };
  }

  async deleteListing(params: { sellerId: number; publicId: string }) {
    const existing = await prisma.marketplaceListing.findFirst({
      where: {
        public_id: String(params.publicId),
        seller_id: params.sellerId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw notFound("Listing not found");
    }

    if (await hasBlockingOrderForListing(existing.id)) {
      throw conflict(
        "Нельзя удалить объявление, связанное с неотмененным заказом. Это нарушит финансовую прозрачность.",
      );
    }

    await prisma.marketplaceListing.delete({
      where: { id: existing.id },
    });

    return { success: true };
  }

  async loadSellerModerationContext(params: { sellerId: number }) {
    return loadSellerModerationContext(params.sellerId);
  }

  async applyAutoModerationDecision(params: {
    listingId: number;
    moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
    listingStatus: string;
    reasonCode: string;
    reasonNote?: string | null;
    riskScore: number;
    signals: string[];
    aiUsed: boolean;
    imageModerationSignals: string[];
  }) {
    return applyAutoModerationDecision(params);
  }
}
