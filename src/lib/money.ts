/**
 * DEC-006 money helpers: exact fixed-point arithmetic on minor units
 *
 * PostgreSQL monetary columns are `DECIMAL(12, 2)`. Authoritative arithmetic
 * happens here on BigInt minor units (1 = 0.01) — never on IEEE-754 numbers —
 * and results are formatted back into the same fixed-scale decimal strings
 * that `@db.Decimal(12, 2)` stores. Constants like `Number.MAX_SAFE_INTEGER`
 * never enter this file: a 12-digit NPR amount (99,999,999.99 = 9,999,999,999
 * minor units) is far below the safe-integer ceiling anyway, but BigInt keeps
 * the rule structural rather than situational.
 *
 * Money digit strings already pass validation (non-negative, ≤ 2 decimals),
 * so this parser treats malformed input as a programming error (throws).
 */

const MINOR_EXPONENT = 2;
const MINOR_FACTOR = 10n ** BigInt(MINOR_EXPONENT);

export type MoneyLine = {
  /** Validated unit price as a decimal string (e.g. "1800.50"). */
  unitPrice: string;
  /** Positive integer quantity. */
  quantity: number;
};

/** `parseMinorUnits("1800.50")` → 180050n. */
export function parseMinorUnits(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (match === null) {
    throw new Error(`Money string is not a valid decimal amount: ${value}`);
  }

  const major = BigInt(match[1]);
  const fractionText = (match[2] ?? "").padEnd(MINOR_EXPONENT, "0");
  return major * MINOR_FACTOR + BigInt(fractionText);
}

/** `formatMinorUnits(180050n)` → "1800.50". */
export function formatMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const major = absolute / MINOR_FACTOR;
  const minor = absolute % MINOR_FACTOR;
  const digits = `${major}.${minor.toString().padStart(MINOR_EXPONENT, "0")}`;
  return negative ? `-${digits}` : digits;
}

/** `formatMoney("USD", "12.50")` → "USD 12.50". */
export function formatMoney(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

export type OrderTotals = {
  /** Σ(quantity × unit price) — exact string, scale 2. */
  subtotal: string;
  /**
   * `subtotal + delivery fee − discount` as a fixed-amount discount, per the
   * AMB-001 reconciliation accepted by the owner on 2026-10-18. At least zero:
   * a discount larger than the order amount is rejected, never clamped.
   */
  total: string;
};

/**
 * Authoritative order calculation (AMB-001 resolved 2026-10-18): per-item
 * subtotals, then `total = subtotal + deliveryFee − discount`. Throws
 * `InvalidTotalsError` when discount would drive the total below zero —
 * callers map that error onto a safe message ("Discount…exceeds…").
 */
export function computeOrderTotals(
  lines: readonly MoneyLine[],
  discount: string,
  deliveryFee: string,
): OrderTotals {
  let subtotalMinor = 0n;
  for (const line of lines) {
    const unitPriceMinor = parseMinorUnits(line.unitPrice);
    subtotalMinor += unitPriceMinor * BigInt(line.quantity);
  }

  const discountMinor = parseMinorUnits(discount);
  const deliveryFeeMinor = parseMinorUnits(deliveryFee);
  const totalMinor = subtotalMinor + deliveryFeeMinor - discountMinor;

  if (totalMinor < 0n) {
    throw new InvalidTotalsError(
      `Discount (${formatMinorUnits(discountMinor)}) exceeds subtotal + delivery fee (${formatMinorUnits(subtotalMinor + deliveryFeeMinor)}).`,
    );
  }

  return {
    subtotal: formatMinorUnits(subtotalMinor),
    total: formatMinorUnits(totalMinor),
  };
}

/**
 * Per-item line subtotal — `quantity × unitPrice`, exact.
 */
export function computeLineSubtotal(unitPrice: string, quantity: number): string {
  return formatMinorUnits(parseMinorUnits(unitPrice) * BigInt(quantity));
}

export class InvalidTotalsError extends Error {
  readonly name = "InvalidTotalsError";
}
