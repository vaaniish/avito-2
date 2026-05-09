export type ListingTypeValue = "PRODUCT";

export type ListingTechGrade = "A_PLUS" | "A" | "B" | "C";

export type ListingTechState = {
  grade: ListingTechGrade;
  batteryHealthPercent: number;
  defects: string;
  included: string;
};

export const PRODUCT_MIN_IMAGES = 4;

const GRADE_VALUES = new Set<ListingTechGrade>(["A_PLUS", "A", "B", "C"]);

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeBattery(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isInteger(raw)) return null;
  if (raw < 1 || raw > 100) return null;
  return raw;
}

export function normalizeListingTechState(value: unknown): ListingTechState | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as {
    grade?: unknown;
    batteryHealthPercent?: unknown;
    defects?: unknown;
    included?: unknown;
  };

  const gradeRaw = normalizeText(payload.grade).toUpperCase();
  const grade = gradeRaw === "A+" ? "A_PLUS" : (gradeRaw as ListingTechGrade);
  if (!GRADE_VALUES.has(grade)) {
    return null;
  }

  const batteryHealthPercent = normalizeBattery(payload.batteryHealthPercent);
  if (batteryHealthPercent === null) {
    return null;
  }

  const defects = normalizeText(payload.defects);
  const included = normalizeText(payload.included);
  if (defects.length < 5 || included.length < 3) {
    return null;
  }

  return {
    grade,
    batteryHealthPercent,
    defects: defects.slice(0, 2000),
    included: included.slice(0, 2000),
  };
}

export function validateListingQuality(params: {
  type: ListingTypeValue;
  images: string[];
  techState: ListingTechState | null;
}): { ok: true } | { ok: false; error: string; reasonCode: string } {
  const normalizedImages = Array.from(
    new Set(
      params.images
        .map((image) => image.trim())
        .filter(Boolean),
    ),
  );

  if (params.type !== "PRODUCT") {
    if (normalizedImages.length < 1) {
      return {
        ok: false,
        error: "Provide at least one image",
        reasonCode: "QUALITY_PHOTO_MINIMUM_NOT_MET",
      };
    }
    return { ok: true };
  }

  if (normalizedImages.length < PRODUCT_MIN_IMAGES) {
    return {
      ok: false,
      error: `Provide at least ${PRODUCT_MIN_IMAGES} unique images for product listing`,
      reasonCode: "QUALITY_PHOTO_MINIMUM_NOT_MET",
    };
  }

  return { ok: true };
}
