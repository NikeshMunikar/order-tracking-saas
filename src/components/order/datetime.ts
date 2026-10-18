/**
 * Local-time conversion for a `datetime-local` input value
 * ("YYYY-MM-DDTHH:mm"); "" when unset. Shared by the order form (client) and
 * the order edit page (server) — kept dependency-free and client-safe.
 */
export function toDatetimeLocal(value: Date | null): string {
  if (!value) return "";
  const pad = (part: number) => part.toString().padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
