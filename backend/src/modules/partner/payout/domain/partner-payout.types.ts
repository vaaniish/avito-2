export type PayoutLegalTypeValue =
  | "COMPANY"
  | "IP"
  | "BRAND"
  | "ADMIN_APPROVED";

export type PartnerSellerIdentity = {
  legalType: "COMPANY" | "IP" | "BRAND";
  legalName: string;
  taxId: string;
} | null;

export interface PartnerPayoutRepositoryPort {
  getProfile(sellerId: number): Promise<{
    public_id: string;
    legal_type: string;
    legal_name: string;
    tax_id: string;
    bank_account: string;
    bank_bic: string;
    correspondent_account: string;
    bank_name: string;
    recipient_name: string;
    status: string;
    verified_at: Date | null;
    rejection_reason: string | null;
    updated_at: Date;
  } | null>;
  getSellerIdentity(sellerId: number): Promise<PartnerSellerIdentity>;
  upsertProfile(params: {
    sellerId: number;
    publicId: string;
    legalType: PayoutLegalTypeValue;
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
  }): Promise<{
    public_id: string;
    legal_type: string;
    legal_name: string;
    tax_id: string;
    bank_account: string;
    bank_bic: string;
    correspondent_account: string;
    bank_name: string;
    recipient_name: string;
    status: string;
    verified_at: Date | null;
    rejection_reason: string | null;
    updated_at: Date;
  }>;
}

export interface PartnerPayoutAuditPort {
  write(input: {
    actorUserId: number;
    requestIp: string | null;
    payoutProfileId: string;
    status: string;
  }): Promise<void>;
}
