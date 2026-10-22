"use client";

import { useId, useState, type ComponentPropsWithRef } from "react";

import { managementFieldClass } from "@/components/ui/management-form";

/**
 * Password input with a show/hide toggle. The toggle only flips the input's
 * `type` between "password" and "text" in client state — it changes no value
 * and no validation, so the server-side validation rules are untouched. The
 * visible label and `name` stay exactly as before so labelled-field queries
 * keep working.
 */
export function PasswordField({
  label,
  name,
  id,
  hint,
  className = "",
  ...props
}: ComponentPropsWithRef<"input"> & {
  label: string;
  name: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          aria-describedby={hintId}
          className={`${managementFieldClass} pr-16 ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-controls={fieldId}
          aria-label={visible ? "Hide characters" : "Show characters"}
          className="absolute inset-y-1 right-1 inline-flex min-w-14 items-center justify-center rounded border border-control bg-raised px-2 text-xs font-medium text-ink transition-colors hover:bg-surface"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
