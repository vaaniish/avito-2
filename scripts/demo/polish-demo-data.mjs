import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const parsedDatabaseUrl = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname)) {
  throw new Error("Demo polish is allowed only for a local database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const listingRemovedText =
  "Объявление снято с продажи после рассмотрения связанной жалобы";

const catalogPayload = {
  categoryName: "Электроника",
  subcategoryName: "Носимая электроника",
  proposedItem: "Смарт-часы и браслеты",
  brand: "Amazfit",
  model: "GTR 4",
  importantAttributes:
    'Экран: AMOLED 1.43"; Навигация: GPS; Защита: 5 ATM; Автономность: до 14 дней; Датчики: пульс, SpO2, сон',
  link: "https://amazfit.example.com/gtr-4",
  email: "catalog@techpoint.example.com",
  photoName:
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
  photoLabel: "Фото товара и упаковки",
  comment:
    "Покупатели часто ищут умные часы отдельным типом товара, сейчас продавцы выбирают неподходящие категории. Нужны поля для автономности, влагозащиты и датчиков здоровья.",
};

const additionalCatalogPayloads = [
  {
    publicId: "CSG-005",
    payload: {
      categoryName: "Техника для дома",
      subcategoryName: "Роботы-пылесосы",
      proposedItem: "Роботы-пылесосы с самоочисткой",
      brand: "Roborock",
      model: "S8 MaxV Ultra",
      importantAttributes:
        "Уровень шума: до 67 дБ; Станция: самоочистка и сушка; Навигация: лидар; Влажная уборка: есть",
      email: "assortment@homecomfort.example.com",
      comment:
        "Покупатели регулярно уточняют уровень шума и тип станции, сейчас эти признаки не выделены в справочнике.",
    },
  },
  {
    publicId: "CSG-008",
    payload: {
      categoryName: "Электроника",
      subcategoryName: "Носимая электроника",
      proposedItem: "Смарт-часы",
      brand: "Apple",
      model: "Watch Series 9 45mm",
      importantAttributes:
        "Цвет корпуса: Titanium Graphite; Размер: 45 мм; Связь: GPS; Ремешок: sport band",
      email: "catalog@mobileexpert.example.com",
      comment:
        "Цвет Titanium Graphite регулярно встречается в поставках, но отсутствует среди нормализованных значений.",
    },
  },
];

const questionUpdates = [
  [
    "QST-001",
    "Товар в наличии именно в той комплектации, что на фото?",
    "Да, комплект соответствует фото и описанию в карточке.",
  ],
  [
    "QST-002",
    "Можно оформить доставку через безопасную сделку?",
    "Да, доставка и оплата проходят через платформу.",
  ],
  [
    "QST-003",
    "Есть ли гарантия продавца и документы после покупки?",
    "Да, гарантия продавца 14 дней, документы передадим вместе с товаром.",
  ],
  [
    "QST-004",
    "Можете добавить фото комплекта и серийной наклейки?",
    null,
  ],
];

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const catalogSuggestion = await tx.catalogSuggestion.updateMany({
      where: { public_id: "CSG-001" },
      data: {
        status: "PENDING",
        raw_value: "Смарт-часы и браслеты",
        normalized_value: "смарт-часы и браслеты",
        reason:
          "Покупатели часто ищут умные часы отдельным типом товара, а продавцы вынуждены выбирать неподходящие категории",
        payload: catalogPayload,
        admin_note: null,
        reviewed_by_id: null,
        reviewed_at: null,
      },
    });
    for (const suggestion of additionalCatalogPayloads) {
      await tx.catalogSuggestion.updateMany({
        where: { public_id: suggestion.publicId },
        data: { payload: suggestion.payload },
      });
    }

    let questions = 0;
    for (const [publicId, question, answer] of questionUpdates) {
      const update = await tx.listingQuestion.updateMany({
        where: { public_id: publicId },
        data: {
          question,
          answer,
          status: answer ? "ANSWERED" : "PENDING",
          answered_at: answer ? new Date() : null,
        },
      });
      questions += update.count;
    }

    const orders = await Promise.all([
      tx.marketOrder.updateMany({
        where: { public_id: "ORD-1009" },
        data: { delivery_address: "Москва, Ленинградский проспект 37" },
      }),
      tx.marketOrder.updateMany({
        where: { public_id: "ORD-1010" },
        data: { delivery_address: "Москва, Мясницкая 24" },
      }),
    ]);

    const listing = await tx.marketplaceListing.findUnique({
      where: { public_id: "LST-026" },
      select: { id: true },
    });
    const admin = await tx.appUser.findUnique({
      where: { public_id: "ADM-001" },
      select: { id: true },
    });

    let relatedComplaints = 0;
    if (listing && admin) {
      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: "INACTIVE", moderation_status: "REJECTED" },
      });
      const complaints = await tx.complaint.updateMany({
        where: {
          listing_id: listing.id,
          public_id: { not: "CMP-001" },
          status: { in: ["NEW", "PENDING", "APPROVED"] },
        },
        data: {
          status: "REJECTED",
          checked_at: new Date(),
          checked_by_id: admin.id,
          action_taken: listingRemovedText,
        },
      });
      relatedComplaints = complaints.count;

      const serviceComplaints = await tx.complaint.findMany({
        where: { listing_id: listing.id, action_taken: listingRemovedText },
        select: { id: true },
      });
      await tx.complaintEvent.updateMany({
        where: {
          complaint_id: { in: serviceComplaints.map((complaint) => complaint.id) },
          event_type: { in: ["approved", "rejected", "triaged"] },
        },
        data: {
          event_type: "rejected",
          to_status: "REJECTED",
          note: "Объявление уже снято после подтверждения связанной жалобы.",
          metadata: {
            actorRole: "admin",
            resolutionKind: "related_listing_removed_after_approval",
          },
        },
      });
    }

    const approvedComplaint = await tx.complaint.findUnique({
      where: { public_id: "CMP-009" },
      select: { id: true },
    });
    if (approvedComplaint) {
      await tx.complaintSanction.updateMany({
        where: { public_id: "CSN-004" },
        data: {
          complaint_id: approvedComplaint.id,
          reason: "Повторное использование чужих фото и признаки мошенничества",
        },
      });
    }

    const partner = await tx.partnershipRequest.updateMany({
      where: { public_id: "PRQ-002" },
      data: {
        name: "ООО Север Трейд",
        email: "north.trade@example.com",
        contact: "+79003000102",
        link: "https://north.example.com",
        category: "Смартфоны и фототехника",
        inn: "7702000001",
        geography: "Москва",
        social_profile: "@north_trade",
        credibility:
          "Работают с 2019 года, есть сайт, сервисный номер и витрина на внешних площадках",
        why_us:
          "Нужен канал продаж с безопасной сделкой и понятными правилами гарантии",
      },
    });

    await tx.kycRequest.updateMany({
      where: { public_id: "KYC-001" },
      data: {
        documents: "Учредительные документы и выписка ЕГРЮЛ.pdf",
        notes: "Реквизиты, адрес и полномочия представителя подтверждены.",
      },
    });

    return {
      catalogSuggestions: catalogSuggestion.count,
      questions,
      orders: orders.reduce((sum, update) => sum + update.count, 0),
      relatedComplaints,
      partnerRequests: partner.count,
    };
  });

  const duplicateApprovals = await prisma.complaint.groupBy({
    by: ["listing_id"],
    where: { status: "APPROVED" },
    _count: { _all: true },
    having: { listing_id: { _count: { gt: 1 } } },
  });
  if (duplicateApprovals.length > 0) {
    throw new Error(
      `Invariant violation: ${duplicateApprovals.length} listings have multiple approved complaints`,
    );
  }

  console.log("[demo-polish] updated", result);
  console.log("[demo-polish] approved complaint invariant: OK");
}

main()
  .catch((error) => {
    console.error("[demo-polish] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
