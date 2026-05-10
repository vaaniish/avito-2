import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { fetchCatalogCategories, fetchCatalogReference } from "./partner-listings.api";
import { CUSTOM_OPTION } from "./partner-listings.constants";
import type {
  CatalogCategoryDto,
  CatalogReferenceFieldDto,
  CharacteristicField,
  FormState,
  Listing,
  ListingType,
} from "./partner-listings.types";
import {
  catalogRequestDefaults,
  getAttributeValue,
  getCharacteristicFields,
  normalizeCharacteristics,
} from "./partner-listings.utils";

export function usePartnerListingCatalogFlow({
  isCreateOpen,
  listingTypeFilter,
  form,
  setForm,
}: {
  isCreateOpen: boolean;
  listingTypeFilter: ListingType;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
}) {
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategoryDto[]>([]);

  const resetCatalogSelection = useCallback((type: ListingType) => {
    setForm((prev) => ({
      ...prev,
      type,
      category: "",
      categoryRoot: "",
      customCategoryRoot: "",
      subcategory: "",
      customSubcategory: "",
      catalogItem: "",
      customCatalogItem: "",
      ...catalogRequestDefaults(),
      characteristics: {},
    }));
  }, [setForm]);

  const loadCategories = useCallback(
    async (type: ListingType) => {
      try {
        const nextCatalog = await fetchCatalogCategories(type);
        setCatalogCategories(nextCatalog);
        setForm((prev) => {
          if (prev.type !== type) return prev;
          if (!prev.categoryRoot) return prev;
          if (nextCatalog.some((category) => category.name === prev.categoryRoot)) {
            return prev;
          }
          return {
            ...prev,
            category: "",
            categoryRoot: "",
            customCategoryRoot: "",
            subcategory: "",
            customSubcategory: "",
            catalogItem: "",
            customCatalogItem: "",
            ...catalogRequestDefaults(),
            characteristics: {},
          };
        });
      } catch {
        setCatalogCategories([]);
        resetCatalogSelection(type);
      }
    },
    [resetCatalogSelection, setForm],
  );

  useEffect(() => {
    if (!isCreateOpen) return;
    void loadCategories(form.type);
  }, [form.type, isCreateOpen, loadCategories]);

  useEffect(() => {
    void loadCategories(listingTypeFilter);
  }, [listingTypeFilter, loadCategories]);

  const selectedCategory = useMemo(
    () =>
      catalogCategories.find((category) => category.name === form.categoryRoot) ??
      null,
    [catalogCategories, form.categoryRoot],
  );
  const selectedSubcategory = useMemo(
    () =>
      selectedCategory?.subcategories.find(
        (subcategory) => subcategory.name === form.subcategory,
      ) ?? null,
    [selectedCategory, form.subcategory],
  );
  const manualCategoryColumnCount = selectedSubcategory
    ? 3
    : selectedCategory
      ? 2
      : 1;
  const characteristicFields = useMemo(
    () =>
      getCharacteristicFields(
        form.type,
        form.subcategory,
        selectedSubcategory,
        form.catalogItem,
      ),
    [form.catalogItem, form.subcategory, form.type, selectedSubcategory],
  );

  return {
    catalogCategories,
    selectedCategory,
    selectedSubcategory,
    manualCategoryColumnCount,
    characteristicFields,
    loadCategories,
    resetCatalogSelection,
  };
}

export function useCatalogReferenceFields({
  isCreateOpen,
  form,
  editingListing,
  characteristicFields,
  setForm,
}: {
  isCreateOpen: boolean;
  form: FormState;
  editingListing: Listing | null;
  characteristicFields: CharacteristicField[];
  setForm: Dispatch<SetStateAction<FormState>>;
}) {
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [dnsFields, setDnsFields] = useState<CatalogReferenceFieldDto[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  const isCandidate =
    form.type === "products" &&
    Boolean(form.catalogItem) &&
    form.catalogItem !== CUSTOM_OPTION;
  const isCreation = isCandidate && isSupported;

  const fields = useMemo<CharacteristicField[]>(
    () => [
      {
        key: "brand",
        label: "Бренд",
        required: true,
        inputType: "text",
        orderIndex: 1,
      },
      {
        key: "model",
        label: "Модель",
        required: true,
        inputType: "text",
        orderIndex: 2,
      },
      ...dnsFields.map((field) => ({
        key: field.key,
        label: field.label,
        required: true,
        inputType: "select" as const,
        options: field.options,
        defaultValue: field.defaultValue,
        orderIndex: field.orderIndex,
        locked: field.locked,
        source: field.source,
      })),
    ],
    [dnsFields],
  );
  const effectiveFields = isCreation ? fields : characteristicFields;

  useEffect(() => {
    if (!isCreateOpen || !isCandidate) {
      setIsSupported(false);
      setBrands([]);
      setModels([]);
      setDnsFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchCatalogReference({ item: form.catalogItem });
        if (!cancelled) {
          const supported = Boolean(data.supported);
          setIsSupported(supported);
          setBrands(supported ? (data.brands ?? []) : []);
          if (!supported) {
            setModels([]);
            setDnsFields([]);
          }
        }
      } catch {
        if (!cancelled) {
          setIsSupported(false);
          setBrands([]);
          setModels([]);
          setDnsFields([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.catalogItem, isCreateOpen, isCandidate]);

  useEffect(() => {
    if (!isCreateOpen || !isCreation) return;
    const brand = form.characteristics.brand?.trim() ?? "";
    if (!brand) {
      setModels([]);
      setDnsFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchCatalogReference({
          item: form.catalogItem,
          brand,
        });
        if (!cancelled) setModels(data.models ?? []);
      } catch {
        if (!cancelled) setModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.catalogItem, form.characteristics.brand, isCreateOpen, isCreation]);

  useEffect(() => {
    if (!isCreateOpen || !isCreation) return;
    const brand = form.characteristics.brand?.trim() ?? "";
    const model = form.characteristics.model?.trim() ?? "";
    if (!brand || !model) {
      setDnsFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchCatalogReference({
          item: form.catalogItem,
          brand,
          model,
        });
        if (!cancelled) {
          const nextFields = (data.fields ?? []).filter(
            (field) => !/^Характеристика\s+\d+$/iu.test(field.label),
          );
          setDnsFields(nextFields);
          const defaults = Object.fromEntries(
            nextFields
              .filter((field) => field.defaultValue)
              .map((field) => [field.key, field.defaultValue as string]),
          );
          const existingReferenceValues = editingListing
            ? Object.fromEntries(
                nextFields
                  .map((field) => [
                    field.key,
                    getAttributeValue(editingListing.attributes, [
                      field.label,
                      field.key,
                    ]),
                  ])
                  .filter((entry): entry is [string, string] => Boolean(entry[1])),
              )
            : {};
          const allowedKeys = new Set([
            "brand",
            "model",
            ...nextFields.map((field) => field.key),
          ]);
          setForm((prev) => ({
            ...prev,
            characteristics: {
              ...Object.fromEntries(
                Object.entries(prev.characteristics).filter(([key]) =>
                  allowedKeys.has(key),
                ),
              ),
              ...defaults,
              ...existingReferenceValues,
            },
          }));
        }
      } catch {
        if (!cancelled) setDnsFields([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    editingListing,
    form.catalogItem,
    form.characteristics.brand,
    form.characteristics.model,
    isCreateOpen,
    isCreation,
    setForm,
  ]);

  return {
    brands,
    models,
    fields,
    effectiveFields,
    isCreation,
  };
}
