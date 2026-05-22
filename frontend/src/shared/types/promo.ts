export type AppliedPromo = {
  code: string;
  discountAmount: number;
  discountPercent: number | null;
  subtotal: number;
  remainingActivations: number;
  message: string;
};
