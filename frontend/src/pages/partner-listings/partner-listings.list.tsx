import React, { type Dispatch, type SetStateAction } from "react";
import { Edit2, ExternalLink, Eye, EyeOff, Trash2 } from "lucide-react";
import { FALLBACK_IMAGE } from "./partner-listings.constants";
import type {
  CatalogCategoryDto,
  FormState,
  Listing,
} from "./partner-listings.types";
import { InlineListingEditForm } from "./partner-listings.components";

function getStatusLabel(status: Listing["status"]): {
  label: string;
  color: string;
} {
  if (status === "active") {
    return { label: "Активно", color: "bg-green-100 text-green-700" };
  }
  if (status === "moderation") {
    return { label: "На модерации", color: "bg-yellow-100 text-yellow-700" };
  }
  return { label: "Неактивно", color: "bg-gray-100 text-gray-700" };
}

function getRejectionReason(listing: Listing): string {
  if (listing.moderation?.status !== "rejected") return "";
  return (
    listing.moderation.reasonNote?.trim() ||
    listing.moderation.reasonCode
      ?.toLocaleLowerCase("ru-RU")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ") ||
    ""
  );
}

export function PartnerListingsList({
  listings,
  inlineEditingId,
  inlineForm,
  inlineIssue,
  catalogCategories,
  inlineAddressSuggestions,
  isInlineSaving,
  setInlineForm,
  onOpenListing,
  onToggleStatus,
  onOpenEdit,
  onRemove,
  onInlineFilesSelected,
  onRemoveInlineImage,
  onCancelInlineEdit,
  onSaveInlineEdit,
}: {
  listings: Listing[];
  inlineEditingId: string | null;
  inlineForm: FormState | null;
  inlineIssue: string | null;
  catalogCategories: CatalogCategoryDto[];
  inlineAddressSuggestions: string[];
  isInlineSaving: boolean;
  setInlineForm: Dispatch<SetStateAction<FormState | null>>;
  onOpenListing: (listingId: string) => void;
  onToggleStatus: (listing: Listing) => void;
  onOpenEdit: (listing: Listing) => void;
  onRemove: (listingId: string) => void;
  onInlineFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveInlineImage: (index: number) => void;
  onCancelInlineEdit: () => void;
  onSaveInlineEdit: (listing: Listing) => void;
}) {
  if (listings.length === 0) {
    return <div className="dashboard-empty">Объявления не найдены</div>;
  }

  return (
    <div className="space-y-3">
      {listings.map((listing) => {
        const status = getStatusLabel(listing.status);
        const rejectionReason = getRejectionReason(listing);
        const isInlineEditing = inlineEditingId === listing.id && inlineForm;
        return (
          <article key={listing.id} className="dashboard-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => onOpenListing(listing.id)}
                className="h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition hover:border-blue-300"
                title="Открыть карточку объявления"
              >
                <img
                  src={listing.image || FALLBACK_IMAGE}
                  alt={listing.title}
                  className="h-full w-full object-contain"
                />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpenListing(listing.id)}
                  className="block max-w-full truncate text-left text-sm font-semibold text-gray-900 transition hover:text-blue-700 hover:underline md:text-base"
                  title="Открыть карточку объявления"
                >
                  {listing.title}
                </button>
                <div className="text-sm text-gray-600">
                  {listing.price.toLocaleString("ru-RU")} ₽
                </div>
                <div className="text-xs text-gray-500">
                  Просмотры: {listing.views}
                </div>
                {listing.city && (
                  <div className="text-xs text-gray-500">{listing.city}</div>
                )}
                {rejectionReason ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                    Причина отказа: {rejectionReason}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <span className={`rounded-full px-2 py-1 text-xs ${status.color}`}>
                  {status.label}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenListing(listing.id)}
                    title="Открыть карточку"
                    className="rounded-lg p-2 hover:bg-gray-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStatus(listing)}
                    disabled={isInlineSaving}
                    title={
                      listing.status === "inactive"
                        ? "Отправить повторно на проверку"
                        : "Снять с публикации"
                    }
                    className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {listing.status === "inactive" ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEdit(listing)}
                    className="rounded-lg p-2 hover:bg-gray-100"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(listing.id)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                isInlineEditing
                  ? "mt-4 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0">
                {isInlineEditing && (
                  <InlineListingEditForm
                    listing={listing}
                    inlineForm={inlineForm}
                    inlineIssue={inlineIssue}
                    catalogCategories={catalogCategories}
                    inlineAddressSuggestions={inlineAddressSuggestions}
                    isInlineSaving={isInlineSaving}
                    setInlineForm={setInlineForm}
                    onInlineFilesSelected={onInlineFilesSelected}
                    onRemoveImage={onRemoveInlineImage}
                    onCancel={onCancelInlineEdit}
                    onSave={onSaveInlineEdit}
                  />
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
