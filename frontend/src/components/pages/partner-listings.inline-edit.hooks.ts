import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { updatePartnerListing } from "./partner-listings.api";
import { analyzeListingImagesForModeration } from "./partner-listing-image-moderation";
import { MAX_IMAGES } from "./partner-listings.constants";
import {
  buildPartnerListingSavePayload,
  snapshotListingFormForSave,
  validateInlineListingDetails,
} from "./partner-listings.submit";
import type { CatalogCategoryDto, FormState, Listing } from "./partner-listings.types";
import {
  fileToDataUrl,
  getCharacteristicFields,
  getMinImagesForType,
  validateImageDuplicates,
} from "./partner-listings.utils";

export function usePartnerListingInlineEditFlow({
  catalogCategories,
  addressBook,
  setListings,
  loadListings,
  showNotice,
}: {
  catalogCategories: CatalogCategoryDto[];
  addressBook: string[];
  setListings: Dispatch<SetStateAction<Listing[]>>;
  loadListings: () => Promise<void>;
  showNotice: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<FormState | null>(null);
  const [inlineIssue, setInlineIssue] = useState<string | null>(null);
  const [isInlineSaving, setIsInlineSaving] = useState(false);

  const reportInlineIssue = useCallback(
    (message: string) => {
      setInlineIssue(message);
      showNotice(message, "error");
    },
    [showNotice],
  );

  const resetInlineEdit = useCallback(() => {
    setInlineEditingId(null);
    setInlineForm(null);
    setInlineIssue(null);
  }, []);

  const inlineAddressSuggestions = useMemo(() => {
    if (!inlineForm) return [];
    const query = inlineForm.meetingAddress.trim().toLocaleLowerCase("ru-RU");
    if (!query) return addressBook.slice(0, 8);
    return addressBook
      .filter((address) => address.toLocaleLowerCase("ru-RU").includes(query))
      .slice(0, 8);
  }, [addressBook, inlineForm]);

  const onInlineFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!inlineForm || !files.length) return;

      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          reportInlineIssue(`Файл ${file.name} не является изображением`);
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          reportInlineIssue(`Файл ${file.name} больше 3 МБ`);
          return;
        }
      }

      const encoded = await Promise.all(files.map((file) => fileToDataUrl(file)));
      const images = [...inlineForm.images, ...encoded].slice(0, MAX_IMAGES);
      const imageError = await validateImageDuplicates(images);
      if (imageError) {
        reportInlineIssue(imageError);
        return;
      }

      setInlineIssue(null);
      setInlineForm((prev) => (prev ? { ...prev, images } : prev));
    },
    [inlineForm, reportInlineIssue],
  );

  const removeInlineImage = useCallback(
    (index: number) => {
      if (!inlineForm) return;
      const minImages = getMinImagesForType(inlineForm.type);
      if (inlineForm.images.length <= minImages) {
        reportInlineIssue(`Нужно оставить минимум ${minImages} фото`);
        return;
      }
      setInlineForm((prev) => {
        if (!prev) return prev;
        const images = prev.images.filter((_, imageIndex) => imageIndex !== index);
        return { ...prev, images };
      });
    },
    [inlineForm, reportInlineIssue],
  );

  const saveInlineEdit = useCallback(
    async (listing: Listing) => {
      if (!inlineForm) return;

      const inlineSelectedCategory =
        catalogCategories.find(
          (category) => category.name === inlineForm.categoryRoot,
        ) ?? null;
      const inlineSelectedSubcategory =
        inlineSelectedCategory?.subcategories.find(
          (subcategory) => subcategory.name === inlineForm.subcategory,
        ) ?? null;
      const inlineCharacteristicFields = getCharacteristicFields(
        inlineForm.type,
        inlineForm.subcategory,
        inlineSelectedSubcategory,
        inlineForm.catalogItem,
      );
      const snapshotInlineForm = snapshotListingFormForSave(
        inlineForm,
        inlineCharacteristicFields,
      );

      const inlineValidationError = await validateInlineListingDetails({
        form: snapshotInlineForm,
        fields: inlineCharacteristicFields,
      });
      if (inlineValidationError) {
        reportInlineIssue(inlineValidationError);
        return;
      }

      const imageModerationSignals = await analyzeListingImagesForModeration(
        snapshotInlineForm.images,
      );
      const payload = buildPartnerListingSavePayload({
        form: snapshotInlineForm,
        fields: inlineCharacteristicFields,
        imageModerationSignals,
        includeDefects: true,
        includeMultipleStock: false,
      });

      const optimisticCity = listing.city ?? null;
      setListings((prev) =>
        prev.map((item) =>
          item.id === listing.id
            ? {
                ...item,
                title: payload.title,
                price: payload.price,
                condition: payload.condition,
                description: payload.description,
                category: payload.category,
                city: optimisticCity,
                image: payload.images[0] ?? item.image,
                images: payload.images,
                status: "moderation",
              }
            : item,
        ),
      );

      setIsInlineSaving(true);
      setInlineIssue(null);
      resetInlineEdit();
      try {
        await updatePartnerListing(listing.id, payload);
        await loadListings();
        showNotice("Изменения сохранены", "success");
      } catch (error) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Не удалось сохранить изменения",
          "error",
        );
        await loadListings();
      } finally {
        setIsInlineSaving(false);
      }
    },
    [
      catalogCategories,
      inlineForm,
      loadListings,
      reportInlineIssue,
      resetInlineEdit,
      setListings,
      showNotice,
    ],
  );

  return {
    inlineEditingId,
    inlineForm,
    inlineIssue,
    inlineAddressSuggestions,
    isInlineSaving,
    setInlineForm,
    resetInlineEdit,
    onInlineFilesSelected,
    removeInlineImage,
    saveInlineEdit,
  };
}
