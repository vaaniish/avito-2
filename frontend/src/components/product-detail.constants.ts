import type { ComplaintCategoryConfig } from "./product-detail.types";

export const QUESTIONS_PAGE_SIZE = 6;
export const COMPLAINT_DETAILS_MAX = 2000;

export const COMPLAINT_CATEGORIES: ComplaintCategoryConfig[] = [
  {
    key: "listing_info",
    title: "Информация в объявлении",
    detailsTitle: "Информация в объявлении",
    subtitle: "Неверная цена или другие параметры, актуальность",
    apiType: "suspicious_listing",
    reasons: [
      "Неверная цена",
      "Неправдивые фото или описание",
      "Неверный адрес",
      "Уже продано",
      "Объявление должно быть в другой категории",
      "Телефон или ссылки в описании",
    ],
    detailsPlaceholder: "Проверка",
  },
  {
    key: "communication",
    title: "Общение с продавцом",
    detailsTitle: "Общение с продавцом",
    subtitle: "Хамство в ответах, невозможно связаться",
    apiType: "other",
    reasons: [
      "Невозможно связаться",
      "Хамство, грубость",
      "Хамил в ответах на вопросы",
      "Кажется, это мошенники",
    ],
    detailsPlaceholder: "Расскажите, что не так",
  },
  {
    key: "fraud",
    title: "Нарушение правил или обман",
    detailsTitle: "Нарушение правил или обман",
    subtitle: "Мошенничество, дубли, чужие фото",
    apiType: "fraud",
    reasons: [
      "Дубль другого объявления",
      "Чужие фото",
      "Запрещенный товар",
      "Просят оплатить комиссию за доставку",
      "Просят предоплату",
      "Кажется, это мошенники",
    ],
    detailsPlaceholder: "Расскажите, что не так",
  },
];

export const REVIEW_MONTH_INDEX: Record<string, number> = {
  января: 0,
  февраль: 1,
  февраля: 1,
  март: 2,
  марта: 2,
  апрель: 3,
  апреля: 3,
  май: 4,
  мая: 4,
  июнь: 5,
  июня: 5,
  июль: 6,
  июля: 6,
  август: 7,
  августа: 7,
  сентябрь: 8,
  сентября: 8,
  октябрь: 9,
  октября: 9,
  ноябрь: 10,
  ноября: 10,
  декабрь: 11,
  декабря: 11,
};
