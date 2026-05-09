import assert from "node:assert/strict";
import test from "node:test";
import { validateListingQuality } from "../../../backend/src/modules/partner/listing-quality";

const VALID_IMAGES = [
  "https://images.example/front.jpg",
  "https://images.example/back.jpg",
  "https://images.example/left.jpg",
  "https://images.example/right.jpg",
];

test("listing quality: accepts valid product payload", () => {
  const result = validateListingQuality({
    type: "PRODUCT",
    images: VALID_IMAGES,
    techState: null,
  });

  assert.equal(result.ok, true);
});

test("listing quality: rejects product with less than four unique photos", () => {
  const result = validateListingQuality({
    type: "PRODUCT",
    images: [VALID_IMAGES[0], VALID_IMAGES[1], VALID_IMAGES[1]],
    techState: null,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("expected validation failure");
  }
  assert.equal(result.reasonCode, "QUALITY_PHOTO_MINIMUM_NOT_MET");
});

test("listing quality: service listing allows lightweight payload", () => {
  const result = validateListingQuality({
    type: "SERVICE",
    images: ["https://images.example/service.jpg"],
    techState: null,
  });
  assert.equal(result.ok, true);
});
