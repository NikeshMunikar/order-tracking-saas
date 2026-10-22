import type { ReactNode } from "react";

export type StatusTone = "positive" | "warning" | "negative" | "info" | "neutral";

const STATUS_TONES: Record<StatusTone, string> = {
  positive: "bg-status-positive-bg text-status-positive-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  negative: "bg-status-negative-bg text-status-negative-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium leading-4 ${STATUS_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
