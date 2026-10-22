import {
  isOrderStatus,
  orderStatusLabel,
  type OrderStatusValue,
} from "@/lib/order-status";

const STATUS_STYLES: Record<OrderStatusValue, string> = {
  PENDING: "bg-status-warning-bg text-status-warning-fg",
  CONFIRMED: "bg-status-info-bg text-status-info-fg",
  PREPARING: "bg-status-info-bg text-status-info-fg",
  READY: "bg-status-info-bg text-status-info-fg",
  OUT_FOR_DELIVERY: "bg-status-info-bg text-status-info-fg",
  DELIVERED: "bg-status-positive-bg text-status-positive-fg",
  CANCELLED: "bg-status-negative-bg text-status-negative-fg",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const tone = isOrderStatus(status)
    ? STATUS_STYLES[status]
    : "bg-status-neutral-bg text-status-neutral-fg";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium leading-4 ${tone}`}
    >
      {orderStatusLabel(status)}
    </span>
  );
}
