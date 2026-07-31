import type { RequestHandler } from "express";
import { z } from "zod";

const MAX_DEPTH = 8;
const MAX_ARRAY = 200;
const MAX_STRING = 20_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_URL = 2048;

const shortText = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().max(MAX_STRING).optional();
const publicId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const positiveInteger = z.coerce.number().int().positive();
const booleanValue = z.boolean();
const money = z.coerce.number().int().nonnegative();
const imageValue = z.string().trim().min(1).max(5 * 1024 * 1024);
const imageList = z.array(imageValue).max(10);
const attributeList = z.array(z.object({
  key: z.string().trim().min(1).max(160),
  value: z.string().trim().max(4_000),
}).strict()).max(200);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string().max(MAX_STRING),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValue).max(MAX_ARRAY),
  z.record(z.string().min(1).max(160), jsonValue).refine(
    (value) => Object.keys(value).length <= MAX_ARRAY,
    `Object must not contain more than ${MAX_ARRAY} fields`,
  ),
]));
const jsonObject = z.record(z.string().min(1).max(160), jsonValue).refine(
  (value) => Object.keys(value).length <= MAX_ARRAY,
  `Object must not contain more than ${MAX_ARRAY} fields`,
);

const emptyBody = z.object({}).strict();
const authLoginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
  rememberMe: z.boolean().optional(),
}).strict();
const authSignupBody = authLoginBody.extend({
  name: z.string().trim().min(1).max(160),
  username: z.string().trim().min(1).max(80).optional(),
}).strict();

const profileBody = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  displayName: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(320).optional(),
  workEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  oldPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(12).max(128).optional(),
}).strict();

const addressBody = z.object({
  name: z.string().trim().max(160).optional(),
  label: z.string().trim().max(80).optional(),
  fullAddress: z.string().trim().max(1_000).optional(),
  region: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  street: z.string().trim().max(240).optional(),
  house: z.string().trim().max(40).optional(),
  building: z.string().trim().max(40).optional(),
  apartment: z.string().trim().max(40).optional(),
  entrance: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(20).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  isDefault: booleanValue.optional(),
}).strict();

const checkoutBody = z.object({
  items: z.array(z.object({
    listingId: publicId,
    quantity: positiveInteger.max(1_000),
  }).strict()).min(1).max(100),
  pickupPointAddress: z.string().trim().max(1_000).optional(),
  pickupPointId: z.string().trim().max(160).optional(),
  pickupPointProvider: z.string().trim().max(80).optional(),
  deliveryType: z.enum(["pickup", "delivery"]),
  paymentMethod: z.string().trim().min(1).max(80),
  promoCode: z.string().trim().max(80).optional(),
}).strict();

const listingBody = z.object({
  title: z.string().trim().max(500).optional(),
  price: money.optional(),
  condition: z.enum(["new", "used", "restored", "NEW", "USED"]).optional(),
  description: optionalText,
  category: z.string().trim().max(300).optional(),
  image: imageValue.optional(),
  images: imageList.optional(),
  imageModerationSignals: z.array(z.string().trim().max(160)).max(100).optional(),
  attributes: attributeList.optional(),
  techState: jsonObject.optional(),
  type: z.enum(["product", "products", "PRODUCT"]).optional(),
  draftId: publicId.optional(),
  sellerWarrantyEnabled: booleanValue.optional(),
  sellerWarrantyDays: z.coerce.number().int().min(0).max(3650).optional(),
  hasMultipleStock: booleanValue.optional(),
  availableQuantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  status: z.string().trim().max(40).optional(),
}).strict();

const draftFormState = z.object({
  title: z.string().trim().max(500).optional(),
  price: z.string().trim().max(40).optional(),
  condition: z.enum(["new", "restored", "used"]).optional(),
  description: z.string().trim().max(MAX_STRING).optional(),
  category: z.string().trim().max(300).optional(),
  categoryRoot: z.string().trim().max(300).optional(),
  customCategoryRoot: z.string().trim().max(300).optional(),
  subcategory: z.string().trim().max(300).optional(),
  customSubcategory: z.string().trim().max(300).optional(),
  catalogItem: z.string().trim().max(300).optional(),
  customCatalogItem: z.string().trim().max(300).optional(),
  catalogRequestAttributes: z.string().trim().max(4_000).optional(),
  catalogRequestComment: z.string().trim().max(4_000).optional(),
  type: z.enum(["products"]).optional(),
  meetingAddress: z.string().trim().max(1_000).optional(),
  images: imageList.optional(),
  hasDefects: z.enum(["", "yes", "no"]).optional(),
  characteristics: z.record(z.string().min(1).max(160), z.string().max(4_000)).optional(),
  sellerWarrantyEnabled: z.boolean().optional(),
  sellerWarrantyDays: z.string().trim().max(20).optional(),
  hasMultipleStock: z.boolean().optional(),
  availableQuantity: z.string().trim().max(20).optional(),
}).strict();

const listingDraftBody = z.object({
  type: z.enum(["product", "products", "PRODUCT"]).optional(),
  payload: draftFormState.optional(),
  currentScreen: z.string().trim().max(120).optional(),
  title: z.string().trim().max(500).optional(),
  category: z.string().trim().max(300).optional(),
  itemId: publicId.optional(),
  images: imageList.optional(),
  attributes: attributeList.optional(),
}).strict();

const payoutBody = z.object({
  recipientName: z.string().trim().max(240).optional(),
  bankName: z.string().trim().max(240).optional(),
  bankBic: z.string().trim().max(20).optional(),
  correspondentAccount: z.string().trim().max(34).optional(),
  bankAccount: z.string().trim().max(34).optional(),
  taxId: z.string().trim().max(20).optional(),
  legalName: z.string().trim().max(500).optional(),
  legalType: z.string().trim().max(80).optional(),
}).strict();

const partnershipBody = z.object({
  name: z.string().trim().max(240).optional(),
  email: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  sellerType: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(500).optional(),
  link: z.string().trim().max(2048).optional(),
  category: z.string().trim().max(300).optional(),
  geography: z.string().trim().max(500).optional(),
  socialProfile: z.string().trim().max(2048).optional(),
  credibility: optionalText,
  whyUs: optionalText,
  inn: z.string().trim().max(20).optional(),
  legalType: z.string().trim().max(80).optional(),
  ogrn: z.string().trim().max(20).optional(),
  ogrnip: z.string().trim().max(20).optional(),
  kpp: z.string().trim().max(20).optional(),
  legalName: z.string().trim().max(500).optional(),
  registrationStatus: z.string().trim().max(80).optional(),
  registeredAddress: z.string().trim().max(1_000).optional(),
  taxRegion: z.string().trim().max(160).optional(),
  representativeFullName: z.string().trim().max(240).optional(),
  representativeRole: z.string().trim().max(160).optional(),
  representativePhone: z.string().trim().max(40).optional(),
  representativeEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  authorityType: z.string().trim().max(160).optional(),
  authorityDocument: z.string().trim().max(1_000).optional(),
  websiteUrl: z.string().trim().max(2048).optional(),
  businessEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  domainOwnershipMethod: z.string().trim().max(160).optional(),
  publicProfileUrls: z.array(z.string().trim().max(2048)).max(20).optional(),
  businessRole: z.string().trim().max(160).optional(),
  categories: z.array(z.string().trim().max(300)).max(100).optional(),
  fulfillmentModel: z.string().trim().max(160).optional(),
  country: z.string().trim().max(160).optional(),
  warehouseAddress: z.string().trim().max(1_000).optional(),
  serviceCenterAddress: z.string().trim().max(1_000).optional(),
  deliveryCoverageRegions: z.array(z.string().trim().max(160)).max(100).optional(),
  pickupAvailable: z.boolean().optional(),
  returnAddress: z.string().trim().max(1_000).optional(),
  supportPhone: z.string().trim().max(40).optional(),
  supportEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
  serviceHours: z.string().trim().max(500).optional(),
  monthlyCapacity: z.union([z.string().trim().max(120), z.coerce.number().nonnegative()]).optional(),
  productSourceType: z.string().trim().max(160).optional(),
  supplierDocuments: z.array(z.string().trim().max(2048)).max(50).optional(),
  diagnosticProcess: optionalText,
  gradingStandard: optionalText,
  warrantyDays: z.coerce.number().int().min(0).max(3650).optional(),
  returnDays: z.coerce.number().int().min(0).max(3650).optional(),
  serialCheckPolicy: optionalText,
  qualityCharterAccepted: z.boolean().optional(),
  legalLookupVerified: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  domainVerified: z.boolean().optional(),
  representativeVerified: z.boolean().optional(),
  payoutVerified: z.boolean().optional(),
}).strict();

const webhookBody = z.object({
  type: z.string().trim().max(80).optional(),
  event: z.string().trim().max(160),
  object: jsonObject,
}).strict();

type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type MutationSchemaDefinition = {
  method: MutationMethod;
  template: string;
  body: z.ZodType<Record<string, unknown>>;
  requireIdempotencyKey?: boolean;
};

function route(
  method: MutationMethod,
  template: string,
  body: z.ZodType<Record<string, unknown>> = emptyBody,
  requireIdempotencyKey = false,
): MutationSchemaDefinition {
  return { method, template, body, requireIdempotencyKey };
}

const statusBody = z.object({ status: shortText }).strict();
const adminModerationBody = z.object({
  status: z.enum(["approved", "rejected", "pending", "APPROVED", "REJECTED", "PENDING"]),
  reasonCode: z.string().trim().max(160).optional(),
  reasonNote: z.string().trim().max(4_000).optional(),
}).strict();
const nullableAdminText = z.union([z.string().trim().max(4_000), z.null()]).optional();
const complaintBody = z.object({
  status: z.enum(["new", "pending", "approved", "rejected"]),
  adminNote: nullableAdminText,
  actionTaken: nullableAdminText,
  rejectionReason: nullableAdminText,
}).strict();
const partnershipDecisionBody = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "pending", "approved", "rejected"]),
  adminNote: nullableAdminText,
  rejectionReason: nullableAdminText,
}).strict();
const kycDecisionBody = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "pending", "approved", "rejected"]),
  rejectionReason: nullableAdminText,
}).strict();
const catalogReferenceCharacteristic = z.object({
  id: positiveInteger.optional(),
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(4_000),
}).strict();
const catalogApproval = z.object({
  type: z.enum(["products"]),
  categoryId: publicId.optional(),
  categoryName: z.string().trim().max(300).optional(),
  subcategoryId: publicId.optional(),
  subcategoryName: z.string().trim().max(300).optional(),
  itemName: z.string().trim().min(1).max(300),
}).strict();
const catalogSuggestionUpdateBody = z.object({
  status: z.enum(["pending", "auto_approved", "approved", "rejected", "merged"]),
  adminNote: nullableAdminText,
  mergedTargetPublicId: publicId.optional(),
  approval: catalogApproval.optional(),
}).strict();
const catalogReferenceApprovalBody = z.object({
  approval: catalogApproval,
  reference: z.object({
    brandName: z.string().trim().min(1).max(300),
    modelName: z.string().trim().min(1).max(300),
    productTitle: z.string().trim().min(1).max(500),
    characteristics: z.array(catalogReferenceCharacteristic).max(100),
  }).strict(),
  adminNote: nullableAdminText,
}).strict();
const commissionTier = z.object({
  id: publicId,
  minSales: z.coerce.number().int().min(0).max(1_000_000_000),
  maxSales: z.union([z.coerce.number().int().min(0).max(1_000_000_000), z.null()]),
  commissionRate: z.coerce.number().positive().max(100),
}).strict();
const promoBody = z.object({
  code: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  discountType: z.enum(["percent", "fixed_amount", "PERCENT", "FIXED_AMOUNT"]),
  discountValue: z.coerce.number().positive().max(100_000_000),
  minSubtotal: z.coerce.number().int().min(0).max(1_000_000_000),
  maxActivations: z.coerce.number().int().positive().max(100_000_000),
  perUserLimit: z.coerce.number().int().min(1).max(1_000),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  isEnabled: z.boolean(),
  allCatalog: z.boolean(),
  categoryIds: z.array(publicId).max(500),
  subcategoryIds: z.array(publicId).max(500),
  itemIds: z.array(publicId).max(500),
}).strict();
const categoryCreateBody = z.object({
  type: z.enum(["products"]),
  name: z.string().trim().min(1).max(300),
  iconKey: z.string().trim().max(160),
}).strict();
const categoryUpdateBody = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  iconKey: z.string().trim().max(160).optional(),
  orderIndex: z.coerce.number().int().min(0).max(1_000_000).optional(),
}).strict();
const subcategoryCreateBody = z.object({ categoryId: publicId, name: z.string().trim().min(1).max(300) }).strict();
const subcategoryUpdateBody = z.object({ categoryId: publicId.optional(), name: z.string().trim().min(1).max(300).optional() }).strict();
const itemCreateBody = z.object({ subcategoryId: publicId, name: z.string().trim().min(1).max(300) }).strict();
const itemUpdateBody = z.object({ subcategoryId: publicId.optional(), name: z.string().trim().min(1).max(300).optional() }).strict();
const referenceNameBody = z.object({ name: z.string().trim().min(1).max(300) }).strict();
const referenceProductCreateBody = z.object({
  title: z.string().trim().max(500).optional(),
  characteristics: z.array(catalogReferenceCharacteristic.omit({ id: true })).max(100),
}).strict();
const referenceProductUpdateBody = z.object({ title: z.string().trim().min(1).max(500) }).strict();
const catalogRequestBody = z.object({
  mode: z.enum(["catalog", "characteristic"]),
  categoryName: z.string().trim().max(300),
  subcategoryName: z.string().trim().max(300),
  itemName: z.string().trim().max(300),
  brand: z.string().trim().max(300),
  model: z.string().trim().max(300),
  importantAttributes: z.string().trim().max(4_000),
  comment: z.string().trim().max(4_000),
  link: z.union([z.string().trim().url().max(MAX_IMAGE_URL), z.literal("")]),
  email: z.union([z.string().trim().email().max(320), z.literal("")]),
  photoName: z.string().trim().max(500),
  photoLabel: z.string().trim().max(500),
  title: z.string().trim().max(500),
}).strict();

export const mutationSchemaRegistry: readonly MutationSchemaDefinition[] = [
  route("POST", "/api/auth/login", authLoginBody),
  route("POST", "/api/auth/signup", authSignupBody),
  route("POST", "/api/auth/logout"),
  route("POST", "/api/auth/logout-all"),

  route("POST", "/api/profile/policy-acceptance", z.object({ scope: z.enum(["checkout", "partnership"]), policyId: publicId.optional() }).strict()),
  route("PATCH", "/api/profile/me", profileBody),
  route("POST", "/api/profile/wishlist/:listingPublicId"),
  route("DELETE", "/api/profile/wishlist/:listingPublicId"),
  route("PATCH", "/api/profile/notifications/mark-as-read"),
  route("DELETE", "/api/profile/notifications"),
  route("POST", "/api/profile/addresses", addressBody),
  route("PATCH", "/api/profile/addresses/:id", addressBody),
  route("DELETE", "/api/profile/addresses/:id"),
  route("POST", "/api/profile/addresses/:id/default"),
  route("POST", "/api/profile/payments/yookassa/webhook", webhookBody),
  route("POST", "/api/profile/orders", checkoutBody, true),
  route("POST", "/api/profile/orders/promo/preview", checkoutBody.omit({ paymentMethod: true }).extend({ paymentMethod: z.string().trim().max(80).optional() }).strict()),
  route("POST", "/api/profile/orders/:orderId/cancel"),
  route("POST", "/api/profile/partnership-requests/legal-lookup", z.object({
    inn: z.string().trim().refine((value) => /^\d{10}$|^\d{12}$/.test(value), "Некорректный ИНН"),
    legalType: z.string().trim().max(80),
  }).strict()),
  route("POST", "/api/profile/partnership-requests/draft", partnershipBody),
  route("PATCH", "/api/profile/partnership-requests/:publicId", partnershipBody),
  route("POST", "/api/profile/partnership-requests/:publicId/submit"),
  route("POST", "/api/profile/partnership-requests", partnershipBody),
  route("POST", "/api/profile/listings/:listingPublicId/review", z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(4_000).optional() }).strict()),

  route("POST", "/api/partner/questions/:publicId/answer", z.object({ answer: z.string().trim().min(1).max(4_000) }).strict()),
  route("PUT", "/api/partner/payout-profile", payoutBody),
  route("POST", "/api/partner/listings/catalog-requests", catalogRequestBody),
  route("POST", "/api/partner/listings", listingBody),
  route("PATCH", "/api/partner/listings/:publicId", listingBody),
  route("POST", "/api/partner/listings/:publicId/toggle-status"),
  route("PATCH", "/api/partner/listings/:publicId/status", statusBody),
  route("DELETE", "/api/partner/listings/:publicId"),
  route("POST", "/api/partner/listing-drafts", listingDraftBody),
  route("PATCH", "/api/partner/listing-drafts/:publicId", listingDraftBody),
  route("DELETE", "/api/partner/listing-drafts/:publicId"),
  route("PATCH", "/api/partner/orders/:publicId/status", statusBody),
  route("PATCH", "/api/partner/orders/:publicId/tracking", z.object({ tracking_number: z.string().trim().min(1).max(160), provider: z.string().trim().max(120).optional() }).strict()),

  route("PATCH", "/api/admin/complaints/:publicId/legacy", complaintBody.omit({ adminNote: true, rejectionReason: true }).strict()),
  route("PATCH", "/api/admin/complaints/:id/status", complaintBody, true),
  route("PATCH", "/api/admin/complaints/:publicId", complaintBody, true),
  route("POST", "/api/admin/catalog-suggestions/:publicId/approve-reference", catalogReferenceApprovalBody),
  route("PATCH", "/api/admin/catalog-suggestions/:publicId", catalogSuggestionUpdateBody),
  route("PATCH", "/api/admin/partnership-requests/:publicId", partnershipDecisionBody),
  route("PATCH", "/api/admin/kyc-requests/:publicId", kycDecisionBody),
  route("PATCH", "/api/admin/listings/:publicId/moderation", adminModerationBody),
  route("POST", "/api/admin/listings/moderation/batch", z.object({ listingIds: z.array(publicId).min(1).max(200), status: adminModerationBody.shape.status, reasonCode: z.string().trim().max(160).optional(), reasonNote: z.string().trim().max(4_000).optional() }).strict()),
  route("PATCH", "/api/admin/commission-tiers", z.object({ tiers: z.array(commissionTier).min(1).max(100) }).strict()),
  route("PATCH", "/api/admin/commission-tiers/:publicId", z.object({ commissionRate: z.coerce.number().positive().max(100) }).strict()),
  route("POST", "/api/admin/promos", promoBody),
  route("PATCH", "/api/admin/promos/:publicId", promoBody),
  route("PATCH", "/api/admin/users/:publicId/status", z.object({ status: z.enum(["ACTIVE", "BLOCKED", "active", "blocked"]), blockReason: z.string().trim().max(4_000).optional() }).strict()),
  route("PATCH", "/api/admin/users/:publicId/role", z.object({ role: z.enum(["BUYER", "SELLER", "ADMIN", "regular", "partner", "admin"]) }).strict()),
  route("PATCH", "/api/admin/catalog/reorder", z.object({ kind: z.enum(["category", "subcategory", "item"]), orderedIds: z.array(publicId).min(1).max(500) }).strict()),
  route("POST", "/api/admin/catalog/categories", categoryCreateBody),
  route("PATCH", "/api/admin/catalog/categories/:publicId", categoryUpdateBody),
  route("DELETE", "/api/admin/catalog/categories/:publicId"),
  route("POST", "/api/admin/catalog/subcategories", subcategoryCreateBody),
  route("PATCH", "/api/admin/catalog/subcategories/:publicId", subcategoryUpdateBody),
  route("DELETE", "/api/admin/catalog/subcategories/:publicId"),
  route("POST", "/api/admin/catalog/items", itemCreateBody),
  route("PATCH", "/api/admin/catalog/items/:publicId", itemUpdateBody),
  route("DELETE", "/api/admin/catalog/items/:publicId"),
  route("POST", "/api/admin/catalog/items/:publicId/reference/brands", referenceNameBody),
  route("PATCH", "/api/admin/catalog/reference/brands/:publicId", referenceNameBody),
  route("DELETE", "/api/admin/catalog/reference/brands/:publicId"),
  route("POST", "/api/admin/catalog/reference/brands/:publicId/models", referenceNameBody),
  route("PATCH", "/api/admin/catalog/reference/models/:publicId", referenceNameBody),
  route("DELETE", "/api/admin/catalog/reference/models/:publicId"),
  route("POST", "/api/admin/catalog/reference/models/:publicId/products", referenceProductCreateBody),
  route("PATCH", "/api/admin/catalog/reference/products/:publicId", referenceProductUpdateBody),
  route("DELETE", "/api/admin/catalog/reference/characteristics/:id"),
  route("DELETE", "/api/admin/catalog/reference/products/:publicId"),
  route("POST", "/api/admin/recommendations/recompute"),

  route("POST", "/api/catalog/listings/:publicId/view", z.object({ sourcePage: z.string().trim().max(160).optional() }).strict()),
  route("POST", "/api/catalog/listings/:publicId/questions", z.object({ question: z.string().trim().min(1).max(4_000) }).strict()),
  route("POST", "/api/catalog/listings/:publicId/complaints", z.object({ complaintType: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(4_000) }).strict()),
  route("POST", "/api/recommendations/cart", z.object({ listingPublicIds: z.array(publicId).max(100) }).strict()),
  route("POST", "/api/recommendations/events", z.object({ listingPublicId: publicId.optional(), eventType: z.string().trim().min(1).max(80), sourcePage: z.string().trim().max(160).optional() }).strict()),
] as const;

type CompiledDefinition = MutationSchemaDefinition & {
  regex: RegExp;
  paramNames: string[];
};

function compileDefinition(definition: MutationSchemaDefinition): CompiledDefinition {
  const paramNames: string[] = [];
  const pattern = definition.template
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      paramNames.push(segment.slice(1));
      return "([^/]+)";
    })
    .join("/");
  return { ...definition, regex: new RegExp(`^${pattern}/?$`), paramNames };
}

const compiledRegistry = mutationSchemaRegistry.map(compileDefinition);

export function findMutationSchema(method: string, path: string): CompiledDefinition | null {
  return compiledRegistry.find((entry) => entry.method === method && entry.regex.test(path)) ?? null;
}

function inspectShape(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return `Payload depth must not exceed ${MAX_DEPTH}`;
  if (typeof value === "string" && value.length > MAX_STRING && !value.startsWith("data:image/")) {
    return "String value is too long";
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) return `Array must not contain more than ${MAX_ARRAY} items`;
    for (const item of value) {
      const error = inspectShape(item, depth + 1);
      if (error) return error;
    }
  } else if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const error = inspectShape(nested, depth + 1);
      if (error) return error;
    }
  }
  return null;
}

function isAllowedImageUrl(value: string): boolean {
  if (value.length > MAX_IMAGE_URL) return false;
  if (value.startsWith("/media/seed/")) return true;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function validateDataImage(value: string): boolean {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== match[2]) return false;
  if (match[1] === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (match[1] === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function collectImages(value: unknown, output: string[] = []): string[] {
  if (!value || typeof value !== "object") return output;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "image" && typeof nested === "string") output.push(nested.trim());
    if (key === "images" && Array.isArray(nested)) {
      for (const item of nested) if (typeof item === "string") output.push(item.trim());
    }
    if (key !== "imageModerationSignals") collectImages(nested, output);
  }
  return output;
}

function validationFields(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "body";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

function reject(res: Parameters<RequestHandler>[1], error: string, fields: Record<string, string[]> = {}): void {
  res.status(400).json({ code: "VALIDATION_ERROR", error, fields });
}

export const validateMutationRequest: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const definition = findMutationSchema(req.method, req.path);
  if (!definition) return next();

  const match = definition.regex.exec(req.path);
  const params = Object.fromEntries(definition.paramNames.map((name, index) => [name, decodeURIComponent(match?.[index + 1] ?? "")]));
  for (const [name, value] of Object.entries(params)) {
    const numericParam = name === "id" && (
      definition.template.includes("/addresses/:id") ||
      definition.template.includes("/characteristics/:id")
    );
    const result = numericParam ? positiveInteger.safeParse(value) : publicId.safeParse(value);
    if (!result.success) {
      reject(res, "Некорректный идентификатор в URL", { [name]: result.error.issues.map((issue) => issue.message) });
      return;
    }
  }

  const shapeError = inspectShape(req.body ?? {});
  if (shapeError) {
    reject(res, shapeError);
    return;
  }
  const bodyResult = definition.body.safeParse(req.body ?? {});
  if (!bodyResult.success) {
    reject(res, bodyResult.error.issues[0]?.message ?? "Запрос не соответствует схеме", validationFields(bodyResult.error));
    return;
  }

  const images = collectImages(bodyResult.data);
  if (images.length > 10 || new Set(images).size !== images.length ||
      images.some((item) => !(item.startsWith("data:") ? validateDataImage(item) : isAllowedImageUrl(item)))) {
    reject(res, "Изображения должны быть уникальными JPEG/PNG/WebP до 3 MiB или допустимыми URL (не более 10)", {
      images: ["Invalid images"],
    });
    return;
  }

  const idempotencyKey = req.header("idempotency-key");
  if (definition.requireIdempotencyKey && !idempotencyKey) {
    reject(res, "Idempotency-Key is required", { idempotencyKey: ["Required"] });
    return;
  }
  if (idempotencyKey && (idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) {
    reject(res, "Invalid Idempotency-Key", { idempotencyKey: ["Invalid header"] });
    return;
  }
  req.body = bodyResult.data;
  next();
};
