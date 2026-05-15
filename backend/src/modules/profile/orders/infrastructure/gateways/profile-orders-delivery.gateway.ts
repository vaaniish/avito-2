import {
  fetchTrackingStatus,
  type DeliveryExternalStatus,
} from "../../../../partner/order-delivery";

export type DeliveryTrackingResult = {
  status: DeliveryExternalStatus;
  trackingUrl: string | null;
  rawStatus: string;
} | null;

export class ProfileOrdersDeliveryGateway {
  async fetchTracking(params: {
    provider: string;
    trackingNumber: string;
  }): Promise<DeliveryTrackingResult> {
    const tracking = await fetchTrackingStatus(params);
    if (!tracking) {
      return null;
    }

    return {
      status: tracking.status,
      trackingUrl: tracking.trackingUrl ?? null,
      rawStatus: tracking.rawStatus ?? tracking.status,
    };
  }
}
