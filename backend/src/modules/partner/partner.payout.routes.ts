import type { Request, Response, Router } from "express";
import { SellerType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  isValidBankAccount,
  isValidBic,
  isValidTaxId,
  makeAuditPublicId,
  makePublicId,
  normalizeDigits,
  normalizeRequiredText,
} from "./partner.shared";

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
type PayoutLegalTypeValue = "COMPANY" | "IP" | "BRAND" | "ADMIN_APPROVED";

function parsePayoutLegalType(value: unknown): PayoutLegalTypeValue | null {
  if (value === "COMPANY") return "COMPANY";
  if (value === "IP") return "IP";
  if (value === "BRAND") return "BRAND";
  if (value === "ADMIN_APPROVED") return "ADMIN_APPROVED";
  return null;
}

export function registerPartnerPayoutRoutes(router: Router): void {
  router.get("/payout-profile", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const profile = await prisma.sellerPayoutProfile.findUnique({
        where: { seller_id: session.user.id },
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

      if (!profile) {
        res.json({ profile: null });
        return;
      }

      res.json({
        profile: {
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
          verifiedAt: profile.verified_at,
          rejectionReason: profile.rejection_reason,
          updatedAt: profile.updated_at,
        },
      });
    } catch (error) {
      console.error("Error fetching payout profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.put("/payout-profile", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        legalType?: unknown;
        legalName?: unknown;
        taxId?: unknown;
        bankAccount?: unknown;
        bankBic?: unknown;
        correspondentAccount?: unknown;
        bankName?: unknown;
        recipientName?: unknown;
      };

      const legalType = parsePayoutLegalType(body.legalType);
      const legalName = normalizeRequiredText(body.legalName);
      const taxId = normalizeDigits(body.taxId);
      const bankAccount = normalizeDigits(body.bankAccount);
      const bankBic = normalizeDigits(body.bankBic);
      const correspondentAccount = normalizeDigits(body.correspondentAccount);
      const bankName = normalizeRequiredText(body.bankName);
      const recipientName = normalizeRequiredText(body.recipientName);

      if (!legalType) {
        res.status(400).json({
          error: "Invalid legal type. Use COMPANY, IP, BRAND or ADMIN_APPROVED.",
        });
        return;
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
        res.status(400).json({
          error:
            "Invalid payout requisites. Check legal name, tax id, account, BIC and correspondent account.",
        });
        return;
      }

      const payload = {
        legal_type: legalType as SellerType,
        legal_name: legalName,
        tax_id: taxId,
        bank_account: bankAccount,
        bank_bic: bankBic,
        correspondent_account: correspondentAccount,
        bank_name: bankName,
        recipient_name: recipientName,
        status: "PENDING" as const,
        verified_by_id: null,
        verified_at: null,
        rejection_reason: null,
      };

      const saved = await prisma.sellerPayoutProfile.upsert({
        where: { seller_id: session.user.id },
        create: {
          public_id: makePublicId("PAYOUT"),
          seller_id: session.user.id,
          ...payload,
        },
        update: payload,
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

      await prisma.auditLog.create({
        data: {
          public_id: makeAuditPublicId(),
          actor_user_id: session.user.id,
          action: "seller.payout_profile.updated",
          entity_type: "user",
          entity_public_id: null,
          details: {
            payoutProfileId: saved.public_id,
            status: saved.status,
          },
          ip_address: req.ip || null,
        },
      });

      res.json({
        success: true,
        profile: {
          id: saved.public_id,
          legalType: saved.legal_type,
          legalName: saved.legal_name,
          taxId: saved.tax_id,
          bankAccount: saved.bank_account,
          bankBic: saved.bank_bic,
          correspondentAccount: saved.correspondent_account,
          bankName: saved.bank_name,
          recipientName: saved.recipient_name,
          status: saved.status.toLowerCase(),
          updatedAt: saved.updated_at,
        },
      });
    } catch (error) {
      console.error("Error upserting payout profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
