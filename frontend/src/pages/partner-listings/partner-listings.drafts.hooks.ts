import { useCallback, useEffect, useState } from "react";
import {
  createListingDraft,
  fetchCreateSuggestions,
  fetchListingDrafts,
  updateListingDraft,
} from "./partner-listings.api";
import type {
  CreateSuggestionMatch,
  CreationScreen,
  FormState,
  ListingDraftDto,
  ListingType,
} from "./partner-listings.types";

export function useListingDrafts({
  listingTypeFilter,
  isCreateOpen,
  isEditingListing,
  creationScreen,
  form,
}: {
  listingTypeFilter: ListingType;
  isCreateOpen: boolean;
  isEditingListing: boolean;
  creationScreen: CreationScreen;
  form: FormState;
}) {
  const [listingDrafts, setListingDrafts] = useState<ListingDraftDto[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const loadDrafts = useCallback(async (type: ListingType) => {
    try {
      const data = await fetchListingDrafts(type);
      setListingDrafts(data);
    } catch {
      setListingDrafts([]);
    }
  }, []);

  useEffect(() => {
    void loadDrafts(listingTypeFilter);
  }, [listingTypeFilter, loadDrafts]);

  useEffect(() => {
    if (!isCreateOpen) return;
    if (isEditingListing) return;
    if (creationScreen !== "details") return;
    const hasMeaningfulDraft =
      form.title.trim() ||
      form.categoryRoot ||
      form.subcategory ||
      form.catalogItem ||
      form.description.trim() ||
      form.price.trim() ||
      form.images.length > 0;
    if (!hasMeaningfulDraft) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const payload = {
        type: form.type,
        title: form.title,
        currentScreen: creationScreen,
        payload: form,
      };
      try {
        if (activeDraftId) {
          await updateListingDraft(activeDraftId, payload);
        } else {
          const created = await createListingDraft(payload);
          if (!cancelled) setActiveDraftId(created.id);
        }
        if (!cancelled) await loadDrafts(form.type);
      } catch {
        // Draft autosave is helpful, but should not block listing creation.
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDraftId, creationScreen, form, isCreateOpen, isEditingListing, loadDrafts]);

  return {
    listingDrafts,
    activeDraftId,
    setActiveDraftId,
    loadDrafts,
  };
}

export function useCreateTitleSuggestions({
  isCreateOpen,
  creationScreen,
  titlePickedFromSuggestion,
  form,
}: {
  isCreateOpen: boolean;
  creationScreen: CreationScreen;
  titlePickedFromSuggestion: boolean;
  form: FormState;
}) {
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [createSuggestionMatches, setCreateSuggestionMatches] = useState<
    CreateSuggestionMatch[]
  >([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);

  useEffect(() => {
    if (
      !isCreateOpen ||
      creationScreen !== "titleSearch" ||
      titlePickedFromSuggestion
    ) {
      setTitleSuggestions([]);
      setCreateSuggestionMatches([]);
      return;
    }
    const query = form.title.trim();
    if (query.length < 2) {
      setTitleSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setIsSuggestionsLoading(true);
        const response = await fetchCreateSuggestions({
          query,
          type: form.type,
        });
        const normalizedQuery = query.toLocaleLowerCase("ru-RU");
        const rawTitleSuggestions = response.titleSuggestions ?? response.chips;
        const next = Array.from(
          new Set(rawTitleSuggestions.map((item) => item.trim()).filter(Boolean)),
        )
          .filter((item) => item.toLocaleLowerCase("ru-RU") !== normalizedQuery)
          .slice(0, 8);
        if (!cancelled) {
          setTitleSuggestions(next);
          setCreateSuggestionMatches(response.matches ?? []);
        }
      } catch {
        if (!cancelled) {
          setTitleSuggestions([]);
          setCreateSuggestionMatches([]);
        }
      } finally {
        if (!cancelled) setIsSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [creationScreen, form.title, form.type, isCreateOpen, titlePickedFromSuggestion]);

  return {
    titleSuggestions,
    setTitleSuggestions,
    createSuggestionMatches,
    setCreateSuggestionMatches,
    isSuggestionsLoading,
  };
}
