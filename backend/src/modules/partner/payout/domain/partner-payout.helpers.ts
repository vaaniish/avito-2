export function parsePayoutLegalType(value: unknown) {
  if (value === "COMPANY") return "COMPANY";
  if (value === "IP") return "IP";
  if (value === "BRAND") return "BRAND";
  if (value === "ADMIN_APPROVED") return "ADMIN_APPROVED";
  return null;
}

export function payoutProfileToClient(profile: {
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
  verified_at?: Date | null;
  rejection_reason?: string | null;
  updated_at: Date;
}) {
  return {
    id: profile.public_id,
    legalType: profile.legal_type,
    legalName: profile.legal_name,
    taxId: profile.tax_id,
    bankAccount: profile.bank_account,
    bankBic: profile.bank_bic,
    correspondentAccount: profile.correspondent_account,
    bankName: profile.bank_name,
    recipientName: profile.recipient_name,
    status: profile.status.toLowerCase(),
    verifiedAt: profile.verified_at ?? null,
    rejectionReason: profile.rejection_reason ?? null,
    updatedAt: profile.updated_at,
  };
}
