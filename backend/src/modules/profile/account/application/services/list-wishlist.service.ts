import { assertListingExists, mapWishlistItems, type WishlistViewHelpers } from "../../domain/profile-account.helpers";
import type { ProfileWishlistRepository } from "../../infrastructure/repositories/profile-wishlist.repository";

export class ListWishlistService {
  constructor(
    private readonly repository: ProfileWishlistRepository,
    private readonly helpers: WishlistViewHelpers,
  ) {}

  async execute(userId: number) {
    return mapWishlistItems(await this.repository.listWishlist(userId), this.helpers);
  }
}

export class AddWishlistItemService {
  constructor(private readonly repository: ProfileWishlistRepository) {}

  async execute(input: { userId: number; listingPublicId: string }) {
    const listing = assertListingExists(
      await this.repository.findListingByPublicId(input.listingPublicId),
    );
    await this.repository.addWishlistItem(input.userId, listing.id);
    return { success: true };
  }
}

export class RemoveWishlistItemService {
  constructor(private readonly repository: ProfileWishlistRepository) {}

  async execute(input: { userId: number; listingPublicId: string }) {
    const listing = assertListingExists(
      await this.repository.findListingByPublicId(input.listingPublicId),
    );
    await this.repository.removeWishlistItem(input.userId, listing.id);
    return { success: true };
  }
}
