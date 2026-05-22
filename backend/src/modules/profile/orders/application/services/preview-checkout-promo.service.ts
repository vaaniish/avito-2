import type {
  CheckoutPromoPreviewDto,
  CheckoutPromoPreviewInput,
  ProfileOrdersRepositoryPort,
} from "../../domain/profile-orders.types";
import { PromoEngineService } from "./promo-engine.service";

export class PreviewCheckoutPromoService {
  private readonly promoEngine: PromoEngineService;

  constructor(private readonly repository: ProfileOrdersRepositoryPort) {
    this.promoEngine = new PromoEngineService(repository);
  }

  async execute(input: CheckoutPromoPreviewInput): Promise<CheckoutPromoPreviewDto> {
    const evaluation = await this.promoEngine.evaluate({
      actorUserId: input.actorUserId,
      promoCode: input.promoCode,
      items: input.items,
    });

    return {
      success: true,
      code: evaluation.promo.code,
      discountPercent: evaluation.discountPercent,
      discountAmount: evaluation.discountAmount,
      subtotal: evaluation.subtotal,
      remainingActivations: evaluation.remainingActivations,
      message: evaluation.message,
    };
  }
}
