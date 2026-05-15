import {
  preconditionFailed,
  validationError,
} from "../../../../../common/application-error";
import { toPartnershipPolicyDto } from "../../domain/profile-engagement.helpers";
import type {
  ProfileEngagementPolicyPort,
  ProfilePartnershipRepositoryPort,
} from "../../domain/profile-engagement.types";
import {
  parsePartnershipLegalType,
  validateAndNormalizeOnboardingPayload,
} from "../../../../partnership/onboarding";

export class CreateLegacyPartnershipRequestService {
  constructor(
    private readonly repository: ProfilePartnershipRepositoryPort,
    private readonly policyPort: ProfileEngagementPolicyPort,
  ) {}

  async execute(input: {
    userId: number;
    body: Record<string, unknown>;
  }) {
    const policyStatus = await this.policyPort.getPartnershipPolicyStatus(
      input.userId,
    );
    if (!policyStatus.accepted) {
      throw preconditionFailed(
        "Before submitting a partnership request, accept the partnership policy.",
        {
          policy: toPartnershipPolicyDto(policyStatus.policy),
        },
      );
    }

    const name = typeof input.body.name === "string" ? input.body.name.trim() : "";
    const email =
      typeof input.body.email === "string" ? input.body.email.trim() : "";
    const contact =
      typeof input.body.contact === "string" ? input.body.contact.trim() : "";
    const link = typeof input.body.link === "string" ? input.body.link.trim() : "";
    const category =
      typeof input.body.category === "string" ? input.body.category.trim() : "";
    const inn = typeof input.body.inn === "string" ? input.body.inn.trim() : "";
    const geography =
      typeof input.body.geography === "string"
        ? input.body.geography.trim()
        : "";
    const socialProfile =
      typeof input.body.socialProfile === "string"
        ? input.body.socialProfile.trim()
        : "";
    const credibility =
      typeof input.body.credibility === "string"
        ? input.body.credibility.trim()
        : "";
    const whyUs =
      typeof input.body.whyUs === "string" ? input.body.whyUs.trim() : "";
    const sellerType = parsePartnershipLegalType(input.body.sellerType);

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
      throw validationError("Заполните обязательные поля заявки");
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
        representativeRole:
          sellerType === "IP" ? "ИП" : "Ответственный за маркетплейс",
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
        gradingStandard:
          "new_open_box, refurbished_a, refurbished_b, refurbished_c",
        warrantyDays: 90,
        returnDays: 14,
        serialCheckPolicy: whyUs,
        qualityCharterAccepted: true,
      },
      { allowDraft: true },
    );

    if (!legacyProfile.ok || legacyProfile.profile.categories.length === 0) {
      throw validationError(
        "Only categories related to electronics and home appliances are allowed.",
      );
    }

    const created = await this.repository.createLegacyRequest({
      userId: input.userId,
      sellerType,
      name,
      email,
      contact,
      link,
      category,
      inn,
      geography,
      socialProfile,
      credibility,
      whyUs,
      profile: legacyProfile.profile,
    });

    return {
      success: true,
      request_id: created.public_id,
    };
  }
}
