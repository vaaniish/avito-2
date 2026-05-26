import {
  externalServiceError,
  validationError,
} from "../../../../../common/application-error";
import { makePublicId } from "../../../common/domain/ids";
import {
  normalizeDigits,
  normalizeRequiredText,
} from "../../../common/domain/text";
import {
  isValidBankAccount,
  isValidBic,
  isValidCorrespondentBankAccount,
  isValidSettlementBankAccount,
  isValidTaxId,
} from "../../../common/domain/validation";
import { lookupDadataBankByBic } from "../../../../partnership/dadata";
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

  private normalizeBankNameForCompare(value: string): string {
    return value
      .toUpperCase()
      .replace(/[«»"'`]/g, " ")
      .replace(/[.,()/\\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private isBankNameConsistent(inputName: string, referenceName: string): boolean {
    const normalizedInput = this.normalizeBankNameForCompare(inputName);
    const normalizedReference = this.normalizeBankNameForCompare(referenceName);
    if (!normalizedInput || !normalizedReference) return false;
    return (
      normalizedInput === normalizedReference ||
      normalizedInput.includes(normalizedReference) ||
      normalizedReference.includes(normalizedInput)
    );
  }

  async execute(input: {
    sellerId: number;
    actorUserId: number;
    requestIp: string | null;
    body: Record<string, unknown>;
  }) {
    const [sellerIdentity, currentProfile] = await Promise.all([
      this.repository.getSellerIdentity(input.sellerId),
      this.repository.getProfile(input.sellerId),
    ]);
    const legalType =
      parsePayoutLegalType(input.body.legalType) ??
      (sellerIdentity ? parsePayoutLegalType(sellerIdentity.legalType) : null) ??
      parsePayoutLegalType(currentProfile?.legal_type);
    const legalName =
      normalizeRequiredText(input.body.legalName) ||
      sellerIdentity?.legalName ||
      currentProfile?.legal_name ||
      "";
    const taxId =
      normalizeDigits(input.body.taxId) || sellerIdentity?.taxId || currentProfile?.tax_id || "";
    const bankAccount = normalizeDigits(input.body.bankAccount);
    const bankBic = normalizeDigits(input.body.bankBic);
    const correspondentAccount = normalizeDigits(input.body.correspondentAccount);
    const bankName = normalizeRequiredText(input.body.bankName);
    const recipientName =
      normalizeRequiredText(input.body.recipientName) ||
      currentProfile?.recipient_name ||
      legalName;

    if (!legalType) {
      throw validationError(
        "Не удалось определить юридические данные продавца. Сначала завершите и одобрите партнёрскую заявку или сохраните исходный профиль выплат.",
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
        "Проверьте ИНН, расчётный счёт, БИК, корреспондентский счёт и наименование банка.",
      );
    }

    let nextStatus: "REJECTED" | "VERIFIED" = "REJECTED";
    let verifiedAt: Date | null = null;
    let rejectionReason: string | null = null;
    let resolvedBankName = bankName;

    if (!isValidSettlementBankAccount(bankAccount, bankBic)) {
      rejectionReason = "Расчётный счёт не проходит контрольную проверку по БИК.";
    } else if (!isValidCorrespondentBankAccount(correspondentAccount, bankBic)) {
      rejectionReason = "Корреспондентский счёт не проходит контрольную проверку по БИК.";
    }

    if (!rejectionReason) {
      const bankLookup = await lookupDadataBankByBic(bankBic);
      if (!bankLookup.ok) {
        if (bankLookup.status === 404) {
          rejectionReason = "Банк с указанным БИК не найден в справочнике.";
        } else {
          throw externalServiceError(
            "Не удалось выполнить автоматическую проверку реквизитов. Попробуйте позже.",
          );
        }
      } else {
      const officialCorrespondentAccount = bankLookup.result.correspondentAccount;
      const officialBankName = bankLookup.result.paymentName || bankLookup.result.bankName;

        if (!officialCorrespondentAccount) {
          rejectionReason = "Для указанного БИК не найден корреспондентский счёт банка.";
        } else if (officialCorrespondentAccount !== correspondentAccount) {
          rejectionReason = "Корреспондентский счёт не совпадает со справочником банка по БИК.";
        } else if (!this.isBankNameConsistent(bankName, officialBankName)) {
          rejectionReason = "Наименование банка не совпадает со справочником банка по БИК.";
        } else {
          nextStatus = "VERIFIED";
          verifiedAt = new Date();
          rejectionReason = null;
          resolvedBankName = officialBankName;
        }
      }
    }

    if (rejectionReason && currentProfile) {
      throw validationError(rejectionReason);
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
      bankName: resolvedBankName,
      recipientName,
      status: nextStatus,
      verifiedAt,
      rejectionReason,
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
