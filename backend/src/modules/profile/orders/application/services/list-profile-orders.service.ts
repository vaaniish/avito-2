import {
  mapBuyerOrder,
  mapDeliveryStatusToOrderStatus,
  uniqueNumbers,
  shouldSyncBuyerDeliveryStatus,
} from "../profile-orders.helpers";
import type {
  BuyerProfileOrderDto,
  ProfileOrdersDeliveryGatewayPort,
  ProfileOrdersRepositoryPort,
  ProfileOrdersServiceHelpers,
} from "../profile-orders.types";

export class ListProfileOrdersService {
  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly deliveryGateway: ProfileOrdersDeliveryGatewayPort,
    private readonly helpers: ProfileOrdersServiceHelpers,
  ) {}

  async execute(input: { buyerId: number }): Promise<BuyerProfileOrderDto[]> {
    let orders = await this.repository.findBuyerOrdersDetailed(input.buyerId);

    const candidates = orders.filter(shouldSyncBuyerDeliveryStatus);
    for (const order of candidates) {
      const tracking = await this.deliveryGateway.fetchTracking({
        provider: order.tracking_provider ?? "",
        trackingNumber: order.tracking_number ?? "",
      });
      if (!tracking) {
        continue;
      }

      const nextStatus = mapDeliveryStatusToOrderStatus(tracking.status);
      await this.repository.updateOrderDeliveryTracking({
        orderId: order.id,
        currentStatus: order.status,
        nextStatus,
        trackingUrl: tracking.trackingUrl ?? order.tracking_url,
        rawStatus: tracking.rawStatus ?? tracking.status,
      });
    }

    if (candidates.length > 0) {
      orders = await this.repository.findBuyerOrdersDetailed(input.buyerId);
    }

    const listingIds = orders.flatMap((order) =>
      order.items
        .map((item) => item.listing_id)
        .filter((listingId): listingId is number => typeof listingId === "number"),
    );
    const reviewedListingIds = await this.repository.findReviewedListingIds({
      authorId: input.buyerId,
      listingIds: uniqueNumbers(listingIds),
    });

    return orders.map((order) =>
      mapBuyerOrder(order, reviewedListingIds, this.helpers),
    );
  }
}
