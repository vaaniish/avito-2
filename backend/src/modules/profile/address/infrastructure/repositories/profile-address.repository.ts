import type { PrismaClient } from "@prisma/client";
import type {
  ProfileAddressRecord,
  ProfileAddressRepositoryPort,
  SaveProfileAddressInput,
} from "../../domain/profile-address.types";

export class ProfileAddressRepository implements ProfileAddressRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  listByUserId(userId: number): Promise<ProfileAddressRecord[]> {
    return this.prisma.userAddress.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    });
  }

  countByUserId(userId: number): Promise<number> {
    return this.prisma.userAddress.count({
      where: { user_id: userId },
    });
  }

  findByIdForUser(params: {
    id: number;
    userId: number;
  }): Promise<ProfileAddressRecord | null> {
    return this.prisma.userAddress.findFirst({
      where: { id: params.id, user_id: params.userId },
    });
  }

  async createForUser(params: {
    userId: number;
    data: SaveProfileAddressInput;
    isDefault: boolean;
  }): Promise<ProfileAddressRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (params.isDefault) {
        await tx.userAddress.updateMany({
          where: { user_id: params.userId },
          data: { is_default: false },
        });
      }

      return tx.userAddress.create({
        data: {
          user_id: params.userId,
          label: params.data.label,
          full_address: params.data.fullAddress,
          region: params.data.region,
          city: params.data.city,
          street: params.data.street,
          house: params.data.house,
          apartment: params.data.apartment,
          entrance: params.data.entrance,
          postal_code: params.data.postalCode,
          lat: params.data.lat,
          lon: params.data.lon,
          is_default: params.isDefault,
        },
      });
    });
  }

  async updateForUser(params: {
    id: number;
    userId: number;
    data: Partial<SaveProfileAddressInput> & {
      label?: string;
      fullAddress?: string;
      region?: string;
      city?: string;
      street?: string;
      house?: string;
      apartment?: string;
      entrance?: string;
      postalCode?: string;
      lat?: number;
      lon?: number;
    };
    isDefault?: boolean;
  }): Promise<ProfileAddressRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (params.isDefault) {
        await tx.userAddress.updateMany({
          where: { user_id: params.userId },
          data: { is_default: false },
        });
      }

      return tx.userAddress.update({
        where: { id: params.id },
        data: {
          label: params.data.label,
          full_address: params.data.fullAddress,
          region: params.data.region,
          city: params.data.city,
          street: params.data.street,
          house: params.data.house,
          apartment: params.data.apartment,
          entrance: params.data.entrance,
          postal_code: params.data.postalCode,
          lat: params.data.lat,
          lon: params.data.lon,
          is_default: params.isDefault,
        },
      });
    });
  }

  deleteForUser(params: { id: number; userId: number }): Promise<void> {
    return this.prisma.userAddress
      .delete({
        where: { id: params.id },
      })
      .then(() => undefined);
  }

  async setDefaultForUser(params: {
    id: number;
    userId: number;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userAddress.updateMany({
        where: { user_id: params.userId },
        data: { is_default: false },
      }),
      this.prisma.userAddress.update({
        where: { id: params.id },
        data: { is_default: true },
      }),
    ]);
  }
}
