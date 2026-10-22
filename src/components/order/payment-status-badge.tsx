import {
  isPaymentStatus,
  paymentStatusLabel,
  type PaymentStatusValue,
} from "@/lib/payment-status";

const PAYMENT_STATUS_STYLES: Record<PaymentStatusValue, string> = {
  UNPAID: "bg-status-warning-bg text-status-warning-fg",
  PAID: "bg-status-positive-bg text-status-positive-fg",
  PARTIALLY_PAID: "bg-status-info-bg text-status-info-fg",
  REFUNDED: "bg-status-neutral-bg text-status-neutral-fg",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const tone = isPaymentStatus(status)
    ? PAYMENT_STATUS_STYLES[status]
    : "bg-status-neutral-bg text-status-neutral-fg";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium leading-4 ${tone}`}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}
