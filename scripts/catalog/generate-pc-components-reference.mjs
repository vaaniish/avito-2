import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CATALOG_ROOT = path.join(ROOT, "data/catalog-reference");
const OUTPUT_PATH = path.join(ROOT, "data/catalog-reference/generated/catalog-reference.json");
const REPORT_PATH = path.join(ROOT, "data/catalog-reference/generated/catalog-reference-report.json");
const BRACKET_GROUPS_SOURCE = "bracketGroups";
const TITLE_FALLBACK_SOURCE = "titleFallback";

const MANIFEST_PATHS = [
  "dns-appliances/manifest.json",
  "dns-smartphones-photo/manifest.json",
  "dns-tv-consoles-audio/manifest.json",
  "dns-pc-laptops-peripherals/manifest.json",
  "dns-pc-components/manifest.json",
  "dns-network-equipment/manifest.json",
];

const TOKEN_FIXUPS = new Map([
  ["ASUS", "ASUS"],
  ["MSI", "MSI"],
  ["GIGABYTE", "GIGABYTE"],
  ["DEEPCOOL", "DEEPCOOL"],
  ["ID-COOLING", "ID-COOLING"],
  ["AMD", "AMD"],
  ["Intel", "Intel"],
  ["HUAWEI", "HUAWEI"],
  ["HONOR", "HONOR"],
  ["DEXP", "DEXP"],
  ["TP-LINK", "TP-Link"],
  ["XIAOMI", "Xiaomi"],
]);

const COLOR_WORDS = new Set([
  "белый", "черный", "чёрный", "серый", "серебристый", "золотистый", "синий", "красный",
  "зеленый", "зелёный", "желтый", "жёлтый", "фиолетовый", "розовый", "голубой", "бежевый",
  "коричневый", "оранжевый", "графит", "графитовый", "титановый", "прозрачный",
]);

const LEADING_DESCRIPTOR_WORDS = new Set([
  "автоматическая", "без", "встраиваемая", "встраиваемый", "декоративная", "каминная",
  "купольная", "наклонная", "настенная", "настольная", "островная", "подвесная",
  "полновстраиваемая", "пристенная", "телескопическая",
]);

const INVALID_BRAND_WORDS = new Set([
  "адаптер", "антивибрационные", "антипригарный", "держатель", "коврик", "комплект",
  "набор", "переходник", "противень", "сетка", "силовой", "средство", "фильтр", "шланг",
]);

const KNOWN_TITLE_PREFIXES = [
  "Вытяжка полновстраиваемая", "Вытяжка телескопическая", "Вытяжка купольная", "Вытяжка наклонная",
  "Вытяжка островная", "Вытяжка подвесная", "Вытяжка встраиваемая",
  "Электрический духовой шкаф", "Газовый духовой шкаф",
  "Индукционная варочная поверхность", "Электрическая варочная поверхность", "Газовая варочная поверхность",
  "Комбинированная варочная поверхность",
  "Встраиваемая кофемашина", "Кофемашина автоматическая",
  "Встраиваемый холодильник без морозильника",
  "Кулер для процессора", "Система жидкостного охлаждения", "Игровая консоль", "Портативная игровая консоль",
  "Посудомоечная машина", "Встраиваемая посудомоечная машина", "Стиральная машина", "Стирально-сушильная машина",
  "Встраиваемая стиральная машина", "Встраиваемая стирально-сушильная машина", "Холодильник", "Морозильный шкаф",
  "Встраиваемый холодильник", "Встраиваемый морозильный шкаф", "Варочная поверхность", "Варочная панель",
  "Электрическая плита", "Газовая плита", "Микроволновая печь", "Встраиваемая микроволновая печь",
  "Духовой шкаф", "Вытяжка", "Кофемашина", "Кофеварка", "Электрочайник", "Термопот",
  "Мультиварка", "Блендер", "Мясорубка", "Тостер", "Фритюрница", "Аэрогриль", "Гриль",
  "Робот-пылесос", "Пылесос", "Утюг", "Отпариватель", "Швейная машина", "Водонагреватель",
  "Кондиционер", "Обогреватель", "Очиститель воздуха", "Увлажнитель воздуха", "Вентилятор",
  "Смартфон", "Планшет", "Электронная книга", "Смарт-часы", "Фитнес-браслет", "Детские часы",
  "Сотовый телефон", "Фотоаппарат", "Объектив", "Экшн-камера", "Видеокамера", "Квадрокоптер",
  "Ноутбук", "Ультрабук", "Моноблок", "Персональный компьютер", "Системный блок", "Монитор",
  "Клавиатура", "Мышь", "Веб-камера", "Микрофон", "Графический планшет", "Внешний накопитель",
  "Наушники", "Гарнитура", "Колонки", "Портативная колонка", "Саундбар", "Телевизор", "Проектор",
  "Wi-Fi роутер", "MESH-комплект", "Роутер", "Маршрутизатор", "Точка доступа", "Коммутатор",
  "IP камера", "Аналоговая камера", "Видеорегистратор", "Источник бесперебойного питания", "Стабилизатор напряжения",
  "Процессор", "Материнская плата", "Видеокарта", "Оперативная память", "Блок питания", "Корпус",
  "Устройство видеозахвата", "Конвертер видеосигнала", "Контроллер для стриминга",
  "Чистящее средство", "Дымогенератор для копчения", "Супница (подогреватель супа)",
  "Радиобудильник", "Радиостанция", "Зарядная станция", "Адаптер питания сетевой",
  "Адаптер питания", "Антивирус", "Электронный блокнот", "Штатив", "Жидкость для чистки",
  "Набор для очистки оптики", "Салфетка", "Держатель слайдов", "Зажим",
  "Кронштейн для ТВ", "Кронштейн-полка", "Адаптер наклона", "Направляющие для видеостены",
  "Подписка на медиасервис", "Подписка на игровой сервис", "Пополнение баланса сервиса",
  "Игра", "Геймпад беспроводной/проводной", "Геймпад", "Кабель", "Коврик", "Салазки",
  "Салазки в отсек привода",
  "Корзина для накопителей", "Комплект направляющих", "Адаптер PowerLine", "3G/4G LTE модем",
  "Антенный кабель", "Крепежный комплект", "Крепление", "Cистема видеонаблюдения",
  "Система видеонаблюдения", "Видеоняня", "Шкаф коммутационный", "Аккумуляторная батарея для ИБП",
  "Аккумуляторная батарея", "Переходник", "Блок розеток", "Батарейка", "Зарядное устройство",
  "Платформа", "Шнур, мон+клав+мышь", "Держатель для кабелей",
].sort((a, b) => b.length - a.length);

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleBeforeFirstBracket(value) {
  return normalizeWhitespace(String(value).split("[")[0].split(",")[0]);
}

function titleWithoutBracketBlocks(value) {
  return normalizeWhitespace(String(value).replace(/\[[^\]]*\]/gu, " "));
}

function normalizeBrand(value) {
  const brand = normalizeWhitespace(value).replace(/[Кк](?=[a-z])/u, "K").replace(/[Оо](?=[a-z])/u, "O");
  return TOKEN_FIXUPS.get(brand) ?? brand;
}

function stripLeadingScreenSize(value) {
  return normalizeWhitespace(value.replace(/^(?:\d+(?:[.,]\d+)?\s*(?:"|дюйм(?:а|ов)?|''))\s+/iu, ""));
}

function stripKnownTitlePrefix(value) {
  let result = stripLeadingScreenSize(value);
  for (const prefix of KNOWN_TITLE_PREFIXES) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = normalizeWhitespace(result.replace(new RegExp(`^${escaped}\\s+`, "iu"), ""));
  }
  return result;
}

function stripTrailingColor(value) {
  const parts = normalizeWhitespace(value).split(" ");
  while (parts.length > 1 && COLOR_WORDS.has(parts.at(-1).toLocaleLowerCase("ru-RU"))) {
    parts.pop();
  }
  return normalizeWhitespace(parts.join(" "));
}

function stripLeadingDescriptors(value) {
  const parts = normalizeWhitespace(value).split(" ");
  while (
    parts.length > 1 &&
    LEADING_DESCRIPTOR_WORDS.has(parts[0].toLocaleLowerCase("ru-RU"))
  ) {
    parts.shift();
  }
  return normalizeWhitespace(parts.join(" "));
}

function extractBrandAndModel(itemName, title) {
  const beforeBracket = stripLeadingDescriptors(
    stripTrailingColor(stripKnownTitlePrefix(titleBeforeFirstBracket(title))),
  );

  if (itemName === "Твердотельные накопители SSD") {
    const afterDriveWord = beforeBracket.match(/накопитель\s+(.+)$/iu)?.[1] ?? beforeBracket;
    const [brand = "", ...modelParts] = normalizeWhitespace(afterDriveWord).split(" ");
    return { brand: normalizeBrand(brand), model: normalizeWhitespace(modelParts.join(" ")) };
  }

  if (itemName === "Охлаждение компьютера") {
    const withoutCoolerPrefix = beforeBracket
      .replace(/^Кулер для процессора\s+/iu, "")
      .replace(/^Система жидкостного охлаждения\s+/iu, "")
      .replace(/^Вентилятор\s+/iu, "")
      .replace(/^Термопаста\s+/iu, "");
    const [brand = "", ...modelParts] = normalizeWhitespace(withoutCoolerPrefix).split(" ");
    return { brand: normalizeBrand(brand), model: normalizeWhitespace(modelParts.join(" ")) };
  }

  const [brand = "", ...modelParts] = beforeBracket.split(" ");
  if (/^\d/.test(brand) || brand.length < 2) return { brand: "", model: "" };
  if (INVALID_BRAND_WORDS.has(brand.toLocaleLowerCase("ru-RU"))) {
    return { brand: "", model: "" };
  }
  return { brand: normalizeBrand(brand), model: normalizeWhitespace(modelParts.join(" ")) };
}

function isLikelyCodeGroup(group) {
  const text = normalizeWhitespace(group);
  if (!text || text.includes(",") || text.length < 6) return false;
  if (/[а-яё]/iu.test(text)) return false;
  if (!/[A-Z]/u.test(text) || !/\d/u.test(text)) return false;
  return /[-_./]/u.test(text) || /[A-Z0-9]{8,}/u.test(text);
}

function splitCharacteristicGroup(group) {
  return normalizeWhitespace(group)
    .split(/\s*,\s*/u)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function slugifyCharacteristic(text, index) {
  const ascii = text
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "e")
    .replace(/[а]/g, "a").replace(/[б]/g, "b").replace(/[в]/g, "v").replace(/[г]/g, "g")
    .replace(/[д]/g, "d").replace(/[е]/g, "e").replace(/[ж]/g, "zh").replace(/[з]/g, "z")
    .replace(/[и]/g, "i").replace(/[й]/g, "y").replace(/[к]/g, "k").replace(/[л]/g, "l")
    .replace(/[м]/g, "m").replace(/[н]/g, "n").replace(/[о]/g, "o").replace(/[п]/g, "p")
    .replace(/[р]/g, "r").replace(/[с]/g, "s").replace(/[т]/g, "t").replace(/[у]/g, "u")
    .replace(/[ф]/g, "f").replace(/[х]/g, "h").replace(/[ц]/g, "c").replace(/[ч]/g, "ch")
    .replace(/[ш]/g, "sh").replace(/[щ]/g, "sch").replace(/[ъь]/g, "").replace(/[ы]/g, "y")
    .replace(/[э]/g, "e").replace(/[ю]/g, "yu").replace(/[я]/g, "ya")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return ascii || `characteristic_${index + 1}`;
}

function characteristicKey(label, index, occurrence) {
  const base = slugifyCharacteristic(label, index);
  return occurrence > 1 ? `${base}_${occurrence}` : base;
}

function labelFromKeyValue(text) {
  const match = text.match(/^([^:-]+?)\s*(?:-|:)\s*(.+)$/u);
  if (!match) return null;
  const key = normalizeWhitespace(match[1])
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/gu, " ");
  const value = normalizeWhitespace(match[2]);
  const map = new Map([
    ["ядер", "Ядра и частота"],
    ["ядра", "Ядра и частота"],
    ["ram", "Оперативная память"],
    ["расход воды", "Расход воды"],
    ["кол-во комплектов", "Количество комплектов"],
    ["количество комплектов", "Количество комплектов"],
    ["кол-во корзин", "Количество корзин"],
    ["количество корзин", "Количество корзин"],
    ["мощность", "Мощность"],
    ["объем", "Объем"],
    ["объём", "Объем"],
    ["скорость чтения", "Скорость чтения"],
    ["скорость записи", "Скорость записи"],
    ["диагональ", "Диагональ"],
    ["разрешение", "Разрешение"],
    ["режимы", "Режим работы"],
    ["режим", "Режим работы"],
    ["ширина", "Ширина"],
    ["высота", "Высота"],
    ["глубина", "Глубина"],
    ["уровень шума", "Уровень шума"],
    ["класс энергопотребления", "Класс энергопотребления"],
    ["количество программ", "Количество программ"],
    ["кол-во программ", "Количество программ"],
    ["программ", "Количество программ"],
    ["конфорок", "Количество конфорок"],
    ["панель", "Материал панели"],
    ["разморозка", "Разморозка"],
    ["исп. кофе", "Используемый кофе"],
    ["материал поверхности", "Материал поверхности"],
    ["тип питания", "Тип питания"],
    ["резервное питание", "Резервное питание"],
    ["каналов", "Количество каналов"],
    ["передатчик", "Мощность передатчика"],
    ["время работы", "Время работы"],
    ["полет", "Время полета"],
    ["полёт", "Время полета"],
    ["скорость", "Скорость"],
    ["радиус действия", "Радиус действия"],
    ["байонет", "Байонет"],
    ["дата выхода", "Дата выхода"],
    ["язык озвучки", "Язык озвучки"],
    ["количество устройств", "Количество устройств"],
    ["назначение", "Назначение"],
    ["совместимость", "Совместимость"],
    ["совместимый водоблок", "Совместимый водоблок"],
    ["для видеокарт", "Совместимые видеокарты"],
    ["глубина монтажа в стойку", "Глубина монтажа в стойку"],
    ["ширина монтажной стойки", "Ширина монтажной стойки"],
    ["размещение камер", "Размещение камер"],
    ["камер в комплекте", "Камер в комплекте"],
    ["портов", "Количество портов"],
    ["розеток", "Количество розеток"],
    ["кабель", "Длина кабеля"],
    ["вилок", "Количество вилок"],
    ["защита", "Степень защиты"],
    ["установка", "Установка"],
    ["глубина раб. пространства", "Глубина рабочего пространства"],
    ["секций", "Количество секций"],
    ["разъем 1", "Разъем 1"],
    ["разъем 2", "Разъем 2"],
    ["переходники", "Переходники в комплекте"],
    ["рисунок", "Рисунок"],
    ["вентиляторы", "Вентиляторы"],
    ["в комплекте", "Комплектация"],
    ["клавиатура", "Клавиатура"],
    ["питание", "Питание"],
    ["форм-фактор накопителя", "Форм-фактор накопителя"],
    ["разъем подключения", "Разъем подключения"],
  ]);
  const label = map.get(key);
  return label ? { label, value } : null;
}

function inferCharacteristic(itemName, value) {
  const text = normalizeWhitespace(value);
  const keyed = labelFromKeyValue(text);
  if (keyed) return keyed;
  if (/^L2\s*-/iu.test(text)) return { label: "L2", value: normalizeWhitespace(text.replace(/^L2\s*-\s*/iu, "")) };
  if (/^L3\s*-/iu.test(text)) return { label: "L3", value: normalizeWhitespace(text.replace(/^L3\s*-\s*/iu, "")) };
  if (/^TDP\s+/iu.test(text)) return { label: "TDP", value: normalizeWhitespace(text.replace(/^TDP\s*/iu, "")) };
  if (/^GPU\s+/iu.test(text)) return { label: "Частота GPU", value: normalizeWhitespace(text.replace(/^GPU\s*/iu, "")) };
  if (/^(AM\d|LGA\s*\d|sTRX|sWRX|Socket)/iu.test(text)) return { label: "Сокет", value: text };
  if (/^Intel Core|^AMD Ryzen|^AMD Athlon|^Intel Celeron|^Intel Pentium|^Apple M\d/iu.test(text)) return { label: "Процессор", value: text };
  if (/^RAM\s+/iu.test(text)) return { label: "Оперативная память", value: normalizeWhitespace(text.replace(/^RAM\s*/iu, "")) };
  if (/^SSD\s+/iu.test(text)) return { label: "SSD", value: normalizeWhitespace(text.replace(/^SSD\s*/iu, "")) };
  if (/^HDD\s+/iu.test(text)) return { label: "HDD", value: normalizeWhitespace(text.replace(/^HDD\s*/iu, "")) };
  if (itemName !== "Процессоры" && /^(Intel UHD|Intel Iris|AMD Radeon|NVIDIA GeForce|GeForce RTX|GeForce GTX|Radeon RX)/iu.test(text)) return { label: "Графика", value: text };
  if (/^\d+(?:[.,]\d+)?\s*м³\/ч$/iu.test(text)) return { label: "Производительность", value: text };
  if (/^\d+(?:[.,]\d+)?\s*дБ$/iu.test(text)) return { label: "Уровень шума", value: text };
  if (/^\d+(?:[.,]\d+)?\s*об\/мин$/iu.test(text)) return { label: "Скорость вращения", value: text };
  if (/^\d+(?:[.,]\d+)?\s*Мбит\/с$/iu.test(text)) return { label: "Скорость", value: text };
  if (/^\d+(?:[.,]\d+)?\s*Мбит\/сек$/iu.test(text)) return { label: "Скорость", value: text };
  if (/^\d+(?:[.,]\d+)?\s*кг$/iu.test(text)) return { label: "Вес", value: text };
  if (/^до\s+\d+(?:[.,]\d+)?\s*кг$/iu.test(text)) return { label: "Максимальная нагрузка", value: text };
  if (/^\d+(?:[.,]\d+)?\s*г$/iu.test(text)) return { label: "Вес", value: text };
  if (/^\d+(?:[.,]\d+)?\s*л$/iu.test(text)) return { label: "Объем", value: text };
  if (/^\d+(?:[.,]\d+)?\s*мл$/iu.test(text)) return { label: "Объем", value: text };
  if (/^\d+(?:[.,]\d+)?\s*см$/iu.test(text)) return { label: "Размер", value: text };
  if (/^(?:от\s+)?\d+(?:[.,]\d+)?\s*см\s+до\s+\d+(?:[.,]\d+)?\s*см$/iu.test(text)) return { label: "Диапазон высоты", value: text };
  if (/^\d+(?:[.,]\d+)?\s*мм\s*[хx]\s*\d+(?:[.,]\d+)?\s*мм(?:\s*[хx]\s*\d+(?:[.,]\d+)?\s*мм)?$/iu.test(text)) return { label: "Размеры", value: text };
  if (/^\d+(?:[.,]\d+)?\s*см\s*[хx]\s*\d+(?:[.,]\d+)?\s*см(?:\s*[хx]\s*\d+(?:[.,]\d+)?\s*см)?$/iu.test(text)) return { label: "Размеры", value: text };
  if (/^\d+(?:[.,]\d+)?\s*(?:см|мм)\s*[хx]\s*\d+(?:[.,]\d+)?\s*(?:см|мм)(?:\s*[хx]\s*\d+(?:[.,]\d+)?\s*(?:см|мм))?$/iu.test(text)) return { label: "Размеры", value: text };
  if (/^класс\s+[A-GА-Я](?:\+{1,3})?$/iu.test(text)) return { label: "Класс энергопотребления", value: text };
  if (/^\d+(?:[.,]\d+)?\s*В$/u.test(text)) return { label: "Напряжение", value: text };
  if (/^\d+(?:[.,]\d+)?\s*А$/u.test(text)) return { label: "Сила тока", value: text };
  if (/^\d+(?:[.,]\d+)?\s*А\*ч$/iu.test(text)) return { label: "Емкость", value: text };
  if (/^\d+(?:[.,]\d+)?\s*ВА$/iu.test(text)) return { label: "Полная мощность", value: text };
  if (/^\d+(?:[.,]\d+)?\s*кВт$/iu.test(text)) return { label: "Активная мощность", value: text };
  if (/^\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*Гц$/iu.test(text)) return { label: "Частота", value: text };
  if (/^\d+(?:[.,]\d+)?\s*В\s*-\s*\d+(?:[.,]\d+)?\s*В$/iu.test(text)) return { label: "Диапазон напряжения", value: text };
  if (/^IP\d{2}$/iu.test(text)) return { label: "Степень защиты", value: text };
  if (/^(металл|пластик|сталь|алюминий|дерево|бамбук|ткань|полиэстер|нейлон|спандекс|МДФ|углеродистая сталь|полиуретан)$/iu.test(text)) return { label: "Материал", value: text };
  if (/^для\s+.+/iu.test(text)) return { label: "Совместимость / назначение", value: text };
  if (/^установка\s+на\s+/iu.test(text)) return { label: "Тип установки", value: text };
  if (itemName === "Вытяжки" && /^металл$/iu.test(text)) return { label: "Материал", value: text };
  if (/^дисплей$/iu.test(text)) return { label: "Дисплей", value: "Есть" };
  if (/^защита от протечек$/iu.test(text)) return { label: "Защита от протечек", value: "Есть" };
  if (/^инвертор$/iu.test(text)) return { label: "Инвертор", value: "Есть" };
  if (/^независим(?:ый|ая)$/iu.test(text)) return { label: "Тип установки", value: text };
  if (/^до\s+\d+(?:[.,]\d+)?\s*°C$/iu.test(text)) return { label: "Максимальная температура", value: text };
  if (/^гриль$/iu.test(text)) return { label: "Гриль", value: "Есть" };
  if (/^конвекция$/iu.test(text)) return { label: "Конвекция", value: "Есть" };
  if (/^капучинатор$/iu.test(text)) return { label: "Капучинатор", value: "Есть" };
  if (/морозильная камера$/iu.test(text)) return { label: "Морозильная камера", value: text };
  if (/DisplayPort|HDMI|DVI/iu.test(text)) return { label: "Видеоразъемы", value: text };
  if (/^(RCA|S-Video|VGA|3\.5 мм jack)/iu.test(text)) return { label: "Видеоразъемы", value: text };
  if (/^(USB|Thunderbolt|PCI-Express|PCIe)/iu.test(text)) return { label: "Интерфейс", value: text };
  if (/^(VHF|UHF|VHF\/UHF)$/iu.test(text)) return { label: "Диапазон частот", value: text };
  if (/^Cat\.\d+/iu.test(text)) return { label: "Категория LTE", value: text };
  if (/^(3G|4G|5G|LTE|DC-HSPA\+|HSPA\+)$/iu.test(text)) return { label: "Сети", value: text };
  if (/\bбит\b/iu.test(text)) return { label: "Шина памяти", value: text };
  if (/^\d{3,5}\s*[xх]\s*\d{3,5}$/iu.test(text)) return { label: "Разрешение", value: text };
  if (/^([0-9]+P?\s*x|[0-9]+E\s*x)/iu.test(text) && /ГГц/iu.test(text)) return { label: "Ядра и частота", value: text };
  if (/DDR[3-7]/iu.test(text)) return { label: itemName === "Оперативная память" ? "Тип памяти" : "Память", value: text };
  if (/^\d+(?:[.,]\d+)?\s*Вт$/iu.test(text)) return { label: "Мощность", value: text };
  if (/PCI[\s-]?E|PCIe/iu.test(text)) return { label: "Интерфейс", value: text };
  if (/^\d+(?:[.,]\d+)?\s*(?:ГБ|ТБ)$/iu.test(text)) return { label: "Объем памяти", value: text };
  if (/M\.2|SATA|NVMe/iu.test(text)) return { label: "Интерфейс / форм-фактор", value: text };
  if (/ATX|Tower|Mini-ITX|Micro-ATX/iu.test(text)) return { label: "Форм-фактор", value: text };
  if (/чтение/iu.test(text)) return { label: "Скорость чтения", value: text };
  if (/запись/iu.test(text)) return { label: "Скорость записи", value: text };
  if (/TBW/iu.test(text)) return { label: "Ресурс TBW", value: text };
  if (/^\d+(?:[.,]\d+)?\s*(?:"|дюйм(?:а|ов)?)$/iu.test(text)) return { label: "Диагональ", value: text };
  if (/^(IPS|VA|OLED|AMOLED|Super Retina XDR|TN)$/iu.test(text)) return { label: "Тип матрицы", value: text };
  if (/^камера\s+/iu.test(text)) return { label: "Камера", value: normalizeWhitespace(text.replace(/^камера\s*/iu, "")) };
  if (/^\d+\s*SIM$/iu.test(text)) return { label: "SIM-карты", value: text };
  if (/^\d+\s*мА\*ч$/iu.test(text)) return { label: "Аккумулятор", value: text };
  if (/^(4G|5G|Wi-Fi\s*\d|Bluetooth\s*\d)/iu.test(text)) return { label: "Беспроводные интерфейсы", value: text };
  if (/^(RJ-11|RJ-12|RJ-45|FTP|SFTP|STP|UTP)$/iu.test(text)) return { label: "Поддерживаемые разъемы / кабели", value: text };
  if (/^(AA|AAA|Ni-MH|Ni-Cd|Li-Ion|LiFePO4|CR2025|CR2032)$/iu.test(text)) return { label: "Типоразмер / химия", value: text };
  if (/^(щелочная|литиевая|монохромный экран|будильник|радио|проектор|подсветка дисплея|стабилизация|пульт ДУ|камера|ночная съемка|голосовая активация|датчик движения|Wi-Fi|FHSS)$/iu.test(text)) return { label: "Особенность", value: text };
  if (/^(проводной|беспроводной|аккумулятор|от USB)$/iu.test(text)) return { label: "Подключение / питание", value: text };
  if (/^(мышь|клавиатура|коврик|наушники)\s+/iu.test(text)) return { label: "Состав набора", value: text };
  if (/^(зачистка|заделка|обрезка|снятие|запрессовка)\s+кабел/iu.test(text)) return { label: "Операции с кабелем", value: text };
  if (/^\d+(?:[.,]\d+)?°(?:\/\d+(?:[.,]\d+)?°)?$/u.test(text)) return { label: "Угол регулировки", value: text };
  if (/^до\s+\d+(?:[.,]\d+)?["”]$/u.test(text)) return { label: "Совместимая диагональ", value: text };
  if (/^\d+\s*шт$/iu.test(text)) return { label: "Количество в комплекте", value: text };
  if (/^\d+\+$/u.test(text)) return { label: "Возрастной рейтинг", value: text };
  if (/^(цифровое|стандартное)\s+издание$/iu.test(text)) return { label: "Тип издания", value: text };
  if (isLikelyCodeGroup(text)) return { label: "Код / артикул", value: text };
  return null;
}

function bracketGroupsToVariant(itemName, product) {
  const groups = Array.isArray(product.bracketGroups) ? product.bracketGroups.map(normalizeWhitespace).filter(Boolean) : [];
  const rawParts = groups.flatMap((group, groupIndex) => splitCharacteristicGroup(group).map((part) => ({ part, groupIndex })));
  const labelOccurrences = new Map();
  const characteristics = rawParts.flatMap(({ part, groupIndex }, index) => {
    const inferred = inferCharacteristic(itemName, part);
    if (!inferred) return [];
    const occurrence = (labelOccurrences.get(inferred.label) ?? 0) + 1;
    labelOccurrences.set(inferred.label, occurrence);
    return [{
      key: characteristicKey(inferred.label, index, occurrence),
      label: inferred.label,
      value: inferred.value,
      rawValue: part,
      sourceGroupIndex: groupIndex,
      source: BRACKET_GROUPS_SOURCE,
    }];
  });
  return { productId: normalizeWhitespace(product.productId), title: normalizeWhitespace(product.title), characteristics };
}

function collectUniqueMatches(text, pattern) {
  return Array.from(text.matchAll(pattern))
    .map((match) => normalizeWhitespace(match[0]))
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((entry) => normalizeExactForGeneration(entry) === normalizeExactForGeneration(value)) === index);
}

function normalizeExactForGeneration(value) {
  return normalizeWhitespace(value).toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function makeFallbackCharacteristic(label, value, rawValue, index) {
  return {
    key: characteristicKey(label, index, 1),
    label,
    value: normalizeWhitespace(value),
    rawValue: normalizeWhitespace(rawValue),
    sourceGroupIndex: -1,
    source: TITLE_FALLBACK_SOURCE,
  };
}

function titleFallbackCharacteristics(itemName, title) {
  const text = titleWithoutBracketBlocks(title);
  const characteristics = [];
  const seenLabels = new Set();
  const push = (label, value, rawValue = value) => {
    const cleanValue = normalizeWhitespace(value);
    if (!cleanValue || seenLabels.has(label)) return;
    seenLabels.add(label);
    characteristics.push(makeFallbackCharacteristic(label, cleanValue, rawValue, characteristics.length));
  };

  if (itemName === "Карты видеозахвата") {
    const interfaces = collectUniqueMatches(
      text,
      /\b(?:USB\s*\d(?:\.\d)?(?:\s*Gen\s*\d)?(?:\s*\([^)]*\))?\s*Type[-\s]?[ACА]?|PCI-Express\s*x\d+|Thunderbolt\s*\d)\b/giu,
    );
    if (interfaces.length > 0) push("Интерфейс подключения", interfaces.join(", "));

    const resolution = text.match(/\b\d{3,5}\s*[xх]\s*\d{3,5}\b/iu)?.[0];
    if (resolution) push("Разрешение захвата", resolution);

    const videoInputs = collectUniqueMatches(
      text,
      /\b(?:HDMI(?:\s*x\d+)?|RCA\s*\([^)]*\)|S-Video|VGA\s*\(D-Sub\)|3\.5\s*мм\s*jack\s*\([^)]*\))\b/giu,
    );
    if (videoInputs.length > 0) push("Видеовходы", videoInputs.join(", "));
  }

  if (itemName === "Корзины для накопителей") {
    const bays = text.match(/Количество корзин\s+([^:]+):\s*([^,]+)/iu);
    if (bays) push("Количество корзин", `${normalizeWhitespace(bays[2])} x ${normalizeWhitespace(bays[1])}`, bays[0]);
    const bayInstall = text.match(/Установка в отсек:\s*([^,]+)/iu);
    if (bayInstall) push("Установка в отсек", bayInstall[1], bayInstall[0]);
    const hotSwap = text.match(/Горячая замена:\s*(есть|нет)/iu);
    if (hotSwap) push("Горячая замена", hotSwap[1], hotSwap[0]);
  }

  if (/^(Подписки медиасервисов|Карты оплаты и цифровой контент|Nintendo)$/u.test(itemName)) {
    const serviceFor = text.match(/Для:\s*([^,]+(?:,\s*[^,]+){0,4})/iu);
    if (serviceFor) {
      push("Сервис / платформа", serviceFor[1].replace(/,\s*Устройств:.*/iu, ""), serviceFor[0]);
    }
    const devices = text.match(/Устройств:\s*\d+/iu);
    if (devices) push("Количество устройств", devices[0].replace(/^Устройств:\s*/iu, ""), devices[0]);
    const duration = text.match(/на\s+\d+\s+месяц(?:ев|а)?/iu);
    if (duration) push("Срок подписки", duration[0].replace(/^на\s+/iu, ""), duration[0]);
  }

  if (itemName === "Платформы") {
    const socket = text.match(/\b(?:AM\d|LGA\s*\d+|BGA\s*\d+)\b/iu)?.[0];
    if (socket) push("Сокет", socket);
    const chipset = text.match(/\b(?:AMD|Intel)\s+[A-Z]?\d{3,4}\b/iu)?.[0];
    if (chipset) push("Чипсет", chipset);
    const processor = text.match(/\b(?:Intel\s+(?:Core\s+i\d-\d+[A-Z]*|Core\s+\d-\d+[A-Z]*|N\d{3})|AMD\s+Ryzen\s+\d[^,]*)\b/iu)?.[0];
    if (processor) push("Процессор", processor);
  }

  if (itemName === "KVM оборудование") {
    const interfaces = collectUniqueMatches(text, /\b(?:USB|SPHD15|DB15|HD\s+DB15|A-Тип)\b/giu);
    if (interfaces.length > 0) push("Интерфейсы", interfaces.join(", "));
  }

  if (characteristics.length > 0) return characteristics;

  const genericPatterns = [
    { label: "Разрешение", pattern: /\b\d{3,5}\s*[xх]\s*\d{3,5}\b/iu },
    { label: "Интерфейс", pattern: /\b(?:USB\s*\d(?:\.\d)?(?:\s*Gen\s*\d)?|PCI-Express\s*x\d+|PCIe\s*\d(?:\.\d)?|Thunderbolt\s*\d|SATA|M\.2|NVMe)\b/iu },
    { label: "Видеоразъемы", pattern: /\b(?:HDMI(?:\s*x\d+)?|DisplayPort|DVI|VGA\s*\(D-Sub\)|RCA|S-Video)\b/iu },
    { label: "Мощность", pattern: /\b\d+(?:[.,]\d+)?\s*(?:Вт|кВт|ВА)\b/iu },
    { label: "Объем памяти", pattern: /\b\d+(?:[.,]\d+)?\s*(?:ГБ|ТБ)\b/iu },
    { label: "Напряжение", pattern: /\b\d+(?:[.,]\d+)?\s*В\b/u },
    { label: "Емкость", pattern: /\b\d+(?:[.,]\d+)?\s*(?:А\*ч|мА\*ч)\b/iu },
    { label: "Размеры", pattern: /\b\d+(?:[.,]\d+)?\s*(?:см|мм)\s*[xх]\s*\d+(?:[.,]\d+)?\s*(?:см|мм)(?:\s*[xх]\s*\d+(?:[.,]\d+)?\s*(?:см|мм))?\b/iu },
    { label: "Количество устройств", pattern: /\bУстройств:\s*\d+\b/iu, clean: (value) => value.replace(/^Устройств:\s*/iu, "") },
  ];
  for (const { label, pattern, clean } of genericPatterns) {
    const raw = text.match(pattern)?.[0];
    if (raw) push(label, clean ? clean(raw) : raw, raw);
  }

  if (characteristics.length === 0) {
    const sparseTypeByItem = new Map([
      ["Домашние заготовки", "Дымогенератор для копчения"],
      ["Супницы и мармиты", "Супница / подогреватель"],
      ["Кабель-менеджмент", "Держатель для кабелей"],
      ["Аксессуары к ИБП", "Кабель"],
    ]);
    const sparseType = sparseTypeByItem.get(itemName);
    if (sparseType && text.toLocaleLowerCase("ru-RU").includes(sparseType.split(" ")[0].toLocaleLowerCase("ru-RU"))) {
      push("Тип товара", sparseType);
    }
  }

  return characteristics;
}

function parseItem(manifestDir, source) {
  const sourcePath = path.join(CATALOG_ROOT, manifestDir, source.file);
  const data = JSON.parse(readFileSync(sourcePath, "utf8"));
  const brands = new Map();
  let productsWithBracketGroups = 0;
  let parsedProductsCount = 0;
  let fallbackParsedProductsCount = 0;
  let bracketParsedProductsCount = 0;
  const fieldLabels = new Set();
  const sourceLabels = new Map();
  const omittedBracketParts = new Map();
  for (const product of data.products ?? []) {
    const title = normalizeWhitespace(product.title);
    const hasBracketGroups =
      Array.isArray(product.bracketGroups) &&
      product.bracketGroups.some((group) => normalizeWhitespace(group));
    if (hasBracketGroups) productsWithBracketGroups += 1;
    let { brand, model } = extractBrandAndModel(source.itemName, title);
    let variant = bracketGroupsToVariant(source.itemName, product);
    const recognizedRawValues = new Set(variant.characteristics.map((characteristic) => characteristic.rawValue));
    if (hasBracketGroups) {
      const groups = product.bracketGroups.map(normalizeWhitespace).filter(Boolean);
      const rawParts = groups.flatMap(splitCharacteristicGroup);
      for (const part of rawParts) {
        if (recognizedRawValues.has(part)) continue;
        omittedBracketParts.set(part, (omittedBracketParts.get(part) ?? 0) + 1);
      }
    }
    let usedFallback = false;
    if (variant.characteristics.length === 0) {
      const fallbackCharacteristics = titleFallbackCharacteristics(source.itemName, product.title);
      if (fallbackCharacteristics.length > 0) {
        if (!brand) brand = "Другое";
        if (!model) {
          model = normalizeWhitespace(stripKnownTitlePrefix(titleWithoutBracketBlocks(title))) || title;
          if (normalizeExactForGeneration(model) === normalizeExactForGeneration(brand)) {
            model = titleWithoutBracketBlocks(title);
          }
        }
        usedFallback = true;
        variant = {
          productId: normalizeWhitespace(product.productId),
          title,
          characteristics: fallbackCharacteristics,
        };
      }
    }
    if (!brand || !model) continue;
    if (variant.characteristics.length === 0) continue;
    parsedProductsCount += 1;
    if (usedFallback) {
      fallbackParsedProductsCount += 1;
    } else {
      bracketParsedProductsCount += 1;
    }
    for (const characteristic of variant.characteristics) {
      fieldLabels.add(characteristic.label);
      if (!sourceLabels.has(characteristic.source)) sourceLabels.set(characteristic.source, new Set());
      sourceLabels.get(characteristic.source).add(characteristic.label);
    }
    if (!brands.has(brand)) brands.set(brand, new Map());
    const models = brands.get(brand);
    if (!models.has(model)) models.set(model, []);
    models.get(model).push(variant);
  }
  const item = {
    categoryName: source.categoryName,
    subcategoryName: source.subcategoryName,
    itemName: source.itemName,
    sourceFile: `${manifestDir}/${source.file}`,
    productsCount: data.products?.length ?? 0,
    brands: Array.from(brands.entries()).map(([brand, models]) => ({
      brand,
      models: Array.from(models.entries()).map(([model, variants]) => ({
        model,
        variants: variants.sort((left, right) => left.title.localeCompare(right.title, "ru-RU")),
      })).sort((left, right) => left.model.localeCompare(right.model, "ru-RU")),
    })).filter((brand) => brand.models.length > 0).sort((left, right) => left.brand.localeCompare(right.brand, "ru-RU")),
  };
  const reportEntry = {
    categoryName: source.categoryName,
    subcategoryName: source.subcategoryName,
    itemName: source.itemName,
    sourceFile: `${manifestDir}/${source.file}`,
    productsCount: data.products?.length ?? 0,
    productsWithBracketGroups,
    parsedProductsCount,
    bracketParsedProductsCount,
    fallbackParsedProductsCount,
    brandsCount: item.brands.length,
    fieldsCount: fieldLabels.size,
    fieldsBySource: Object.fromEntries(
      Array.from(sourceLabels.entries()).map(([sourceName, labels]) => [
        sourceName,
        Array.from(labels).sort((left, right) => left.localeCompare(right, "ru-RU")),
      ]),
    ),
    omittedBracketParts: Array.from(omittedBracketParts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru-RU"))
      .slice(0, 20)
      .map(([value, count]) => ({ value, count })),
    status:
      bracketParsedProductsCount > 0
        ? "ok_bracket_groups"
        : fallbackParsedProductsCount > 0
          ? "fallback_from_title"
          : productsWithBracketGroups > 0
            ? "needs_more_label_rules"
            : "no_characteristics_source",
    fields: Array.from(fieldLabels).sort((left, right) =>
      left.localeCompare(right, "ru-RU"),
    ),
  };
  return { item, reportEntry };
}

function parseManifest(relativePath) {
  const manifestPath = path.join(CATALOG_ROOT, relativePath);
  const manifestDir = path.dirname(relativePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return (manifest.items ?? [])
    .filter((item) => item.status === "done" && item.file)
    .map((item) => parseItem(manifestDir, { ...item, categoryName: manifest.categoryName }));
}

const parsedItems = MANIFEST_PATHS.flatMap(parseManifest);
const items = parsedItems
  .map((entry) => entry.item)
  .filter((item) => item.brands.length > 0);
const report = {
  generatedAt: "2026-05-07T00:00:00.000Z",
  totalManifestItems: parsedItems.length,
  supportedItems: items.length,
  unsupportedItems: parsedItems.filter((entry) =>
    ["needs_more_label_rules", "no_characteristics_source"].includes(entry.reportEntry.status),
  ).length,
  items: parsedItems.map((entry) => entry.reportEntry),
};
const reference = {
  generatedAt: "2026-05-07T00:00:00.000Z",
  source: "DNS catalog title + bracketGroups with title fallback for sparse DNS items",
  characteristicSource: "bracketGroups+titleFallback",
  totalItems: items.length,
  items,
};

mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(reference, null, 2)}\n`);
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)} (${items.length} items)`);
