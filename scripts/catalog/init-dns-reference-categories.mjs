#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, "data/catalog-reference");
const SEED_PATH = path.join(ROOT, "backend/prisma/dns-product-catalog.seed.ts");
const SELECTED_CATEGORY_NAMES = [
  "Смартфоны и фототехника",
  "ТВ, консоли и аудио",
  "ПК, ноутбуки, периферия",
  "Комплектующие для ПК",
  "Сетевое оборудование",
];

const CATEGORY_DIRS = {
  "Смартфоны и фототехника": "dns-smartphones-photo",
  "ТВ, консоли и аудио": "dns-tv-consoles-audio",
  "ПК, ноутбуки, периферия": "dns-pc-laptops-peripherals",
  "Комплектующие для ПК": "dns-pc-components",
  "Сетевое оборудование": "dns-network-equipment",
};

const CATEGORY_URLS = {
  "Смартфоны и фототехника": "https://www.dns-shop.ru/catalog/17a890dc16404e77/smartfony-i-fototehnika/",
  "ТВ, консоли и аудио": "https://www.dns-shop.ru/catalog/17a8bfb516404e77/tv-konsoli-i-audio/",
  "ПК, ноутбуки, периферия": "https://www.dns-shop.ru/catalog/17aa72ab16404e77/pk-noutbuki-periferia/",
  "Комплектующие для ПК": "https://www.dns-shop.ru/catalog/17aa522a16404e77/komplektuusie-dla-pk/",
  "Сетевое оборудование": "https://www.dns-shop.ru/catalog/03d800b1b7df14a9/setevoe-oborudovanie/",
};

const CYRILLIC_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function readSeed() {
  let source = fs.readFileSync(SEED_PATH, "utf8");
  source = source
    .replace(/export type[\s\S]*?;\n\n/, "")
    .replace(/export const dnsProductCatalogSeed[^=]*=/, "const dnsProductCatalogSeed =");
  const context = {};
  vm.runInNewContext(`${source}\nthis.seed = dnsProductCatalogSeed;`, context);
  return context.seed;
}

function slugify(value) {
  const transliterated = String(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/[а-яё]/g, (char) => CYRILLIC_MAP[char] ?? char)
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/3g\/4g\/5g/g, "3g-4g-5g")
    .replace(/8bit/g, "8bit")
    .replace(/16bit/g, "16bit")
    .replace(/wi-fi/g, "wifi")
    .replace(/hi-fi/g, "hifi")
    .replace(/poe/g, "poe")
    .replace(/voip/g, "voip")
    .replace(/kvm/g, "kvm")
    .replace(/ssd/g, "ssd")
    .replace(/hdd/g, "hdd")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return transliterated || "item";
}

function uniqueSlug(base, used) {
  let slug = base;
  let index = 2;
  while (used.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  used.add(slug);
  return slug;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function runSafariJavaScript(source) {
  const jsPath = path.join(os.tmpdir(), `dns-reference-init-${process.pid}-${Date.now()}.js`);
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
      maxBuffer: 1024 * 1024 * 32,
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

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanLinkText(value) {
  const text = decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const half = text.length % 2 === 0 ? text.slice(0, text.length / 2) : "";
  if (half && half === text.slice(text.length / 2)) return half;
  return text;
}

function absoluteDnsUrl(href) {
  if (!href) return "";
  if (href.startsWith("https://www.dns-shop.ru/")) return href;
  if (href.startsWith("/")) return `https://www.dns-shop.ru${href}`;
  return href;
}

function fetchHtmlViaSafari(url) {
  const script = `
(function () {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", ${JSON.stringify(url)}, false);
  xhr.send(null);
  return xhr.responseText || "";
})()
`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const html = runSafariJavaScript(script);
    if (html) return html;
    sleep(attempt * 1000);
    ensureSafariOnDns();
  }
  return "";
}

function linksFrom(url) {
  const html = fetchHtmlViaSafari(url);
  const links = [];
  const anchorPattern = /<a\b([^>]*\bhref=(["'])(.*?)\2[^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const href = absoluteDnsUrl(decodeHtmlEntities(match[3]));
    const text = cleanLinkText(match[4]);
    if (text && href.includes("/catalog/")) {
      links.push({ text, href });
    }
  }
  return links;
}

function findLink(links, name) {
  const exact = links.find((link) => link.text === name);
  if (exact) return exact.href;
  const fuzzy = links
    .filter((link) => link.text.includes(name))
    .sort((a, b) => a.text.length - b.text.length)[0];
  return fuzzy?.href ?? null;
}

function discoverUrls(categories) {
  const catalogLinks = linksFrom("https://www.dns-shop.ru/catalog/");
  const result = {};
  for (const category of categories) {
    const categoryUrl = findLink(catalogLinks, category.name) ?? category.url ?? null;
    result[category.name] = { url: categoryUrl, subcategories: {} };
    if (!categoryUrl) continue;
    const categoryLinks = linksFrom(categoryUrl);
    for (const subcategory of category.subcategories) {
      const subcategoryUrl = findLink(categoryLinks, subcategory.name);
      result[category.name].subcategories[subcategory.name] = {
        url: subcategoryUrl,
        products: {},
      };
      if (!subcategoryUrl) continue;
      const subcategoryLinks = linksFrom(subcategoryUrl);
      for (const productName of subcategory.products) {
        result[category.name].subcategories[subcategory.name].products[productName] =
          findLink(subcategoryLinks, productName);
      }
    }
  }
  return result;
}

function createReferenceFiles(category, discovery) {
  const categoryDir = path.join(OUTPUT_ROOT, CATEGORY_DIRS[category.name]);
  const usedSubcategorySlugs = new Set();
  const usedItemSlugs = new Map();
  const items = [];

  for (const subcategory of category.subcategories) {
    const subcategorySlug = uniqueSlug(slugify(subcategory.name), usedSubcategorySlugs);
    usedItemSlugs.set(subcategorySlug, new Set());
    const subcategoryDiscovery = discovery[category.name]?.subcategories?.[subcategory.name];
    for (const itemName of subcategory.products) {
      const itemSlug = uniqueSlug(slugify(itemName), usedItemSlugs.get(subcategorySlug));
      const file = `${subcategorySlug}/${itemSlug}.json`;
      const item = {
        subcategoryName: subcategory.name,
        itemName,
        file,
        status: "empty",
        dnsUrl: subcategoryDiscovery?.products?.[itemName] ?? null,
      };
      items.push(item);
      writeJson(path.join(categoryDir, file), {
        source: "DNS catalog",
        categoryName: category.name,
        subcategoryName: subcategory.name,
        itemName,
        dnsUrl: item.dnsUrl,
        collectedAt: null,
        status: "empty",
        totalPages: 0,
        totalProducts: 0,
        products: [],
        brands: [],
        errors: [],
      });
    }
  }

  const manifest = {
    source: "DNS catalog",
    categoryName: category.name,
    categoryUrl: discovery[category.name]?.url ?? null,
    status: "empty",
    totalItems: items.length,
    items,
  };
  writeJson(path.join(categoryDir, "manifest.json"), manifest);
  return { categoryName: category.name, dir: categoryDir, totalItems: items.length };
}

function main() {
  ensureSafariOnDns();
  const seed = readSeed();
  const categories = seed.filter((category) => SELECTED_CATEGORY_NAMES.includes(category.name));
  const discovery = discoverUrls(
    categories.map((category) => ({ ...category, url: CATEGORY_URLS[category.name] ?? null })),
  );
  const summary = categories.map((category) => createReferenceFiles(category, discovery));
  console.log(JSON.stringify(summary, null, 2));
}

main();
