import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchesSearch } from "../../shared/lib/search";
import { ConfirmDialog, ToastViewport, type AppNotice } from "../../shared/ui/feedback";
import { ProfileAddressCreateModal } from "../profile/profile.address-create-modal";
import {
  createCatalogRequest,
} from "./partner-listings.api";
import {
  CUSTOM_OPTION,
  MAX_IMAGES,
} from "./partner-listings.constants";
import type {
  CatalogRequestModalPayload,
  CatalogRequestMode,
  CreationScreen,
  CreateSuggestionMatch,
  FormState,
  Listing,
  ListingDraftDto,
  ListingType,
  PartnerListingsPageProps,
} from "./partner-listings.types";
import {
  CatalogRequestModal,
  PartnerListingsHeader,
  PartnerListingsStats,
  PartnerListingsToolbar,
} from "./partner-listings.components";
import {
  buildInitialForm,
  catalogRequestDefaults,
  fileToDataUrl,
  getCharacteristicFields,
  getMinImagesForType,
  normalizeCharacteristics,
  validateImageDuplicates,
} from "./partner-listings.utils";
import { PartnerListingCreateFlow } from "./partner-listings.create-flow";
import { PartnerListingsList } from "./partner-listings.list";
import { listingToEditForm } from "./partner-listings.mappers";
import {
  useCatalogReferenceFields,
  useCreateTitleSuggestions,
  useListingDrafts,
  usePartnerListingCatalogFlow,
  usePartnerListingInlineEditFlow,
  usePartnerListingSaveFlow,
  usePartnerListingsCollection,
  usePartnerListingAddressFlow,
} from "./partner-listings.hooks";
export function PartnerListingsPage({
  onOpenListing,
  onOpenCreateListing,
  onExitCreate,
  createMode = false,
}: PartnerListingsPageProps) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive" | "moderation"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [listingTypeFilter, setListingTypeFilter] =
    useState<ListingType>("products");
  const [showModal, setShowModal] = useState(false);
  const [creationScreen, setCreationScreen] =
    useState<CreationScreen>("start");

  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [titlePickedFromSuggestion, setTitlePickedFromSuggestion] =
    useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [formIssue, setFormIssue] = useState<string | null>(null);
  const [isCharacteristicRequestOpen, setIsCharacteristicRequestOpen] =
    useState(false);
  const [catalogRequestMode, setCatalogRequestMode] =
    useState<CatalogRequestMode>("characteristic");

  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm("products"),
  );
  const createRouteInitializedRef = useRef(false);
  const isCreateOpen = createMode || showModal;
  const isEditingListing = Boolean(editingListing);
  const {
    listingDrafts,
    activeDraftId,
    setActiveDraftId,
    loadDrafts,
  } = useListingDrafts({
    listingTypeFilter,
    isCreateOpen,
    isEditingListing,
    creationScreen,
    form,
  });
  const {
    titleSuggestions,
    setTitleSuggestions,
    createSuggestionMatches,
    setCreateSuggestionMatches,
    isSuggestionsLoading,
  } = useCreateTitleSuggestions({
    isCreateOpen,
    creationScreen,
    titlePickedFromSuggestion,
    form,
  });

  const showNotice = useCallback(
    (message: string, tone: AppNotice["tone"] = "info") => {
      const id = Date.now() + Math.floor(Math.random() * 1_000);
      setNotices((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => {
        setNotices((prev) => prev.filter((item) => item.id !== id));
      }, 4500);
    },
    [],
  );

  const closeNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const closeAllNotices = useCallback(() => {
    setNotices([]);
  }, []);

  const {
    listings,
    setListings,
    isLoading,
    deleteCandidateId,
    isDeleteBusy,
    loadListings,
    requestRemoveListing,
    cancelRemoveListing,
    confirmRemoveListing,
    toggleListingStatus,
  } = usePartnerListingsCollection({
    listingTypeFilter,
    showNotice,
  });

  const {
    catalogCategories,
    selectedCategory,
    selectedSubcategory,
    manualCategoryColumnCount,
    characteristicFields,
  } = usePartnerListingCatalogFlow({
    isCreateOpen,
    listingTypeFilter,
    form,
    setForm,
  });

  const {
    profileAddresses,
    addressBook,
    defaultProfileAddress,
    selectedMeetingAddressId,
    setSelectedMeetingAddressId,
    addressModalOpen,
    addressForm,
    setAddressForm,
    addressMapHint,
    mapCenterQuery,
    addressFullInputRef,
    selectMeetingAddress,
    openAddressCreateModal,
    closeAddressCreateModal,
    onAddressFullAddressChange,
    addressFullInputHandlers,
    handleAddressSelectFromMap,
    createAddress,
  } = usePartnerListingAddressFlow({
    isCreateOpen,
    setForm,
    showNotice,
  });

  const {
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
  } = usePartnerListingInlineEditFlow({
    catalogCategories,
    addressBook,
    setListings,
    loadListings,
    showNotice,
  });

  const reportFormIssue = useCallback(
    (message: string) => {
      setFormIssue(message);
      showNotice(message, "error");
    },
    [showNotice],
  );

  const openListingPage = useCallback(
    (listingId: string) => {
      if (onOpenListing) {
        onOpenListing(listingId);
        return;
      }
      window.location.assign(`/products/${encodeURIComponent(listingId)}`);
    },
    [onOpenListing],
  );

  const applyCatalogPath = useCallback(
    (path: {
      categoryName: string;
      subcategoryName: string;
      itemName: string;
    }) => {
      const category = catalogCategories.find(
        (item) => item.name === path.categoryName,
      );
      const subcategory = category?.subcategories.find(
        (item) => item.name === path.subcategoryName,
      );
      setForm((prev) => ({
        ...prev,
        type: "products",
        categoryRoot: path.categoryName,
        category: path.itemName,
        subcategory: path.subcategoryName,
        catalogItem: path.itemName,
        customCategoryRoot: "",
        customSubcategory: "",
        customCatalogItem: "",
        ...catalogRequestDefaults(),
        characteristics: normalizeCharacteristics(
          getCharacteristicFields(
            "products",
            path.subcategoryName,
            subcategory,
            path.itemName,
          ),
          {},
        ),
      }));
    },
    [catalogCategories],
  );

  const applyCreateSuggestion = (match: CreateSuggestionMatch) => {
    applyCatalogPath({
      categoryName: match.categoryName,
      subcategoryName: match.subcategoryName,
      itemName: match.itemName,
    });
    setCreationScreen("details");
  };

  const startFromDraft = (draft: ListingDraftDto) => {
    const draftForm =
      draft.payload && typeof draft.payload === "object"
        ? ({ ...buildInitialForm(draft.type), ...draft.payload } as FormState)
        : buildInitialForm(draft.type);
    setForm(draftForm);
    const draftAddress = draftForm.meetingAddress.trim();
    setSelectedMeetingAddressId(
      profileAddresses.find((address) => address.fullAddress === draftAddress)
        ?.id ?? "",
    );
    setActiveDraftId(draft.id);
    setCreationScreen(
      ["start", "titleSearch", "manualCategory", "details"].includes(
        draft.currentScreen,
      )
        ? (draft.currentScreen as CreationScreen)
        : "details",
    );
  };

  const startTitleSearch = (categoryName?: string) => {
    if (categoryName) {
      setForm((prev) => ({
        ...prev,
        type: "products",
        categoryRoot: categoryName,
        category: categoryName,
        subcategory: "",
        catalogItem: "",
        characteristics: {},
      }));
    }
    setCreationScreen("titleSearch");
  };

  const filteredListings = useMemo(
    () =>
      listings.filter((listing) => {
        const statusOk =
          statusFilter === "all" || listing.status === statusFilter;
        return statusOk && matchesSearch(listing, searchQuery);
      }),
    [listings, searchQuery, statusFilter],
  );

  const stats = useMemo(
    () => ({
      total: listings.length,
      active: listings.filter((x) => x.status === "active").length,
      moderation: listings.filter((x) => x.status === "moderation").length,
      inactive: listings.filter((x) => x.status === "inactive").length,
    }),
    [listings],
  );

  const {
    brands: catalogReferenceBrands,
    models: catalogReferenceModels,
    fields: catalogReferenceFields,
    effectiveFields: effectiveCharacteristicFields,
    isCreation: isCatalogReferenceCreation,
  } = useCatalogReferenceFields({
    isCreateOpen,
    form,
    editingListing,
    characteristicFields,
    setForm,
  });

  const hasMeetingAddress = form.meetingAddress.trim().length >= 5;
  const resetCreateFlow = useCallback(() => {
    resetInlineEdit();
    setEditingListing(null);
    setFormIssue(null);
    setIsCharacteristicRequestOpen(false);
    setCatalogRequestMode("characteristic");
    const defaultAddressValue =
      defaultProfileAddress?.fullAddress?.trim() ?? "";
    setSelectedMeetingAddressId(defaultProfileAddress?.id ?? "");
    setForm({
      ...buildInitialForm(listingTypeFilter),
      meetingAddress: defaultAddressValue,
    });
    setActiveDraftId(null);
    setTitlePickedFromSuggestion(false);
    setTitleSuggestions([]);
    setCreateSuggestionMatches([]);
    setCreationScreen("start");
    void loadDrafts(listingTypeFilter);
  }, [defaultProfileAddress, listingTypeFilter, loadDrafts, resetInlineEdit]);

  const closeCreateFlow = useCallback(() => {
    setCreationScreen("start");
    setTitleSuggestions([]);
    setTitlePickedFromSuggestion(false);
    setCreateSuggestionMatches([]);
    setIsCharacteristicRequestOpen(false);
    setCatalogRequestMode("characteristic");
    setEditingListing(null);
    if (createMode && onExitCreate) {
      onExitCreate();
      return;
    }
    setShowModal(false);
  }, [createMode, onExitCreate]);

  const { isCreateSaving, saveListing } = usePartnerListingSaveFlow({
    form,
    fields: effectiveCharacteristicFields,
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
    clearFormIssue: () => setFormIssue(null),
    reportFormIssue,
    showNotice,
  });

  useEffect(() => {
    if (!createMode) {
      createRouteInitializedRef.current = false;
      return;
    }
    if (createRouteInitializedRef.current) return;
    createRouteInitializedRef.current = true;
    resetCreateFlow();
  }, [createMode, resetCreateFlow]);

  const openCreate = () => {
    if (onOpenCreateListing) {
      onOpenCreateListing();
      return;
    }
    setEditingListing(null);
    resetCreateFlow();
    setShowModal(true);
  };

  const openEdit = (listing: Listing) => {
    setFormIssue(null);
    resetInlineEdit();
    setEditingListing(listing);
    setForm(
      listingToEditForm({
        listing,
        catalogCategories,
        listingType: listingTypeFilter,
      }),
    );
    setTitleSuggestions([]);
    setCreateSuggestionMatches([]);
    setActiveDraftId(null);
    setCreationScreen("details");
    setShowModal(true);
  };

  const onFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        reportFormIssue(`Файл ${file.name} не является изображением`);
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        reportFormIssue(`Файл ${file.name} больше 3 МБ`);
        return;
      }
    }

    const encoded = await Promise.all(files.map((file) => fileToDataUrl(file)));
    const images = [...form.images, ...encoded].slice(0, MAX_IMAGES);
    const imageError = await validateImageDuplicates(images);
    if (imageError) {
      reportFormIssue(imageError);
      return;
    }

    setFormIssue(null);
    setForm((prev) => ({ ...prev, images }));
  };

  const removeImage = (index: number) => {
    const minImages = getMinImagesForType(form.type);
    if (form.images.length <= minImages) {
      reportFormIssue(`Нужно оставить минимум ${minImages} фото`);
      return;
    }
    setForm((prev) => {
      const images = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images,
      };
    });
  };

  const prevStep = () => {
    if (editingListing && creationScreen === "details") {
      closeCreateFlow();
      return;
    }
    if (creationScreen === "details") {
      setCreationScreen("titleSearch");
      return;
    }
    if (creationScreen === "manualCategory") {
      setCreationScreen("start");
      return;
    }
    if (creationScreen === "titleSearch") {
      if (form.categoryRoot) {
        setCreationScreen("manualCategory");
        return;
      }
      setCreationScreen("start");
      return;
    }
    closeCreateFlow();
  };

  const openCatalogRequest = () => {
    setCatalogRequestMode("catalog");
    setIsCharacteristicRequestOpen(true);
  };

  const openCharacteristicRequest = () => {
    setCatalogRequestMode("characteristic");
    setIsCharacteristicRequestOpen(true);
  };

  const submitCharacteristicRequest = async (
    request: CatalogRequestModalPayload,
  ) => {
    const comment = [
      request.link ? `Ссылка: ${request.link.trim()}` : "",
      request.email ? `Почта: ${request.email.trim()}` : "",
      request.photoName ? `Фото товара: ${request.photoName}` : "",
      request.photoLabel ? `Файл фото: ${request.photoLabel}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await createCatalogRequest({
        mode: catalogRequestMode,
        categoryName: request.category.trim(),
        subcategoryName: request.subcategory.trim(),
        itemName: request.item.trim(),
        brand: request.brand.trim(),
        model: request.model.trim(),
        importantAttributes: request.details.trim(),
        comment,
        link: request.link.trim(),
        email: request.email.trim(),
        photoName: request.photoName,
        photoLabel: request.photoLabel.trim(),
        title: form.title.trim(),
      });
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Не удалось отправить запрос",
        "error",
      );
      throw error;
    }

    setForm((prev) => ({
      ...prev,
      ...(catalogRequestMode === "catalog"
        ? {
            categoryRoot: CUSTOM_OPTION,
            customCategoryRoot: request.category.trim(),
            subcategory: CUSTOM_OPTION,
            customSubcategory: request.subcategory.trim(),
            catalogItem: CUSTOM_OPTION,
            customCatalogItem: request.item.trim(),
            category: request.item.trim(),
          }
        : {}),
      catalogRequestAttributes: request.details.trim(),
      catalogRequestComment: comment,
      characteristics: {
        ...prev.characteristics,
        brand: request.brand.trim(),
        model: request.model.trim(),
      },
    }));
    setIsCharacteristicRequestOpen(false);
    if (catalogRequestMode === "catalog") {
      setCreationScreen("details");
    }
    showNotice(
      catalogRequestMode === "catalog"
        ? "Запрос добавлен, заполните объявление"
        : "Запрос добавлен к объявлению",
      "success",
    );
    setCatalogRequestMode("characteristic");
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <ToastViewport notices={notices} onClose={closeNotice} onCloseAll={closeAllNotices} />
      <ConfirmDialog
        open={Boolean(deleteCandidateId)}
        title="Удалить объявление?"
        description="Объявление будет удалено без возможности восстановления."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        confirmTone="danger"
        confirmPhrase="УДАЛИТЬ"
        confirmHint="Введите «УДАЛИТЬ», чтобы подтвердить действие."
        isBusy={isDeleteBusy}
        onCancel={cancelRemoveListing}
        onConfirm={() => void confirmRemoveListing()}
      />
      <ProfileAddressCreateModal
        open={addressModalOpen}
        addressForm={addressForm}
        addressMapHint={addressMapHint}
        mapCenterQuery={mapCenterQuery}
        addressFullInputRef={addressFullInputRef}
        onClose={closeAddressCreateModal}
        onAddressNameChange={(value) => {
          setAddressForm((prev) => ({ ...prev, name: value }));
        }}
        onAddressFullAddressChange={onAddressFullAddressChange}
        onAddressFullAddressFocus={addressFullInputHandlers.onFocus}
        onAddressFullAddressBlur={addressFullInputHandlers.onBlur}
        onAddressFullAddressEnter={addressFullInputHandlers.onEnter}
        onAddressFullAddressEscape={addressFullInputHandlers.onEscape}
        onAddressSelectFromMap={handleAddressSelectFromMap}
        onCreateAddress={() => {
          void createAddress();
        }}
      />
      <CatalogRequestModal
        open={isCharacteristicRequestOpen}
        mode={catalogRequestMode}
        form={form}
        onClose={() => {
          setIsCharacteristicRequestOpen(false);
          setCatalogRequestMode("characteristic");
        }}
        onSubmit={submitCharacteristicRequest}
      />

      <PartnerListingsHeader onCreate={openCreate} />
      <PartnerListingsStats stats={stats} />
      <PartnerListingsToolbar
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        listingTypeFilter={listingTypeFilter}
        onSearchQueryChange={setSearchQuery}
        onStatusFilterChange={setStatusFilter}
        onListingTypeFilterChange={setListingTypeFilter}
      />

      {isLoading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <PartnerListingsList
          listings={filteredListings}
          inlineEditingId={inlineEditingId}
          inlineForm={inlineForm}
          inlineIssue={inlineIssue}
          catalogCategories={catalogCategories}
          inlineAddressSuggestions={inlineAddressSuggestions}
          isInlineSaving={isInlineSaving}
          setInlineForm={setInlineForm}
          onOpenListing={openListingPage}
          onToggleStatus={(listing) => void toggleListingStatus(listing)}
          onOpenEdit={openEdit}
          onRemove={requestRemoveListing}
          onInlineFilesSelected={onInlineFilesSelected}
          onRemoveInlineImage={removeInlineImage}
          onCancelInlineEdit={resetInlineEdit}
          onSaveInlineEdit={(listing) => void saveInlineEdit(listing)}
        />
      )}

      {isCreateOpen && (
        <PartnerListingCreateFlow
          createMode={createMode}
          creationScreen={creationScreen}
          form={form}
          formIssue={formIssue}
          listingDrafts={listingDrafts}
          catalogCategories={catalogCategories}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          manualCategoryColumnCount={manualCategoryColumnCount}
          isEditingListing={isEditingListing}
          titleSuggestions={titleSuggestions}
          isSuggestionsLoading={isSuggestionsLoading}
          createSuggestionMatches={createSuggestionMatches}
          characteristicFields={characteristicFields}
          isCatalogReferenceCreation={isCatalogReferenceCreation}
          catalogReferenceBrands={catalogReferenceBrands}
          catalogReferenceModels={catalogReferenceModels}
          catalogReferenceFields={catalogReferenceFields}
          profileAddresses={profileAddresses}
          selectedMeetingAddressId={selectedMeetingAddressId}
          hasMeetingAddress={hasMeetingAddress}
          isCreateSaving={isCreateSaving}
          setForm={setForm}
          setCreationScreen={setCreationScreen}
          setTitlePickedFromSuggestion={setTitlePickedFromSuggestion}
          onPrevStep={prevStep}
          onClose={closeCreateFlow}
          onStartFromDraft={startFromDraft}
          onStartTitleSearch={startTitleSearch}
          onOpenCatalogRequest={openCatalogRequest}
          onApplyCatalogPath={applyCatalogPath}
          onApplyCreateSuggestion={applyCreateSuggestion}
          onOpenCharacteristicRequest={openCharacteristicRequest}
          onFilesSelected={onFilesSelected}
          onRemoveImage={removeImage}
          onSelectMeetingAddress={selectMeetingAddress}
          onOpenAddressCreateModal={openAddressCreateModal}
          onSave={() => void saveListing()}
        />
      )}
    </div>
  );
}
