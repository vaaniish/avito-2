import {
  isBroadAdministrativeUnit,
  isRussianCountry,
  RUSSIA_BOUNDS,
} from "./profile.address-utils";
import {
  resolvePreferredRegion,
  sanitizeCityValue,
  sanitizeHouseValue,
  sanitizeRegion,
} from "./profile.address-helpers";

export type ProfileGeocodeResult = {
  region: string;
  city: string;
  street: string;
  house: string;
  postalCode: string;
  formatted: string;
  country: string;
  lat: number | null;
  lon: number | null;
};

function parseGeoObjectAddress(geoObject: any): ProfileGeocodeResult {
  const components = geoObject?.properties?.get?.(
    "metaDataProperty.GeocoderMetaData.Address.Components",
  ) as Array<{ kind: string; name: string }> | undefined;

  let province = "";
  let area = "";
  let city = "";
  let street = "";
  let house = "";
  let postalCode = "";
  let country = "";

  for (const component of components ?? []) {
    if (component.kind === "province" && !province) province = component.name;
    if (component.kind === "area" && !area) area = component.name;
    if (component.kind === "locality" && !isBroadAdministrativeUnit(component.name)) {
      city = component.name;
    }
    if (component.kind === "street") street = component.name;
    if (component.kind === "house") house = sanitizeHouseValue(component.name);
    if (component.kind === "postal_code") postalCode = component.name;
    if (component.kind === "country" && !country) country = component.name;
  }

  const region = sanitizeRegion(resolvePreferredRegion(province, area));
  const safeCity = sanitizeCityValue(city);
  city = !safeCity && region ? region : safeCity;

  const formatted = String(geoObject?.properties?.get?.("text") ?? "").trim();
  const coords = geoObject?.geometry?.getCoordinates?.();
  const lat = Array.isArray(coords) && coords.length >= 2 ? Number(coords[0]) : NaN;
  const lon = Array.isArray(coords) && coords.length >= 2 ? Number(coords[1]) : NaN;

  return {
    region: sanitizeRegion(region),
    city: sanitizeCityValue(city),
    street,
    house: sanitizeHouseValue(house),
    postalCode,
    formatted,
    country: country.trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

function mergeParsed(
  base: ProfileGeocodeResult,
  candidate: ProfileGeocodeResult,
): ProfileGeocodeResult {
  const nextCity = sanitizeCityValue(base.city || candidate.city);
  return {
    ...base,
    region: sanitizeRegion(base.region) || sanitizeRegion(candidate.region),
    city: nextCity,
    street: base.street || candidate.street,
    house: sanitizeHouseValue(base.house || candidate.house),
    postalCode: base.postalCode || candidate.postalCode,
    formatted: base.formatted || candidate.formatted,
    country: base.country || candidate.country || "",
    lat: typeof base.lat === "number" ? base.lat : candidate.lat ?? null,
    lon: typeof base.lon === "number" ? base.lon : candidate.lon ?? null,
  };
}

export async function geocodeAddress(
  query: string,
): Promise<ProfileGeocodeResult | null> {
  const rawQuery = query.trim();
  if (!rawQuery) return null;

  const ymaps = (window as unknown as { ymaps?: any }).ymaps;
  if (!ymaps?.geocode) return null;

  try {
    const geocodeResult = await ymaps.geocode(rawQuery, {
      results: 1,
      boundedBy: RUSSIA_BOUNDS,
      strictBounds: true,
    });
    const firstGeoObject = geocodeResult?.geoObjects?.get?.(0);
    if (!firstGeoObject) return null;

    let parsed = parseGeoObjectAddress(firstGeoObject);
    if (!isRussianCountry(parsed.country)) return null;

    if (!parsed.house || !parsed.postalCode || !sanitizeRegion(parsed.region)) {
      try {
        const houseGeocode = await ymaps.geocode(rawQuery, {
          kind: "house",
          results: 1,
          boundedBy: RUSSIA_BOUNDS,
          strictBounds: true,
        });
        const houseGeoObject = houseGeocode?.geoObjects?.get?.(0);
        if (houseGeoObject) {
          parsed = mergeParsed(parsed, parseGeoObjectAddress(houseGeoObject));
          if (!isRussianCountry(parsed.country)) return null;
        }
      } catch {
        // keep primary result
      }
    }

    if (!parsed.postalCode && parsed.house) {
      try {
        const houseQuery = [
          parsed.region,
          parsed.city,
          parsed.street,
          parsed.house ? `дом ${parsed.house}` : "",
        ]
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .join(", ");

        if (houseQuery) {
          const exactHouseGeocode = await ymaps.geocode(houseQuery, {
            kind: "house",
            results: 1,
            boundedBy: RUSSIA_BOUNDS,
            strictBounds: true,
          });
          const exactHouseGeoObject = exactHouseGeocode?.geoObjects?.get?.(0);
          if (exactHouseGeoObject) {
            parsed = mergeParsed(parsed, parseGeoObjectAddress(exactHouseGeoObject));
            if (!isRussianCountry(parsed.country)) return null;
          }
        }
      } catch {
        // keep previous result
      }
    }

    if (!isRussianCountry(parsed.country)) return null;

    if (parsed.postalCode) {
      return {
        ...parsed,
        region: sanitizeRegion(parsed.region),
        city: sanitizeCityValue(parsed.city),
        house: sanitizeHouseValue(parsed.house),
      };
    }

    const coords = firstGeoObject?.geometry?.getCoordinates?.();
    if (!Array.isArray(coords) || coords.length < 2) {
      return {
        ...parsed,
        region: sanitizeRegion(parsed.region),
        city: sanitizeCityValue(parsed.city),
        house: sanitizeHouseValue(parsed.house),
      };
    }

    try {
      const reverseGeocode = await ymaps.geocode(coords, { kind: "house", results: 1 });
      const reverseFirst = reverseGeocode?.geoObjects?.get?.(0);
      if (!reverseFirst) {
        return {
          ...parsed,
          region: sanitizeRegion(parsed.region),
          city: sanitizeCityValue(parsed.city),
          house: sanitizeHouseValue(parsed.house),
        };
      }
      const reverseParsed = parseGeoObjectAddress(reverseFirst);
      const merged = mergeParsed(parsed, reverseParsed);
      return isRussianCountry(merged.country) ? merged : null;
    } catch {
      return {
        ...parsed,
        region: sanitizeRegion(parsed.region),
        city: sanitizeCityValue(parsed.city),
        house: sanitizeHouseValue(parsed.house),
      };
    }
  } catch {
    return null;
  }
}
