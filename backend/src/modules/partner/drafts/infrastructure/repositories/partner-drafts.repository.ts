import { Prisma, type PrismaClient } from "@prisma/client";
import { makePublicId } from "../../../common/domain/ids";
import { formatDraftPublicId } from "../../domain/partner-drafts.helpers";
import type { PartnerDraftsRepositoryPort } from "../../domain/partner-drafts.types";

export class PartnerDraftsRepository implements PartnerDraftsRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  listDrafts(params: { sellerId: number; type: "PRODUCT" }) {
    return this.prisma.listingDraft.findMany({
      where: {
        seller_id: params.sellerId,
        type: params.type,
      },
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      take: 3,
    });
  }

  async createDraft(params: {
    sellerId: number;
    type: "PRODUCT";
    title: string | null;
    categoryId: number | null;
    subcategoryId: number | null;
    itemId: number | null;
    payload: Record<string, unknown>;
    currentScreen: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.listingDraft.create({
        data: {
          public_id: makePublicId("DRFTMP"),
          seller_id: params.sellerId,
          type: params.type,
          title: params.title,
          category_id: params.categoryId,
          subcategory_id: params.subcategoryId,
          item_id: params.itemId,
          payload: params.payload as Prisma.InputJsonObject,
          current_screen: params.currentScreen,
        },
      });

      const updated = await tx.listingDraft.update({
        where: { id: draft.id },
        data: {
          public_id: formatDraftPublicId(draft.id),
        },
      });

      const staleDrafts = await tx.listingDraft.findMany({
        where: {
          seller_id: params.sellerId,
          type: params.type,
          id: { not: updated.id },
        },
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        skip: 2,
        select: { id: true },
      });

      if (staleDrafts.length > 0) {
        await tx.listingDraft.deleteMany({
          where: { id: { in: staleDrafts.map((draftRow) => draftRow.id) } },
        });
      }

      return updated;
    });
  }

  findDraft(params: { sellerId: number; publicId: string }) {
    return this.prisma.listingDraft.findFirst({
      where: {
        public_id: params.publicId,
        seller_id: params.sellerId,
      },
    });
  }

  updateDraft(params: {
    draftId: number;
    data: {
      type?: "PRODUCT";
      title?: string | null;
      categoryId?: number | null;
      subcategoryId?: number | null;
      itemId?: number | null;
      payload?: Record<string, unknown>;
      currentScreen?: string;
    };
  }) {
    return this.prisma.listingDraft.update({
      where: { id: params.draftId },
      data: {
        type: params.data.type,
        title: params.data.title,
        category_id: params.data.categoryId,
        subcategory_id: params.data.subcategoryId,
        item_id: params.data.itemId,
        payload: params.data.payload as Prisma.InputJsonObject | undefined,
        current_screen: params.data.currentScreen,
      },
    });
  }

  async deleteDraft(draftId: number): Promise<void> {
    await this.prisma.listingDraft.delete({
      where: { id: draftId },
    });
  }
}
