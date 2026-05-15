import { validationError } from "../../../../../common/application-error";
import { makePublicId } from "../../../common/domain/ids";
import {
  normalizeDigits,
  normalizeRequiredText,
} from "../../../common/domain/text";
import {
  isValidBankAccount,
  isValidBic,
  isValidTaxId,
} from "../../../common/domain/validation";
import {
  parsePayoutLegalType,
  payoutProfileToClient,
} from "../../domain/partner-payout.helpers";
import type {
  PartnerPayoutAuditPort,
  PartnerPayoutRepositoryPort,
} from "../../domain/partner-payout.types";

export class UpsertPartnerPayoutProfileService {
  constructor(
    private readonly repository: PartnerPayoutRepositoryPort,
    private readonly auditWriter: PartnerPayoutAuditPort,
  ) {}

  async execute(input: {
    sellerId: number;
    actorUserId: number;
    requestIp: string | null;
    body: Record<string, unknown>;
  }) {
    const legalType = parsePayoutLegalType(input.body.legalType);
    const legalName = normalizeRequiredText(input.body.legalName);
    const taxId = normalizeDigits(input.body.taxId);
    const bankAccount = normalizeDigits(input.body.bankAccount);
    const bankBic = normalizeDigits(input.body.bankBic);
    const correspondentAccount = normalizeDigits(input.body.correspondentAccount);
    const bankName = normalizeRequiredText(input.body.bankName);
    const recipientName = normalizeRequiredText(input.body.recipientName);

    if (!legalType) {
      throw validationError(
        "Invalid legal type. Use COMPANY, IP, BRAND or ADMIN_APPROVED.",
      );
    }
    if (
      !legalName ||
      !bankName ||
      !recipientName ||
      !isValidTaxId(taxId) ||
      !isValidBankAccount(bankAccount) ||
      !isValidBic(bankBic) ||
      !isValidBankAccount(correspondentAccount)
    ) {
      throw validationError(
        "Invalid payout requisites. Check legal name, tax id, account, BIC and correspondent account.",
      );
    }

    const saved = await this.repository.upsertProfile({
      sellerId: input.sellerId,
      publicId: makePublicId("PAYOUT"),
      legalType,
      legalName,
      taxId,
      bankAccount,
      bankBic,
      correspondentAccount,
      bankName,
      recipientName,
    });

    await this.auditWriter.write({
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
      payoutProfileId: saved.public_id,
      status: saved.status,
    });

    return {
      success: true,
      profile: payoutProfileToClient(saved),
    };
  }
}
