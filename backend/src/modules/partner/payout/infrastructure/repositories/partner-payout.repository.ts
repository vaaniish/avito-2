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
        status: "PENDING",
        verified_by_id: null,
        verified_at: null,
        rejection_reason: null,
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
        status: "PENDING",
        verified_by_id: null,
        verified_at: null,
        rejection_reason: null,
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
        updated_at: true,
      },
    });
  }
}
