"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const managementFieldClass =
  "min-h-11 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";

type FieldProps = ComponentPropsWithRef<"input"> & {
  label: string;
  name: string;
  hint?: string;
};

export function ManagementField({
  label,
  name,
  id,
  hint,
  className = "",
  ...props
}: FieldProps) {
  const fieldId = id ?? name;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        aria-describedby={hintId}
        className={`${managementFieldClass} ${className}`}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

type TextAreaProps = ComponentPropsWithRef<"textarea"> & {
  label: string;
  name: string;
  hint?: string;
  hideLabel?: boolean;
};

export function ManagementTextArea({
  label,
  name,
  id,
  hint,
  hideLabel = false,
  className = "",
  rows = 3,
  ...props
}: TextAreaProps) {
  const fieldId = id ?? name;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className={hideLabel ? "sr-only" : "text-sm font-medium text-ink"}
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        aria-describedby={hintId}
        className={`${managementFieldClass} ${className}`}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

type SelectProps = ComponentPropsWithRef<"select"> & {
  label: string;
  name: string;
  hint?: string;
  children: ReactNode;
};

export function ManagementSelect({
  label,
  name,
  id,
  hint,
  className = "",
  children,
  ...props
}: SelectProps) {
  const fieldId = id ?? name;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={fieldId}
        name={name}
        aria-describedby={hintId}
        className={`${managementFieldClass} ${className}`}
        {...props}
      >
        {children}
      </select>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ManagementCheckbox({
  label,
  name,
  id,
  defaultChecked,
}: {
  label: string;
  name: string;
  id?: string;
  defaultChecked?: boolean;
}) {
  const fieldId = id ?? name;

  return (
    <label
      htmlFor={fieldId}
      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-control bg-surface p-3 text-sm text-ink"
    >
      <input
        id={fieldId}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}

export function ManagementSubmitButton({
  children,
  tone = "primary",
  className = "",
}: {
  children: ReactNode;
  tone?: "primary" | "danger" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const tones = {
    primary: "bg-primary text-white hover:bg-ink",
    danger: "bg-status-negative-fg text-white hover:opacity-90",
    secondary: "border border-control bg-surface text-ink hover:bg-raised",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]} ${className}`}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-status-negative-fg/25 bg-status-negative-bg px-3 py-2 text-sm text-status-negative-fg"
    >
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="rounded-md border border-status-positive-fg/25 bg-status-positive-bg px-3 py-2 text-sm text-status-positive-fg"
    >
      {message}
    </p>
  );
}
