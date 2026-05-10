import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { createPartnerListing, updatePartnerListing } from "./partner-listings.api";
import { analyzeListingImagesForModeration } from "./partner-listing-image-moderation";
import {
  buildPartnerListingSavePayload,
  snapshotListingFormForSave,
  validateCreateListingDetails,
} from "./partner-listings.submit";
import type { CharacteristicField, FormState, Listing, ListingType } from "./partner-listings.types";

export function usePartnerListingSaveFlow({
  form,
  fields,
  isCatalogReferenceCreation,
  catalogReferenceBrands,
  catalogReferenceModels,
  editingListing,
  listingTypeFilter,
  activeDraftId,
  setListingTypeFilter,
  setListings,
  loadListings,
  loadDrafts,
  closeCreateFlow,
  clearFormIssue,
  reportFormIssue,
  showNotice,
}: {
  form: FormState;
  fields: CharacteristicField[];
  isCatalogReferenceCreation: boolean;
  catalogReferenceBrands: string[];
  catalogReferenceModels: string[];
  editingListing: Listing | null;
  listingTypeFilter: ListingType;
  activeDraftId: string | null;
  setListingTypeFilter: Dispatch<SetStateAction<ListingType>>;
  setListings: Dispatch<SetStateAction<Listing[]>>;
  loadListings: () => Promise<void>;
  loadDrafts: (type: ListingType) => Promise<void>;
  closeCreateFlow: () => void;
  clearFormIssue: () => void;
  reportFormIssue: (message: string) => void;
  showNotice: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [isCreateSaving, setIsCreateSaving] = useState(false);

  const saveListing = useCallback(async () => {
    if (isCreateSaving) return;

    const validationError = await validateCreateListingDetails({
      form,
      fields,
      isCatalogReferenceCreation,
      catalogReferenceBrands,
      catalogReferenceModels,
    });
    if (validationError) {
      reportFormIssue(validationError);
      return;
    }

    clearFormIssue();
    const snapshotForm = snapshotListingFormForSave(form, fields);
    const imageModerationSignals = await analyzeListingImagesForModeration(
      snapshotForm.images,
    );
    const payload = buildPartnerListingSavePayload({
      form: snapshotForm,
      fields,
      imageModerationSignals,
      includeDefects: !isCatalogReferenceCreation,
      includeMultipleStock: true,
    });

    setIsCreateSaving(true);
    try {
      if (editingListing) {
        const updated = await updatePartnerListing(editingListing.id, payload);
        showNotice("Изменения сохранены", "success");
        if (listingTypeFilter !== snapshotForm.type) {
          setListingTypeFilter(snapshotForm.type);
        } else {
          setListings((prev) =>
            prev.map((listing) =>
              listing.id === updated.id ? updated : listing,
            ),
          );
          await loadListings();
        }
        closeCreateFlow();
        return;
      }

      const created = await createPartnerListing({
        ...payload,
        type: snapshotForm.type,
        draftId: activeDraftId,
      });

      showNotice("Объявление отправлено на модерацию", "success");

      if (listingTypeFilter !== snapshotForm.type) {
        setListingTypeFilter(snapshotForm.type);
      } else {
        setListings((prev) => [
          created,
          ...prev.filter((listing) => listing.id !== created.id),
        ]);
        await loadListings();
      }

      await loadDrafts(snapshotForm.type);
      closeCreateFlow();
    } catch (error) {
      reportFormIssue(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить объявление",
      );
    } finally {
      setIsCreateSaving(false);
    }
  }, [
    activeDraftId,
    catalogReferenceBrands,
    catalogReferenceModels,
    clearFormIssue,
    closeCreateFlow,
    editingListing,
    fields,
    form,
    isCatalogReferenceCreation,
    isCreateSaving,
    listingTypeFilter,
    loadDrafts,
    loadListings,
    reportFormIssue,
    setListingTypeFilter,
    setListings,
    showNotice,
  ]);

  return {
    isCreateSaving,
    saveListing,
  };
}
