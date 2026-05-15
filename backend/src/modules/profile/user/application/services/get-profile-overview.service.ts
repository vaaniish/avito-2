import {
  assertProfileUserExists,
  buildProfileOverviewDto,
  type ProfileOverviewUser,
  type ProfileUserViewHelpers,
} from "../../domain/profile-user.helpers";
import type { ProfileUserRepository } from "../../infrastructure/repositories/profile-user.repository";

export class GetProfileOverviewService {
  constructor(
    private readonly repository: ProfileUserRepository,
    private readonly helpers: ProfileUserViewHelpers,
  ) {}

  async execute(userId: number) {
    const user = assertProfileUserExists(
      (await this.repository.loadOverviewUser(userId)) as ProfileOverviewUser | null,
    );

    const listingIds = user.orders_as_buyer.flatMap((order) =>
      order.items
        .map((item) => item.listing_id)
        .filter((listingId): listingId is number => typeof listingId === "number"),
    );
    const reviewedListingIds = new Set(
      (await this.repository.findReviewedListingIds(userId, listingIds)).map(
        (review) => review.listing_id,
      ),
    );

    return buildProfileOverviewDto(user, reviewedListingIds, this.helpers);
  }
}
