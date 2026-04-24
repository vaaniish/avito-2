import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { apiPost, apiGet } from "../../lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../ui/notifications";

type PartnershipPageProps = {
  onBack: () => void;
};

type SellerTypeValue = "company" | "ip" | "brand" | "admin_approved";

type PartnershipPolicy = {
  id: string;
  title: string;
  version: string;
  contentUrl: string;
};

type CategoryOption = {
  key: string;
  label: string;
};

const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: "smartphones", label: "Смартфоны" },
  { key: "laptops", label: "Ноутбуки" },
  { key: "tablets", label: "Планшеты" },
  { key: "audio", label: "Аудио" },
  { key: "wearables", label: "Носимая электроника" },
  { key: "gaming", label: "Игровая электроника" },
  { key: "components", label: "Комплектующие" },
  { key: "accessories", label: "Аксессуары" },
  { key: "home_appliances", label: "Бытовая техника" },
  { key: "kitchen_appliances", label: "Кухонная техника" },
  { key: "electronics_repair", label: "Ремонт электроники" },
  { key: "home_appliance_repair", label: "Ремонт бытовой техники" },
];

const SELLER_TYPE_OPTIONS: Array<{ value: SellerTypeValue; label: string }> = [
  { value: "company", label: "Юрлицо" },
  { value: "ip", label: "ИП" },
  { value: "brand", label: "Бренд" },
  { value: "admin_approved", label: "Индивидуальное одобрение" },
];

export function PartnershipPage({ onBack }: PartnershipPageProps) {
  const [formData, setFormData] = useState({
    sellerType: "company" as SellerTypeValue,
    name: "",
    email: "",
    contact: "",
    link: "",
    category: "",
    inn: "",
    geography: "",
    socialProfile: "",
    credibility: "",
    whyUs: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
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
        const response = await apiGet<{
          id: string;
          title: string;
          version: string;
          contentUrl: string;
        }>("/public/policy/current?scope=partnership");
        if (cancelled) return;
        if (
          typeof response.id === "string" &&
          typeof response.title === "string" &&
          typeof response.contentUrl === "string"
        ) {
          setPolicy({
            id: response.id,
            title: response.title,
            version: typeof response.version === "string" ? response.version : "",
            contentUrl: response.contentUrl,
          });
        }
      } catch {
        // fallback to local terms page
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (
      !formData.name ||
      !formData.email ||
      !formData.contact ||
      !formData.link ||
      !formData.category ||
      !formData.whyUs
    ) {
      notifyInfo("Заполните обязательные поля заявки");
      return;
    }

    if (!policyAccepted) {
      notifyInfo("Перед отправкой заявки нужно принять правила партнерства.");
      return;
    }

    setSubmitting(true);
    try {
      await apiPost<{ success: boolean }>("/profile/policy-acceptance", {
        scope: "partnership",
        policyId: policy.id || undefined,
      });

      const response = await apiPost<{ success: boolean; request_id: string }>(
        "/profile/partnership-requests",
        formData,
      );

      notifySuccess(`Заявка отправлена: ${response.request_id}`);
      setFormData({
        sellerType: "company",
        name: "",
        email: "",
        contact: "",
        link: "",
        category: "",
        inn: "",
        geography: "",
        socialProfile: "",
        credibility: "",
        whyUs: "",
      });
      setPolicyAccepted(false);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить заявку");
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
          <h1 className="mb-4 text-3xl text-gray-900 sm:text-5xl">Партнерство</h1>
          <p className="text-base text-gray-600 sm:text-xl">
            Подключаем только партнеров из электроники и бытовой техники после модерации.
          </p>
        </div>

        <div className="content-page rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-10">
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-gray-900">Кто может стать партнером</div>
              <div className="text-sm text-gray-600">ИП, юрлица, бренды или заявки с индивидуальным одобрением админа.</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-gray-900">Категории</div>
              <div className="text-sm text-gray-600">Только электроника, бытовая техника и профильный ремонт.</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-gray-900">Как проходит</div>
              <div className="text-sm text-gray-600">Заявка → модерация → решение админа → доступ к партнерскому кабинету.</div>
            </div>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={formData.sellerType}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    sellerType: event.target.value as SellerTypeValue,
                  }))
                }
                className="field-control"
              >
                {SELLER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={formData.name}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Название компании / ФИО"
                className="field-control"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={formData.email}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="Email"
                className="field-control"
              />
              <input
                value={formData.contact}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, contact: event.target.value }))
                }
                placeholder="Телефон / Telegram"
                className="field-control"
              />
            </div>

            <input
              value={formData.link}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, link: event.target.value }))
              }
              placeholder="Сайт / профиль / каталог"
              className="field-control"
            />

            <select
              value={formData.category}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, category: event.target.value }))
              }
              className="field-control"
            >
              <option value="">Выберите категорию</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={formData.inn}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, inn: event.target.value }))
                }
                placeholder="ИНН (опционально)"
                className="field-control"
              />
              <input
                value={formData.geography}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, geography: event.target.value }))
                }
                placeholder="География работы"
                className="field-control"
              />
            </div>

            <textarea
              value={formData.credibility}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, credibility: event.target.value }))
              }
              rows={3}
              placeholder="Почему вам можно доверять (опционально)"
              className="field-control"
            />

            <textarea
              value={formData.whyUs}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, whyUs: event.target.value }))
              }
              rows={4}
              placeholder="Почему хотите продавать у нас"
              className="field-control"
            />

            <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(event) => setPolicyAccepted(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Я принимаю{" "}
                <a href={policy.contentUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                  {policyTitle}
                </a>
              </span>
            </label>

            <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base disabled:bg-gray-400">
              {submitting ? "Отправляем..." : "Отправить заявку"}
            </button>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle className="h-4 w-4" />
              После отправки заявки статус проверки можно посмотреть в профиле.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
