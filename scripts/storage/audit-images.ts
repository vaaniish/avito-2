import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../../backend/src/lib/prisma";
import { decodeInlineImage } from "../../backend/src/lib/image-migration";

async function main(): Promise<void> {
type Source = "listing" | "draft";
type AuditEntry = { source: Source; reference: string; value: string };

function collectDraftImages(value: unknown, reference: string, output: AuditEntry[], depth = 0): void {
  if (depth > 8 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDraftImages(entry, `${reference}[${index}]`, output, depth + 1));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "image" || key === "url") && typeof nested === "string") {
      output.push({ source: "draft", reference: `${reference}.${key}`, value: nested });
    } else if (key === "images" && Array.isArray(nested)) {
      nested.forEach((entry, index) => {
        if (typeof entry === "string") output.push({ source: "draft", reference: `${reference}.images[${index}]`, value: entry });
        else collectDraftImages(entry, `${reference}.images[${index}]`, output, depth + 1);
      });
    } else {
      collectDraftImages(nested, `${reference}.${key}`, output, depth + 1);
    }
  }
}

const [listingImages, drafts] = await Promise.all([
  prisma.listingImage.findMany({
    select: { id: true, url: true, listing: { select: { public_id: true } } },
    orderBy: { id: "asc" },
  }),
  prisma.listingDraft.findMany({ select: { public_id: true, payload: true }, orderBy: { id: "asc" } }),
]);

const entries: AuditEntry[] = listingImages.map((image) => ({
  source: "listing",
  reference: `${image.listing.public_id}:${image.id}`,
  value: image.url,
}));
for (const draft of drafts) collectDraftImages(draft.payload, draft.public_id, entries);

const checksumCounts = new Map<string, number>();
const summary = {
  totalReferences: entries.length,
  listingReferences: entries.filter((entry) => entry.source === "listing").length,
  draftReferences: entries.filter((entry) => entry.source === "draft").length,
  inline: 0,
  https: 0,
  relativeSeed: 0,
  other: 0,
  inlineBytes: 0,
  invalidInline: 0,
};
const inlineByMime: Record<string, number> = {};

for (const entry of entries) {
  if (entry.value.startsWith("data:")) {
    const decoded = decodeInlineImage(entry.value);
    if (!decoded) {
      summary.invalidInline += 1;
      continue;
    }
    summary.inline += 1;
    summary.inlineBytes += decoded.bytes.byteLength;
    inlineByMime[decoded.contentType] = (inlineByMime[decoded.contentType] ?? 0) + 1;
    checksumCounts.set(decoded.checksumSha256, (checksumCounts.get(decoded.checksumSha256) ?? 0) + 1);
  } else if (entry.value.startsWith("https://")) summary.https += 1;
  else if (entry.value.startsWith("/media/seed/")) summary.relativeSeed += 1;
  else summary.other += 1;
}

const duplicates = [...checksumCounts.entries()]
  .filter(([, count]) => count > 1)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([checksumSha256, references]) => ({ checksumSha256, references }));
const report = {
  version: 1,
  summary,
  inlineByMime: Object.fromEntries(Object.entries(inlineByMime).sort(([left], [right]) => left.localeCompare(right))),
  duplicateGroups: duplicates,
  fingerprint: createHash("sha256").update(JSON.stringify({ summary, inlineByMime, duplicates })).digest("hex"),
};

await mkdir("artifacts/storage", { recursive: true });
await writeFile("artifacts/storage/image-audit.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
await prisma.$disconnect();
process.stdout.write(`[storage-audit] ${JSON.stringify(summary)}\n[storage-audit] report: artifacts/storage/image-audit.json\n`);
}

void main().catch(async (error) => {
  await prisma.$disconnect().catch(() => undefined);
  throw error;
});
