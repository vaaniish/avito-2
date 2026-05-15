import type { PrismaClient } from "@prisma/client";

export class AdminCatalogReferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findItemByPublicId(publicId: string) {
    return this.prisma.catalogItem.findUnique({
      where: { public_id: publicId },
      select: { id: true, public_id: true, name: true },
    });
  }

  listReferenceBrands(itemPublicId: string) {
    return this.prisma.catalogReferenceBrand.findMany({
      where: { item: { public_id: itemPublicId } },
      orderBy: [{ order_index: "asc" }, { name: "asc" }, { id: "asc" }],
      include: {
        models: {
          orderBy: [{ order_index: "asc" }, { name: "asc" }, { id: "asc" }],
          include: {
            variants: {
              orderBy: [{ order_index: "asc" }, { title: "asc" }, { id: "asc" }],
              include: {
                characteristics: {
                  orderBy: [{ order_index: "asc" }, { id: "asc" }],
                },
              },
            },
          },
        },
      },
    });
  }

  createBrand(params: {
    itemPublicId: string;
    name: string;
    makePublicId: (prefix: string) => string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.findUnique({
        where: { public_id: params.itemPublicId },
        select: { id: true },
      });
      if (!item) throw new Error("Вид товара не найден");

      return tx.catalogReferenceBrand.create({
        data: {
          public_id: params.makePublicId("CRB"),
          item_id: item.id,
          name: params.name,
          order_index:
            (await tx.catalogReferenceBrand.count({
              where: { item_id: item.id },
            })) + 1,
        },
      });
    });
  }

  updateBrand(publicId: string, name: string) {
    return this.prisma.catalogReferenceBrand.update({
      where: { public_id: publicId },
      data: { name },
    });
  }

  deleteBrand(publicId: string) {
    return this.prisma.catalogReferenceBrand.delete({
      where: { public_id: publicId },
    });
  }

  createModel(params: {
    brandPublicId: string;
    name: string;
    makePublicId: (prefix: string) => string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const brand = await tx.catalogReferenceBrand.findUnique({
        where: { public_id: params.brandPublicId },
        select: { id: true },
      });
      if (!brand) throw new Error("Бренд не найден");

      return tx.catalogReferenceModel.create({
        data: {
          public_id: params.makePublicId("CRM"),
          brand_id: brand.id,
          name: params.name,
          order_index:
            (await tx.catalogReferenceModel.count({
              where: { brand_id: brand.id },
            })) + 1,
        },
      });
    });
  }

  updateModel(publicId: string, name: string) {
    return this.prisma.catalogReferenceModel.update({
      where: { public_id: publicId },
      data: { name },
    });
  }

  deleteModel(publicId: string) {
    return this.prisma.catalogReferenceModel.delete({
      where: { public_id: publicId },
    });
  }

  createProduct(params: {
    modelPublicId: string;
    characteristics: Array<{ label: string; value: string }>;
    makePublicId: (prefix: string) => string;
    makeCharacteristicKey: (label: string) => string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.catalogReferenceModel.findUnique({
        where: { public_id: params.modelPublicId },
        select: { id: true, name: true },
      });
      if (!model) throw new Error("Модель не найдена");

      const variant =
        (await tx.catalogReferenceVariant.findFirst({
          where: { model_id: model.id },
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
        })) ??
        (await tx.catalogReferenceVariant.create({
          data: {
            public_id: params.makePublicId("CRV"),
            model_id: model.id,
            title: model.name,
            order_index:
              (await tx.catalogReferenceVariant.count({
                where: { model_id: model.id },
              })) + 1,
          },
        }));

      if (params.characteristics.length > 0) {
        const existingCharacteristics =
          await tx.catalogReferenceCharacteristic.findMany({
            where: { variant: { model_id: model.id } },
            select: { label: true },
          });
        const existingKeys = new Set(
          existingCharacteristics.map((characteristic) =>
            params.makeCharacteristicKey(characteristic.label),
          ),
        );
        const duplicateExistingCharacteristic = params.characteristics.find(
          (characteristic) =>
            existingKeys.has(params.makeCharacteristicKey(characteristic.label)),
        );
        if (duplicateExistingCharacteristic) {
          throw new Error(
            `Характеристика «${duplicateExistingCharacteristic.label}» уже добавлена`,
          );
        }

        const currentCount = await tx.catalogReferenceCharacteristic.count({
          where: { variant_id: variant.id },
        });
        await tx.catalogReferenceCharacteristic.createMany({
          data: params.characteristics.map((characteristic, index) => ({
            variant_id: variant.id,
            key: params.makeCharacteristicKey(characteristic.label),
            label: characteristic.label,
            value: characteristic.value,
            raw_value: characteristic.value,
            source_group_index: index,
            source: "admin",
            order_index: currentCount + index + 1,
          })),
        });
      }

      return variant;
    });
  }

  updateProduct(publicId: string, title: string) {
    return this.prisma.catalogReferenceVariant.update({
      where: { public_id: publicId },
      data: { title },
    });
  }

  deleteCharacteristic(id: number) {
    return this.prisma.catalogReferenceCharacteristic.delete({ where: { id } });
  }

  deleteProduct(publicId: string) {
    return this.prisma.catalogReferenceVariant.delete({
      where: { public_id: publicId },
    });
  }
}
