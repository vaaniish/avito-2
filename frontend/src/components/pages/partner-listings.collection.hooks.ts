import { useCallback, useEffect, useState, type SetStateAction, type Dispatch } from "react";
import {
  deletePartnerListing,
  fetchPartnerListings,
  togglePartnerListingStatus,
} from "./partner-listings.api";
import type { Listing, ListingType } from "./partner-listings.types";

export function usePartnerListingsCollection({
  listingTypeFilter,
  showNotice,
}: {
  listingTypeFilter: ListingType;
  showNotice: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [isDeleteBusy, setIsDeleteBusy] = useState(false);

  const loadListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchPartnerListings(listingTypeFilter);
      setListings(data);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить объявления",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [listingTypeFilter, showNotice]);

  const requestRemoveListing = useCallback((listingId: string) => {
    setDeleteCandidateId(listingId);
  }, []);

  const cancelRemoveListing = useCallback(() => {
    setDeleteCandidateId(null);
  }, []);

  const confirmRemoveListing = useCallback(async () => {
    if (!deleteCandidateId) return;
    setIsDeleteBusy(true);
    try {
      await deletePartnerListing(deleteCandidateId);
      await loadListings();
      showNotice("Объявление удалено", "success");
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Не удалось удалить объявление",
        "error",
      );
    } finally {
      setIsDeleteBusy(false);
      setDeleteCandidateId(null);
    }
  }, [deleteCandidateId, loadListings, showNotice]);

  const toggleListingStatus = useCallback(
    async (listing: Listing) => {
      try {
        await togglePartnerListingStatus(listing.id);
        await loadListings();
      } catch (error) {
        showNotice(
          error instanceof Error ? error.message : "Не удалось сменить статус",
          "error",
        );
      }
    },
    [loadListings, showNotice],
  );

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const detail = (
        event as CustomEvent<{ url?: string; message?: string }>
      ).detail;
      const text =
        `${detail?.url ?? ""} ${detail?.message ?? ""}`.toLocaleLowerCase(
          "ru-RU",
        );
      if (
        text.includes("объявлен") ||
        text.includes("listing") ||
        text.includes("partner")
      ) {
        void loadListings();
      }
    };
    window.addEventListener("app-notification-received", handleNotification);
    return () =>
      window.removeEventListener(
        "app-notification-received",
        handleNotification,
      );
  }, [loadListings]);

  return {
    listings,
    setListings: setListings as Dispatch<SetStateAction<Listing[]>>,
    isLoading,
    deleteCandidateId,
    isDeleteBusy,
    loadListings,
    requestRemoveListing,
    cancelRemoveListing,
    confirmRemoveListing,
    toggleListingStatus,
  };
}
