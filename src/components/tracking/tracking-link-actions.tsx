"use client";

import { useState } from "react";

import { buildTrackingPath, buildTrackingUrl } from "@/lib/tracking";

/**
 * Copy/share controls for a public tracking link (MASTER_SPEC §18/§21,
 * docs/ui-ux.md §11): copy uses the Clipboard API, share uses the Web Share
 * API when the browser provides it and falls back to copying. No external
 * messaging integration and no capability detection at render time — the
 * share button simply does the right thing when pressed, so nothing depends on
 * `window` during server rendering.
 */
export function TrackingLinkActions({
  token,
  shareTitle,
}: {
  token: string;
  shareTitle?: string;
}) {
  const path = buildTrackingPath(token);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  async function copyLink(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(buildTrackingUrl(window.location.origin, token));
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <code className="break-all rounded-md border border-line bg-raised px-3 py-2 font-mono text-xs text-ink">
        {path}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            setCopyState((await copyLink()) ? "done" : "failed");
          }}
          className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Copy link
        </button>
        <button
          type="button"
          onClick={async () => {
            const url = buildTrackingUrl(window.location.origin, token);
            if (typeof navigator.share === "function") {
              try {
                await navigator.share({ title: shareTitle ?? "Order tracking", url });
                setShareState("shared");
                return;
              } catch (error) {
                // The user dismissing the share sheet is not a failure.
                if (error instanceof DOMException && error.name === "AbortError") {
                  return;
                }
              }
            }
            setShareState((await copyLink()) ? "copied" : "failed");
          }}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-ink"
        >
          Share
        </button>
        <div className="text-sm" aria-live="polite">
          {copyState === "done" && <span className="text-status-positive-fg">Copied.</span>}
          {copyState === "failed" && (
            <span className="text-status-negative-fg">
              Could not copy automatically — select the link and copy it manually.
            </span>
          )}
          {shareState === "shared" && (
            <span className="text-status-positive-fg">Link shared.</span>
          )}
          {shareState === "copied" && (
            <span className="text-status-positive-fg">
              Sharing is unavailable here — the link was copied instead.
            </span>
          )}
          {shareState === "failed" && (
            <span className="text-status-negative-fg">
              Could not share or copy automatically — select the link and copy it manually.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
