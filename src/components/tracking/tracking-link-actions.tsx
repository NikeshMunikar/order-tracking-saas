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
      <code className="break-all rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-800">
        {path}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            setCopyState((await copyLink()) ? "done" : "failed");
          }}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
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
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Share
        </button>
        {copyState === "done" && <span className="text-sm text-green-700">Copied.</span>}
        {copyState === "failed" && (
          <span className="text-sm text-red-600">
            Could not copy automatically — select the link and copy it manually.
          </span>
        )}
        {shareState === "shared" && <span className="text-sm text-green-700">Link shared.</span>}
        {shareState === "copied" && (
          <span className="text-sm text-green-700">
            Sharing is unavailable here — the link was copied instead.
          </span>
        )}
        {shareState === "failed" && (
          <span className="text-sm text-red-600">
            Could not share or copy automatically — select the link and copy it manually.
          </span>
        )}
      </div>
    </div>
  );
}
