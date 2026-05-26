import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle, Info } from "lucide-react";
import { apiGet, apiPost } from "../../../shared/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../../shared/ui/notifications";

type PartnershipPageProps = {
  onBack: () => void;
};

type LegalTypeValue = "COMPANY" | "IP";

type PartnershipPolicy = {
  id: string;
  title: string;
  version: string;
  contentUrl: string;
};

type LegalLookupResult = {
  inn: string;
  ogrn: string;
  kpp: string | null;
  legalName: string;
  registeredAddress: string;
  taxRegion: string;
  registrationStatus: "active" | "inactive";
  dadataType: "LEGAL" | "INDIVIDUAL";
  managementName: string | null;
  managementPost: string | null;
};

type CatalogCategoryOption = {
  id: string;
  name: string;
};

type WeekdayKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

type ServiceDaySchedule = {
  day: WeekdayKey;
  enabled: boolean;
  openHour: string;
  closeHour: string;
};

type OnboardingForm = {
  legalType: LegalTypeValue;
  inn: string;
  representativeFullName: string;
  representativePhone: string;
  representativeEmail: string;
  authorityType: "director" | "owner" | "employee";
  authorityDocument: string;
  supportPhone: string;
  supportEmail: string;
  serviceSchedule: ServiceDaySchedule[];
  onlinePresenceUrls: string;
  businessDescription: string;
  categories: string[];
  monthlyCapacity: string;
};

type FormErrors = Partial<Record<keyof OnboardingForm | "legalLookup" | "policy", string>>;

const STEP_TITLES = ["Бизнес", "Контакты", "Продажи"];
const FIXED_WARRANTY_DAYS = 90;
const RETURN_DAYS = 14;
const WEEKDAY_OPTIONS: Array<{ key: WeekdayKey; short: string; label: string }> = [
  { key: "mon", short: "Пн", label: "Понедельник" },
  { key: "tue", short: "Вт", label: "Вторник" },
  { key: "wed", short: "Ср", label: "Среда" },
  { key: "thu", short: "Чт", label: "Четверг" },
  { key: "fri", short: "Пт", label: "Пятница" },
  { key: "sat", short: "Сб", label: "Суббота" },
  { key: "sun", short: "Вс", label: "Воскресенье" },
];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  `${String(index).padStart(2, "0")}:00`,
);
const STEP_FIELDS: Array<Array<keyof OnboardingForm | "legalLookup" | "policy">> = [
  ["legalType", "inn", "legalLookup", "onlinePresenceUrls"],
  ["representativeFullName", "authorityType", "representativePhone", "representativeEmail", "authorityDocument", "supportPhone", "supportEmail", "serviceSchedule"],
  ["businessDescription", "categories", "monthlyCapacity", "policy"],
];

function createDefaultServiceSchedule(): ServiceDaySchedule[] {
  return WEEKDAY_OPTIONS.map((day, index) => ({
    day: day.key,
    enabled: index < 5,
    openHour: "10:00",
    closeHour: "19:00",
  }));
}

function createEmptyForm(): OnboardingForm {
  return {
    legalType: "COMPANY",
    inn: "",
    representativeFullName: "",
    representativePhone: "",
    representativeEmail: "",
    authorityType: "director",
    authorityDocument: "",
    supportPhone: "",
    supportEmail: "",
    serviceSchedule: createDefaultServiceSchedule(),
    onlinePresenceUrls: "",
    businessDescription: "",
    categories: [],
    monthlyCapacity: "",
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function onlyDigits(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

function formatRuPhone(value: string): string {
  const rawDigits = onlyDigits(value);
  if (!rawDigits) return "";

  let digits = rawDigits;
  if (digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith("7")) {
    digits = `7${digits}`;
  }
  digits = digits.slice(0, 11);

  const area = digits.slice(1, 4);
  const first = digits.slice(4, 7);
  const second = digits.slice(7, 9);
  const third = digits.slice(9, 11);

  let formatted = "+7";
  if (area) formatted += ` (${area}`;
  if (area.length === 3) formatted += ")";
  if (first) formatted += ` ${first}`;
  if (second) formatted += `-${second}`;
  if (third) formatted += `-${third}`;

  return formatted;
}

function isValidRuPhone(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 && digits.startsWith("7");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasValidInnChecksum(inn: string): boolean {
  const digits = inn.split("").map(Number);
  const checksum = (coefficients: number[]) =>
    (coefficients.reduce((sum, coefficient, index) => sum + coefficient * digits[index], 0) % 11) % 10;

  if (inn.length === 10) {
    return checksum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9];
  }

  if (inn.length === 12) {
    return (
      checksum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10] &&
      checksum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11]
    );
  }

  return false;
}

function validateInnForLegalType(innValue: string, legalType: LegalTypeValue): string | null {
  const inn = onlyDigits(innValue);
  const expectedInnLength = legalType === "IP" ? 12 : 10;

  if (!inn) return "Укажите ИНН.";
  if (inn.length !== expectedInnLength) {
    return legalType === "IP" ? "Для ИП нужен ИНН из 12 цифр." : "Для юрлица нужен ИНН из 10 цифр.";
  }
  if (!hasValidInnChecksum(inn)) return "Проверьте ИНН: контрольная сумма не сходится.";
  return null;
}

function weekdayOrderIndex(day: WeekdayKey): number {
  return WEEKDAY_OPTIONS.findIndex((item) => item.key === day);
}

function formatServiceDays(days: WeekdayKey[]): string {
  const sorted = [...days].sort(
    (left, right) => weekdayOrderIndex(left) - weekdayOrderIndex(right),
  );
  const labels = sorted.map(
    (day) => WEEKDAY_OPTIONS.find((item) => item.key === day)?.short ?? day,
  );
  const isWeekdays =
    sorted.length === 5 &&
    sorted.every((day, index) => day === WEEKDAY_OPTIONS[index]?.key);
  const isFullWeek =
    sorted.length === 7 &&
    sorted.every((day, index) => day === WEEKDAY_OPTIONS[index]?.key);
  if (isWeekdays) return "Пн-Пт";
  if (isFullWeek) return "Пн-Вс";
  return labels.join(", ");
}

function buildServiceHours(schedule: ServiceDaySchedule[]): string {
  const sorted = [...schedule].sort(
    (left, right) => weekdayOrderIndex(left.day) - weekdayOrderIndex(right.day),
  );

  const enabledDays = sorted.filter(
    (item) => item.enabled && item.openHour && item.closeHour,
  );
  const disabledDays = sorted.filter((item) => !item.enabled);

  if (enabledDays.length === 0 && disabledDays.length === 0) return "";

  const workingGroups: Array<{ days: WeekdayKey[]; openHour: string; closeHour: string }> = [];
  for (const item of enabledDays) {
    const previous = workingGroups[workingGroups.length - 1];
    const previousLastDay = previous?.days[previous.days.length - 1];
    const isNextDay =
      typeof previousLastDay !== "undefined" &&
      weekdayOrderIndex(item.day) === weekdayOrderIndex(previousLastDay) + 1;

    if (
      previous &&
      isNextDay &&
      previous.openHour === item.openHour &&
      previous.closeHour === item.closeHour
    ) {
      previous.days.push(item.day);
      continue;
    }

    workingGroups.push({
      days: [item.day],
      openHour: item.openHour,
      closeHour: item.closeHour,
    });
  }

  const offGroups: WeekdayKey[][] = [];
  for (const item of disabledDays) {
    const previous = offGroups[offGroups.length - 1];
    const previousLastDay = previous?.[previous.length - 1];
    const isNextDay =
      typeof previousLastDay !== "undefined" &&
      weekdayOrderIndex(item.day) === weekdayOrderIndex(previousLastDay) + 1;

    if (previous && isNextDay) {
      previous.push(item.day);
      continue;
    }

    offGroups.push([item.day]);
  }

  return [
    ...workingGroups.map(
      (group) =>
        `${formatServiceDays(group.days)} ${group.openHour}-${group.closeHour}`,
    ),
    ...offGroups.map((days) => `${formatServiceDays(days)} выходной`),
  ].join("; ");
}

function deriveCityFromAddress(address: string, region: string): string {
  const normalized = address.replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:^|,\s*)(?:г\.?|город)\s*([А-ЯA-ZЁ][^,]+)/iu,
    /(?:^|,\s*)(?:пос\.?|поселок|пгт\.?)\s*([А-ЯA-ZЁ][^,]+)/iu,
    /(?:^|,\s*)(?:д\.?|деревня)\s*([А-ЯA-ZЁ][^,]+)/iu,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return region;
}

function validateForm(
  form: OnboardingForm,
  policyAccepted: boolean,
  legalLookup: LegalLookupResult | null,
): FormErrors {
  const errors: FormErrors = {};
  const onlineUrls = splitList(form.onlinePresenceUrls);
  const monthlyCapacity = Number(form.monthlyCapacity);

  if (!form.legalType) errors.legalType = "Выберите тип продавца.";
  const innError = validateInnForLegalType(form.inn, form.legalType);
  if (innError) {
    errors.inn = innError;
  } else if (!legalLookup || legalLookup.inn !== onlyDigits(form.inn) || legalLookup.registrationStatus !== "active") {
    errors.legalLookup = "Проверьте ИНН через DaData: юрлицо/ИП должен быть найден и действовать.";
  }

  if (onlineUrls.length === 0) {
    errors.onlinePresenceUrls = "Добавьте хотя бы одну ссылку на сайт, VK, карты или публичный профиль.";
  } else if (onlineUrls.some((url) => !isValidHttpUrl(url))) {
    errors.onlinePresenceUrls = "Ссылки должны начинаться с http:// или https://.";
  }

  if (form.representativeFullName.trim().split(/\s+/).length < 2) {
    errors.representativeFullName = "Укажите минимум имя и фамилию представителя.";
  }
  if (!isValidRuPhone(form.representativePhone)) {
    errors.representativePhone = "Укажите телефон в формате +7 (999) 123-45-67.";
  }
  if (!isValidEmail(form.representativeEmail)) errors.representativeEmail = "Укажите корректный email представителя.";
  if (form.authorityType === "employee" && form.authorityDocument.trim().length < 3) {
    errors.authorityDocument = "Для сотрудника нужна доверенность: номер документа или ссылка на PDF.";
  }

  if (form.businessDescription.trim().length < 20) {
    errors.businessDescription =
      "Коротко опишите, что вы продаёте и какое происхождение у товара.";
  }
  if (form.categories.length === 0) errors.categories = "Выберите хотя бы одну категорию каталога.";
  if (!isValidRuPhone(form.supportPhone)) {
    errors.supportPhone = "Укажите рабочий телефон компании/ИП в формате +7 (999) 123-45-67.";
  }
  if (!isValidEmail(form.supportEmail)) errors.supportEmail = "Укажите корректный рабочий email компании/ИП.";
  const enabledScheduleDays = form.serviceSchedule.filter((item) => item.enabled);
  if (enabledScheduleDays.length === 0) {
    errors.serviceSchedule = "Выберите хотя бы один рабочий день.";
  } else {
    for (const day of enabledScheduleDays) {
      if (!day.openHour || !day.closeHour) {
        errors.serviceSchedule = "Для каждого рабочего дня укажите время начала и окончания.";
        break;
      }
      if (HOUR_OPTIONS.indexOf(day.openHour) >= HOUR_OPTIONS.indexOf(day.closeHour)) {
        errors.serviceSchedule =
          "Во всех рабочих днях время окончания должно быть позже времени начала.";
        break;
      }
    }
  }
  if (!Number.isFinite(monthlyCapacity) || monthlyCapacity < 1) {
    errors.monthlyCapacity = "Укажите количество заказов в месяц числом больше 0.";
  }

  if (!policyAccepted) errors.policy = "Примите правила партнерства.";

  return errors;
}

function findFirstErrorStep(errors: FormErrors): number {
  const index = STEP_FIELDS.findIndex((fields) => fields.some((field) => Boolean(errors[field])));
  return index === -1 ? 0 : index;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function HelpNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function PartnershipPage({ onBack }: PartnershipPageProps) {
  const [formData, setFormData] = useState<OnboardingForm>(createEmptyForm);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategoryOption[]>([]);
  const [catalogCategoriesLoading, setCatalogCategoriesLoading] = useState(false);
  const [catalogCategoriesError, setCatalogCategoriesError] = useState<string | null>(null);
  const [legalLookup, setLegalLookup] = useState<LegalLookupResult | null>(null);
  const [legalLookupLoading, setLegalLookupLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formAlert, setFormAlert] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PartnershipPolicy>({
    id: "",
    title: "Правила использования",
    version: "",
    contentUrl: "/terms",
  });

  useEffect(() => {
    let cancelled = false;
    const loadPolicy = async () => {
      try {
        const response = await apiGet<PartnershipPolicy>(
          "/public/policy/current?scope=partnership",
        );
        if (!cancelled) setPolicy(response);
      } catch {
        // keep fallback
      }
    };
    void loadPolicy();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCatalogCategories = async () => {
    setCatalogCategoriesLoading(true);
    setCatalogCategoriesError(null);
    try {
      const response = await apiGet<Array<{ id: string; name: string }>>(
        "/catalog/categories?type=products",
      );
      const nextCategories = response
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? "").trim(),
        }))
        .filter((item) => item.id && item.name);
      setCatalogCategories(nextCategories);
      setFormData((prev) => ({
        ...prev,
        categories: prev.categories.filter((selected) =>
          nextCategories.some((category) => category.name === selected),
        ),
      }));
    } catch {
      setCatalogCategoriesError(
        "Не удалось загрузить актуальные категории каталога. Попробуйте ещё раз.",
      );
    } finally {
      setCatalogCategoriesLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalogCategories();
  }, []);

  const policyTitle = useMemo(() => "Правила использования", []);

  const updateField = <K extends keyof OnboardingForm>(
    field: K,
    value: OnboardingForm[K],
  ) => {
    setFormAlert(null);
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "inn" || field === "legalType") {
      setLegalLookup(null);
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      if (field === "inn" || field === "legalType") {
        delete next.legalLookup;
      }
      if (!prev[field] && (field !== "inn" && field !== "legalType")) return prev;
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setFormAlert(null);
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((item) => item !== category)
        : [...prev.categories, category],
    }));
    setErrors((prev) => {
      if (!prev.categories) return prev;
      const next = { ...prev };
      delete next.categories;
      return next;
    });
  };

  const toggleWorkingDay = (day: WeekdayKey) => {
    setFormAlert(null);
    setFormData((prev) => {
      return {
        ...prev,
        serviceSchedule: prev.serviceSchedule.map((item) =>
          item.day === day ? { ...item, enabled: !item.enabled } : item,
        ),
      };
    });
    setErrors((prev) => {
      if (!prev.serviceSchedule) return prev;
      const next = { ...prev };
      delete next.serviceSchedule;
      return next;
    });
  };

  const updateDayScheduleField = (
    day: WeekdayKey,
    field: "openHour" | "closeHour",
    value: string,
  ) => {
    setFormAlert(null);
    setFormData((prev) => ({
      ...prev,
      serviceSchedule: prev.serviceSchedule.map((item) =>
        item.day === day ? { ...item, [field]: value } : item,
      ),
    }));
    setErrors((prev) => {
      if (!prev.serviceSchedule) return prev;
      const next = { ...prev };
      delete next.serviceSchedule;
      return next;
    });
  };

  const fieldClass = (field: keyof OnboardingForm | "legalLookup" | "policy") =>
    `field-control ${errors[field] ? "field-control-invalid" : ""}`;

  const goToStep = (targetStep: number) => {
    setFormAlert(null);
    setStep(targetStep);
  };

  const goNext = () => {
    setFormAlert(null);
    setStep((prev) => Math.min(STEP_TITLES.length - 1, prev + 1));
  };

  const lookupLegalEntity = async () => {
    setFormAlert(null);
    const localError = validateInnForLegalType(formData.inn, formData.legalType);
    if (localError) {
      setErrors((prev) => ({ ...prev, inn: localError, legalLookup: localError }));
      notifyInfo(localError);
      return;
    }

    setLegalLookupLoading(true);
    setLegalLookup(null);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.inn;
      delete next.legalLookup;
      return next;
    });

    try {
      const response = await apiPost<{ success: boolean; result: LegalLookupResult }>(
        "/profile/partnership-requests/legal-lookup",
        {
          inn: onlyDigits(formData.inn),
          legalType: formData.legalType,
        },
      );
      setLegalLookup(response.result);
      if (response.result.registrationStatus === "active") {
        notifySuccess("ИНН проверен, юрлицо/ИП найдено.");
      } else {
        setErrors((prev) => ({
          ...prev,
          legalLookup: "Юрлицо/ИП найдено, но статус не действующий.",
        }));
        notifyInfo("Юрлицо/ИП найдено, но статус не действующий.");
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message = rawMessage.includes("не найд")
        ? "ИНН не найден в DaData. Проверьте цифры, тип продавца или попробуйте другой ИНН."
        : "Не удалось проверить ИНН. Попробуйте позже.";
      setErrors((prev) => ({ ...prev, legalLookup: message }));
      notifyError(message);
    } finally {
      setLegalLookupLoading(false);
    }
  };

  const buildPayload = () => {
    const onlinePresenceUrls = splitList(formData.onlinePresenceUrls);
    const primaryOnlineUrl = onlinePresenceUrls[0] ?? "";
    const derivedRegion = legalLookup?.taxRegion?.trim() ?? "";
    const derivedAddress = legalLookup?.registeredAddress?.trim() ?? "";
    const derivedCity = deriveCityFromAddress(derivedAddress, derivedRegion);
    const representativeRole =
      formData.authorityType === "director"
        ? "Директор / руководитель"
        : formData.authorityType === "owner"
          ? "Владелец / ИП"
          : "Сотрудник по доверенности";

    return {
      legalType: formData.legalType,
      inn: formData.inn,
      legalName: legalLookup?.legalName ?? "",
      ogrn: legalLookup?.ogrn ?? "",
      kpp: legalLookup?.kpp ?? "",
      registrationStatus: legalLookup?.registrationStatus === "active" ? "active" : "inactive",
      registeredAddress: legalLookup?.registeredAddress ?? "",
      taxRegion: legalLookup?.taxRegion ?? "",
      representativeFullName: formData.representativeFullName,
      representativeRole,
      representativePhone: formData.representativePhone,
      representativeEmail: formData.representativeEmail,
      authorityType: formData.authorityType,
      authorityDocument: formData.authorityDocument,
      websiteUrl: primaryOnlineUrl,
      businessEmail: formData.supportEmail,
      domainOwnershipMethod: "manual_review",
      publicProfileUrls: onlinePresenceUrls,
      businessRole: formData.businessDescription,
      categories: formData.categories,
      fulfillmentModel: "platform_pvz",
      country: "Россия",
      region: derivedRegion,
      city: derivedCity,
      warehouseAddress: derivedAddress,
      serviceCenterAddress: derivedAddress,
      deliveryCoverageRegions: ["Россия"],
      pickupAvailable: false,
      returnAddress: derivedAddress,
      supportPhone: formData.supportPhone,
      supportEmail: formData.supportEmail,
      serviceHours: buildServiceHours(formData.serviceSchedule),
      monthlyCapacity: Number(formData.monthlyCapacity),
      productSourceType: formData.businessDescription,
      supplierDocuments: "not_required_for_initial_onboarding",
      diagnosticProcess: "Проверяется по внутреннему регламенту продавца перед публикацией.",
      gradingStandard: "Используется шкала площадки: new_open_box, refurbished_a, refurbished_b, refurbished_c.",
      warrantyDays: FIXED_WARRANTY_DAYS,
      returnDays: RETURN_DAYS,
      serialCheckPolicy: "Продавец обязуется не публиковать заблокированные, краденые или неподтвержденные устройства.",
      qualityCharterAccepted: true,
      legalLookupVerified: legalLookup?.registrationStatus === "active" && legalLookup.inn === onlyDigits(formData.inn),
      emailVerified: false,
      domainVerified: false,
      representativeVerified: false,
      payoutVerified: false,
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validateForm(formData, policyAccepted, legalLookup);
    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.values(nextErrors).find(Boolean);
      setFormAlert(firstError ? `Проверьте форму: ${firstError}` : "Проверьте обязательные поля перед отправкой.");
      setErrors(nextErrors);
      setStep(findFirstErrorStep(nextErrors));
      notifyInfo("Проверьте обязательные поля перед отправкой.");
      return;
    }

    setFormAlert(null);
    setSubmitting(true);
    try {
      await apiPost<{ success: boolean }>("/profile/policy-acceptance", {
        scope: "partnership",
        policyId: policy.id || undefined,
      });

      const draft = await apiPost<{ requestId: string }>(
        "/profile/partnership-requests/draft",
        buildPayload(),
      );
      const submitted = await apiPost<{ requestId: string }>(
        `/profile/partnership-requests/${encodeURIComponent(draft.requestId)}/submit`,
      );

      notifySuccess(`Заявка отправлена: ${submitted.requestId}`);
      setFormData(createEmptyForm());
      setLegalLookup(null);
      setStep(0);
      setPolicyAccepted(false);
      setErrors({});
      setFormAlert(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить заявку";
      setFormAlert(message);
      notifyError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen app-shell">
      <div className="page-container pb-12 pt-6 md:pt-8 sm:pb-16">
        <button onClick={onBack} className="back-link mb-7 text-sm sm:text-base">
          <ArrowLeft className="h-6 w-6" />
          Назад
        </button>

        <div className="content-page mb-8 text-center sm:mb-10">
          <h1 className="mb-4 text-3xl text-gray-900 sm:text-5xl">Партнерская проверка</h1>
          <p className="text-base text-gray-600 sm:text-xl">
            Минимум ручной бюрократии: ИНН, представитель, онлайн-след бизнеса и правила площадки.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="content-page rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-10">
          <div className="mb-6 grid grid-cols-3 gap-2">
            {STEP_TITLES.map((title, index) => (
              <button
                key={title}
                type="button"
                onClick={() => goToStep(index)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  step === index ? "border-blue-700 bg-white text-blue-800" : "border-gray-200 bg-gray-100 text-gray-600"
                }`}
              >
                {index + 1}. {title}
              </button>
            ))}
          </div>
          {formAlert && (
            <div className="mb-4">
              <ErrorNote message={formAlert} />
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="h-full">
                  <select
                    value={formData.legalType}
                    onChange={(event) => updateField("legalType", event.target.value as LegalTypeValue)}
                    className={`${fieldClass("legalType")} py-0`}
                    style={{ height: "100%", minHeight: "4.5rem" }}
                  >
                    <option value="COMPANY">Юрлицо</option>
                    <option value="IP">ИП</option>
                  </select>
                  <FieldError message={errors.legalType} />
                </div>
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={formData.inn}
                      onChange={(event) => updateField("inn", onlyDigits(event.target.value, formData.legalType === "IP" ? 12 : 10))}
                      inputMode="numeric"
                      maxLength={formData.legalType === "IP" ? 12 : 10}
                      placeholder={formData.legalType === "IP" ? "ИНН ИП, 12 цифр" : "ИНН юрлица, 10 цифр"}
                      className={fieldClass("inn")}
                    />
                    <button
                      type="button"
                      onClick={() => void lookupLegalEntity()}
                      disabled={legalLookupLoading}
                      className="btn-secondary shrink-0 px-4 py-2.5 text-sm disabled:opacity-50"
                    >
                      {legalLookupLoading ? "Проверяем..." : "Проверить ИНН"}
                    </button>
                  </div>
                  {!errors.legalLookup && <FieldError message={errors.inn} />}
                </div>
              </div>
              <ErrorNote message={errors.legalLookup} />
              {legalLookup && (
                <div className={`rounded-xl border p-4 text-sm leading-6 sm:text-base ${legalLookup.registrationStatus === "active" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{legalLookup.legalName}</div>
                      <div className="text-xs opacity-80 sm:text-sm">Данные найдены в DaData по ЕГРЮЛ/ЕГРИП.</div>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs">
                      {legalLookup.registrationStatus === "active" ? "Действующая" : "Не действующая"}
                    </span>
                  </div>
                  <div className="grid gap-1 text-sm sm:grid-cols-2">
                    <div>ИНН: {legalLookup.inn}</div>
                    <div>{legalLookup.dadataType === "INDIVIDUAL" ? "ОГРНИП" : "ОГРН"}: {legalLookup.ogrn}</div>
                    {legalLookup.kpp && <div>КПП: {legalLookup.kpp}</div>}
                    {legalLookup.managementName && <div>Руководитель из реестра: {legalLookup.managementName}</div>}
                    {legalLookup.managementPost && <div>Должность руководителя: {legalLookup.managementPost}</div>}
                    {legalLookup.taxRegion && <div>Регион: {legalLookup.taxRegion}</div>}
                  </div>
                  <div className="mt-2 text-sm">Юр. адрес: {legalLookup.registeredAddress}</div>
                </div>
              )}
              <div>
                <textarea
                  value={formData.onlinePresenceUrls}
                  onChange={(event) => updateField("onlinePresenceUrls", event.target.value)}
                  rows={3}
                  placeholder="Сайт, VK, Avito, 2GIS, Я.Карты или другой публичный профиль бизнеса"
                  className={fieldClass("onlinePresenceUrls")}
                />
                <FieldError message={errors.onlinePresenceUrls} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <input value={formData.representativeFullName} onChange={(event) => updateField("representativeFullName", event.target.value)} placeholder="ФИО представителя" className={fieldClass("representativeFullName")} />
                  <FieldError message={errors.representativeFullName} />
                </div>
                <div>
                  <select value={formData.authorityType} onChange={(event) => updateField("authorityType", event.target.value as OnboardingForm["authorityType"])} className={fieldClass("authorityType")}>
                    <option value="director">Директор / руководитель</option>
                    <option value="owner">Владелец / ИП</option>
                    <option value="employee">Сотрудник по доверенности</option>
                  </select>
                  <FieldError message={errors.authorityType} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <input
                    value={formData.representativePhone}
                    onChange={(event) => updateField("representativePhone", formatRuPhone(event.target.value))}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+7 (___) ___-__-__"
                    className={fieldClass("representativePhone")}
                  />
                  <FieldError message={errors.representativePhone} />
                </div>
                <div>
                  <input
                    value={formData.representativeEmail}
                    onChange={(event) => updateField("representativeEmail", event.target.value)}
                    onBlur={(event) => updateField("representativeEmail", event.target.value.trim().toLowerCase())}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@company.ru"
                    className={fieldClass("representativeEmail")}
                  />
                  <FieldError message={errors.representativeEmail} />
                </div>
              </div>
              <HelpNote>
                Ниже укажите рабочие контакты компании или ИП. Для ИП можно использовать рабочий номер и email самого предпринимателя, если это основной канал связи по бизнесу.
              </HelpNote>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <input
                    value={formData.supportPhone}
                    onChange={(event) => updateField("supportPhone", formatRuPhone(event.target.value))}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+7 (___) ___-__-__"
                    className={fieldClass("supportPhone")}
                  />
                  <FieldError message={errors.supportPhone} />
                </div>
                <div>
                  <input
                    value={formData.supportEmail}
                    onChange={(event) => updateField("supportEmail", event.target.value)}
                    onBlur={(event) => updateField("supportEmail", event.target.value.trim().toLowerCase())}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="Рабочий email компании / ИП"
                    className={fieldClass("supportEmail")}
                  />
                  <FieldError message={errors.supportEmail} />
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm font-medium text-gray-800">
                  График работы компании / ИП
                </div>
                <div className="flex items-start flex-nowrap gap-1 overflow-x-auto">
                  {formData.serviceSchedule.map((schedule) => {
                    const dayMeta = WEEKDAY_OPTIONS.find(
                      (item) => item.key === schedule.day,
                    );
                    return (
                      <div
                        key={schedule.day}
                        className={`min-w-0 shrink-0 self-start overflow-hidden rounded-xl border p-1.5 transition ${
                          schedule.enabled
                            ? "border-[rgb(38,83,141)] bg-[rgba(38,83,141,0.05)]"
                            : "border-gray-200 bg-gray-50"
                        }`}
                        style={{ width: "calc((100% - 1.5rem) / 7)" }}
                      >
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleWorkingDay(schedule.day)}
                            className={`flex w-full items-center justify-center rounded-full border px-2 py-1 text-center text-sm font-medium transition ${
                              schedule.enabled
                                ? "border-[rgb(38,83,141)] bg-[rgb(38,83,141)] text-white"
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                            }`}
                          >
                            {dayMeta?.short ?? schedule.day}
                          </button>
                        </div>
                        <div
                          className={`overflow-hidden transition-all duration-300 ease-out ${
                            schedule.enabled
                              ? "mt-1.5 max-h-40 opacity-100"
                              : "mt-0 max-h-0 opacity-0"
                          }`}
                        >
                          <div className="text-center text-[10px] font-medium text-gray-500">
                            рабочий
                          </div>
                          <div
                            className="mt-1.5 space-y-1"
                          >
                            <div>
                              <label className="mb-0.5 block text-[10px] font-medium text-gray-700">
                                С
                              </label>
                              <select
                                value={schedule.openHour}
                                onChange={(event) =>
                                  updateDayScheduleField(
                                    schedule.day,
                                    "openHour",
                                    event.target.value,
                                  )
                                }
                                disabled={!schedule.enabled}
                                className={`${fieldClass("serviceSchedule")} min-h-[2rem] px-1.5 py-1 text-xs ${
                                  !schedule.enabled
                                    ? "cursor-not-allowed bg-gray-100 text-gray-400"
                                    : ""
                                }`}
                              >
                                {HOUR_OPTIONS.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] font-medium text-gray-700">
                                До
                              </label>
                              <select
                                value={schedule.closeHour}
                                onChange={(event) =>
                                  updateDayScheduleField(
                                    schedule.day,
                                    "closeHour",
                                    event.target.value,
                                  )
                                }
                                disabled={!schedule.enabled}
                                className={`${fieldClass("serviceSchedule")} min-h-[2rem] px-1.5 py-1 text-xs ${
                                  !schedule.enabled
                                    ? "cursor-not-allowed bg-gray-100 text-gray-400"
                                    : ""
                                }`}
                              >
                                {HOUR_OPTIONS.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <FieldError message={errors.serviceSchedule} />
                <div className="text-xs text-gray-500">
                  График:{" "}
                  {buildServiceHours(formData.serviceSchedule) ||
                    "выберите хотя бы один рабочий день"}
                </div>
              </div>
              {formData.authorityType === "employee" && (
                <>
                  <HelpNote>
                    Доверенность обычно выдаёт руководитель компании. На MVP можно указать номер документа или ссылку на PDF в облаке, например Яндекс Диск/Google Drive с доступом по ссылке. Позже это поле лучше заменить настоящей загрузкой файла.
                  </HelpNote>
                  <input value={formData.authorityDocument} onChange={(event) => updateField("authorityDocument", event.target.value)} placeholder="Номер доверенности или ссылка на PDF" className={fieldClass("authorityDocument")} />
                  <FieldError message={errors.authorityDocument} />
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <textarea
                value={formData.businessDescription}
                onChange={(event) => updateField("businessDescription", event.target.value)}
                rows={3}
                placeholder="Кратко опишите, что продаете и какое происхождение у товара. Например: восстанавливаем смартфоны и ноутбуки, продаем уцененную бытовую технику после диагностики."
                className={fieldClass("businessDescription")}
              />
              <FieldError message={errors.businessDescription} />
              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-800">Категории каталога</div>
                {catalogCategoriesLoading ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500">
                    Загружаем актуальные категории каталога...
                  </div>
                ) : catalogCategoriesError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div>{catalogCategoriesError}</div>
                    <button
                      type="button"
                      onClick={() => void loadCatalogCategories()}
                      className="mt-2 text-sm font-medium text-blue-700 underline"
                    >
                      Повторить загрузку
                    </button>
                  </div>
                ) : (
                  <>
                    {catalogCategories.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500">
                        В каталоге пока нет корневых категорий для выбора.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {catalogCategories.map((category) => (
                          <label
                            key={category.id}
                            className={`flex items-center gap-2 rounded-lg border bg-white p-3 text-sm ${errors.categories ? "border-red-300" : "border-gray-200"}`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.categories.includes(category.name)}
                              onChange={() => toggleCategory(category.name)}
                            />
                            {category.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <FieldError message={errors.categories} />
              <div>
                <input value={formData.monthlyCapacity} onChange={(event) => updateField("monthlyCapacity", onlyDigits(event.target.value))} inputMode="numeric" placeholder="Среднее количество продаж в месяц" className={fieldClass("monthlyCapacity")} />
                <FieldError message={errors.monthlyCapacity} />
              </div>
              <HelpNote>
                В этом описании кратко укажите и сам товар, и его происхождение. Документы по происхождению площадка может запросить позже точечно: при жалобе, споре, риск-категории или ручной модерации.
              </HelpNote>
              <label className={`flex items-start gap-2 rounded-xl border bg-white p-3 text-sm text-gray-700 ${errors.policy ? "border-red-300" : "border-gray-200"}`}>
                <input
                  type="checkbox"
                  checked={policyAccepted}
                  onChange={(event) => {
                    setFormAlert(null);
                    setPolicyAccepted(event.target.checked);
                    setErrors((prev) => {
                      if (!prev.policy) return prev;
                      const next = { ...prev };
                      delete next.policy;
                      return next;
                    });
                  }}
                  className="mt-0.5"
                />
                <span>
                  Я принимаю{" "}
                  <a href={policy.contentUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    {policyTitle}
                  </a>
                </span>
              </label>
              <FieldError message={errors.policy} />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={step === 0} onClick={() => setStep((prev) => Math.max(0, prev - 1))} className="btn-secondary flex-1 py-2.5 disabled:opacity-50">
              Назад
            </button>
            {step < STEP_TITLES.length - 1 ? (
              <button type="button" onClick={goNext} className="btn-primary flex-1 py-2.5">
                Далее
              </button>
            ) : (
              <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5 disabled:bg-gray-400">
                {submitting ? "Отправляем..." : "Отправить на проверку"}
              </button>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <CheckCircle className="h-4 w-4" />
            Юридические данные по ИНН проверяются модератором/будущей интеграцией, вручную продавец их не вводит.
          </div>
        </form>
      </div>
    </div>
  );
}
