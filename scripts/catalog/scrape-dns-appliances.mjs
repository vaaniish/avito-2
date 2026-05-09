#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(
  ROOT,
  process.env.DNS_DATA_DIR ?? "data/catalog-reference/dns-appliances",
);
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const DNS_BASE = "https://www.dns-shop.ru";
const STOCK_QUERY = "stock=now-today-tomorrow-later";
const PAGE_BATCH_SIZE = Number(process.env.DNS_PAGE_BATCH_SIZE ?? 4);
const MAX_PAGES_PER_ITEM = Number(process.env.DNS_MAX_PAGES_PER_ITEM ?? 0);
const START_INDEX = Number(process.env.DNS_START_INDEX ?? 0);
const ONLY_FILE = process.env.DNS_ONLY_FILE ?? "";
const ONLY_FAILED = process.env.DNS_ONLY_FAILED === "1";

const SUBCATEGORY_URLS = {
  "Встраиваемая техника":
    "https://www.dns-shop.ru/catalog/e258ce9b690b26d7/vstraivaemaa-tehnika/",
  "Техника для кухни":
    "https://www.dns-shop.ru/catalog/e3d826d63bb17fd7/tehnika-dla-kuhni/",
  "Техника для дома":
    "https://www.dns-shop.ru/catalog/17a8ea2316404e77/tehnika-dla-doma/",
};

const ITEM_URLS = {
  "Варочные панели": "https://www.dns-shop.ru/catalog/17aa74ec16404e77/varocnye-paneli/",
  "Духовые шкафы": "https://www.dns-shop.ru/catalog/17aa752016404e77/duhovye-skafy/",
  "Вытяжки": "https://www.dns-shop.ru/catalog/eb9d6084edb461de/vytazki/",
  "Встраиваемые микроволновые печи": "https://www.dns-shop.ru/catalog/17a8d15716404e77/vstraivaemye-mikrovolnovye-peci/",
  "Встраиваемые холодильники": "https://www.dns-shop.ru/catalog/17a8d26216404e77/vstraivaemye-holodilniki/",
  "Встраиваемые морозильные шкафы": "https://www.dns-shop.ru/catalog/17aa734716404e77/vstraivaemye-morozilnye-skafy/",
  "Встраиваемые посудомоечные машины": "https://www.dns-shop.ru/catalog/17a8d1c216404e77/vstraivaemye-posudomoecnye-masiny/",
  "Встраиваемые стиральные машины": "https://www.dns-shop.ru/catalog/17a8d12016404e77/vstraivaemye-stiralnye-masiny/",
  "Встраиваемые стирально-сушильные машины": "https://www.dns-shop.ru/catalog/17a8d12016404e77/vstraivaemye-stiralnye-masiny/?f%5Bj%5D=czi0&virtual_category_uid=d84b873bd6b64687",
  "Встраиваемые винные шкафы": "https://www.dns-shop.ru/catalog/d41702130de56479/vstraivaemye-vinnye-skafy/",
  "Встраиваемые кофемашины": "https://www.dns-shop.ru/catalog/15efef292eb04e77/vstraivaemye-kofemasiny/",
  "Встраиваемые подогреватели для посуды": "https://www.dns-shop.ru/catalog/54d638e7f4d84e77/vstraivaemye-podogrevateli-dla-posudy/",
  "Чистящие средства для кухни": "https://www.dns-shop.ru/catalog/d7df05c4c4c58b97/cistasie-sredstva-dla-kuhonnoj-tehniki/?virtual_category_uid=6d1534af4075a976",
  "Плиты, СВЧ и печи": "https://www.dns-shop.ru/catalog/89873d5539157fd7/plity-svc-i-peci/",
  "Холодильное оборудование": "https://www.dns-shop.ru/catalog/093d2768390b7fd7/holodilnoe-oborudovanie/",
  "Посудомоечные машины": "https://www.dns-shop.ru/catalog/ce94bfb342c0b185/posudomoecnye-masiny/",
  "Приготовление напитков": "https://www.dns-shop.ru/catalog/17a9a8ec16404e77/prigotovlenie-napitkov/",
  "Электрочайники и термопоты": "https://www.dns-shop.ru/catalog/f2d1bfed43140ba6/elektrocajniki-i-termopoty/",
  "Фильтрация воды": "https://www.dns-shop.ru/catalog/ad992e0b3f707a6b/filtracia-vody/",
  "Нарезка и смешивание": "https://www.dns-shop.ru/catalog/17a8c79516404e77/narezka-i-smesivanie/",
  "Грили, аэрогрили, вафельницы, шашлычницы": "https://www.dns-shop.ru/catalog/d7bc35044aab7fd7/grili-aerogrili-vafelnicy-saslycnicy/",
  "Фритюрницы и тостеры": "https://www.dns-shop.ru/catalog/17a9b2de16404e77/friturnicy-i-tostery/",
  "Мультиварки и техника для варки": "https://www.dns-shop.ru/catalog/17a8c75c16404e77/multivarki-i-tehnika-dla-varki/",
  "Приготовление десертов": "https://www.dns-shop.ru/catalog/19704bc240147fd7/prigotovlenie-desertov/",
  "Вакуумная упаковка": "https://www.dns-shop.ru/catalog/2dc1c4fd548f7fd7/vakuumnaa-upakovka/",
  "Измерения": "https://www.dns-shop.ru/catalog/48e11fc754957fd7/izmerenia/",
  "Измельчение пищевых отходов": "https://www.dns-shop.ru/catalog/9b0730afc4a9a455/izmelcenie-pisevyh-othodov/",
  "Домашние заготовки": "https://www.dns-shop.ru/catalog/3509e60bbe51d858/domasnie-zagotovki/",
  "Супницы и мармиты": "https://www.dns-shop.ru/catalog/995b4ac6d0edacca/supnicy-i-marmity/",
  "Сушка овощей и фруктов": "https://www.dns-shop.ru/catalog/97bbb54ed3fece48/suska-ovosej-i-fruktov/",
  "Прочая техника для кухни": "https://www.dns-shop.ru/catalog/17a9010d16404e77/procaa-tehnika-dla-kuhni/",
  "Посуда и кухонные предметы": "https://www.dns-shop.ru/catalog/8d97f3a219c3866e/posuda-i-kuhonnye-predmety/",
  "Стирка и сушка": "https://www.dns-shop.ru/catalog/17a8e9ed16404e77/stirka-i-suska/",
  "Глаженье": "https://www.dns-shop.ru/catalog/4f9855e23bd17fd7/glazene/",
  "Уборка": "https://www.dns-shop.ru/catalog/3275c8503bd17fd7/uborka/",
  "Водонагреватели и котлы отопления": "https://www.dns-shop.ru/catalog/9996116b39147fd7/vodonagrevateli-i-kotly-otoplenia/",
  "Летний климат": "https://www.dns-shop.ru/catalog/915f54b950cc7fd7/letnij-klimat/",
  "Зимний климат": "https://www.dns-shop.ru/catalog/a1b612f050cc7fd7/zimnij-klimat/",
  "Управление климатом и обработка воздуха": "https://www.dns-shop.ru/catalog/ab19e09750cc7fd7/upravlenie-klimatom-i-obrabotka-vozduha/",
  "Умная техника": "https://www.dns-shop.ru/catalog/ff303f670709f732/umnaa-tehnika/",
  "Шитье, вышивание и уход за одеждой": "https://www.dns-shop.ru/catalog/714b74dbb6e6a9fc/site-vysivanie-i-uhod-za-odezdoj/",
  "Часы": "https://www.dns-shop.ru/catalog/f3c2fb20310fab78/casy/",
};

const TYPE_PREFIXES = [
  "Встраиваемая кофемашина",
  "Кофемашина автоматическая",
  "Встраиваемая микроволновая печь",
  "Встраиваемый холодильник",
  "Встраиваемый морозильный шкаф",
  "Встраиваемая посудомоечная машина",
  "Встраиваемая стирально-сушильная машина",
  "Встраиваемая стиральная машина",
  "Встраиваемый винный шкаф",
  "Встраиваемый подогреватель для посуды",
  "Электрический духовой шкаф",
  "Газовый духовой шкаф",
  "Духовой шкаф",
  "Электрическая варочная панель",
  "Газовая варочная панель",
  "Индукционная варочная панель",
  "Комбинированная варочная панель",
  "Варочная панель",
  "Вытяжка",
  "Микроволновая печь",
  "Электрическая плита",
  "Газовая плита",
  "Комбинированная плита",
  "Мини-печь",
  "Холодильник",
  "Морозильный шкаф",
  "Морозильный ларь",
  "Посудомоечная машина",
  "Электрочайник",
  "Термопот",
  "Фильтр для воды",
  "Блендер",
  "Миксер",
  "Кухонный комбайн",
  "Мясорубка",
  "Гриль",
  "Аэрогриль",
  "Вафельница",
  "Шашлычница",
  "Фритюрница",
  "Тостер",
  "Мультиварка",
  "Пароварка",
  "Вакуумный упаковщик",
  "Кухонные весы",
  "Измельчитель пищевых отходов",
  "Сушилка для овощей и фруктов",
  "Стиральная машина",
  "Сушильная машина",
  "Отпариватель",
  "Утюг",
  "Пылесос",
  "Робот-пылесос",
  "Водонагреватель",
  "Кондиционер",
  "Вентилятор",
  "Обогреватель",
  "Увлажнитель воздуха",
  "Очиститель воздуха",
  "Швейная машина",
  "Оверлок",
  "Часы",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeSpace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function appendQuery(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function runSafariJavaScript(source) {
  const jsPath = path.join(
    os.tmpdir(),
    `dns-appliance-scrape-${process.pid}-${Date.now()}.js`,
  );
  fs.writeFileSync(jsPath, source, "utf8");
  const appleScript = `
set jsSource to read POSIX file "${jsPath}"
tell application "Safari"
  return do JavaScript jsSource in current tab of front window
end tell
`;

  try {
    return execFileSync("osascript", ["-e", appleScript], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
    }).trim();
  } finally {
    fs.rmSync(jsPath, { force: true });
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureSafariOnDns() {
  execFileSync(
    "osascript",
    [
      "-e",
      `tell application "Safari"
  if not (exists front window) then make new document with properties {URL:"https://www.dns-shop.ru/catalog/"}
  set URL of current tab of front window to "https://www.dns-shop.ru/catalog/"
end tell`,
    ],
    { encoding: "utf8" },
  );
  sleep(2500);
}

function discoverItemUrls(items) {
  const grouped = new Map();
  for (const item of items) {
    const url = SUBCATEGORY_URLS[item.subcategoryName];
    if (!url) continue;
    if (!grouped.has(item.subcategoryName)) {
      grouped.set(item.subcategoryName, { url, names: [] });
    }
    grouped.get(item.subcategoryName).names.push(item.itemName);
  }

  const script = `
(function () {
  function request(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    return { status: xhr.status, html: xhr.responseText || "" };
  }
  var groups = ${JSON.stringify(Array.from(grouped.values()))};
  var result = {};
  for (var i = 0; i < groups.length; i += 1) {
    var group = groups[i];
    var response = request(group.url);
    var doc = new DOMParser().parseFromString(response.html, "text/html");
    var links = Array.from(doc.querySelectorAll("a")).map(function (a) {
      return {
        text: (a.innerText || a.textContent || "").replace(/\\s+/g, " ").trim(),
        href: a.href
      };
    }).filter(function (link) {
      return link.text && link.href.indexOf("/catalog/") !== -1;
    });
    for (var j = 0; j < group.names.length; j += 1) {
      var name = group.names[j];
      var exact = links.find(function (link) { return link.text === name; });
      var fuzzy = links
        .filter(function (link) { return link.text.indexOf(name) !== -1; })
        .sort(function (a, b) { return a.text.length - b.text.length; })[0];
      result[name] = (exact || fuzzy) ? (exact || fuzzy).href : null;
    }
  }
  return JSON.stringify(result);
})()
`;

  return JSON.parse(runSafariJavaScript(script));
}

function makePageUrls(baseUrl, totalPages) {
  const safeTotal = MAX_PAGES_PER_ITEM > 0 ? Math.min(totalPages, MAX_PAGES_PER_ITEM) : totalPages;
  const urls = [];
  for (let page = 1; page <= safeTotal; page += 1) {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set("stock", "now-today-tomorrow-later");
    parsed.searchParams.set("p", String(page));
    urls.push({ page, url: parsed.toString() });
  }
  return urls;
}

function fetchPages(pageUrls) {
  const script = `
(function () {
  function clean(value) {
    return String(value || "").replace(/\\s+/g, " ").trim();
  }
  function request(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    return { status: xhr.status, html: xhr.responseText || "" };
  }
  function productFromCard(card) {
    var nameLink = card.querySelector(".catalog-product__name");
    if (!nameLink) return null;
    var title = clean(nameLink.innerText || nameLink.textContent);
    var href = nameLink.href;
    if (!title || !href) return null;
    var text = clean(card.innerText || card.textContent);
    var priceNode = card.querySelector(".product-buy__price, .product-buy__price-wrap, .product-buy__sub");
    var priceText = priceNode ? clean(priceNode.innerText || priceNode.textContent) : "";
    if (!priceText) {
      var priceMatch = text.match(/\\d[\\d\\s]*\\u00a0?₽/);
      priceText = priceMatch ? clean(priceMatch[0]) : "";
    }
    var groups = Array.from(title.matchAll(/\\[([^\\]]+)\\]/g)).map(function (match) {
      return clean(match[1]);
    }).filter(Boolean);
    return {
      href: href,
      title: title,
      specsText: groups.length ? groups[groups.length - 1] : "",
      bracketGroups: groups,
      priceText: priceText,
      productId: (href.match(/\\/product\\/([^/]+)/) || [])[1] || "",
      cardText: text
    };
  }
  function parsePage(entry) {
    var response = request(entry.url);
    var doc = new DOMParser().parseFromString(response.html, "text/html");
    var bodyText = clean(doc.body ? doc.body.innerText : "");
    var title = doc.title || "";
    var totalMatch = bodyText.match(/(\\d[\\d\\s]*)\\s+товар/);
    var pageMatch = title.match(/страница\\s+\\d+\\s+из\\s+(\\d+)/i);
    var maxPager = Array.from(doc.querySelectorAll("a")).map(function (a) {
      try { return Number(new URL(a.href).searchParams.get("p") || "0"); } catch (_) { return 0; }
    }).reduce(function (max, value) { return Math.max(max, value); }, 0);
    var cards = Array.from(doc.querySelectorAll(".catalog-product")).map(productFromCard).filter(Boolean);
    var childSeen = {};
    var childLinks = Array.from(doc.querySelectorAll("a.subcategory__item")).map(function (a) {
      var text = clean(a.innerText || a.textContent);
      var half = text.length % 2 === 0 ? text.slice(0, text.length / 2) : "";
      if (half && half === text.slice(text.length / 2)) text = half;
      return { text: text, href: a.href };
    }).filter(function (link) {
      if (!link.text || !link.href || link.href.indexOf("/catalog/") === -1) return false;
      if (childSeen[link.href]) return false;
      childSeen[link.href] = true;
      return true;
    });
    return {
      page: entry.page,
      url: entry.url,
      status: response.status,
      title: title,
      totalProducts: totalMatch ? Number(totalMatch[1].replace(/\\s+/g, "")) : null,
      totalPages: pageMatch ? Number(pageMatch[1]) : maxPager || (cards.length ? 1 : 0),
      count: cards.length,
      products: cards,
      childLinks: childLinks
    };
  }
  var urls = ${JSON.stringify(pageUrls)};
  return JSON.stringify(urls.map(parsePage));
})()
`;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = runSafariJavaScript(script);
      if (!raw) throw new Error("Safari returned an empty JavaScript result");
      return JSON.parse(raw);
    } catch (error) {
      lastError = error;
      sleep(1000 * attempt);
      if (attempt === 2) ensureSafariOnDns();
    }
  }

  if (pageUrls.length > 1) {
    return pageUrls.flatMap((entry) => fetchPages([entry]));
  }

  const entry = pageUrls[0];
  return [
    {
      page: entry.page,
      url: entry.url,
      status: 0,
      title: "",
      totalProducts: null,
      totalPages: 0,
      count: 0,
      products: [],
      childLinks: [],
      error: lastError instanceof Error ? lastError.message : String(lastError),
    },
  ];
}

function collectCatalog(url, label, depth = 0, visited = new Set()) {
  const normalizedUrl = appendQuery(url, { stock: "now-today-tomorrow-later" });
  const visitKey = new URL(normalizedUrl);
  visitKey.searchParams.delete("p");
  const key = visitKey.toString();
  if (visited.has(key)) {
    return {
      pages: [],
      products: [],
      totalProducts: 0,
      totalPages: 0,
      errors: [],
      childLinks: [],
    };
  }
  visited.add(key);

  const firstPage = fetchPages([{ page: 1, url: appendQuery(normalizedUrl, { p: "1" }) }])[0];
  if (!firstPage || firstPage.status < 200 || firstPage.status >= 300) {
    return {
      pages: firstPage ? [firstPage] : [],
      products: [],
      totalProducts: 0,
      totalPages: 0,
      errors: [`HTTP ${firstPage?.status ?? "unknown"} on page 1: ${normalizedUrl}`],
      childLinks: [],
    };
  }

  if (firstPage.products.length === 0 && firstPage.childLinks.length > 0 && depth < 4) {
    console.log(
      `${"  ".repeat(depth + 1)}${label}: nested sections ${firstPage.childLinks.length}`,
    );
    const nestedPages = [firstPage];
    const nestedProducts = [];
    const nestedErrors = [];
    let nestedTotalProducts = 0;
    let nestedTotalPages = 0;
    for (const child of firstPage.childLinks) {
      const childResult = collectCatalog(child.href, child.text, depth + 1, visited);
      nestedPages.push(...childResult.pages);
      nestedProducts.push(...childResult.products);
      nestedErrors.push(...childResult.errors);
      nestedTotalProducts += childResult.totalProducts;
      nestedTotalPages += childResult.totalPages;
    }
    return {
      pages: nestedPages,
      products: nestedProducts,
      totalProducts: nestedTotalProducts,
      totalPages: nestedTotalPages || 1,
      errors: nestedErrors,
      childLinks: firstPage.childLinks,
    };
  }

  const totalPages = Math.max(firstPage.totalPages || 0, 1);
  const pageUrls = makePageUrls(normalizedUrl, totalPages).filter((entry) => entry.page !== 1);
  const pages = [firstPage];
  for (let offset = 0; offset < pageUrls.length; offset += PAGE_BATCH_SIZE) {
    const batch = pageUrls.slice(offset, offset + PAGE_BATCH_SIZE);
    const parsed = fetchPages(batch);
    pages.push(...parsed);
    const productCount = pages.reduce((sum, page) => sum + page.products.length, 0);
    console.log(
      `${"  ".repeat(depth + 1)}${label}: pages ${Math.min(offset + PAGE_BATCH_SIZE + 1, totalPages)}/${totalPages}, products ${productCount}`,
    );
  }

  const products = pages.flatMap((page) => page.products);
  const errors = pages
    .filter((page) => page.status < 200 || page.status >= 300)
    .map((page) => `HTTP ${page.status} on page ${page.page}: ${page.url}`);

  return {
    pages,
    products,
    totalProducts: firstPage.totalProducts ?? products.length,
    totalPages,
    errors,
    childLinks: firstPage.childLinks,
  };
}

function stripTitleBrackets(title) {
  return normalizeSpace(title.replace(/\[[^\]]+\]/g, " "));
}

function withoutKnownPrefix(value) {
  let result = value;
  const sorted = [...TYPE_PREFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (result.toLocaleLowerCase("ru-RU").startsWith(prefix.toLocaleLowerCase("ru-RU"))) {
      result = normalizeSpace(result.slice(prefix.length));
      break;
    }
  }
  return result;
}

function deriveBrandAndModel(title) {
  const withoutBrackets = stripTitleBrackets(title);
  const core = withoutKnownPrefix(withoutBrackets);
  const parts = core.split(" ").filter(Boolean);
  const brand = parts[0] ?? "";
  const model = normalizeSpace(parts.slice(1).join(" "));
  return {
    brand,
    model: model || core,
    name: core,
  };
}

function buildBrands(products) {
  const byBrand = new Map();
  for (const product of products) {
    const derived = deriveBrandAndModel(product.title);
    if (!derived.brand) continue;
    const manufacturerCodes = product.bracketGroups.length > 1 ? product.bracketGroups.slice(0, -1) : [];
    if (!byBrand.has(derived.brand)) {
      byBrand.set(derived.brand, new Map());
    }
    const models = byBrand.get(derived.brand);
    const modelKey = derived.model || derived.name;
    if (!models.has(modelKey)) {
      models.set(modelKey, {
        brand: derived.brand,
        model: modelKey,
        name: derived.name,
        manufacturerCodes: [],
        products: [],
      });
    }
    const entry = models.get(modelKey);
    for (const code of manufacturerCodes) {
      if (!entry.manufacturerCodes.includes(code)) entry.manufacturerCodes.push(code);
    }
    entry.products.push({
      href: product.href,
      title: product.title,
      specsText: product.specsText,
      priceText: product.priceText,
    });
  }

  return Array.from(byBrand.entries())
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([brand, models]) => ({
      brand,
      models: Array.from(models.values()).sort((a, b) => a.model.localeCompare(b.model, "ru")),
    }));
}

function uniqueProducts(products) {
  const seen = new Set();
  const result = [];
  for (const product of products) {
    const key = product.href || product.title;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(product);
  }
  return result;
}

function scrapeItem(item, index, total) {
  const filePath = path.join(DATA_DIR, item.file);
  const current = readJson(filePath);
  if (!item.dnsUrl) {
    const error = `DNS URL not found for ${item.itemName}`;
    console.warn(`[${index}/${total}] ${error}`);
    current.status = "failed";
    current.errors = [...(current.errors ?? []), error];
    writeJson(filePath, current);
    return { status: "failed", products: 0 };
  }

  const dnsUrl = appendQuery(item.dnsUrl, { stock: "now-today-tomorrow-later" });
  current.dnsUrl = dnsUrl;
  current.status = "parsing";
  current.errors = [];
  writeJson(filePath, current);

  console.log(`[${index}/${total}] ${item.itemName}: ${dnsUrl}`);

  const catalog = collectCatalog(dnsUrl, item.itemName);
  const pages = catalog.pages;
  const products = uniqueProducts(catalog.products);
  const pageErrors = catalog.errors;
  const brands = buildBrands(products);

  const output = {
    source: "DNS catalog via Safari same-origin XHR",
    categoryName: current.categoryName,
    subcategoryName: current.subcategoryName,
    itemName: current.itemName,
    dnsUrl,
    collectedAt: new Date().toISOString(),
    status: pageErrors.length ? "failed" : "done",
    totalPages: catalog.totalPages,
    totalProducts: catalog.totalProducts || products.length,
    products,
    brands,
    childCategories: catalog.childLinks,
    pages: pages.map((page) => ({
      page: page.page,
      url: page.url,
      status: page.status,
      count: page.count,
      title: page.title,
    })),
    errors: pageErrors,
  };
  writeJson(filePath, output);
  return { status: output.status, products: products.length };
}

function main() {
  ensureSafariOnDns();
  const manifest = readJson(MANIFEST_PATH);
  const items = manifest.items;
  const discovered = discoverItemUrls(items);
  for (const item of items) {
    item.dnsUrl = discovered[item.itemName] ?? ITEM_URLS[item.itemName] ?? item.dnsUrl ?? null;
  }
  manifest.status = "parsing";
  manifest.collectedAt = new Date().toISOString();
  writeJson(MANIFEST_PATH, manifest);

  const selected = items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => {
      if (index < START_INDEX) return false;
      if (ONLY_FILE && item.file !== ONLY_FILE) return false;
      if (ONLY_FAILED && item.status !== "failed") return false;
      return true;
    });

  const summary = [];
  for (const { item, index } of selected) {
    try {
      const result = scrapeItem(item, index + 1, items.length);
      item.status = result.status;
      summary.push({ file: item.file, itemName: item.itemName, ...result });
    } catch (error) {
      item.status = "failed";
      summary.push({
        file: item.file,
        itemName: item.itemName,
        status: "failed",
        products: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      const filePath = path.join(DATA_DIR, item.file);
      const current = readJson(filePath);
      current.status = "failed";
      current.errors = [...(current.errors ?? []), error instanceof Error ? error.message : String(error)];
      writeJson(filePath, current);
      console.error(`Failed ${item.itemName}:`, error);
    }
    writeJson(MANIFEST_PATH, manifest);
  }

  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const empty = items.filter((item) => item.status === "empty").length;
  manifest.status = failed ? "partial" : empty ? "parsing" : "done";
  manifest.summary = {
    done,
    failed,
    empty,
    totalProducts: items.reduce((sum, item) => {
      const filePath = path.join(DATA_DIR, item.file);
      if (!fs.existsSync(filePath)) return sum;
      const data = readJson(filePath);
      return sum + (Array.isArray(data.products) ? data.products.length : 0);
    }, 0),
  };
  manifest.lastRun = {
    collectedAt: new Date().toISOString(),
    summary,
  };
  writeJson(MANIFEST_PATH, manifest);
  console.log(JSON.stringify(manifest.summary, null, 2));
}

main();
