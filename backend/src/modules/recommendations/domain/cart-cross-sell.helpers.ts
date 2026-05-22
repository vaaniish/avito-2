export type CartCrossSellCatalogItemSeed = {
  id: number;
  public_id: string;
  name: string;
  subcategory: {
    id: number;
    public_id: string;
    name: string;
    category: {
      id: number;
      public_id: string;
      name: string;
    };
  };
};

export type CartCrossSellRuleSeed = {
  source_category_id: number | null;
  source_subcategory_id: number | null;
  source_item_id: number | null;
  source_brand: string | null;
  source_model: string | null;
  target_category_id: number | null;
  target_subcategory_id: number | null;
  target_item_id: number | null;
  target_brand: string | null;
  priority: number;
  is_active: boolean;
};

type CrossSellBlueprint = {
  source: (item: NormalizedCatalogItem) => boolean;
  target: (item: NormalizedCatalogItem) => boolean;
  priority: number;
  take?: number;
};

type NormalizedCatalogItem = CartCrossSellCatalogItemSeed & {
  normalizedName: string;
  normalizedSubcategory: string;
  normalizedCategory: string;
  searchText: string;
};

const normalizeCrossSellText = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .normalize("NFKD");

const includesAny = (text: string, needles: string[]) =>
  needles.some((needle) => text.includes(normalizeCrossSellText(needle)));

const isOneOf = (text: string, names: string[]) =>
  names.some((name) => text === normalizeCrossSellText(name));

const isAccessoryLike = (item: NormalizedCatalogItem) =>
  includesAny(item.searchText, [
    "аксессуар",
    "защита",
    "заряд",
    "кабель",
    "блок питания",
    "адаптер",
    "чех",
    "сумк",
    "хаб",
    "подсвет",
    "вентилятор",
    "контроллер",
    "геймпад",
    "микрофон",
    "креплен",
    "освет",
    "фильтр",
    "щет",
    "расход",
    "чистящ",
    "уход",
    "посуда",
    "предмет",
  ]);

const buildRule = (
  source: NormalizedCatalogItem,
  target: NormalizedCatalogItem,
  priority: number,
): CartCrossSellRuleSeed => ({
  source_category_id: source.subcategory.category.id,
  source_subcategory_id: source.subcategory.id,
  source_item_id: source.id,
  source_brand: null,
  source_model: null,
  target_category_id: target.subcategory.category.id,
  target_subcategory_id: target.subcategory.id,
  target_item_id: target.id,
  target_brand: null,
  priority,
  is_active: true,
});

const sortItems = (items: NormalizedCatalogItem[]) =>
  [...items].sort((left, right) => {
    const categoryCompare = left.subcategory.category.name.localeCompare(
      right.subcategory.category.name,
      "ru-RU",
    );
    if (categoryCompare !== 0) return categoryCompare;
    const subcategoryCompare = left.subcategory.name.localeCompare(
      right.subcategory.name,
      "ru-RU",
    );
    if (subcategoryCompare !== 0) return subcategoryCompare;
    return left.name.localeCompare(right.name, "ru-RU");
  });

const crossSellBlueprints: CrossSellBlueprint[] = [
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Смартфоны", "Сотовые телефоны", "Стационарные сотовые телефоны"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Защита и поддержка для смартфонов",
        "Зарядка и подключение для смартфонов",
        "Прочие аксессуары для смартфонов",
        "Наушники и гарнитуры",
      ]),
    priority: 140,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Защита и поддержка для смартфонов", "Прочие аксессуары для смартфонов"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Зарядка и подключение для смартфонов",
        "Наушники и гарнитуры",
        "Аксессуары для смарт-часов и браслетов",
      ]),
    priority: 120,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Зарядка и подключение для смартфонов"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Прочие аксессуары для смартфонов",
        "Наушники и гарнитуры",
        "Аксессуары для смарт-часов и браслетов",
      ]),
    priority: 125,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Наушники и гарнитуры"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Зарядка и подключение для смартфонов",
        "Прочие аксессуары для смартфонов",
        "Смарт-часы и браслеты",
      ]),
    priority: 115,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Смарт-часы и браслеты", "Детские часы", "Умные кольца"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Аксессуары для смарт-часов и браслетов",
        "Зарядка и подключение для смартфонов",
        "Наушники и гарнитуры",
      ]),
    priority: 120,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Планшеты", "Электронные книги", "Цифровые блокноты"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Аксессуары для планшетов и электронных книг",
        "Наушники и гарнитуры",
        "Зарядка и подключение для смартфонов",
      ]),
    priority: 125,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Аксессуары для планшетов и электронных книг"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Зарядка и подключение для смартфонов",
        "Наушники и гарнитуры",
      ]),
    priority: 110,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Фотоаппараты", "Видеокамеры", "Экшн-камеры"]),
    target: (item) =>
      isOneOf(item.normalizedName, ["Объективы", "Осветительное оборудование"]),
    priority: 130,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Объективы"]),
    target: (item) =>
      isOneOf(item.normalizedName, ["Осветительное оборудование", "Фотоаппараты"]),
    priority: 120,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Ноутбуки"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Зарядные устройства для ноутбуков",
        "Блоки питания для ноутбуков",
        "Комплектующие и запчасти для ноутбуков",
        "Мониторы",
        "Веб-камеры",
        "Микрофоны",
      ]),
    priority: 135,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, [
        "Зарядные устройства для ноутбуков",
        "Блоки питания для ноутбуков",
        "Комплектующие и запчасти для ноутбуков",
      ]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Веб-камеры",
        "Микрофоны",
        "Мониторы",
      ]),
    priority: 118,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Персональные компьютеры", "Моноблоки"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Мониторы",
        "Видеокарты",
        "Процессоры",
        "Оперативная память",
        "Твердотельные накопители SSD",
        "Материнские платы",
        "Блоки питания",
        "Вентиляторы для корпуса",
        "Системы подсветки",
        "Веб-камеры",
        "Микрофоны",
      ]),
    priority: 128,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, [
        "Видеокарты",
        "Процессоры",
        "Оперативная память",
        "Твердотельные накопители SSD",
        "Материнские платы",
        "Блоки питания",
        "Вентиляторы для корпуса",
        "Системы подсветки",
      ]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Мониторы",
        "Персональные компьютеры",
        "Моноблоки",
        "Веб-камеры",
        "Микрофоны",
      ]),
    priority: 116,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["PlayStation", "Microsoft Xbox", "Nintendo"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Контроллеры и геймпады",
        "Телевизоры",
        "Саундбары",
        "Медиаплееры и DVD",
      ]),
    priority: 132,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Контроллеры и геймпады"]),
    target: (item) =>
      isOneOf(item.normalizedName, ["Саундбары", "Телевизоры"]),
    priority: 112,
  },
  {
    source: (item) => isOneOf(item.normalizedName, ["Телевизоры", "Проекторы"]),
    target: (item) =>
      isOneOf(item.normalizedName, ["Саундбары", "Медиаплееры и DVD", "Умные колонки"]),
    priority: 126,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, [
        "Саундбары",
        "Умные колонки",
        "Портативные колонки",
        "Портативные плееры и диктофоны",
      ]),
    target: (item) =>
      isOneOf(item.normalizedName, ["Телевизоры", "Проекторы"]),
    priority: 108,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Wi-Fi роутеры", "MESH-комплекты", "Коммутаторы", "Модемы 3G/4G/5G", "IP камеры"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Умная электрика и выключатели",
        "Радиостанции",
        "Аксессуары для радиостанций",
      ]),
    priority: 118,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Радиостанции", "Аксессуары для радиостанций"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Умная электрика и выключатели",
        "Wi-Fi роутеры",
        "MESH-комплекты",
      ]),
    priority: 110,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Встраиваемые кофемашины", "Приготовление напитков"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Чистящие средства для кухни",
        "Фильтрация воды",
        "Посуда и кухонные предметы",
      ]),
    priority: 140,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, [
        "Плиты, СВЧ и печи",
        "Холодильное оборудование",
        "Посудомоечные машины",
        "Электрочайники и термопоты",
        "Нарезка и смешивание",
        "Грили, аэрогрили, вафельницы, шашлычницы",
        "Фритюрницы и тостеры",
        "Мультиварки и техника для варки",
        "Приготовление десертов",
        "Вакуумная упаковка",
        "Домашние заготовки",
        "Супницы и мармиты",
        "Сушка овощей и фруктов",
        "Прочая техника для кухни",
        "Варочные панели",
        "Духовые шкафы",
        "Вытяжки",
        "Встраиваемые микроволновые печи",
        "Встраиваемые холодильники",
        "Встраиваемые морозильные шкафы",
        "Встраиваемые посудомоечные машины",
        "Встраиваемые стиральные машины",
        "Встраиваемые стирально-сушильные машины",
        "Встраиваемые винные шкафы",
        "Встраиваемые подогреватели для посуды",
      ]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Чистящие средства для кухни",
        "Посуда и кухонные предметы",
        "Фильтрация воды",
      ]),
    priority: 120,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, ["Уборка", "Стирка и сушка", "Глаженье", "Шитье, вышивание и уход за одеждой"]),
    target: (item) =>
      isOneOf(item.normalizedName, [
        "Умная техника",
        "Чистящие средства для кухни",
        "Управление климатом и обработка воздуха",
      ]),
    priority: 112,
  },
  {
    source: (item) =>
      isOneOf(item.normalizedName, [
        "Летний климат",
        "Зимний климат",
        "Управление климатом и обработка воздуха",
        "Водонагреватели и котлы отопления",
      ]),
    target: (item) =>
      isOneOf(item.normalizedName, ["Умная техника", "Часы"]),
    priority: 108,
  },
];

export function generateCartCrossSellRuleSeeds(
  rawItems: CartCrossSellCatalogItemSeed[],
): CartCrossSellRuleSeed[] {
  const items = sortItems(
    rawItems.map((item) => ({
      ...item,
      normalizedName: normalizeCrossSellText(item.name),
      normalizedSubcategory: normalizeCrossSellText(item.subcategory.name),
      normalizedCategory: normalizeCrossSellText(item.subcategory.category.name),
      searchText: normalizeCrossSellText(
        `${item.name} ${item.subcategory.name} ${item.subcategory.category.name}`,
      ),
    })),
  );

  const rules = new Map<string, CartCrossSellRuleSeed>();

  const addRule = (source: NormalizedCatalogItem, target: NormalizedCatalogItem, priority: number) => {
    if (source.id === target.id) return;
    const key = `${source.id}:${target.id}`;
    const existing = rules.get(key);
    if (existing && existing.priority >= priority) return;
    rules.set(key, buildRule(source, target, priority));
  };

  for (const source of items) {
    for (const blueprint of crossSellBlueprints) {
      if (!blueprint.source(source)) continue;
      const matches = items.filter((target) => blueprint.target(target) && target.id !== source.id);
      for (const target of matches.slice(0, blueprint.take ?? 3)) {
        addRule(source, target, blueprint.priority);
      }
    }
  }

  for (const source of items) {
    const existingCount = Array.from(rules.keys()).filter((key) => key.startsWith(`${source.id}:`)).length;
    if (existingCount > 0) continue;

    const sameSubcategoryAccessories = items.filter(
      (target) =>
        target.id !== source.id &&
        target.subcategory.id === source.subcategory.id &&
        isAccessoryLike(target),
    );
    for (const target of sameSubcategoryAccessories.slice(0, 2)) {
      addRule(source, target, 92);
    }

    const sameCategoryAccessories = items.filter(
      (target) =>
        target.id !== source.id &&
        target.subcategory.category.id === source.subcategory.category.id &&
        isAccessoryLike(target),
    );
    for (const target of sameCategoryAccessories.slice(0, 2)) {
      addRule(source, target, 76);
    }

    const fallbackSibling = items.find(
      (target) =>
        target.id !== source.id &&
        (target.subcategory.id === source.subcategory.id ||
          target.subcategory.category.id === source.subcategory.category.id),
    );
    if (fallbackSibling) {
      addRule(source, fallbackSibling, 48);
    }
  }

  return Array.from(rules.values()).sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    if ((left.source_item_id ?? 0) !== (right.source_item_id ?? 0)) {
      return (left.source_item_id ?? 0) - (right.source_item_id ?? 0);
    }
    return (left.target_item_id ?? 0) - (right.target_item_id ?? 0);
  });
}
