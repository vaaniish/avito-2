import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle, Info } from "lucide-react";
import { apiGet, apiPost } from "../../../shared/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../../shared/ui/notifications";

type PartnershipPageProps = {
  onBack: () => void;
};

type LegalTypeValue = "COMPANY" | "IP" | "BRAND";
type CategoryValue = "electronics" | "home_appliances";

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

type OnboardingForm = {
  legalType: LegalTypeValue;
  inn: string;
  representativeFullName: string;
  representativePhone: string;
  representativeEmail: string;
  authorityType: "director" | "owner" | "employee";
  authorityDocument: string;
  onlinePresenceUrls: string;
  businessDescription: string;
  categories: CategoryValue[];
  region: string;
  city: string;
  returnAddress: string;
  supportPhone: string;
  supportEmail: string;
  serviceHours: string;
  monthlyCapacity: string;
  productSourceType: string;
  supplierDocuments: string;
  warrantyDays: string;
  qualityCharterAccepted: boolean;
};

type FormErrors = Partial<Record<keyof OnboardingForm | "legalLookup" | "policy", string>>;

const STEP_TITLES = ["Бизнес", "Контакты", "Продажи", "Качество"];
const RETURN_DAYS = 14;
const PARTNERSHIP_DOCUMENTS_EMAIL = "partners@ecomm.ru";
const STEP_FIELDS: Array<Array<keyof OnboardingForm | "legalLookup" | "policy">> = [
  ["legalType", "inn", "legalLookup", "onlinePresenceUrls", "region", "city"],
  ["representativeFullName", "authorityType", "representativePhone", "representativeEmail", "authorityDocument"],
  ["businessDescription", "categories", "returnAddress", "supportPhone", "supportEmail", "serviceHours", "monthlyCapacity"],
  ["productSourceType", "supplierDocuments", "warrantyDays", "qualityCharterAccepted", "policy"],
];

function createEmptyForm(): OnboardingForm {
  return {
    legalType: "COMPANY",
    inn: "",
    representativeFullName: "",
    representativePhone: "",
    representativeEmail: "",
    authorityType: "director",
    authorityDocument: "",
    onlinePresenceUrls: "",
    businessDescription: "",
    categories: [],
    region: "",
    city: "",
    returnAddress: "",
    supportPhone: "",
    supportEmail: "",
    serviceHours: "Пн-Пт 10:00-19:00",
    monthlyCapacity: "20",
    productSourceType: "",
    supplierDocuments: "",
    warrantyDays: "90",
    qualityCharterAccepted: false,
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

function validateForm(
  form: OnboardingForm,
  policyAccepted: boolean,
  legalLookup: LegalLookupResult | null,
): FormErrors {
  const errors: FormErrors = {};
  const onlineUrls = splitList(form.onlinePresenceUrls);
  const monthlyCapacity = Number(form.monthlyCapacity);
  const warrantyDays = Number(form.warrantyDays);

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
  if (form.region.trim().length < 2) errors.region = "Укажите регион.";
  if (form.city.trim().length < 2) errors.city = "Укажите город.";

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
    errors.businessDescription = "Опишите партнера чуть подробнее: минимум 20 символов.";
  }
  if (form.categories.length === 0) errors.categories = "Выберите электронику и/или бытовую технику.";
  if (form.returnAddress.trim().length < 10) errors.returnAddress = "Укажите понятный адрес для возвратов.";
  if (!isValidRuPhone(form.supportPhone)) {
    errors.supportPhone = "Укажите телефон в формате +7 (999) 123-45-67.";
  }
  if (!isValidEmail(form.supportEmail)) errors.supportEmail = "Укажите корректный email поддержки.";
  if (form.serviceHours.trim().length < 3) errors.serviceHours = "Укажите часы поддержки.";
  if (!Number.isFinite(monthlyCapacity) || monthlyCapacity < 1) {
    errors.monthlyCapacity = "Укажите количество заказов в месяц числом больше 0.";
  }

  if (form.productSourceType.trim().length < 10) errors.productSourceType = "Опишите, откуда товар.";
  if (form.supplierDocuments.trim().length < 5) errors.supplierDocuments = "Перечислите документы на товар.";
  if (!Number.isFinite(warrantyDays) || warrantyDays < 90) errors.warrantyDays = "Гарантия должна быть минимум 90 дней.";
  if (!form.qualityCharterAccepted) errors.qualityCharterAccepted = "Примите quality charter.";
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
  const [legalLookup, setLegalLookup] = useState<LegalLookupResult | null>(null);
  const [legalLookupLoading, setLegalLookupLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formAlert, setFormAlert] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PartnershipPolicy>({
    id: "",
    title: "правила партнерства и безопасной сделки",
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

  const policyTitle = useMemo(
    () => (policy.version ? `${policy.title} (v${policy.version})` : policy.title),
    [policy.title, policy.version],
  );

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

  const toggleCategory = (category: CategoryValue) => {
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

  const copyDocumentsEmail = async () => {
    try {
      await navigator.clipboard.writeText(PARTNERSHIP_DOCUMENTS_EMAIL);
      notifySuccess("Email для документов скопирован.");
    } catch {
      notifyInfo(`Email для документов: ${PARTNERSHIP_DOCUMENTS_EMAIL}`);
    }
  };

  const buildPayload = () => {
    const onlinePresenceUrls = splitList(formData.onlinePresenceUrls);
    const primaryOnlineUrl = onlinePresenceUrls[0] ?? "";
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
      businessEmail: formData.representativeEmail,
      domainOwnershipMethod: "manual_review",
      publicProfileUrls: onlinePresenceUrls,
      businessRole: formData.businessDescription,
      categories: formData.categories,
      fulfillmentModel: "platform_pvz",
      country: "Россия",
      region: formData.region,
      city: formData.city,
      warehouseAddress: formData.returnAddress,
      serviceCenterAddress: formData.returnAddress,
      deliveryCoverageRegions: ["Россия"],
      pickupAvailable: false,
      returnAddress: formData.returnAddress,
      supportPhone: formData.supportPhone,
      supportEmail: formData.supportEmail,
      serviceHours: formData.serviceHours,
      monthlyCapacity: Number(formData.monthlyCapacity),
      productSourceType: formData.productSourceType,
      supplierDocuments: formData.supplierDocuments,
      diagnosticProcess: "Проверяется по внутреннему регламенту продавца перед публикацией.",
      gradingStandard: "Используется шкала площадки: new_open_box, refurbished_a, refurbished_b, refurbished_c.",
      warrantyDays: Number(formData.warrantyDays),
      returnDays: RETURN_DAYS,
      serialCheckPolicy: "Продавец обязуется не публиковать заблокированные, краденые или неподтвержденные устройства.",
      qualityCharterAccepted: formData.qualityCharterAccepted,
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
            Минимум ручной бюрократии: ИНН, представитель, онлайн-след бизнеса и правила качества.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="content-page rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-10">
          <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
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
              <HelpNote>
                Продавец вводит ИНН. ОГРН/ОГРНИП, КПП, юридическое название, адрес и статус регистрации должны подтягиваться системой из реестра при реальной интеграции с ФНС/DaData.
              </HelpNote>
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
                    <option value="BRAND">Бренд / официальный реселлер</option>
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
              <div>
                <input value={formData.region} onChange={(event) => updateField("region", event.target.value)} placeholder="Регион работы, например Москва" className={fieldClass("region")} />
                <FieldError message={errors.region} />
              </div>
              <div>
                <input value={formData.city} onChange={(event) => updateField("city", event.target.value)} placeholder="Город, например Москва" className={fieldClass("city")} />
                <FieldError message={errors.city} />
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
                placeholder="Кратко опишите, чем занимается партнер. Например: восстанавливаем смартфоны и ноутбуки, продаем уцененную бытовую технику после диагностики."
                className={fieldClass("businessDescription")}
              />
              <FieldError message={errors.businessDescription} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className={`flex items-center gap-2 rounded-lg border bg-white p-3 text-sm ${errors.categories ? "border-red-300" : "border-gray-200"}`}>
                  <input type="checkbox" checked={formData.categories.includes("electronics")} onChange={() => toggleCategory("electronics")} />
                  Электроника
                </label>
                <label className={`flex items-center gap-2 rounded-lg border bg-white p-3 text-sm ${errors.categories ? "border-red-300" : "border-gray-200"}`}>
                  <input type="checkbox" checked={formData.categories.includes("home_appliances")} onChange={() => toggleCategory("home_appliances")} />
                  Бытовая техника
                </label>
              </div>
              <FieldError message={errors.categories} />
              <HelpNote>
                Доставка в MVP считается политикой площадки: продавец подтверждает готовность отправлять заказы через подключенный ПВЗ-сценарий по России. Самовывоз и карта ПВЗ лучше включать позже, когда будет реальная интеграция с платным API доставки.
              </HelpNote>
              <div>
                <input value={formData.returnAddress} onChange={(event) => updateField("returnAddress", event.target.value)} placeholder="Адрес для возвратов" className={fieldClass("returnAddress")} />
                <FieldError message={errors.returnAddress} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                    placeholder="support@company.ru"
                    className={fieldClass("supportEmail")}
                  />
                  <FieldError message={errors.supportEmail} />
                </div>
                <div>
                  <input value={formData.serviceHours} onChange={(event) => updateField("serviceHours", event.target.value)} placeholder="Часы поддержки" className={fieldClass("serviceHours")} />
                  <FieldError message={errors.serviceHours} />
                </div>
              </div>
              <div>
                <input value={formData.monthlyCapacity} onChange={(event) => updateField("monthlyCapacity", onlyDigits(event.target.value))} inputMode="numeric" placeholder="Сколько заказов можете обработать в месяц" className={fieldClass("monthlyCapacity")} />
                <FieldError message={errors.monthlyCapacity} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <textarea
                value={formData.productSourceType}
                onChange={(event) => updateField("productSourceType", event.target.value)}
                rows={3}
                placeholder="Откуда товар: например, возвраты из сервиса, выкуп у компаний, уценка от поставщика, собственный ремонт"
                className={fieldClass("productSourceType")}
              />
              <FieldError message={errors.productSourceType} />
              <HelpNote>
                Укажите, какие документы подтверждают происхождение товара: УПД, договор поставки, накладные, акты выкупа, инвойсы или гарантийные письма поставщика. Сами документы нужно отправить с email представителя, указанного в заявке, чтобы мы могли связать письмо с этим бизнесом.
              </HelpNote>
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-gray-900">Почта для документов</div>
                  <a href={`mailto:${PARTNERSHIP_DOCUMENTS_EMAIL}`} className="text-blue-700 underline">
                    {PARTNERSHIP_DOCUMENTS_EMAIL}
                  </a>
                </div>
                <button type="button" onClick={copyDocumentsEmail} className="btn-secondary px-4 py-2 text-sm">
                  Скопировать email
                </button>
              </div>
              <div>
                <textarea value={formData.supplierDocuments} onChange={(event) => updateField("supplierDocuments", event.target.value)} rows={3} placeholder="Какие документы есть у вас. Например: УПД, договор поставки, накладные или акты выкупа" className={fieldClass("supplierDocuments")} />
                <FieldError message={errors.supplierDocuments} />
              </div>
              <div>
                <input value={formData.warrantyDays} onChange={(event) => updateField("warrantyDays", onlyDigits(event.target.value))} inputMode="numeric" placeholder="Гарантия в днях, минимум 90" className={fieldClass("warrantyDays")} />
                <FieldError message={errors.warrantyDays} />
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                Возврат для покупателей фиксированный: {RETURN_DAYS} дней. Продавец не выбирает этот срок отдельно.
              </div>
              <label className={`flex items-start gap-2 rounded-xl border bg-white p-3 text-sm text-gray-700 ${errors.qualityCharterAccepted ? "border-red-300" : "border-gray-200"}`}>
                <input type="checkbox" checked={formData.qualityCharterAccepted} onChange={(event) => updateField("qualityCharterAccepted", event.target.checked)} className="mt-0.5" />
                <span>Принимаю quality charter: техника должна быть рабочей, товары “на запчасти” запрещены, дефекты должны быть явно описаны, гарантия минимум 90 дней.</span>
              </label>
              <FieldError message={errors.qualityCharterAccepted} />
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
