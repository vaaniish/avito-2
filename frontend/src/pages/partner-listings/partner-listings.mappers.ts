import {
  CUSTOM_OPTION,
  META_ATTR_CATALOG_ITEM,
  META_ATTR_CATALOG_ITEM_CUSTOM,
  META_ATTR_CATEGORY_ROOT,
  META_ATTR_HAS_DEFECTS,
  META_ATTR_MEETING_ADDRESS,
  META_ATTR_SUBCATEGORY,
} from "./partner-listings.constants";
import type {
  CatalogCategoryDto,
  DefectsValue,
  FormState,
  Listing,
  ListingType,
} from "./partner-listings.types";
import {
  attributesToCharacteristics,
  catalogRequestFieldsFromAttributes,
  getCharacteristicFields,
  getMetaAttribute,
  referenceCharacteristicsFromAttributes,
} from "./partner-listings.utils";

export function listingToEditForm(params: {
  listing: Listing;
  catalogCategories: CatalogCategoryDto[];
  listingType: ListingType;
}): FormState {
  const { listing, catalogCategories, listingType } = params;
  const normalizedImages =
    listing.images && listing.images.length > 0
      ? listing.images
      : listing.image
        ? [listing.image]
        : [];
  const categoryRoot =
    getMetaAttribute(listing.attributes, META_ATTR_CATEGORY_ROOT) ||
    listing.category ||
    "";
  const subcategory = getMetaAttribute(
    listing.attributes,
    META_ATTR_SUBCATEGORY,
  );
  const customCatalogItem = getMetaAttribute(
    listing.attributes,
    META_ATTR_CATALOG_ITEM_CUSTOM,
  );
  const catalogItem = customCatalogItem
    ? CUSTOM_OPTION
    : getMetaAttribute(listing.attributes, META_ATTR_CATALOG_ITEM);
  const selectedCategory =
    catalogCategories.find((category) => category.name === categoryRoot) ??
    null;
  const selectedSubcategory =
    selectedCategory?.subcategories.find(
      (item) => item.name === subcategory,
    ) ?? null;
  const fields = getCharacteristicFields(
    listingType,
    subcategory,
    selectedSubcategory,
    catalogItem,
  );

  return {
    title: listing.title,
    price: String(listing.price),
    condition: listing.condition === "new" ? "new" : "used",
    description: listing.description ?? "",
    category: catalogItem || subcategory || categoryRoot,
    categoryRoot,
    customCategoryRoot: "",
    subcategory,
    customSubcategory: "",
    catalogItem,
    customCatalogItem,
    ...catalogRequestFieldsFromAttributes(listing.attributes),
    type: listingType,
    meetingAddress: getMetaAttribute(
      listing.attributes,
      META_ATTR_MEETING_ADDRESS,
    ),
    images: normalizedImages,
    hasDefects:
      (getMetaAttribute(
        listing.attributes,
        META_ATTR_HAS_DEFECTS,
      ) as DefectsValue) || "",
    characteristics: {
      ...attributesToCharacteristics(listing.attributes, fields),
      ...referenceCharacteristicsFromAttributes(listing.attributes),
    },
    hasMultipleStock:
      getMetaAttribute(listing.attributes, "Несколько штук в наличии") === "Да",
  };
}
