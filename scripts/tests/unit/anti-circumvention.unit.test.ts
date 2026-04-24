import assert from "node:assert/strict";
import test from "node:test";
import { detectCircumventionSignals } from "../../../backend/src/modules/moderation/anti-circumvention";

test("anti-circumvention: detects all core signal types", () => {
  const text =
    "Пишите в Telegram @outside_deal, email test@example.com, или +79990001122, https://t.me/outside";
  const signals = detectCircumventionSignals(text);

  assert.equal(signals.includes("phone_number"), true);
  assert.equal(signals.includes("email"), true);
  assert.equal(signals.includes("external_link"), true);
  assert.equal(signals.includes("messenger_mention"), true);
  assert.equal(signals.includes("at_handle"), true);
});

test("anti-circumvention: detects off-platform phrase", () => {
  const signals = detectCircumventionSignals("Давайте без комиссии и мимо платформы");
  assert.equal(signals.includes("off_platform_phrase"), true);
});

test("anti-circumvention: returns empty array for neutral message", () => {
  const signals = detectCircumventionSignals(
    "Подскажите, пожалуйста, состояние аккумулятора и срок гарантии",
  );
  assert.deepEqual(signals, []);
});

test("anti-circumvention: trims input and handles empty text", () => {
  assert.deepEqual(detectCircumventionSignals("   "), []);
});
