import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  evaluateOnboardingProfile,
  makePartnershipPublicId,
  parsePartnershipLegalType,
  toClientPartnershipStatus,
  toOnboardingCreateInput,
  validateAndNormalizeOnboardingPayload,
  type PartnerOnboardingPayload,
} from "../partnership/onboarding";
import { lookupDadataParty } from "../partnership/dadata";
import { getPolicyAcceptanceStatus } from "../policy/policy.shared";

const profileEngagementRouter = Router();

const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

const ONBOARDING_PROFILE_SELECT = {
  public_id: true,
  legal_type: true,
  inn: true,
  ogrn: true,
  kpp: true,
  legal_name: true,
  registration_status: true,
  registered_address: true,
  tax_region: true,
  representative_full_name: true,
  representative_role: true,
  representative_phone: true,
  representative_email: true,
  authority_type: true,
  authority_document: true,
  website_url: true,
  business_email: true,
  domain_ownership_method: true,
  public_profile_urls: true,
  business_role: true,
  categories: true,
  fulfillment_model: true,
  country: true,
  region: true,
  city: true,
  warehouse_address: true,
  service_center_address: true,
  delivery_coverage_regions: true,
  pickup_available: true,
  return_address: true,
  support_phone: true,
  support_email: true,
  service_hours: true,
  monthly_capacity: true,
  product_source_type: true,
  supplier_documents: true,
  diagnostic_process: true,
  grading_standard: true,
  warranty_days: true,
  return_days: true,
  serial_check_policy: true,
  quality_charter_accepted: true,
  legal_lookup_verified: true,
  email_verified: true,
  domain_verified: true,
  representative_verified: true,
  payout_verified: true,
  allowed_categories: true,
  listing_limit: true,
  created_at: true,
  updated_at: true,
} as const;

profileEngagementRouter.post(
  "/partnership-requests/legal-lookup",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const lookup = await lookupDadataParty(req.body ?? {});
      if (!lookup.ok) {
        res.status(lookup.status).json({
          error: lookup.error,
          details: lookup.details,
        });
        return;
      }

      res.json({
        success: true,
        result: lookup.result,
      });
    } catch (error) {
      console.error("Error looking up partnership legal entity:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

function profileToClient(profile: any) {
  if (!profile) return null;
  return {
    id: profile.public_id,
    legalType: profile.legal_type,
    inn: profile.inn,
    ogrn: profile.ogrn,
    kpp: profile.kpp,
    legalName: profile.legal_name,
    registrationStatus: profile.registration_status,
    registeredAddress: profile.registered_address,
    taxRegion: profile.tax_region,
    representativeFullName: profile.representative_full_name,
    representativeRole: profile.representative_role,
    representativePhone: profile.representative_phone,
    representativeEmail: profile.representative_email,
    authorityType: profile.authority_type,
    authorityDocument: profile.authority_document,
    websiteUrl: profile.website_url,
    businessEmail: profile.business_email,
    domainOwnershipMethod: profile.domain_ownership_method,
    publicProfileUrls: profile.public_profile_urls,
    businessRole: profile.business_role,
    categories: profile.categories,
    fulfillmentModel: profile.fulfillment_model,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    warehouseAddress: profile.warehouse_address,
    serviceCenterAddress: profile.service_center_address,
    deliveryCoverageRegions: profile.delivery_coverage_regions,
    pickupAvailable: profile.pickup_available,
    returnAddress: profile.return_address,
    supportPhone: profile.support_phone,
    supportEmail: profile.support_email,
    serviceHours: profile.service_hours,
    monthlyCapacity: profile.monthly_capacity,
    productSourceType: profile.product_source_type,
    supplierDocuments: profile.supplier_documents,
    diagnosticProcess: profile.diagnostic_process,
    gradingStandard: profile.grading_standard,
    warrantyDays: profile.warranty_days,
    returnDays: profile.return_days,
    serialCheckPolicy: profile.serial_check_policy,
    qualityCharterAccepted: profile.quality_charter_accepted,
    legalLookupVerified: profile.legal_lookup_verified,
    emailVerified: profile.email_verified,
    domainVerified: profile.domain_verified,
    representativeVerified: profile.representative_verified,
    payoutVerified: profile.payout_verified,
    allowedCategories: profile.allowed_categories,
    listingLimit: profile.listing_limit,
    evaluation: evaluateOnboardingProfile(profile),
  };
}

function storedProfileToPayload(profile: any): PartnerOnboardingPayload {
  return {
    legalType: profile.legal_type,
    inn: profile.inn,
    ogrn: profile.ogrn,
    kpp: profile.kpp,
    legalName: profile.legal_name,
    registrationStatus: profile.registration_status,
    registeredAddress: profile.registered_address,
    taxRegion: profile.tax_region,
    representativeFullName: profile.representative_full_name,
    representativeRole: profile.representative_role,
    representativePhone: profile.representative_phone,
    representativeEmail: profile.representative_email,
    authorityType: profile.authority_type,
    authorityDocument: profile.authority_document,
    websiteUrl: profile.website_url,
    businessEmail: profile.business_email,
    domainOwnershipMethod: profile.domain_ownership_method,
    publicProfileUrls: profile.public_profile_urls,
    businessRole: profile.business_role,
    categories: profile.categories,
    fulfillmentModel: profile.fulfillment_model,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    warehouseAddress: profile.warehouse_address,
    serviceCenterAddress: profile.service_center_address,
    deliveryCoverageRegions: profile.delivery_coverage_regions,
    pickupAvailable: profile.pickup_available,
    returnAddress: profile.return_address,
    supportPhone: profile.support_phone,
    supportEmail: profile.support_email,
    serviceHours: profile.service_hours,
    monthlyCapacity: profile.monthly_capacity,
    productSourceType: profile.product_source_type,
    supplierDocuments: profile.supplier_documents,
    diagnosticProcess: profile.diagnostic_process,
    gradingStandard: profile.grading_standard,
    warrantyDays: profile.warranty_days,
    returnDays: profile.return_days,
    serialCheckPolicy: profile.serial_check_policy,
    qualityCharterAccepted: profile.quality_charter_accepted,
    legalLookupVerified: profile.legal_lookup_verified,
    emailVerified: profile.email_verified,
    domainVerified: profile.domain_verified,
    representativeVerified: profile.representative_verified,
    payoutVerified: profile.payout_verified,
  };
}

profileEngagementRouter.post(
  "/partnership-requests/draft",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const normalized = validateAndNormalizeOnboardingPayload(
        req.body as PartnerOnboardingPayload,
        { allowDraft: true },
      );
      if (!normalized.ok) {
        res.status(400).json({ error: "Invalid onboarding draft", details: normalized.errors });
        return;
      }

      const profile = normalized.profile;
      const created = await prisma.partnershipRequest.create({
        data: {
          public_id: makePartnershipPublicId(),
          user_id: session.user.id,
          seller_type: profile.legalType,
          status: "DRAFT",
          name: profile.legalName || "Черновик партнера",
          email: profile.businessEmail || session.user.email,
          contact: profile.representativePhone || "",
          link: profile.websiteUrl || "",
          category: profile.categories[0] ?? "",
          inn: profile.inn || null,
          geography: [profile.country, profile.region, profile.city].filter(Boolean).join(", ") || null,
          social_profile: profile.publicProfileUrls[0] ?? null,
          credibility: profile.diagnosticProcess || null,
          why_us: profile.businessRole || "Черновик партнерского онбординга",
          onboarding_profile: {
            create: {
              public_id: makePartnershipPublicId("ONB"),
              ...toOnboardingCreateInput(profile),
            },
          },
        },
        include: {
          onboarding_profile: {
            select: ONBOARDING_PROFILE_SELECT,
          },
        },
      });

      res.status(201).json({
        success: true,
        requestId: created.public_id,
        status: toClientPartnershipStatus(created.status),
        profile: profileToClient(created.onboarding_profile),
      });
    } catch (error) {
      console.error("Error creating partnership draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileEngagementRouter.patch(
  "/partnership-requests/:publicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const existing = await prisma.partnershipRequest.findFirst({
        where: {
          public_id: String(req.params.publicId),
          user_id: session.user.id,
        },
        include: {
          onboarding_profile: {
            select: ONBOARDING_PROFILE_SELECT,
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Partnership request not found" });
        return;
      }

      if (!["DRAFT", "NEEDS_MORE_INFO"].includes(existing.status)) {
        res.status(409).json({ error: "Only draft or needs_more_info requests can be edited." });
        return;
      }

      const normalized = validateAndNormalizeOnboardingPayload(
        req.body as PartnerOnboardingPayload,
        { allowDraft: true },
      );
      if (!normalized.ok) {
        res.status(400).json({ error: "Invalid onboarding draft", details: normalized.errors });
        return;
      }

      const profile = normalized.profile;
      const updated = await prisma.partnershipRequest.update({
        where: { id: existing.id },
        data: {
          seller_type: profile.legalType,
          name: profile.legalName || existing.name,
          email: profile.businessEmail || existing.email,
          contact: profile.representativePhone || existing.contact,
          link: profile.websiteUrl || existing.link,
          category: profile.categories[0] ?? existing.category,
          inn: profile.inn || null,
          geography: [profile.country, profile.region, profile.city].filter(Boolean).join(", ") || null,
          social_profile: profile.publicProfileUrls[0] ?? null,
          credibility: profile.diagnosticProcess || null,
          why_us: profile.businessRole || existing.why_us,
          onboarding_profile: {
            upsert: {
              create: {
                public_id: makePartnershipPublicId("ONB"),
                ...toOnboardingCreateInput(profile),
              },
              update: toOnboardingCreateInput(profile),
            },
          },
        },
        include: {
          onboarding_profile: {
            select: ONBOARDING_PROFILE_SELECT,
          },
        },
      });

      res.json({
        success: true,
        requestId: updated.public_id,
        status: toClientPartnershipStatus(updated.status),
        profile: profileToClient(updated.onboarding_profile),
      });
    } catch (error) {
      console.error("Error updating partnership draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileEngagementRouter.post(
  "/partnership-requests/:publicId/submit",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const policyStatus = await getPolicyAcceptanceStatus({
        prisma,
        userId: session.user.id,
        scope: "PARTNERSHIP",
      });
      if (!policyStatus.accepted) {
        res.status(412).json({
          error: "Before submitting a partnership request, accept the partnership policy.",
          policy: policyStatus.policy
            ? {
                id: policyStatus.policy.public_id,
                scope: "partnership",
                version: policyStatus.policy.version,
                title: policyStatus.policy.title,
                contentUrl: policyStatus.policy.content_url,
              }
            : null,
        });
        return;
      }

      const existing = await prisma.partnershipRequest.findFirst({
        where: {
          public_id: String(req.params.publicId),
          user_id: session.user.id,
        },
        include: {
          onboarding_profile: {
            select: ONBOARDING_PROFILE_SELECT,
          },
        },
      });

      if (!existing?.onboarding_profile) {
        res.status(404).json({ error: "Partnership draft not found" });
        return;
      }

      const validation = validateAndNormalizeOnboardingPayload(
        storedProfileToPayload(existing.onboarding_profile),
      );
      if (!validation.ok) {
        res.status(400).json({
          error: "Заполните обязательные поля партнерской проверки",
          details: validation.errors,
        });
        return;
      }

      const nextStatus =
        existing.onboarding_profile.legal_lookup_verified
          ? "REPRESENTATIVE_REVIEW"
          : "LEGAL_REVIEW";
      const updated = await prisma.partnershipRequest.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          rejection_reason: null,
        },
        include: {
          onboarding_profile: {
            select: ONBOARDING_PROFILE_SELECT,
          },
        },
      });

      res.json({
        success: true,
        requestId: updated.public_id,
        status: toClientPartnershipStatus(updated.status),
        profile: profileToClient(updated.onboarding_profile),
      });
    } catch (error) {
      console.error("Error submitting partnership request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileEngagementRouter.post(
  "/partnership-requests",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        sellerType?: unknown;
        name?: unknown;
        email?: unknown;
        contact?: unknown;
        link?: unknown;
        category?: unknown;
        inn?: unknown;
        geography?: unknown;
        socialProfile?: unknown;
        credibility?: unknown;
        whyUs?: unknown;
      };

      const policyStatus = await getPolicyAcceptanceStatus({
        prisma,
        userId: session.user.id,
        scope: "PARTNERSHIP",
      });
      if (!policyStatus.accepted) {
        res.status(412).json({
          error: "Before submitting a partnership request, accept the partnership policy.",
          policy: policyStatus.policy
            ? {
                id: policyStatus.policy.public_id,
                scope: "partnership",
                version: policyStatus.policy.version,
                title: policyStatus.policy.title,
                contentUrl: policyStatus.policy.content_url,
              }
            : null,
        });
        return;
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const contact =
        typeof body.contact === "string" ? body.contact.trim() : "";
      const link = typeof body.link === "string" ? body.link.trim() : "";
      const category =
        typeof body.category === "string" ? body.category.trim() : "";
      const inn = typeof body.inn === "string" ? body.inn.trim() : "";
      const geography =
        typeof body.geography === "string" ? body.geography.trim() : "";
      const socialProfile =
        typeof body.socialProfile === "string" ? body.socialProfile.trim() : "";
      const credibility =
        typeof body.credibility === "string" ? body.credibility.trim() : "";
      const whyUs = typeof body.whyUs === "string" ? body.whyUs.trim() : "";
      const sellerType = parsePartnershipLegalType(body.sellerType);

      if (
        !sellerType ||
        !name ||
        !email ||
        !contact ||
        !link ||
        !category ||
        !inn ||
        !geography ||
        !socialProfile ||
        !credibility ||
        !whyUs
      ) {
        res
          .status(400)
          .json({ error: "Заполните обязательные поля заявки" });
        return;
      }

      const legacyProfile = validateAndNormalizeOnboardingPayload(
        {
          legalType: sellerType,
          inn,
          ogrn: sellerType === "IP" ? "000000000000000" : "0000000000000",
          kpp: sellerType === "COMPANY" ? "000000000" : "",
          legalName: name,
          registrationStatus: "active",
          registeredAddress: geography,
          taxRegion: geography,
          representativeFullName: name,
          representativeRole: sellerType === "IP" ? "ИП" : "Ответственный за маркетплейс",
          representativePhone: contact,
          representativeEmail: email,
          authorityType: sellerType === "IP" ? "owner" : "manual_review",
          authorityDocument: "",
          websiteUrl: link,
          businessEmail: email,
          domainOwnershipMethod: "manual_review",
          publicProfileUrls: [socialProfile],
          businessRole: "seller",
          categories: [category],
          fulfillmentModel: "seller_delivery",
          country: "Россия",
          region: geography,
          city: geography,
          warehouseAddress: geography,
          serviceCenterAddress: geography,
          deliveryCoverageRegions: [geography],
          pickupAvailable: false,
          returnAddress: geography,
          supportPhone: contact,
          supportEmail: email,
          serviceHours: "09:00-18:00",
          monthlyCapacity: 20,
          productSourceType: "resale_or_refurbished",
          supplierDocuments: credibility,
          diagnosticProcess: credibility,
          gradingStandard: "new_open_box, refurbished_a, refurbished_b, refurbished_c",
          warrantyDays: 90,
          returnDays: 14,
          serialCheckPolicy: whyUs,
          qualityCharterAccepted: true,
        },
        { allowDraft: true },
      );

      if (!legacyProfile.ok || legacyProfile.profile.categories.length === 0) {
        res.status(400).json({
          error:
            "Only categories related to electronics and home appliances are allowed.",
        });
        return;
      }

      const created = await prisma.partnershipRequest.create({
        data: {
          public_id: makePartnershipPublicId(),
          user_id: session.user.id,
          seller_type: sellerType,
          status: "LEGAL_REVIEW",
          name,
          email,
          contact,
          link,
          category,
          inn,
          geography,
          social_profile: socialProfile,
          credibility,
          why_us: whyUs,
          onboarding_profile: {
            create: {
              public_id: makePartnershipPublicId("ONB"),
              ...toOnboardingCreateInput(legacyProfile.profile),
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        request_id: created.public_id,
      });
    } catch (error) {
      console.error("Error creating partnership request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileEngagementRouter.post(
  "/listings/:listingPublicId/review",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_BUYER]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const body = (req.body ?? {}) as { rating?: unknown; comment?: unknown };
      const rating = Number(body.rating);
      const comment =
        typeof body.comment === "string" ? body.comment.trim() : "";

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        res
          .status(400)
          .json({ error: "Rating must be an integer from 1 to 5" });
        return;
      }

      if (comment.length < 3) {
        res.status(400).json({ error: "Comment is too short" });
        return;
      }

      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const orderCount = await prisma.marketOrder.count({
        where: {
          buyer_id: session.user.id,
          status: "COMPLETED",
          items: {
            some: {
              listing_id: listing.id,
            },
          },
        },
      });

      if (orderCount === 0) {
        res
          .status(403)
          .json({ error: "You can only review items you have purchased." });
        return;
      }

      const existingReview = await prisma.listingReview.findUnique({
        where: {
          listing_id_author_id: {
            listing_id: listing.id,
            author_id: session.user.id,
          },
        },
      });

      if (existingReview) {
        res.status(409).json({ error: "You have already reviewed this item." });
        return;
      }

      const newReview = await prisma.listingReview.create({
        data: {
          listing_id: listing.id,
          author_id: session.user.id,
          rating,
          comment,
        },
        include: {
          author: {
            select: {
              display_name: true,
              avatar: true,
            },
          },
        },
      });

      const sellerReviews = await prisma.listingReview.findMany({
        where: {
          listing: {
            seller_id: listing.seller_id,
          },
        },
        select: {
          rating: true,
        },
      });

      const sellerRating =
        sellerReviews.length === 0
          ? 0
          : Number(
              (
                sellerReviews.reduce((sum, item) => sum + item.rating, 0) /
                sellerReviews.length
              ).toFixed(1),
            );

      await prisma.marketplaceListing.updateMany({
        where: { seller_id: listing.seller_id },
        data: {
          rating: sellerRating,
        },
      });

      res.status(201).json({
        id: String(newReview.id),
        author: newReview.author.display_name ?? "Аноним",
        rating: newReview.rating,
        date: newReview.created_at.toLocaleString("ru-RU", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }),
        sortTs: newReview.created_at.getTime(),
        comment: newReview.comment,
        avatar: newReview.author.avatar,
      });
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { profileEngagementRouter };
