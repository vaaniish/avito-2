import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type ReferenceCharacteristic = {
  key: string;
  label: string;
  value: string;
  rawValue: string;
};

type ReferenceVariant = {
  title: string;
  characteristics: ReferenceCharacteristic[];
};

type ReferenceModel = {
  model: string;
  variants: ReferenceVariant[];
};

type ReferenceBrand = {
  brand: string;
  models: ReferenceModel[];
};

type ReferenceItem = {
  itemName: string;
  brands: ReferenceBrand[];
};

const reference = JSON.parse(
  readFileSync("data/catalog-reference/generated/catalog-reference.json", "utf8"),
) as {
  characteristicSource: string;
  totalItems: number;
  items: ReferenceItem[];
};
const referenceReport = JSON.parse(
  readFileSync("data/catalog-reference/generated/catalog-reference-report.json", "utf8"),
) as {
  totalManifestItems: number;
  supportedItems: number;
  unsupportedItems: number;
  items: Array<{
    itemName: string;
    status:
      | "ok_bracket_groups"
      | "fallback_from_title"
      | "needs_more_label_rules"
      | "no_characteristics_source";
  }>;
};
const generatorSource = readFileSync(
  "scripts/catalog/generate-pc-components-reference.mjs",
  "utf8",
);
const partnerRoutesSource = readFileSync(
  "backend/src/modules/partner/partner.routes.ts",
  "utf8",
);
const catalogReferenceServiceSource = readFileSync(
  "backend/src/modules/catalog/catalog-reference.service.ts",
  "utf8",
);

function findItem(itemName: string): ReferenceItem {
  const item = reference.items.find((entry) => entry.itemName === itemName);
  assert.ok(item, `missing item: ${itemName}`);
  return item;
}

function findBrand(itemName: string, brandName: string): ReferenceBrand {
  const brand = findItem(itemName).brands.find((entry) => entry.brand === brandName);
  assert.ok(brand, `missing brand ${brandName} for ${itemName}`);
  return brand;
}

function findModel(itemName: string, brandName: string, modelIncludes: string): ReferenceModel {
  const model = findBrand(itemName, brandName).models.find((entry) =>
    entry.model.includes(modelIncludes),
  );
  assert.ok(model, `missing model containing ${modelIncludes}`);
  return model;
}

test("pc components reference: generated artifact is DNS-backed with sparse title fallback", () => {
  assert.equal(reference.characteristicSource, "bracketGroups+titleFallback");
  assert.match(generatorSource, /bracketGroups/);
  assert.match(generatorSource, /titleFallback/);
  assert.doesNotMatch(generatorSource, /cardText/);
  for (const itemName of [
    "Процессоры",
    "Материнские платы",
    "Видеокарты",
    "Оперативная память",
    "Твердотельные накопители SSD",
    "Блоки питания",
    "Корпуса",
    "Охлаждение компьютера",
  ]) {
    const item = findItem(itemName);
    assert.ok(item.brands.length > 0, `${itemName} should have brands`);
    assert.ok(
      item.brands.some((brand) => brand.models.length > 0),
      `${itemName} should have models`,
    );
  }
});

test("catalog reference: generated artifact covers non-PC DNS product kinds", () => {
  for (const itemName of [
    "Смартфоны",
    "Ноутбуки",
    "Посудомоечные машины",
    "Вытяжки",
    "Wi-Fi роутеры",
    "Телевизоры",
  ]) {
    const item = findItem(itemName);
    assert.ok(item.brands.length > 0, `${itemName} should have brands`);
    assert.ok(
      item.brands.some((brand) => brand.models.some((model) => model.variants.length > 0)),
      `${itemName} should have model variants`,
    );
  }
});

test("catalog reference: range hoods expose a minimal DNS characteristic set", () => {
  const hood = findItem("Вытяжки");
  const labels = new Set(
    hood.brands.flatMap((brand) =>
      brand.models.flatMap((model) =>
        model.variants.flatMap((variant) =>
          variant.characteristics.map((characteristic) => characteristic.label),
        ),
      ),
    ),
  );

  for (const label of ["Производительность", "Мощность", "Режим работы", "Ширина"]) {
    assert.ok(labels.has(label), `missing range hood field: ${label}`);
  }
});

test("catalog reference: manifest items are either supported or reported with a reason", () => {
  const manifestPaths = [
    "data/catalog-reference/dns-appliances/manifest.json",
    "data/catalog-reference/dns-smartphones-photo/manifest.json",
    "data/catalog-reference/dns-tv-consoles-audio/manifest.json",
    "data/catalog-reference/dns-pc-laptops-peripherals/manifest.json",
    "data/catalog-reference/dns-pc-components/manifest.json",
    "data/catalog-reference/dns-network-equipment/manifest.json",
  ];
  const manifestItems = manifestPaths.flatMap((manifestPath) => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      items: Array<{ itemName: string; status: string; file?: string }>;
    };
    return manifest.items
      .filter((item) => item.status === "done" && item.file)
      .map((item) => item.itemName);
  });
  const supported = new Set(reference.items.map((item) => item.itemName));
  const reported = new Map(referenceReport.items.map((item) => [item.itemName, item.status]));

  for (const itemName of manifestItems) {
    if (supported.has(itemName)) continue;
    assert.match(
      reported.get(itemName) ?? "",
      /^(needs_more_label_rules|no_characteristics_source)$/,
      `missing report reason for unsupported item: ${itemName}`,
    );
  }
  assert.equal(referenceReport.totalManifestItems, manifestItems.length);
  assert.equal(referenceReport.supportedItems, reference.items.length);
});

test("catalog reference: generated artifact audits and supports every DNS manifest item", () => {
  assert.equal(referenceReport.totalManifestItems, 254);
  assert.equal(reference.totalItems, referenceReport.totalManifestItems);
  assert.equal(referenceReport.unsupportedItems, 0);
  assert.equal(referenceReport.supportedItems, referenceReport.totalManifestItems);

  const statuses = new Set(referenceReport.items.map((item) => item.status));
  assert.ok(statuses.has("ok_bracket_groups"));
  assert.ok(statuses.has("fallback_from_title"));
});

test("catalog reference: capture cards use title fallback when bracketGroups are sparse", () => {
  const captureCards = findItem("Карты видеозахвата");
  const labels = new Set(
    captureCards.brands.flatMap((brand) =>
      brand.models.flatMap((model) =>
        model.variants.flatMap((variant) =>
          variant.characteristics.map((characteristic) => characteristic.label),
        ),
      ),
    ),
  );

  for (const label of ["Интерфейс подключения", "Разрешение захвата", "Видеовходы"]) {
    assert.ok(labels.has(label), `missing capture card field: ${label}`);
  }

  const reportEntry = referenceReport.items.find((item) => item.itemName === "Карты видеозахвата");
  assert.equal(reportEntry?.status, "fallback_from_title");
});

test("pc components reference: CPU brand, model and characteristics come from title plus bracketGroups", () => {
  const cpu = findModel("Процессоры", "AMD", "Ryzen 7 5700X OEM");
  const variant = cpu.variants[0];

  assert.equal(cpu.model, "Ryzen 7 5700X OEM");
  assert.deepEqual(
    variant.characteristics.map((characteristic) => characteristic.rawValue),
    [
      "AM4",
      "8 x 3.4 ГГц",
      "L2 - 4 МБ",
      "L3 - 32 МБ",
      "2 х DDR4-3200 МГц",
      "TDP 65 Вт",
    ],
  );
  assert.equal(
    variant.characteristics.find((characteristic) => characteristic.label === "Сокет")
      ?.value,
    "AM4",
  );
  assert.equal(
    variant.characteristics.find((characteristic) => characteristic.label === "TDP")
      ?.value,
    "65 Вт",
  );
});

test("pc components reference: GPU bracket code remains a normal characteristic", () => {
  const gpu = findModel("Видеокарты", "Palit", "GeForce RTX 5060 Dual");
  const variant = gpu.variants[0];

  assert.ok(
    variant.characteristics.some(
      (characteristic) =>
        characteristic.rawValue === "NE75060019P1-GB2063D" &&
        characteristic.label === "Код / артикул",
    ),
  );
  assert.ok(
    variant.characteristics.some(
      (characteristic) =>
        characteristic.rawValue === "PCIe 5.0" &&
        characteristic.label === "Интерфейс",
    ),
  );
});

test("pc components reference: SSD brand is extracted after the drive noun, not from capacity", () => {
  const ssd = findModel("Твердотельные накопители SSD", "Kingston", "A400");
  const variant = ssd.variants[0];

  assert.match(variant.title, /Kingston A400/);
  assert.ok(
    variant.characteristics.some((characteristic) =>
      /SATA|чтение|запись|TBW/.test(characteristic.rawValue),
    ),
  );
});

test("pc components reference: create suggestions search models and prefill reference data", () => {
  assert.match(partnerRoutesSource, /findCatalogReferenceCreateSuggestions\(query, type\)/);
  assert.match(partnerRoutesSource, /catalogReferenceTitleSuggestions\(query, referenceSuggestions\)/);
  assert.match(partnerRoutesSource, /titleSuggestions/);
  assert.doesNotMatch(partnerRoutesSource, /referenceBrand/);
  assert.doesNotMatch(partnerRoutesSource, /referenceModel/);
  assert.doesNotMatch(partnerRoutesSource, /referenceCharacteristics/);
  assert.match(partnerRoutesSource, /catalogReferenceFields/);
  assert.match(catalogReferenceServiceSource, /source: "bracketGroups"/);
  assert.match(catalogReferenceServiceSource, /locked/);
  assert.doesNotMatch(partnerRoutesSource, /referenceCode/);

  const score = findModel("Процессоры", "AMD", "Ryzen 7 5700X OEM");
  assert.ok(score.variants[0].title.includes("Ryzen 7 5700X"));
});

test("pc components reference: unknown bracket parts are omitted from generated characteristics", () => {
  const cpu = findModel("Процессоры", "AMD", "Ryzen 7 5700G BOX");
  const values = cpu.variants[0].characteristics.map((characteristic) => characteristic.value);
  const labels = cpu.variants[0].characteristics.map((characteristic) => characteristic.label);

  assert.doesNotMatch(labels.join("\n"), /Характеристика \d+/);
  assert.doesNotMatch(values.join("\n"), /^кулер$/imu);
  assert.doesNotMatch(values.join("\n"), /AMD Radeon Graphics/);
});

test("catalog reference: no generated field uses placeholder characteristic labels", () => {
  for (const item of reference.items) {
    for (const brand of item.brands) {
      for (const model of brand.models) {
        for (const variant of model.variants) {
          assert.doesNotMatch(
            variant.characteristics.map((characteristic) => characteristic.label).join("\n"),
            /^Характеристика\s+\d+$/mu,
          );
        }
      }
    }
  }
});
