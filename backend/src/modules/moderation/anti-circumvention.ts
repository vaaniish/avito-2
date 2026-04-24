const SIGNAL_PATTERNS: Array<{ signal: string; re: RegExp }> = [
  { signal: "phone_number", re: /(?:\+?\d[\s()\-]*){10,}/u },
  { signal: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  {
    signal: "external_link",
    re: /\b(?:https?:\/\/|www\.|t\.me\/|wa\.me\/|vk\.com\/|instagram\.com\/)[^\s]+/iu,
  },
  {
    signal: "messenger_mention",
    re: /\b(?:telegram|телеграм|whatsapp|ватсап|viber|вайбер|discord|дискорд|signal)\b/iu,
  },
  {
    signal: "off_platform_phrase",
    re: /(?:в\s*личк|в\s*лс|напиши\s*в|мимо\s*платформ|без\s*комисси|перевед[еёи]\s*на\s*карт)/iu,
  },
  { signal: "at_handle", re: /(^|\s)@[A-Za-z0-9_]{3,}/u },
];

export function detectCircumventionSignals(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const signals: string[] = [];
  for (const candidate of SIGNAL_PATTERNS) {
    if (candidate.re.test(normalized)) {
      signals.push(candidate.signal);
    }
  }

  return signals;
}
