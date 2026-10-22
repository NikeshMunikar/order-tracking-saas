import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { trackingStatusLabel } from "@/lib/tracking";

// Customer-facing status tones. The wording always comes from
// trackingStatusLabel (the public vocabulary), never the internal
// orderStatusLabel, so the badge and the timeline stay consistent.
const STATUS_TONES: Record<string, StatusTone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  PREPARING: "info",
  READY: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "positive",
  CANCELLED: "negative",
};

export function TrackingStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={STATUS_TONES[status] ?? "neutral"}>
      {trackingStatusLabel(status)}
    </StatusBadge>
  );
}
