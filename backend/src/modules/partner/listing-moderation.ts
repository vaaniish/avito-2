type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";
type ModerationStatusValue = "APPROVED" | "PENDING" | "REJECTED";

export type SellerModerationContext = {
  joinedAt: Date;
  isVerified: boolean;
  complaintsCount: number;
  sellerOrdersCount: number;
  listingsCount: number;
};

export type AutoModerationDecision = {
  moderationStatus: ModerationStatusValue;
  listingStatus: ListingStatusValue;
  reason: string;
  riskScore: number;
  signals: string[];
  aiUsed: boolean;
};

type RuleEvaluation = {
  riskScore: number;
  hardSignals: string[];
  mediumSignals: string[];
  softSignals: string[];
  signals: string[];
};

export type ImageModerationSignal =
  | "image_exact_duplicate"
  | "image_near_duplicate"
  | "image_low_contrast"
  | "image_low_resolution"
  | "image_similar_composition";

const IMAGE_SIGNAL_SET = new Set<string>([
  "image_exact_duplicate",
  "image_near_duplicate",
  "image_low_contrast",
  "image_low_resolution",
  "image_similar_composition",
]);

function pushSignal(
  groups: Pick<RuleEvaluation, "hardSignals" | "mediumSignals" | "softSignals" | "signals">,
  level: "hard" | "medium" | "soft",
  signal: string,
): void {
  groups.signals.push(signal);
  if (level === "hard") groups.hardSignals.push(signal);
  if (level === "medium") groups.mediumSignals.push(signal);
  if (level === "soft") groups.softSignals.push(signal);
}

const CONTACT_PATTERNS: RegExp[] = [
  /(\bt(?:elegram)?\b|\btg\b|\btelega\b|телеграм|(?:^|[^а-яa-z0-9])тг(?:$|[^а-яa-z0-9]))/iu,
  /(whatsapp|\bwa\b|ватсап|вотсап)/iu,
  /(viber|вайбер)/iu,
  /(discord|дискорд)/iu,
  /(в\s*лс|личк[ауе]|пиши\s*в\s*личк)/iu,
  /t\s*\.?\s*me/iu,
  /wa\s*\.?\s*me/iu,
  /https?:\/\/\S+/iu,
  /\+\s?\d[\d\-\s()]{7,}/u,
  /@\w{4,}/u,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu,
];

const OFFPLATFORM_PATTERNS: RegExp[] = [
  /(предоплат[ауы]|оплата\s*переводом|вне\s*сайта|обход\s*площадки)/iu,
  /(transfer|prepayment|direct payment|outside platform)/iu,
  /(на\s*карту|перевед[иё]те|сбп|qiwi|юmoney|крипт[ао])/iu,
];

const PROFANITY_PATTERNS: RegExp[] = [
  /(бл[яеё]д|сук[ао]|хер|хуй|пизд|ебан|ебат|мудак|говно|параш)/iu,
  /(fuck|shit|bitch|asshole|motherfucker)/iu,
];

const EXPLICIT_PATTERNS: RegExp[] = [
  /(порно|эротик|голая|голый|интим|секс|нюдс|обнажен)/iu,
  /(porn|nude|naked|xxx|18\+)/iu,
];

const VIOLENCE_PATTERNS: RegExp[] = [
  /(расчлен|кровь|жесть|труп|насилие)/iu,
  /(gore|blood|behead|kill)/iu,
];

const SPAM_PATTERNS: RegExp[] = [
  /(!|\?){3,}/u,
  /(срочно|шок\s*цена|лучшее\s*предложение|скидка\s*90)/iu,
  /(urgent|best price|limited offer|cheap)/iu,
];

const DRUG_PATTERNS: RegExp[] = [
  /(наркот|закладк|амфетамин|меф|кокаин|марихуан|гашиш|соль)/iu,
  /(drug|cocaine|amphetamine|weed|hash)/iu,
];

const WEAPON_PATTERNS: RegExp[] = [
  /(оружи|пистолет|автомат|патрон|гранат|взрывчат)/iu,
  /(weapon|gun|ammo|explosive)/iu,
];

const SCAM_PATTERNS: RegExp[] = [
  /(гарантированн[а-я\s]*доход|быстр[а-я\s]*заработ|без\s*риска|удвою\s*деньги)/iu,
  /(guaranteed\s*profit|quick\s*money|no\s*risk|double\s*your\s*money)/iu,
];

const IMAGE_RISKY_WORDS: RegExp[] = [
  /(nude|naked|porn|xxx|nsfw|18\+|sex|gore|blood)/iu,
  /(голая|порно|эротик|жесть|кровь|расчлен)/iu,
];

const CHAR_NORMALIZATION_MAP: Record<string, string> = {
  "@": "a",
  "4": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "7": "t",
  "|": "l",
};

function normalizeText(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("")
    .map((char) => CHAR_NORMALIZATION_MAP[char] ?? char)
    .join("")
    .replace(/[_\-./\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const compact = normalized.replace(/[^a-zа-я0-9]+/giu, "");
  return `${normalized} ${compact}`.trim();
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let hits = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      hits += 1;
    }
  }
  return hits;
}

function evaluateRules(params: {
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  imageModerationSignals?: string[];
}): RuleEvaluation {
  const bodyText = normalizeText(
    `${params.title} ${params.description} ${params.category}`,
  );
  const imageText = normalizeText(params.imageUrl ?? "");
  const signals: string[] = [];
  const hardSignals: string[] = [];
  const mediumSignals: string[] = [];
  const softSignals: string[] = [];
  const groups = { hardSignals, mediumSignals, softSignals, signals };
  let riskScore = 0;

  const contactHits = countPatternMatches(bodyText, CONTACT_PATTERNS);
  const offplatformHits = countPatternMatches(bodyText, OFFPLATFORM_PATTERNS);
  const profanityHits = countPatternMatches(bodyText, PROFANITY_PATTERNS);
  const explicitHits = countPatternMatches(bodyText, EXPLICIT_PATTERNS);
  const violenceHits = countPatternMatches(bodyText, VIOLENCE_PATTERNS);
  const spamHits = countPatternMatches(bodyText, SPAM_PATTERNS);
  const drugHits = countPatternMatches(bodyText, DRUG_PATTERNS);
  const weaponHits = countPatternMatches(bodyText, WEAPON_PATTERNS);
  const scamHits = countPatternMatches(bodyText, SCAM_PATTERNS);
  const imageWordHits = countPatternMatches(imageText, IMAGE_RISKY_WORDS);

  if (contactHits > 0) {
    pushSignal(groups, "hard", "contact_details_detected");
    riskScore += 32;
  }

  if (offplatformHits > 0) {
    pushSignal(groups, "hard", "offplatform_payment_detected");
    riskScore += 45;
  }

  if (explicitHits > 0) {
    pushSignal(groups, "hard", "sexual_explicit_text_detected");
    riskScore += 70;
  }

  if (violenceHits > 0) {
    pushSignal(groups, "hard", "violence_gore_text_detected");
    riskScore += 70;
  }

  if (drugHits > 0) {
    pushSignal(groups, "hard", "drug_related_text_detected");
    riskScore += 75;
  }

  if (weaponHits > 0) {
    pushSignal(groups, "hard", "weapon_related_text_detected");
    riskScore += 70;
  }

  if (scamHits > 0) {
    pushSignal(groups, "hard", "scam_language_detected");
    riskScore += 50;
  }

  if (profanityHits > 0) {
    pushSignal(groups, "soft", "profanity_detected");
    riskScore += 20;
  }

  if (spamHits > 0) {
    pushSignal(groups, "soft", "spam_markers_detected");
    riskScore += 15;
  }

  if (imageWordHits > 0) {
    pushSignal(groups, "soft", "suspicious_image_url_markers");
    riskScore += 20;
  }

  if (params.price < 50 || params.price > 10_000_000) {
    pushSignal(groups, "medium", "price_outlier");
    riskScore += 12;
  }

  if (params.title.trim().length < 6) {
    pushSignal(groups, "soft", "too_short_title");
    riskScore += 10;
  }

  if (params.description.trim().length < 20) {
    pushSignal(groups, "medium", "too_short_description");
    riskScore += 10;
  }

  for (const signal of params.imageModerationSignals ?? []) {
    if (!IMAGE_SIGNAL_SET.has(signal)) continue;
    if (signal === "image_exact_duplicate" || signal === "image_near_duplicate") {
      pushSignal(groups, "medium", signal);
      riskScore += 14;
      continue;
    }
    pushSignal(groups, "soft", signal);
    riskScore += signal === "image_low_resolution" ? 8 : 6;
  }

  return {
    riskScore: Math.min(100, riskScore),
    hardSignals,
    mediumSignals,
    softSignals,
    signals,
  };
}

export async function evaluateListingModeration(params: {
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  imageModerationSignals?: string[];
  seller: SellerModerationContext | null;
}): Promise<AutoModerationDecision> {
  const rule = evaluateRules({
    title: params.title,
    description: params.description,
    category: params.category,
    price: params.price,
    imageUrl: params.imageUrl,
    imageModerationSignals: params.imageModerationSignals,
  });
  let riskScore = rule.riskScore;
  const signals = [...rule.signals];

  if (params.seller) {
    const accountAgeDays = Math.floor(
      (Date.now() - params.seller.joinedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (accountAgeDays <= 14) {
      riskScore += 8;
      signals.push("seller_new_account");
    }
    if (!params.seller.isVerified) {
      riskScore += 6;
      signals.push("seller_not_verified");
    }
    if (params.seller.complaintsCount >= 3) {
      riskScore += 12;
      signals.push("seller_many_complaints");
    }
    if (
      accountAgeDays >= 90 &&
      params.seller.isVerified &&
      params.seller.complaintsCount === 0 &&
      params.seller.sellerOrdersCount >= 3
    ) {
      riskScore -= 10;
      signals.push("trusted_seller_discount");
    }
    if (params.seller.complaintsCount >= 1 && params.seller.complaintsCount < 3) {
      riskScore += 6;
      signals.push("seller_has_complaints");
    }
  }

  const uniqueSignals = Array.from(new Set(signals));
  const normalizedRiskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
  const hasHardViolation = rule.hardSignals.length > 0;
  const hasCriticalHardViolation = rule.hardSignals.some((signal) =>
    [
      "sexual_explicit_text_detected",
      "violence_gore_text_detected",
      "drug_related_text_detected",
      "weapon_related_text_detected",
    ].includes(signal),
  );
  const hasContactAndPayment =
    uniqueSignals.includes("contact_details_detected") &&
    uniqueSignals.includes("offplatform_payment_detected");

  if (
    normalizedRiskScore >= 70 &&
    (hasCriticalHardViolation || hasContactAndPayment || hasHardViolation)
  ) {
    return {
      moderationStatus: "REJECTED",
      listingStatus: "INACTIVE",
      reason: "auto_reject_high_confidence_violation",
      riskScore: normalizedRiskScore,
      signals: uniqueSignals,
      aiUsed: false,
    };
  }

  if (normalizedRiskScore >= 30 || hasHardViolation) {
    return {
      moderationStatus: "PENDING",
      listingStatus: "MODERATION",
      reason: "manual_review_risk_score_gray_zone",
      riskScore: normalizedRiskScore,
      signals: uniqueSignals,
      aiUsed: false,
    };
  }

  return {
    moderationStatus: "APPROVED",
    listingStatus: "ACTIVE",
    reason: "auto_approve_no_flags",
    riskScore: normalizedRiskScore,
    signals: uniqueSignals,
    aiUsed: false,
  };
}
