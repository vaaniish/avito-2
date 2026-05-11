import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../shared/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../shared/ui/notifications";
import type { PartnershipForm, ProfileUser } from "./profile.models";

type PartnershipPolicy = {
  id: string;
  title: string;
  version: string;
  contentUrl: string;
};

const PARTNERSHIP_INN_REGEX = /^\d{10}(\d{2})?$/;

function isValidPartnershipEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPartnershipUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function useProfilePartnership(params: {
  profile: ProfileUser | null;
}) {
  const [partnershipForm, setPartnershipForm] = useState<PartnershipForm>({
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
  const [partnershipPolicy, setPartnershipPolicy] = useState<PartnershipPolicy>({
    id: "",
    title: "правила партнерства и безопасной сделки",
    version: "",
    contentUrl: "/terms",
  });
  const [partnershipPolicyAccepted, setPartnershipPolicyAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadPartnershipPolicy = async () => {
      try {
        const policy = await apiGet<{
          id: string;
          title: string;
          version: string;
          contentUrl: string;
        }>("/public/policy/current?scope=partnership");
        if (cancelled) return;
        if (
          typeof policy.id === "string" &&
          typeof policy.title === "string" &&
          typeof policy.contentUrl === "string"
        ) {
          setPartnershipPolicy({
            id: policy.id,
            title: policy.title,
            version: typeof policy.version === "string" ? policy.version : "",
            contentUrl: policy.contentUrl,
          });
        }
      } catch {
        // keep fallback
      }
    };
    void loadPartnershipPolicy();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!params.profile) return;
    setPartnershipForm((prev) => ({
      ...prev,
      name: params.profile?.displayName || params.profile?.name || "",
      email: params.profile?.email || "",
    }));
  }, [params.profile]);

  const submitPartnershipRequest = useCallback(async () => {
    const normalizedForm: PartnershipForm = {
      sellerType: partnershipForm.sellerType,
      name: partnershipForm.name.trim(),
      email: partnershipForm.email.trim(),
      contact: partnershipForm.contact.trim(),
      link: partnershipForm.link.trim(),
      category: partnershipForm.category.trim(),
      inn: partnershipForm.inn.trim(),
      geography: partnershipForm.geography.trim(),
      socialProfile: partnershipForm.socialProfile.trim(),
      credibility: partnershipForm.credibility.trim(),
      whyUs: partnershipForm.whyUs.trim(),
    };

    if (
      !normalizedForm.name ||
      !normalizedForm.email ||
      !normalizedForm.contact ||
      !normalizedForm.link ||
      !normalizedForm.category ||
      !normalizedForm.inn ||
      !normalizedForm.geography ||
      !normalizedForm.socialProfile ||
      !normalizedForm.credibility ||
      !normalizedForm.whyUs
    ) {
      notifyInfo("Заполните обязательные поля заявки");
      return;
    }

    if (!isValidPartnershipEmail(normalizedForm.email)) {
      notifyInfo("Укажите корректный email компании");
      return;
    }

    if (!isValidPartnershipUrl(normalizedForm.link)) {
      notifyInfo("Укажите корректную ссылку на сайт или витрину (http/https)");
      return;
    }

    if (!isValidPartnershipUrl(normalizedForm.socialProfile)) {
      notifyInfo("Укажите корректную ссылку на публичный профиль компании (http/https)");
      return;
    }

    if (!PARTNERSHIP_INN_REGEX.test(normalizedForm.inn)) {
      notifyInfo("ИНН должен содержать 10 или 12 цифр");
      return;
    }

    if (normalizedForm.credibility.length < 20) {
      notifyInfo("Опишите надежность бизнеса подробнее (минимум 20 символов)");
      return;
    }

    if (normalizedForm.whyUs.length < 30) {
      notifyInfo("Расскажите подробнее, как вы будете работать на платформе (минимум 30 символов)");
      return;
    }

    if (!partnershipPolicyAccepted) {
      notifyInfo("Перед отправкой заявки нужно принять правила партнерства.");
      return;
    }

    try {
      await apiPost<{ success: boolean }>("/profile/policy-acceptance", {
        scope: "partnership",
        policyId: partnershipPolicy.id || undefined,
      });
      const response = await apiPost<{ success: boolean; request_id: string }>(
        "/profile/partnership-requests",
        normalizedForm,
      );
      notifySuccess(`Заявка отправлена: ${response.request_id}`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить заявку");
    }
  }, [partnershipForm, partnershipPolicy.id, partnershipPolicyAccepted]);

  return {
    partnershipForm,
    partnershipPolicy,
    partnershipPolicyAccepted,
    setPartnershipForm,
    setPartnershipPolicyAccepted,
    submitPartnershipRequest,
  };
}
