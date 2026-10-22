/** Payment statuses accepted by the order schema, in display order. */
export const PAYMENT_STATUSES = [
  "UNPAID",
  "PAID",
  "PARTIALLY_PAID",
  "REFUNDED",
] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  REFUNDED: "Refunded",
};

export function isPaymentStatus(value: string): value is PaymentStatusValue {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function paymentStatusLabel(value: string): string {
  return isPaymentStatus(value) ? PAYMENT_STATUS_LABELS[value] : value;
}
