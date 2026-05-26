import type { SellerType, PrismaClient } from "@prisma/client";
import type { PartnerPayoutRepositoryPort } from "../../domain/partner-payout.types";

export class PartnerPayoutRepository implements PartnerPayoutRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  getProfile(sellerId: number) {
    return this.prisma.sellerPayoutProfile.findUnique({
      where: { seller_id: sellerId },
      select: {
        public_id: true,
        legal_type: true,
        legal_name: true,
        tax_id: true,
        bank_account: true,
        bank_bic: true,
        correspondent_account: true,
        bank_name: true,
        recipient_name: true,
        status: true,
        verified_at: true,
        rejection_reason: true,
        updated_at: true,
      },
    });
  }

  getSellerIdentity(sellerId: number) {
    return this.prisma.partnershipRequest
      .findFirst({
        where: {
          user_id: sellerId,
          onboarding_profile: {
            isNot: null,
          },
        },
        orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
        select: {
          onboarding_profile: {
            select: {
              legal_type: true,
              legal_name: true,
              inn: true,
            },
          },
        },
      })
      .then((request) => {
        if (!request?.onboarding_profile) {
          return null;
        }
        return {
          legalType:
            request.onboarding_profile.legal_type === "IP"
              ? "IP"
              : request.onboarding_profile.legal_type === "BRAND"
                ? "BRAND"
                : "COMPANY",
          legalName: request.onboarding_profile.legal_name,
          taxId: request.onboarding_profile.inn,
        } as const;
      });
  }

  upsertProfile(params: {
    sellerId: number;
    publicId: string;
    legalType: "COMPANY" | "IP" | "BRAND" | "ADMIN_APPROVED";
    legalName: string;
    taxId: string;
    bankAccount: string;
    bankBic: string;
    correspondentAccount: string;
    bankName: string;
    recipientName: string;
    status: "REJECTED" | "VERIFIED";
    verifiedAt: Date | null;
    rejectionReason: string | null;
  }) {
    return this.prisma.sellerPayoutProfile.upsert({
      where: { seller_id: params.sellerId },
      create: {
        public_id: params.publicId,
        seller_id: params.sellerId,
        legal_type: params.legalType as SellerType,
        legal_name: params.legalName,
        tax_id: params.taxId,
        bank_account: params.bankAccount,
        bank_bic: params.bankBic,
        correspondent_account: params.correspondentAccount,
        bank_name: params.bankName,
        recipient_name: params.recipientName,
        status: params.status,
        verified_by_id: null,
        verified_at: params.verifiedAt,
        rejection_reason: params.rejectionReason,
      },
      update: {
        legal_type: params.legalType as SellerType,
        legal_name: params.legalName,
        tax_id: params.taxId,
        bank_account: params.bankAccount,
        bank_bic: params.bankBic,
        correspondent_account: params.correspondentAccount,
        bank_name: params.bankName,
        recipient_name: params.recipientName,
        status: params.status,
        verified_by_id: null,
        verified_at: params.verifiedAt,
        rejection_reason: params.rejectionReason,
      },
      select: {
        public_id: true,
        legal_type: true,
        legal_name: true,
        tax_id: true,
        bank_account: true,
        bank_bic: true,
        correspondent_account: true,
        bank_name: true,
        recipient_name: true,
        status: true,
        verified_at: true,
        rejection_reason: true,
        updated_at: true,
      },
    });
  }
}
