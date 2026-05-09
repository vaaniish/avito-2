import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupDadataParty,
  mapDadataPartySuggestion,
} from "../../../backend/src/modules/partnership/dadata";
import { validateAndNormalizeOnboardingPayload } from "../../../backend/src/modules/partnership/onboarding";

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const snapshot: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    snapshot[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("dadata party: maps legal entity to safe lookup DTO", () => {
  const mapped = mapDadataPartySuggestion({
    value: "ООО РОМАШКА",
    data: {
      inn: "7707083893",
      ogrn: "1027700132195",
      kpp: "770701001",
      type: "LEGAL",
      name: { short_with_opf: "ООО РОМАШКА" },
      management: { name: "Иванов Иван Иванович", post: "ГЕНЕРАЛЬНЫЙ ДИРЕКТОР" },
      state: { status: "ACTIVE" },
      address: {
        unrestricted_value: "127000, г Москва, ул Тестовая, д 1",
        data: { region_with_type: "г Москва" },
      },
    },
  });

  assert.deepEqual(mapped, {
    inn: "7707083893",
    ogrn: "1027700132195",
    kpp: "770701001",
    legalName: "ООО РОМАШКА",
    registeredAddress: "127000, г Москва, ул Тестовая, д 1",
    taxRegion: "г Москва",
    registrationStatus: "active",
    dadataType: "LEGAL",
    managementName: "Иванов Иван Иванович",
    managementPost: "ГЕНЕРАЛЬНЫЙ ДИРЕКТОР",
  });
});

test("dadata party: maps individual entrepreneur and inactive status", () => {
  const mapped = mapDadataPartySuggestion({
    data: {
      inn: "500100732259",
      ogrn: "304500116000157",
      type: "INDIVIDUAL",
      fio: { surname: "Петров", name: "Петр", patronymic: "Петрович" },
      state: { status: "LIQUIDATED" },
      address: {
        value: "Московская обл",
        data: { region: "Московская" },
      },
    },
  });

  assert.equal(mapped?.legalName, "Петров Петр Петрович");
  assert.equal(mapped?.kpp, null);
  assert.equal(mapped?.registrationStatus, "inactive");
  assert.equal(mapped?.dadataType, "INDIVIDUAL");
});

test("dadata party: rejects invalid inn before external request", async () => {
  const result = await withEnv({ DADATA_API_KEY: "test-token" }, () =>
    lookupDadataParty({ inn: "123", legalType: "COMPANY" }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("dadata party: returns service unavailable when token is missing", async () => {
  const result = await withEnv({ DADATA_API_KEY: undefined }, () =>
    lookupDadataParty({ inn: "7707083893", legalType: "COMPANY" }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
});

const VALID_ONBOARDING_PAYLOAD = {
  legalType: "COMPANY",
  inn: "7707083893",
  ogrn: "1027700132195",
  kpp: "770701001",
  legalName: "ООО РОМАШКА",
  registrationStatus: "active",
  registeredAddress: "127000, г Москва, ул Тестовая, д 1",
  taxRegion: "г Москва",
  representativeFullName: "Иванов Иван Иванович",
  representativeRole: "Директор",
  representativePhone: "+79990001122",
  representativeEmail: "director@example.ru",
  authorityType: "director",
  authorityDocument: "",
  websiteUrl: "https://example.ru",
  businessEmail: "director@example.ru",
  domainOwnershipMethod: "manual_review",
  publicProfileUrls: ["https://example.ru"],
  businessRole: "Продаем восстановленную электронику после диагностики.",
  categories: ["electronics"],
  fulfillmentModel: "platform_pvz",
  country: "Россия",
  region: "Москва",
  city: "Москва",
  warehouseAddress: "Москва, ул Тестовая, д 1",
  serviceCenterAddress: "Москва, ул Тестовая, д 1",
  deliveryCoverageRegions: ["Россия"],
  pickupAvailable: false,
  returnAddress: "Москва, ул Тестовая, д 1",
  supportPhone: "+79990001122",
  supportEmail: "support@example.ru",
  serviceHours: "Пн-Пт 10:00-19:00",
  monthlyCapacity: 20,
  productSourceType: "Выкуп у компаний и сервисные возвраты",
  supplierDocuments: "УПД, договор поставки, акты выкупа",
  diagnosticProcess: "Внутренняя диагностика",
  gradingStandard: "refurbished_a/refurbished_b",
  warrantyDays: 90,
  returnDays: 14,
  serialCheckPolicy: "Не публикуем заблокированные устройства",
  qualityCharterAccepted: true,
};

test("onboarding validation: requires verified legal lookup before submit", () => {
  const result = validateAndNormalizeOnboardingPayload({
    ...VALID_ONBOARDING_PAYLOAD,
    legalLookupVerified: false,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join("\n"), /DaData/u);
});

test("onboarding validation: accepts payload with verified active lookup", () => {
  const result = validateAndNormalizeOnboardingPayload({
    ...VALID_ONBOARDING_PAYLOAD,
    legalLookupVerified: true,
  });

  assert.equal(result.ok, true);
});
