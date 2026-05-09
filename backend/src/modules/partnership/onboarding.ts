import type { PartnerOnboardingProfile, PartnershipRequestStatus, Prisma, SellerType } from "@prisma/client";

export type OnboardingLegalType = "COMPANY" | "IP" | "BRAND";

export const PARTNERSHIP_ALLOWED_CATEGORY_KEYS = [
  "electronics",
  "smartphones",
  "laptops",
  "tablets",
  "audio",
  "wearables",
  "gaming",
  "components",
  "accessories",
  "home_appliances",
  "kitchen_appliances",
  "electronics_repair",
  "home_appliance_repair",
] as const;

export const PARTNERSHIP_CATEGORY_LABELS: Record<string, string> = {
  electronics: "Электроника",
  smartphones: "Смартфоны",
  laptops: "Ноутбуки",
  tablets: "Планшеты",
  audio: "Аудио",
  wearables: "Носимая электроника",
  gaming: "Игровая электроника",
  components: "Комплектующие",
  accessories: "Аксессуары",
  home_appliances: "Бытовая техника",
  kitchen_appliances: "Кухонная техника",
  electronics_repair: "Ремонт электроники",
  home_appliance_repair: "Ремонт бытовой техники",
};

const ALLOWED_CATEGORY_SET = new Set<string>(PARTNERSHIP_ALLOWED_CATEGORY_KEYS);
const HIGH_RISK_CATEGORIES = new Set<string>(["smartphones", "laptops", "audio"]);
const ELECTRONICS_CHILD_CATEGORIES = new Set<string>([
  "smartphones",
  "laptops",
  "tablets",
  "audio",
  "wearables",
  "gaming",
  "components",
  "accessories",
  "electronics_repair",
]);
const HOME_APPLIANCE_CHILD_CATEGORIES = new Set<string>([
  "home_appliances",
  "kitchen_appliances",
  "home_appliance_repair",
]);
const INN_REGEX = /^\d{10}(\d{2})?$/;
const OGRN_REGEX = /^\d{13}(\d{2})?$/;
const KPP_REGEX = /^\d{9}$/;

export function hasValidInnChecksum(inn: string): boolean {
  const normalized = inn.replace(/\D/g, "");
  const digits = normalized.split("").map(Number);
  const checksum = (coefficients: number[]) =>
    (coefficients.reduce((sum, coefficient, index) => sum + coefficient * digits[index], 0) % 11) % 10;

  if (normalized.length === 10) {
    return checksum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9];
  }

  if (normalized.length === 12) {
    return (
      checksum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10] &&
      checksum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11]
    );
  }

  return false;
}

export type PartnerOnboardingPayload = {
  legalType?: unknown;
  sellerType?: unknown;
  inn?: unknown;
  ogrn?: unknown;
  ogrnip?: unknown;
  kpp?: unknown;
  legalName?: unknown;
  registrationStatus?: unknown;
  registeredAddress?: unknown;
  taxRegion?: unknown;
  representativeFullName?: unknown;
  representativeRole?: unknown;
  representativePhone?: unknown;
  representativeEmail?: unknown;
  authorityType?: unknown;
  authorityDocument?: unknown;
  websiteUrl?: unknown;
  link?: unknown;
  businessEmail?: unknown;
  email?: unknown;
  domainOwnershipMethod?: unknown;
  publicProfileUrls?: unknown;
  socialProfile?: unknown;
  businessRole?: unknown;
  categories?: unknown;
  category?: unknown;
  fulfillmentModel?: unknown;
  country?: unknown;
  region?: unknown;
  city?: unknown;
  warehouseAddress?: unknown;
  serviceCenterAddress?: unknown;
  deliveryCoverageRegions?: unknown;
  pickupAvailable?: unknown;
  returnAddress?: unknown;
  supportPhone?: unknown;
  contact?: unknown;
  supportEmail?: unknown;
  serviceHours?: unknown;
  monthlyCapacity?: unknown;
  productSourceType?: unknown;
  supplierDocuments?: unknown;
  diagnosticProcess?: unknown;
  gradingStandard?: unknown;
  warrantyDays?: unknown;
  returnDays?: unknown;
  serialCheckPolicy?: unknown;
  qualityCharterAccepted?: unknown;
  legalLookupVerified?: unknown;
  emailVerified?: unknown;
  domainVerified?: unknown;
  representativeVerified?: unknown;
  payoutVerified?: unknown;
  name?: unknown;
};

export type NormalizedOnboardingProfile = {
  legalType: OnboardingLegalType;
  inn: string;
  ogrn: string;
  kpp: string | null;
  legalName: string;
  registrationStatus: string;
  registeredAddress: string;
  taxRegion: string;
  representativeFullName: string;
  representativeRole: string;
  representativePhone: string;
  representativeEmail: string;
  authorityType: string;
  authorityDocument: string | null;
  websiteUrl: string;
  businessEmail: string;
  domainOwnershipMethod: string;
  publicProfileUrls: string[];
  businessRole: string;
  categories: string[];
  fulfillmentModel: string;
  country: string;
  region: string;
  city: string;
  warehouseAddress: string;
  serviceCenterAddress: string;
  deliveryCoverageRegions: string[];
  pickupAvailable: boolean;
  returnAddress: string;
  supportPhone: string;
  supportEmail: string;
  serviceHours: string;
  monthlyCapacity: number;
  productSourceType: string;
  supplierDocuments: string;
  diagnosticProcess: string;
  gradingStandard: string;
  warrantyDays: number;
  returnDays: number;
  serialCheckPolicy: string;
  qualityCharterAccepted: boolean;
  legalLookupVerified: boolean;
  emailVerified: boolean;
  domainVerified: boolean;
  representativeVerified: boolean;
  payoutVerified: boolean;
};

export type OnboardingValidationResult =
  | { ok: true; profile: NormalizedOnboardingProfile }
  | { ok: false; errors: string[] };

export type OnboardingEvaluation = {
  legalIdentityScore: number;
  representativeScore: number;
  payoutScore: number;
  qualityScore: number;
  categoryRisk: "low" | "medium" | "high";
  operationalScore: number;
  totalScore: number;
  recommendation: "approve" | "approve_limited" | "request_more_documents" | "reject";
  checklist: Array<{ key: string; passed: boolean; label: string }>;
};

export function makePartnershipPublicId(prefix = "PRQ"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function parsePartnershipLegalType(value: unknown): OnboardingLegalType | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (raw === "COMPANY" || raw === "IP" || raw === "BRAND") return raw;
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (lower === "company") return "COMPANY";
  if (lower === "ip") return "IP";
  if (lower === "brand") return "BRAND";
  return null;
}

export function parsePartnershipStatus(status: unknown): PartnershipRequestStatus | null {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toUpperCase();
  if (normalized === "DRAFT") return "DRAFT";
  if (normalized === "SUBMITTED") return "SUBMITTED";
  if (normalized === "LEGAL_REVIEW") return "LEGAL_REVIEW";
  if (normalized === "REPRESENTATIVE_REVIEW") return "REPRESENTATIVE_REVIEW";
  if (normalized === "PAYOUT_REVIEW") return "PAYOUT_REVIEW";
  if (normalized === "QUALITY_REVIEW") return "QUALITY_REVIEW";
  if (normalized === "APPROVED_LIMITED") return "APPROVED_LIMITED";
  if (normalized === "NEEDS_MORE_INFO") return "NEEDS_MORE_INFO";
  if (normalized === "PENDING") return "PENDING";
  if (normalized === "APPROVED") return "APPROVED";
  if (normalized === "REJECTED") return "REJECTED";
  if (status === "approvedLimited") return "APPROVED_LIMITED";
  if (status === "needsMoreInfo") return "NEEDS_MORE_INFO";
  return null;
}

export function toClientPartnershipStatus(status: PartnershipRequestStatus): string {
  return status.toLowerCase();
}

export function normalizeCategoryKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labelMatch = Object.entries(PARTNERSHIP_CATEGORY_LABELS).find(
    ([, label]) => label.toLowerCase() === normalized,
  );
  return labelMatch?.[0] ?? normalized;
}

export function normalizeCategories(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n;|]/g)
      : [];
  return Array.from(
    new Set(
      rawItems
        .map((item) => (typeof item === "string" ? normalizeCategoryKey(item) : ""))
        .filter((item) => ALLOWED_CATEGORY_SET.has(item)),
    ),
  );
}

export function isListingCategoryAllowed(listingCategory: string, allowedCategories: string[]): boolean {
  if (allowedCategories.length === 0) return true;
  const normalized = normalizeCategoryKey(listingCategory);
  if (allowedCategories.includes("electronics") && ELECTRONICS_CHILD_CATEGORIES.has(normalized)) {
    return true;
  }
  if (allowedCategories.includes("home_appliances") && HOME_APPLIANCE_CHILD_CATEGORIES.has(normalized)) {
    return true;
  }
  return allowedCategories.includes(normalized);
}

export function validateAndNormalizeOnboardingPayload(
  body: PartnerOnboardingPayload,
  options: { allowDraft?: boolean } = {},
): OnboardingValidationResult {
  const legalType = parsePartnershipLegalType(body.legalType ?? body.sellerType);
  const profile: NormalizedOnboardingProfile = {
    legalType: legalType ?? "COMPANY",
    inn: digits(body.inn),
    ogrn: digits(body.ogrn ?? body.ogrnip),
    kpp: nullableDigits(body.kpp),
    legalName: text(body.legalName ?? body.name),
    registrationStatus: text(body.registrationStatus) || "active",
    registeredAddress: text(body.registeredAddress),
    taxRegion: text(body.taxRegion),
    representativeFullName: text(body.representativeFullName),
    representativeRole: text(body.representativeRole),
    representativePhone: text(body.representativePhone ?? body.contact),
    representativeEmail: text(body.representativeEmail ?? body.email),
    authorityType: text(body.authorityType),
    authorityDocument: nullableText(body.authorityDocument),
    websiteUrl: text(body.websiteUrl ?? body.link),
    businessEmail: text(body.businessEmail ?? body.email),
    domainOwnershipMethod: text(body.domainOwnershipMethod),
    publicProfileUrls: stringList(body.publicProfileUrls ?? body.socialProfile),
    businessRole: text(body.businessRole),
    categories: normalizeCategories(body.categories ?? body.category),
    fulfillmentModel: text(body.fulfillmentModel),
    country: text(body.country) || "Россия",
    region: text(body.region),
    city: text(body.city),
    warehouseAddress: text(body.warehouseAddress),
    serviceCenterAddress: text(body.serviceCenterAddress),
    deliveryCoverageRegions: stringList(body.deliveryCoverageRegions),
    pickupAvailable: bool(body.pickupAvailable),
    returnAddress: text(body.returnAddress),
    supportPhone: text(body.supportPhone ?? body.contact),
    supportEmail: text(body.supportEmail ?? body.email),
    serviceHours: text(body.serviceHours),
    monthlyCapacity: positiveInt(body.monthlyCapacity),
    productSourceType: text(body.productSourceType),
    supplierDocuments: text(body.supplierDocuments),
    diagnosticProcess: text(body.diagnosticProcess),
    gradingStandard: text(body.gradingStandard),
    warrantyDays: positiveInt(body.warrantyDays),
    returnDays: positiveInt(body.returnDays),
    serialCheckPolicy: text(body.serialCheckPolicy),
    qualityCharterAccepted: bool(body.qualityCharterAccepted),
    legalLookupVerified: bool(body.legalLookupVerified),
    emailVerified: bool(body.emailVerified),
    domainVerified: bool(body.domainVerified),
    representativeVerified: bool(body.representativeVerified),
    payoutVerified: bool(body.payoutVerified),
  };

  if (options.allowDraft) {
    return { ok: true, profile };
  }

  const errors: string[] = [];
  if (!legalType) errors.push("Выберите тип продавца: юрлицо, ИП или бренд.");
  if (!INN_REGEX.test(profile.inn)) errors.push("ИНН должен содержать 10 или 12 цифр.");
  if (INN_REGEX.test(profile.inn) && !hasValidInnChecksum(profile.inn)) {
    errors.push("Проверьте ИНН: контрольная сумма не сходится.");
  }
  if (profile.ogrn && !OGRN_REGEX.test(profile.ogrn)) errors.push("ОГРН/ОГРНИП должен содержать 13 или 15 цифр.");
  if (profile.kpp && !KPP_REGEX.test(profile.kpp)) errors.push("КПП должен содержать 9 цифр.");
  if (!profile.legalLookupVerified) errors.push("Проверьте ИНН через DaData перед отправкой заявки.");
  if (!profile.legalName) errors.push("Юридическое название должно быть получено из DaData.");
  if (!profile.ogrn) errors.push("ОГРН/ОГРНИП должен быть получен из DaData.");
  if (!profile.registeredAddress) errors.push("Юридический адрес должен быть получен из DaData.");
  if (profile.registrationStatus && profile.registrationStatus.toLowerCase() !== "active") {
    errors.push("Юрлицо/ИП должен быть активным.");
  }
  if (!profile.representativeFullName) errors.push("Укажите ФИО представителя.");
  if (!isValidEmail(profile.representativeEmail)) errors.push("Укажите корректный email представителя.");
  if (profile.representativePhone.length < 6) errors.push("Укажите телефон представителя.");
  if (!profile.authorityType) errors.push("Укажите основание полномочий представителя.");
  if (profile.authorityType === "employee" && !profile.authorityDocument) {
    errors.push("Для сотрудника нужна доверенность или ссылка/номер документа.");
  }
  if (profile.publicProfileUrls.length === 0 || profile.publicProfileUrls.some((url) => !isValidHttpUrl(url))) {
    errors.push("Добавьте хотя бы один сайт, соцсеть, карту или публичный профиль бизнеса ссылкой http/https.");
  }
  if (!profile.websiteUrl && profile.publicProfileUrls[0]) {
    profile.websiteUrl = profile.publicProfileUrls[0];
  }
  if (!profile.businessEmail && profile.representativeEmail) {
    profile.businessEmail = profile.representativeEmail;
  }
  if (!profile.businessRole) errors.push("Опишите, чем занимается партнер.");
  if (profile.categories.length === 0) errors.push("Выберите электронику и/или бытовую технику.");
  if (!profile.region || !profile.city) errors.push("Укажите регион и город.");
  if (!profile.returnAddress) errors.push("Укажите адрес возврата.");
  if (profile.supportPhone.length < 6 || !isValidEmail(profile.supportEmail)) {
    errors.push("Укажите корректные контакты поддержки.");
  }
  if (!profile.serviceHours) errors.push("Укажите часы поддержки.");
  if (profile.monthlyCapacity <= 0) errors.push("Укажите месячную мощность обработки заказов.");
  if (!profile.productSourceType) errors.push("Укажите происхождение товара.");
  if (!profile.supplierDocuments) errors.push("Укажите документы на происхождение товара.");
  if (profile.warrantyDays < 90) errors.push("Минимальная гарантия для MVP — 90 дней.");
  if (profile.returnDays < 14) errors.push("Минимальный срок возврата — 14 дней.");
  if (!profile.qualityCharterAccepted) errors.push("Примите quality charter восстановленной техники.");

  return errors.length === 0 ? { ok: true, profile } : { ok: false, errors };
}

export function toOnboardingCreateInput(
  profile: NormalizedOnboardingProfile,
): Omit<Prisma.PartnerOnboardingProfileUncheckedCreateInput, "public_id" | "request_id"> {
  return {
    legal_type: profile.legalType as SellerType,
    inn: profile.inn,
    ogrn: profile.ogrn,
    kpp: profile.kpp,
    legal_name: profile.legalName,
    registration_status: profile.registrationStatus,
    registered_address: profile.registeredAddress,
    tax_region: profile.taxRegion,
    representative_full_name: profile.representativeFullName,
    representative_role: profile.representativeRole,
    representative_phone: profile.representativePhone,
    representative_email: profile.representativeEmail,
    authority_type: profile.authorityType,
    authority_document: profile.authorityDocument,
    website_url: profile.websiteUrl,
    business_email: profile.businessEmail,
    domain_ownership_method: profile.domainOwnershipMethod,
    public_profile_urls: profile.publicProfileUrls,
    business_role: profile.businessRole,
    categories: profile.categories,
    fulfillment_model: profile.fulfillmentModel,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    warehouse_address: profile.warehouseAddress,
    service_center_address: profile.serviceCenterAddress,
    delivery_coverage_regions: profile.deliveryCoverageRegions,
    pickup_available: profile.pickupAvailable,
    return_address: profile.returnAddress,
    support_phone: profile.supportPhone,
    support_email: profile.supportEmail,
    service_hours: profile.serviceHours,
    monthly_capacity: profile.monthlyCapacity,
    product_source_type: profile.productSourceType,
    supplier_documents: profile.supplierDocuments,
    diagnostic_process: profile.diagnosticProcess,
    grading_standard: profile.gradingStandard,
    warranty_days: profile.warrantyDays,
    return_days: profile.returnDays,
    serial_check_policy: profile.serialCheckPolicy,
    quality_charter_accepted: profile.qualityCharterAccepted,
    legal_lookup_verified: profile.legalLookupVerified,
    email_verified: profile.emailVerified,
    domain_verified: profile.domainVerified,
    representative_verified: profile.representativeVerified,
    payout_verified: profile.payoutVerified,
    allowed_categories: profile.categories,
    listing_limit: 20,
  };
}

export function evaluateOnboardingProfile(
  profile: Pick<
    PartnerOnboardingProfile,
    | "inn"
    | "ogrn"
    | "legal_type"
    | "kpp"
    | "registration_status"
    | "registered_address"
    | "representative_role"
    | "authority_document"
    | "authority_type"
    | "website_url"
    | "business_email"
    | "domain_ownership_method"
    | "public_profile_urls"
    | "categories"
    | "return_address"
    | "support_phone"
    | "support_email"
    | "service_hours"
    | "monthly_capacity"
    | "supplier_documents"
    | "diagnostic_process"
    | "grading_standard"
    | "warranty_days"
    | "return_days"
    | "serial_check_policy"
    | "quality_charter_accepted"
    | "legal_lookup_verified"
    | "email_verified"
    | "domain_verified"
    | "representative_verified"
    | "payout_verified"
  >,
): OnboardingEvaluation {
  const categories = jsonStringArray(profile.categories);
  const publicProfileUrls = jsonStringArray(profile.public_profile_urls);
  const hasHighRiskCategory = categories.some((category) => HIGH_RISK_CATEGORIES.has(category));

  const checklist = [
    {
      key: "legal_identity_verified",
      passed:
        INN_REGEX.test(profile.inn) &&
        (
          Boolean(profile.legal_lookup_verified) ||
          profile.registration_status.toLowerCase() === "active"
        ),
      label: "ИНН указан, юрлицо/ИП готово к проверке по реестру",
    },
    {
      key: "representative_verified",
      passed:
        Boolean(profile.representative_verified) ||
        profile.authority_type === "owner" ||
        profile.authority_type === "director" ||
        Boolean(profile.authority_document),
      label: "Представитель связан с бизнесом",
    },
    {
      key: "payout_verified",
      passed: Boolean(profile.payout_verified),
      label: "Платежные реквизиты/KYB подтверждены",
    },
    {
      key: "channels_verified",
      passed:
        (
          Boolean(profile.domain_verified) ||
          jsonStringArray(profile.public_profile_urls).length > 0
        ) &&
        isValidEmail(profile.business_email) &&
        publicProfileUrls.length > 0,
      label: "Есть рабочий email и публичный онлайн-след бизнеса",
    },
    {
      key: "quality_charter",
      passed:
        Boolean(profile.quality_charter_accepted) &&
        profile.warranty_days >= 90 &&
        profile.return_days >= 14 &&
        profile.supplier_documents.length > 0,
      label: "Quality charter и документы на товар заполнены",
    },
    {
      key: "operational_readiness",
      passed:
        profile.return_address.length > 0 &&
        profile.support_phone.length >= 6 &&
        isValidEmail(profile.support_email) &&
        profile.service_hours.length > 0 &&
        profile.monthly_capacity > 0,
      label: "Операционная модель готова",
    },
  ];

  const legalIdentityScore = checklist[0].passed ? 100 : 45;
  const representativeScore = checklist[1].passed ? 100 : 50;
  const payoutScore = checklist[2].passed ? 100 : 0;
  const qualityScore = checklist[4].passed ? (hasHighRiskCategory ? 80 : 90) : 35;
  const operationalScore = checklist[5].passed ? 90 : 45;
  const categoryRisk: OnboardingEvaluation["categoryRisk"] = hasHighRiskCategory
    ? "high"
    : categories.length >= 4
      ? "medium"
      : "low";
  const totalScore = Math.round(
    legalIdentityScore * 0.24 +
      representativeScore * 0.16 +
      payoutScore * 0.2 +
      qualityScore * 0.24 +
      operationalScore * 0.16,
  );

  const failedCritical = !checklist[0].passed || !checklist[4].passed;
  const recommendation: OnboardingEvaluation["recommendation"] =
    failedCritical
      ? "request_more_documents"
      : payoutScore === 0
        ? "approve_limited"
        : totalScore >= 85
          ? "approve"
          : totalScore >= 65
            ? "approve_limited"
            : "reject";

  return {
    legalIdentityScore,
    representativeScore,
    payoutScore,
    qualityScore,
    categoryRisk,
    operationalScore,
    totalScore,
    recommendation,
    checklist,
  };
}

export function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function digits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D+/g, "") : "";
}

function nullableDigits(value: unknown): string | null {
  const normalized = digits(value);
  return normalized || null;
}

function positiveInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

function stringList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n;|]/g)
      : [];
  return Array.from(
    new Set(
      values
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
