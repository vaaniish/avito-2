import { Prisma } from "@prisma/client";
import { type Request, type Response, type Router } from "express";
import { prisma } from "../../lib/prisma";
import { buildTargetUrl, createNotification } from "../notifications/notification.service";
import {
  evaluateOnboardingProfile,
  jsonStringArray,
  parsePartnershipStatus as parseOnboardingPartnershipStatus,
  toClientPartnershipStatus,
} from "../partnership/onboarding";
import { requireAdmin, writeAudit } from "./admin.shared";

type KycStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type PartnershipStatusValue =
  | "DRAFT"
  | "SUBMITTED"
  | "LEGAL_REVIEW"
  | "REPRESENTATIVE_REVIEW"
  | "PAYOUT_REVIEW"
  | "QUALITY_REVIEW"
  | "APPROVED_LIMITED"
  | "NEEDS_MORE_INFO"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
type PayoutStatusValue = "PENDING" | "VERIFIED" | "REJECTED";
type ReviewActionClient =
  | "approved_limited"
  | "approved"
  | "needs_more_info"
  | "rejected";

const REVIEWABLE_PARTNERSHIP_STATUSES = new Set<PartnershipStatusValue>([
  "SUBMITTED",
  "LEGAL_REVIEW",
  "REPRESENTATIVE_REVIEW",
  "PAYOUT_REVIEW",
  "QUALITY_REVIEW",
  "PENDING",
]);

function toClientReviewAction(status: PartnershipStatusValue): ReviewActionClient {
  if (status === "APPROVED_LIMITED") return "approved_limited";
  if (status === "APPROVED") return "approved";
  if (status === "NEEDS_MORE_INFO") return "needs_more_info";
  return "rejected";
}

function getAllowedPartnershipActions(status: PartnershipStatusValue): ReviewActionClient[] {
  if (REVIEWABLE_PARTNERSHIP_STATUSES.has(status)) {
    return ["approved_limited", "approved", "needs_more_info", "rejected"];
  }

  if (status === "APPROVED") {
    return ["rejected"];
  }

  if (status === "APPROVED_LIMITED") {
    return ["approved", "needs_more_info", "rejected"];
  }

  if (status === "NEEDS_MORE_INFO") {
    return ["approved_limited", "approved", "rejected"];
  }

  return [];
}

function parseKycStatus(status: unknown): KycStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parsePartnershipStatus(status: unknown): PartnershipStatusValue | null {
  return parseOnboardingPartnershipStatus(status) as PartnershipStatusValue | null;
}

function parsePayoutStatus(status: unknown): PayoutStatusValue | null {
  if (status === "verified") return "VERIFIED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function splitEvidenceFiles(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\n;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildKycEvaluation(params: {
  documentsCount: number;
  hasInn: boolean;
  hasAddress: boolean;
  sellerComplaintsCount: number;
  sellerStatus: "ACTIVE" | "BLOCKED";
}): {
  completenessScore: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: "approve" | "request_more_documents" | "reject";
  checklist: Array<{ key: string; passed: boolean }>;
} {
  const checklist = [
    { key: "documents_attached", passed: params.documentsCount > 0 },
    { key: "inn_provided", passed: params.hasInn },
    { key: "address_provided", passed: params.hasAddress },
    { key: "seller_not_blocked", passed: params.sellerStatus !== "BLOCKED" },
  ];

  const completenessScore = Math.round(
    (checklist.filter((item) => item.passed).length / checklist.length) * 100,
  );

  const riskPoints =
    (params.sellerStatus === "BLOCKED" ? 40 : 0) +
    (params.sellerComplaintsCount >= 5
      ? 35
      : params.sellerComplaintsCount >= 2
        ? 20
        : 5) +
    (params.documentsCount === 0 ? 35 : params.documentsCount < 2 ? 15 : 0);

  const riskLevel: "low" | "medium" | "high" =
    riskPoints >= 65 ? "high" : riskPoints >= 35 ? "medium" : "low";

  const recommendation =
    riskLevel === "high"
      ? "reject"
      : completenessScore < 75
        ? "request_more_documents"
        : "approve";

  return {
    completenessScore,
    riskLevel,
    recommendation,
    checklist,
  };
}

export function registerAdminPartnershipRoutes(adminRouter: Router) {
  adminRouter.get("/partnership-requests", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const requests = await prisma.partnershipRequest.findMany({
        include: {
          user: {
            select: {
              public_id: true,
              role: true,
              status: true,
              email: true,
              name: true,
            },
          },
          reviewed_by: {
            select: {
              public_id: true,
              name: true,
              email: true,
            },
          },
          onboarding_profile: true,
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      res.json(
        requests.map((requestItem) => {
          const onboardingProfile = requestItem.onboarding_profile;
          const evaluation = onboardingProfile
            ? evaluateOnboardingProfile(onboardingProfile)
            : null;
          return {
            id: requestItem.public_id,
            status: toClientPartnershipStatus(requestItem.status),
            allowedActions: getAllowedPartnershipActions(requestItem.status),
            sellerType: requestItem.seller_type,
            name: requestItem.name,
            email: requestItem.email,
            contact: requestItem.contact,
            link: requestItem.link,
            category: requestItem.category,
            inn: requestItem.inn,
            geography: requestItem.geography,
            socialProfile: requestItem.social_profile,
            credibility: requestItem.credibility,
            whyUs: requestItem.why_us,
            createdAt: requestItem.created_at,
            reviewedAt: requestItem.reviewed_at,
            rejectionReason: requestItem.rejection_reason,
            adminNote: requestItem.admin_note,
            onboardingProfile: onboardingProfile
              ? {
                  id: onboardingProfile.public_id,
                  legalType: onboardingProfile.legal_type,
                  inn: onboardingProfile.inn,
                  ogrn: onboardingProfile.ogrn,
                  kpp: onboardingProfile.kpp,
                  legalName: onboardingProfile.legal_name,
                  registrationStatus: onboardingProfile.registration_status,
                  registeredAddress: onboardingProfile.registered_address,
                  taxRegion: onboardingProfile.tax_region,
                  representativeFullName: onboardingProfile.representative_full_name,
                  representativeRole: onboardingProfile.representative_role,
                  representativePhone: onboardingProfile.representative_phone,
                  representativeEmail: onboardingProfile.representative_email,
                  authorityType: onboardingProfile.authority_type,
                  authorityDocument: onboardingProfile.authority_document,
                  websiteUrl: onboardingProfile.website_url,
                  businessEmail: onboardingProfile.business_email,
                  domainOwnershipMethod: onboardingProfile.domain_ownership_method,
                  publicProfileUrls: jsonStringArray(onboardingProfile.public_profile_urls),
                  businessRole: onboardingProfile.business_role,
                  categories: jsonStringArray(onboardingProfile.categories),
                  fulfillmentModel: onboardingProfile.fulfillment_model,
                  country: onboardingProfile.country,
                  region: onboardingProfile.region,
                  city: onboardingProfile.city,
                  warehouseAddress: onboardingProfile.warehouse_address,
                  serviceCenterAddress: onboardingProfile.service_center_address,
                  deliveryCoverageRegions: jsonStringArray(
                    onboardingProfile.delivery_coverage_regions,
                  ),
                  pickupAvailable: onboardingProfile.pickup_available,
                  returnAddress: onboardingProfile.return_address,
                  supportPhone: onboardingProfile.support_phone,
                  supportEmail: onboardingProfile.support_email,
                  serviceHours: onboardingProfile.service_hours,
                  monthlyCapacity: onboardingProfile.monthly_capacity,
                  productSourceType: onboardingProfile.product_source_type,
                  supplierDocuments: onboardingProfile.supplier_documents,
                  diagnosticProcess: onboardingProfile.diagnostic_process,
                  gradingStandard: onboardingProfile.grading_standard,
                  warrantyDays: onboardingProfile.warranty_days,
                  returnDays: onboardingProfile.return_days,
                  serialCheckPolicy: onboardingProfile.serial_check_policy,
                  qualityCharterAccepted: onboardingProfile.quality_charter_accepted,
                  legalLookupVerified: onboardingProfile.legal_lookup_verified,
                  emailVerified: onboardingProfile.email_verified,
                  domainVerified: onboardingProfile.domain_verified,
                  representativeVerified: onboardingProfile.representative_verified,
                  payoutVerified: onboardingProfile.payout_verified,
                  allowedCategories: jsonStringArray(onboardingProfile.allowed_categories),
                  listingLimit: onboardingProfile.listing_limit,
                }
              : null,
            evaluation,
            applicant: {
              id: requestItem.user.public_id,
              role: requestItem.user.role.toLowerCase(),
              status: requestItem.user.status.toLowerCase(),
              email: requestItem.user.email,
              name: requestItem.user.name,
            },
            reviewedBy: requestItem.reviewed_by
              ? {
                  id: requestItem.reviewed_by.public_id,
                  name: requestItem.reviewed_by.name,
                  email: requestItem.reviewed_by.email,
                }
              : null,
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching partnership requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch("/partnership-requests/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as {
        status?: unknown;
        rejectionReason?: unknown;
        adminNote?: unknown;
      };
      const nextStatus = parsePartnershipStatus(body.status);
      if (!nextStatus) {
        res.status(400).json({ error: "Invalid partnership request status" });
        return;
      }

      const existing = await prisma.partnershipRequest.findUnique({
        where: { public_id: String(publicId) },
        select: {
          id: true,
          status: true,
          user_id: true,
          rejection_reason: true,
          admin_note: true,
          onboarding_profile: true,
          user: {
            select: {
              role: true,
              payout_profile: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });
      if (!existing) {
        res.status(404).json({ error: "Partnership request not found" });
        return;
      }

      const rejectionReason =
        nextStatus === "REJECTED" && typeof body.rejectionReason === "string"
          ? body.rejectionReason.trim()
          : null;
      const adminNote =
        typeof body.adminNote === "string" ? body.adminNote.trim() : null;
      const requiresAdminNote =
        nextStatus === "REJECTED" || nextStatus === "NEEDS_MORE_INFO";
      if (requiresAdminNote && !rejectionReason && !adminNote) {
        res.status(400).json({
          error: "Admin note or rejection reason is required for rejected/needs_more_info.",
        });
        return;
      }

      const payoutVerified = existing.user.payout_profile?.status === "VERIFIED";
      if (nextStatus === "APPROVED" && !payoutVerified && !adminNote) {
        res.status(400).json({
          error:
            "Verified payout profile or explicit admin override note is required for full approval.",
        });
        return;
      }

      const allowedActions = getAllowedPartnershipActions(existing.status);
      if (!allowedActions.includes(toClientReviewAction(nextStatus))) {
        res.status(400).json({
          error: "This partnership request transition is not allowed anymore.",
          allowedActions,
        });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.partnershipRequest.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            reviewed_by_id: access.user.id,
            reviewed_at: new Date(),
            rejection_reason: rejectionReason,
            admin_note: adminNote,
          },
        });

        if (existing.onboarding_profile) {
          await tx.partnerOnboardingProfile.update({
            where: { request_id: existing.id },
            data: {
              payout_verified: payoutVerified,
              allowed_categories: jsonStringArray(
                existing.onboarding_profile.categories,
              ) as Prisma.InputJsonValue,
              listing_limit:
                nextStatus === "APPROVED_LIMITED"
                  ? 20
                  : existing.onboarding_profile.listing_limit,
            },
          });
        }

        if (nextStatus === "APPROVED" || nextStatus === "APPROVED_LIMITED") {
          await tx.appUser.update({
            where: { id: existing.user_id },
            data: {
              role: "SELLER",
              status: "ACTIVE",
            },
          });

          await tx.sellerProfile.upsert({
            where: { user_id: existing.user_id },
            create: {
              user_id: existing.user_id,
              is_verified: nextStatus === "APPROVED",
            },
            update: {
              is_verified: nextStatus === "APPROVED",
            },
          });
        }

        if (nextStatus === "REJECTED") {
          await tx.appUser.update({
            where: { id: existing.user_id },
            data: {
              role: "BUYER",
            },
          });
        }

        return next;
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "partnership_request.status_changed",
        entityType: "partnership_request",
        entityPublicId: String(publicId),
        details: {
          beforeStatus: existing.status,
          afterStatus: updated.status,
          beforeUserRole: existing.user.role,
          afterUserRole:
            updated.status === "APPROVED" || updated.status === "APPROVED_LIMITED"
              ? "SELLER"
              : updated.status === "REJECTED"
                ? "BUYER"
                : existing.user.role,
          beforeRejectionReason: existing.rejection_reason,
          afterRejectionReason: updated.rejection_reason,
          beforeAdminNote: existing.admin_note,
          afterAdminNote: updated.admin_note,
        },
      });

      await createNotification({
        userId: existing.user_id,
        type: nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
        message:
          nextStatus === "REJECTED"
            ? `Партнёрская заявка отклонена.${updated.rejection_reason ? ` Причина: ${updated.rejection_reason}` : ""}`
            : nextStatus === "APPROVED" || nextStatus === "APPROVED_LIMITED"
              ? "Партнёрская заявка одобрена."
              : "Статус партнёрской заявки обновлён.",
        targetUrl: buildTargetUrl("partner"),
      });

      res.json({
        success: true,
        status: updated.status.toLowerCase(),
        userRole:
          nextStatus === "APPROVED" || nextStatus === "APPROVED_LIMITED"
            ? "partner"
            : nextStatus === "REJECTED"
              ? "regular"
              : existing.user.role === "SELLER"
                ? "partner"
                : "regular",
        allowedActions: getAllowedPartnershipActions(updated.status),
      });
    } catch (error) {
      console.error("Error updating partnership request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.get("/kyc-requests", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const requests = await prisma.kycRequest.findMany({
        include: {
          seller: {
            select: {
              public_id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              joined_at: true,
              seller_profile: {
                select: {
                  is_verified: true,
                  average_response_minutes: true,
                  commission_tier: {
                    select: {
                      public_id: true,
                      name: true,
                      commission_rate: true,
                    },
                  },
                },
              },
              _count: {
                select: {
                  listings: true,
                  orders_as_seller: true,
                  complaints_against: true,
                },
              },
            },
          },
          reviewed_by: {
            select: {
              public_id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      res.json(
        requests.map((requestItem) => ({
          id: requestItem.public_id,
          createdAt: requestItem.created_at,
          status: requestItem.status.toLowerCase(),
          sellerId: requestItem.seller.public_id,
          sellerName: requestItem.seller.name,
          sellerEmail: requestItem.seller.email,
          sellerPhone: requestItem.seller.phone,
          sellerStatus: requestItem.seller.status.toLowerCase(),
          sellerJoinedAt: requestItem.seller.joined_at,
          sellerVerified: Boolean(requestItem.seller.seller_profile?.is_verified),
          sellerResponseMinutes:
            requestItem.seller.seller_profile?.average_response_minutes ?? null,
          sellerCommissionTier: requestItem.seller.seller_profile?.commission_tier
            ? {
                id: requestItem.seller.seller_profile.commission_tier.public_id,
                name: requestItem.seller.seller_profile.commission_tier.name,
                rate: requestItem.seller.seller_profile.commission_tier.commission_rate,
              }
            : null,
          sellerListingsCount: requestItem.seller._count.listings,
          sellerOrdersCount: requestItem.seller._count.orders_as_seller,
          sellerComplaintsCount: requestItem.seller._count.complaints_against,
          email: requestItem.email,
          phone: requestItem.phone,
          companyName: requestItem.company_name,
          inn: requestItem.inn,
          address: requestItem.address,
          documents: requestItem.documents,
          documentFiles: splitEvidenceFiles(requestItem.documents),
          notes: requestItem.notes,
          reviewedAt: requestItem.reviewed_at,
          reviewedBy: requestItem.reviewed_by
            ? {
                id: requestItem.reviewed_by.public_id,
                name: requestItem.reviewed_by.name,
                email: requestItem.reviewed_by.email,
              }
            : null,
          rejectionReason: requestItem.rejection_reason,
          evaluation: buildKycEvaluation({
            documentsCount: splitEvidenceFiles(requestItem.documents).length,
            hasInn: requestItem.inn.trim().length > 0,
            hasAddress: requestItem.address.trim().length > 0,
            sellerComplaintsCount: requestItem.seller._count.complaints_against,
            sellerStatus: requestItem.seller.status,
          }),
        })),
      );
    } catch (error) {
      console.error("Error fetching KYC requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch("/kyc-requests/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as {
        status?: unknown;
        rejectionReason?: unknown;
      };

      const parsedStatus = parseKycStatus(body.status);
      if (!parsedStatus) {
        res.status(400).json({ error: "Invalid KYC status" });
        return;
      }

      const existing = await prisma.kycRequest.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true, status: true, rejection_reason: true, seller_id: true },
      });

      if (!existing) {
        res.status(404).json({ error: "KYC request not found" });
        return;
      }

      const updated = await prisma.kycRequest.update({
        where: { id: existing.id },
        data: {
          status: parsedStatus,
          reviewed_at: new Date(),
          reviewed_by_id: access.user.id,
          rejection_reason:
            parsedStatus === "REJECTED" && typeof body.rejectionReason === "string"
              ? body.rejectionReason.trim()
              : null,
        },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "kyc.status_changed",
        entityType: "kyc_request",
        entityPublicId: String(publicId),
        details: {
          beforeStatus: existing.status,
          afterStatus: updated.status,
          beforeRejectionReason: existing.rejection_reason,
          afterRejectionReason: updated.rejection_reason,
        },
      });

      await createNotification({
        userId: updated.seller_id,
        type: parsedStatus === "REJECTED" ? "SYSTEM" : "INFO",
        message:
          parsedStatus === "REJECTED"
            ? `KYC-проверка отклонена.${updated.rejection_reason ? ` Причина: ${updated.rejection_reason}` : ""}`
            : parsedStatus === "APPROVED"
              ? "KYC-проверка одобрена."
              : "KYC-проверка снова ожидает рассмотрения.",
        targetUrl: buildTargetUrl("partner"),
      });

      res.json({
        success: true,
        status: updated.status.toLowerCase(),
      });
    } catch (error) {
      console.error("Error updating KYC request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.get("/payout-profiles", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const profiles = await prisma.sellerPayoutProfile.findMany({
        include: {
          seller: {
            select: {
              public_id: true,
              name: true,
              email: true,
              status: true,
            },
          },
          verified_by: {
            select: {
              public_id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      });

      res.json(
        profiles.map((profile) => ({
          id: profile.public_id,
          status: profile.status.toLowerCase(),
          legalType: profile.legal_type,
          legalName: profile.legal_name,
          taxId: profile.tax_id,
          bankAccount: profile.bank_account,
          bankBic: profile.bank_bic,
          correspondentAccount: profile.correspondent_account,
          bankName: profile.bank_name,
          recipientName: profile.recipient_name,
          rejectionReason: profile.rejection_reason,
          verifiedAt: profile.verified_at,
          updatedAt: profile.updated_at,
          seller: {
            id: profile.seller.public_id,
            name: profile.seller.name,
            email: profile.seller.email,
            status: profile.seller.status.toLowerCase(),
          },
          verifiedBy: profile.verified_by
            ? {
                id: profile.verified_by.public_id,
                name: profile.verified_by.name,
                email: profile.verified_by.email,
              }
            : null,
        })),
      );
    } catch (error) {
      console.error("Error fetching payout profiles:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch(
    "/payout-profiles/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const { publicId } = req.params;
        const body = (req.body ?? {}) as { status?: unknown; rejectionReason?: unknown };
        const nextStatus = parsePayoutStatus(body.status);
        if (!nextStatus) {
          res.status(400).json({ error: "Invalid payout profile status" });
          return;
        }

        const existing = await prisma.sellerPayoutProfile.findUnique({
          where: { public_id: String(publicId) },
          select: {
            id: true,
            status: true,
            rejection_reason: true,
            seller_id: true,
          },
        });
        if (!existing) {
          res.status(404).json({ error: "Payout profile not found" });
          return;
        }

        const rejectionReason =
          nextStatus === "REJECTED" && typeof body.rejectionReason === "string"
            ? body.rejectionReason.trim()
            : null;

        const updated = await prisma.sellerPayoutProfile.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            verified_by_id: nextStatus === "PENDING" ? null : access.user.id,
            verified_at: nextStatus === "PENDING" ? null : new Date(),
            rejection_reason: rejectionReason,
          },
        });

        await writeAudit({
          req,
          actorUserId: access.user.id,
          action: "seller.payout_profile.status_changed",
          entityType: "seller_payout_profile",
          entityPublicId: String(publicId),
          details: {
            beforeStatus: existing.status,
            afterStatus: updated.status,
            beforeRejectionReason: existing.rejection_reason,
            afterRejectionReason: updated.rejection_reason,
          },
        });

        await createNotification({
          userId: updated.seller_id,
          type: nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
          message:
            nextStatus === "REJECTED"
              ? `Платёжный профиль отклонён.${updated.rejection_reason ? ` Причина: ${updated.rejection_reason}` : ""}`
              : nextStatus === "VERIFIED"
                ? "Платёжный профиль подтверждён."
                : "Платёжный профиль снова ожидает проверки.",
          targetUrl: buildTargetUrl("partner"),
        });

        res.json({
          success: true,
          status: updated.status.toLowerCase(),
        });
      } catch (error) {
        console.error("Error updating payout profile:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
