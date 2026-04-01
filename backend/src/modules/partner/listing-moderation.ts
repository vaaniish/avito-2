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
  hasAutoFlag: boolean;
  signals: string[];
};

type AiEvaluation = {
  riskScore: number;
  hardReject: boolean;
  needsReview: boolean;
  signals: string[];
};

const CONTACT_PATTERNS: RegExp[] = [
  /(t(?:elegram)?|tg|telega|телеграм|тг)/iu,
  /(whatsapp|wa|ватсап|вотсап)/iu,
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
}): RuleEvaluation {
  const bodyText = normalizeText(
    `${params.title} ${params.description} ${params.category}`,
  );
  const imageText = normalizeText(params.imageUrl ?? "");
  const signals: string[] = [];
  let riskScore = 0;
  let hasAutoFlag = false;

  const contactHits = countPatternMatches(bodyText, CONTACT_PATTERNS);
  const offplatformHits = countPatternMatches(bodyText, OFFPLATFORM_PATTERNS);
  const profanityHits = countPatternMatches(bodyText, PROFANITY_PATTERNS);
  const explicitHits = countPatternMatches(bodyText, EXPLICIT_PATTERNS);
  const violenceHits = countPatternMatches(bodyText, VIOLENCE_PATTERNS);
  const spamHits = countPatternMatches(bodyText, SPAM_PATTERNS);
  const drugHits = countPatternMatches(bodyText, DRUG_PATTERNS);
  const weaponHits = countPatternMatches(bodyText, WEAPON_PATTERNS);
  const imageWordHits = countPatternMatches(imageText, IMAGE_RISKY_WORDS);

  if (contactHits > 0) {
    signals.push("contact_details_detected");
    riskScore += 35;
    hasAutoFlag = true;
  }

  if (offplatformHits > 0) {
    signals.push("offplatform_payment_detected");
    riskScore += 45;
    hasAutoFlag = true;
  }

  if (explicitHits > 0) {
    signals.push("sexual_explicit_text_detected");
    riskScore += 55;
    hasAutoFlag = true;
  }

  if (violenceHits > 0) {
    signals.push("violence_gore_text_detected");
    riskScore += 45;
    hasAutoFlag = true;
  }

  if (drugHits > 0) {
    signals.push("drug_related_text_detected");
    riskScore += 40;
    hasAutoFlag = true;
  }

  if (weaponHits > 0) {
    signals.push("weapon_related_text_detected");
    riskScore += 30;
    hasAutoFlag = true;
  }

  if (profanityHits > 0) {
    signals.push("profanity_detected");
    riskScore += 20;
    hasAutoFlag = true;
  }

  if (spamHits > 0) {
    signals.push("spam_markers_detected");
    riskScore += 15;
  }

  if (imageWordHits > 0) {
    signals.push("suspicious_image_url_markers");
    riskScore += 20;
  }

  if (params.price < 50 || params.price > 10_000_000) {
    signals.push("price_outlier");
    riskScore += 12;
  }

  if (params.title.trim().length < 6) {
    signals.push("too_short_title");
    riskScore += 10;
  }

  if (params.description.trim().length < 20) {
    signals.push("too_short_description");
    riskScore += 10;
  }

  return {
    riskScore: Math.min(100, riskScore),
    hasAutoFlag,
    signals,
  };
}

function parseJsonObjectFromText(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/u);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch (_nestedError) {
      return null;
    }
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageBase64(
  imageUrl: string,
  maxBytes: number,
): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(
      imageUrl,
      { method: "GET" },
      7_500,
    );
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 0 && contentLength > maxBytes) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > maxBytes) return null;
    return data.toString("base64");
  } catch (_error) {
    return null;
  }
}

function parseOllamaRiskPayload(raw: string): AiEvaluation | null {
  const payload = parseJsonObjectFromText(raw);
  if (!payload) return null;

  const riskRaw = Number(payload.risk_score ?? payload.risk ?? 0);
  const hardReject = Boolean(payload.block ?? payload.hard_reject ?? false);
  const needsReview = Boolean(payload.review ?? payload.needs_review ?? false);
  const labelsRaw = Array.isArray(payload.labels) ? payload.labels : [];
  const reasonsRaw = Array.isArray(payload.reasons) ? payload.reasons : [];

  const labels = labelsRaw
    .filter((item) => typeof item === "string")
    .map((item) => `ai_label:${item}`);
  const reasons = reasonsRaw
    .filter((item) => typeof item === "string")
    .map((item) => `ai_reason:${item}`);

  return {
    riskScore: Number.isFinite(riskRaw) ? Math.max(0, Math.min(100, riskRaw)) : 0,
    hardReject,
    needsReview,
    signals: [...labels, ...reasons],
  };
}

async function runFreeAiModeration(params: {
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
}): Promise<AiEvaluation | null> {
  const provider = (process.env.MODERATION_AI_PROVIDER ?? "none")
    .trim()
    .toLowerCase();
  if (provider !== "ollama") {
    return null;
  }

  const baseUrl =
    process.env.MODERATION_AI_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const textModel =
    process.env.MODERATION_AI_TEXT_MODEL?.trim() || "qwen2.5:3b-instruct";
  const visionModel =
    process.env.MODERATION_AI_VISION_MODEL?.trim() || "llava:7b";
  const imageAiEnabled = (process.env.MODERATION_AI_IMAGE_ENABLED ?? "false")
    .trim()
    .toLowerCase() === "true";
  const maxImageBytes = Number(process.env.MODERATION_AI_MAX_IMAGE_BYTES ?? "5242880");
  const textTimeoutMs = Number(process.env.MODERATION_AI_TEXT_TIMEOUT_MS ?? "8000");
  const imageTimeoutMs = Number(process.env.MODERATION_AI_IMAGE_TIMEOUT_MS ?? "12000");

  const textPrompt = [
    "You are a strict marketplace moderator.",
    "Return JSON only with keys: risk_score (0..100), block (bool), review (bool), labels (string[]), reasons (string[]).",
    "Detect: explicit sexual, nudity, gore, hate, scam, external contacts, off-platform payment, spam, prohibited content.",
    `Title: ${params.title}`,
    `Description: ${params.description}`,
    `Category: ${params.category}`,
    `Price: ${params.price}`,
  ].join("\n");

  try {
    const textResponse = await fetchWithTimeout(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: textModel,
          stream: false,
          format: "json",
          messages: [
            {
              role: "user",
              content: textPrompt,
            },
          ],
        }),
      },
      Number.isFinite(textTimeoutMs) ? Math.max(2_000, textTimeoutMs) : 8_000,
    );

    if (!textResponse.ok) {
      return null;
    }

    const textPayload = (await textResponse.json()) as {
      message?: { content?: string };
    };
    const textEval = parseOllamaRiskPayload(textPayload.message?.content ?? "");
    if (!textEval) {
      return null;
    }

    if (!imageAiEnabled || !params.imageUrl) {
      return textEval;
    }

    const imageBase64 = await fetchImageBase64(params.imageUrl, maxImageBytes);
    if (!imageBase64) {
      return textEval;
    }

    const imagePrompt = [
      "You are a strict image moderator for marketplace listings.",
      "Return JSON only with keys: risk_score (0..100), block (bool), review (bool), labels (string[]), reasons (string[]).",
      "Focus on nudity, sexual content, minors, gore, violence, offensive symbols, illegal items, spam text in image.",
    ].join("\n");

    const imageResponse = await fetchWithTimeout(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: visionModel,
          stream: false,
          format: "json",
          messages: [
            {
              role: "user",
              content: imagePrompt,
              images: [imageBase64],
            },
          ],
        }),
      },
      Number.isFinite(imageTimeoutMs) ? Math.max(4_000, imageTimeoutMs) : 12_000,
    );

    if (!imageResponse.ok) {
      return textEval;
    }

    const imagePayload = (await imageResponse.json()) as {
      message?: { content?: string };
    };
    const imageEval = parseOllamaRiskPayload(imagePayload.message?.content ?? "");
    if (!imageEval) {
      return textEval;
    }

    return {
      riskScore: Math.max(textEval.riskScore, imageEval.riskScore),
      hardReject: textEval.hardReject || imageEval.hardReject,
      needsReview: textEval.needsReview || imageEval.needsReview,
      signals: [...textEval.signals, ...imageEval.signals],
    };
  } catch (_error) {
    return null;
  }
}

export async function evaluateListingModeration(params: {
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  seller: SellerModerationContext | null;
}): Promise<AutoModerationDecision> {
  const rule = evaluateRules({
    title: params.title,
    description: params.description,
    category: params.category,
    price: params.price,
    imageUrl: params.imageUrl,
  });
  const ai = await runFreeAiModeration({
    title: params.title,
    description: params.description,
    category: params.category,
    price: params.price,
    imageUrl: params.imageUrl,
  });

  let riskScore = rule.riskScore;
  const signals = [...rule.signals];
  const autoFlagged = rule.hasAutoFlag;

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
  }

  let aiFlagged = false;
  const aiFlagRiskThresholdRaw = Number(
    process.env.MODERATION_AI_FLAG_RISK_THRESHOLD ?? "65",
  );
  const aiHardRiskThresholdRaw = Number(
    process.env.MODERATION_AI_HARD_RISK_THRESHOLD ?? "85",
  );
  const aiFlagRiskThreshold = Number.isFinite(aiFlagRiskThresholdRaw)
    ? Math.max(0, Math.min(100, Math.round(aiFlagRiskThresholdRaw)))
    : 65;
  const aiHardRiskThreshold = Number.isFinite(aiHardRiskThresholdRaw)
    ? Math.max(0, Math.min(100, Math.round(aiHardRiskThresholdRaw)))
    : 85;

  if (ai) {
    riskScore = Math.round(riskScore * 0.6 + ai.riskScore * 0.4);
    aiFlagged =
      ai.hardReject ||
      ai.riskScore >= aiHardRiskThreshold ||
      (ai.needsReview && ai.riskScore >= aiFlagRiskThreshold) ||
      (ai.riskScore >= aiFlagRiskThreshold && autoFlagged);
    signals.push(...ai.signals);
  } else {
    signals.push("ai_not_available_fallback_rules");
  }

  const uniqueSignals = Array.from(new Set(signals));

  // Any deterministic marker, or strong AI signal, sends listing to manual review.
  if (autoFlagged || aiFlagged) {
    return {
      moderationStatus: "PENDING",
      listingStatus: "MODERATION",
      reason: "manual_review_flagged_by_ai_or_rules",
      riskScore: Math.min(100, riskScore),
      signals: uniqueSignals,
      aiUsed: Boolean(ai),
    };
  }

  return {
    moderationStatus: "APPROVED",
    listingStatus: "ACTIVE",
    reason: "auto_approve_no_flags",
    riskScore: Math.min(100, riskScore),
    signals: uniqueSignals,
    aiUsed: Boolean(ai),
  };
}
