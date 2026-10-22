"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ComponentPropsWithRef, FormEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-status";
import type { OrderStatusValue } from "@/lib/order-status";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/payment-status";
import {
  createOrderAction,
  updateOrderAction,
  updateOrderStatusAction,
} from "@/server/order/actions";
import type {
  CreateOrderActionState,
  UpdateOrderActionState,
  UpdateOrderStatusActionState,
} from "@/server/order/action-states";

const initialCreateState: CreateOrderActionState = { status: "idle" };
const initialUpdateState: UpdateOrderActionState = { status: "idle" };
const initialUpdateStatusState: UpdateOrderStatusActionState = { status: "idle" };

// Per-order line cap mirrors src/lib/validation/order.ts (ORDER_ITEM_QUANTITY_MAX).
const ITEM_QUANTITY_MAX = 999;

const fieldClass =
  "min-h-11 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";

type CustomerOption = { id: string; name: string; phone: string };
type ProductOption = { id: string; name: string; price: string };
type ItemRow = { key: string; productId: string; quantity: string };

type OrderFieldValues = {
  deliveryType: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  discount: string;
  deliveryFee: string;
  // datetime-local string ("YYYY-MM-DDTHH:mm"); "" when unset.
  estimatedDeliveryAt: string;
  paymentStatus: string;
  notes: string;
};

function rowKey(idBase: string, number: number): string {
  return `${idBase}-row-${number}`;
}

function OrderSubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-status-negative-fg/25 bg-status-negative-bg px-3 py-2 text-sm text-status-negative-fg"
    >
      {message}
    </p>
  );
}

function FormSuccess({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="rounded-md border border-status-positive-fg/25 bg-status-positive-bg px-3 py-2 text-sm text-status-positive-fg"
    >
      {message}
    </p>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OrderTextField({
  label,
  name,
  id,
  ...props
}: ComponentPropsWithRef<"input"> & { label: string; name: string }) {
  const fieldId = id ?? name;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input id={fieldId} name={name} className={fieldClass} {...props} />
    </div>
  );
}

function ItemRows({
  rows,
  products,
  currency,
  onRowsChange,
  idBase,
}: {
  rows: ItemRow[];
  products: ProductOption[];
  currency: string;
  onRowsChange: (next: ItemRow[]) => void;
  idBase: string;
}) {
  const [search, setSearch] = useState("");
  // Counter for rows added after mount; starts at the initial row count so the
  // generated keys never collide with any existing one.
  const nextRowNumber = useRef(rows.length);

  const term = search.trim().toLowerCase();
  const matching =
    term === ""
      ? products
      : products.filter((product) => product.name.toLowerCase().includes(term));

  // Keep a row's current selection visible even when the filter excludes it, so
  // typing in the search box never silently clears a chosen product.
  const optionsForRow = (selectedId: string) => {
    const selected = products.find((product) => product.id === selectedId);
    if (selected && !matching.some((product) => product.id === selected.id)) {
      return [selected, ...matching];
    }

    return matching;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="order-item-search" className="text-sm font-medium text-ink">
          Search products
        </label>
        <input
          id="order-item-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter products by name"
          className={fieldClass}
        />
      </div>
      {term !== "" && matching.length === 0 && (
        <p className="text-xs text-muted">No products match &ldquo;{search}&rdquo;.</p>
      )}
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 grow flex-col gap-1.5">
              <label
                className="text-xs text-muted"
                htmlFor={`order-item-product-${row.key}`}
              >
                Product
              </label>
              <select
                id={`order-item-product-${row.key}`}
                name={`order-item-product-${row.key}`}
                value={row.productId}
                onChange={(event) => {
                  onRowsChange(
                    rows.map((r) =>
                      r.key === row.key ? { ...r, productId: event.target.value } : r,
                    ),
                  );
                }}
                className={fieldClass}
              >
                <option value="">Select a product…</option>
                {optionsForRow(row.productId).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({formatMoney(currency, product.price)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <label
                className="text-xs text-muted"
                htmlFor={`order-item-quantity-${row.key}`}
              >
                Qty
              </label>
              <input
                id={`order-item-quantity-${row.key}`}
                name={`order-item-quantity-${row.key}`}
                type="number"
                min={1}
                max={ITEM_QUANTITY_MAX}
                step={1}
                value={row.quantity}
                onChange={(event) => {
                  onRowsChange(
                    rows.map((r) =>
                      r.key === row.key ? { ...r, quantity: event.target.value } : r,
                    ),
                  );
                }}
                className={fieldClass}
              />
            </div>
            <div className="flex items-center gap-2">
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRowsChange(rows.filter((r) => r.key !== row.key))}
                  className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  Remove
                </button>
              )}
              {index === rows.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    nextRowNumber.current += 1;
                    onRowsChange([
                      ...rows,
                      {
                        key: rowKey(idBase, nextRowNumber.current),
                        productId: "",
                        quantity: "1",
                      },
                    ]);
                  }}
                  className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  Add item
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* The item lines travel as one JSON array; the schema re-validates every
          element server-side before the service re-resolves the products. */}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          rows.map((row) => ({
            productId: row.productId,
            quantity: Number(row.quantity === "" ? 0 : row.quantity),
          })),
        )}
      />
    </div>
  );
}

function DeliveryAndPaymentFields({
  defaultValues,
  currency,
}: {
  defaultValues: OrderFieldValues;
  currency: string;
}) {
  return (
    <>
      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">Delivery</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deliveryType" className="text-sm font-medium text-ink">
              Delivery type
            </label>
            <select
              id="deliveryType"
              name="deliveryType"
              defaultValue={defaultValues.deliveryType}
              className={fieldClass}
            >
              <option value="DELIVERY">Delivery</option>
              <option value="PICKUP">Pickup</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="estimatedDeliveryAt" className="text-sm font-medium text-ink">
              Estimated delivery
            </label>
            <input
              id="estimatedDeliveryAt"
              name="estimatedDeliveryAt"
              type="datetime-local"
              defaultValue={defaultValues.estimatedDeliveryAt}
              className={fieldClass}
            />
          </div>
          <OrderTextField
            label="Recipient name"
            name="deliveryName"
            type="text"
            autoComplete="off"
            defaultValue={defaultValues.deliveryName}
          />
          <OrderTextField
            label="Recipient phone"
            name="deliveryPhone"
            type="text"
            autoComplete="off"
            defaultValue={defaultValues.deliveryPhone}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="deliveryAddress" className="text-sm font-medium text-ink">
              Delivery address
            </label>
            <textarea
              id="deliveryAddress"
              name="deliveryAddress"
              rows={3}
              defaultValue={defaultValues.deliveryAddress}
              className={fieldClass}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Recipient details are required for delivery orders.
        </p>
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">
          Payment and totals
        </legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <OrderTextField
            label={`Delivery fee (${currency})`}
            name="deliveryFee"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={defaultValues.deliveryFee}
            required
          />
          <OrderTextField
            label={`Discount (${currency})`}
            name="discount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={defaultValues.discount}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paymentStatus" className="text-sm font-medium text-ink">
              Payment status
            </label>
            <select
              id="paymentStatus"
              name="paymentStatus"
              defaultValue={defaultValues.paymentStatus}
              className={fieldClass}
            >
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PAYMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Money is entered as decimal STRINGS end-to-end (DEC-006); the schema
            and the service — not the browser — decide what a valid amount is. */}
        <p className="mt-3 text-xs text-muted">
          Amounts are entered in {currency}; totals are recalculated on the server.
        </p>
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">Notes</legend>
        <div className="mt-4">
          <label htmlFor="notes" className="sr-only">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Delivery instructions or other notes"
            defaultValue={defaultValues.notes}
            className={fieldClass}
          />
        </div>
      </fieldset>
    </>
  );
}

function CustomerField({
  customers,
  defaultCustomerId,
}: {
  customers: CustomerOption[];
  defaultCustomerId?: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(defaultCustomerId ?? "");

  const term = search.trim().toLowerCase();
  const matching =
    term === ""
      ? customers
      : customers.filter(
          (customer) =>
            customer.name.toLowerCase().includes(term) ||
            customer.phone.toLowerCase().includes(term),
        );

  // Keep the selected customer visible even when the filter excludes it, so
  // typing in the search box never silently clears the choice.
  const selected = customers.find((customer) => customer.id === selectedId);
  const options =
    selected && !matching.some((customer) => customer.id === selected.id)
      ? [selected, ...matching]
      : matching;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customer-filter" className="text-sm font-medium text-ink">
          Find a customer
        </label>
        <input
          id="customer-filter"
          type="search"
          aria-label="Filter customers"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter customers by name or phone"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerId" className="text-sm font-medium text-ink">
          Customer
        </label>
        <select
          id="customerId"
          name="customerId"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className={fieldClass}
        >
          <option value="">Select a customer…</option>
          {options.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} ({customer.phone})
            </option>
          ))}
        </select>
      </div>
      {term !== "" && matching.length === 0 && (
        <p className="text-xs text-muted">No customers match &ldquo;{search}&rdquo;.</p>
      )}
    </div>
  );
}

const emptyFieldValues: OrderFieldValues = {
  deliveryType: "DELIVERY",
  deliveryName: "",
  deliveryPhone: "",
  deliveryAddress: "",
  discount: "0",
  deliveryFee: "0",
  estimatedDeliveryAt: "",
  paymentStatus: "UNPAID",
  notes: "",
};

export function CreateOrderForm({
  businessId,
  currency,
  customers,
  products,
}: {
  businessId: string;
  currency: string;
  customers: CustomerOption[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(createOrderAction, initialCreateState);
  const idBase = useId();
  const [rows, setRows] = useState<ItemRow[]>(() => [
    { key: rowKey(idBase, 1), productId: products[0]?.id ?? "", quantity: "1" },
  ]);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${businessId}/orders/${state.orderId}`);
    }
  }, [state, router, businessId]);

  return (
    <form action={formAction} className="flex max-w-4xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />

      <FormSection title="Customer">
        <CustomerField customers={customers} />
      </FormSection>

      <FormSection title="Items">
        <ItemRows
          rows={rows}
          products={products}
          currency={currency}
          onRowsChange={setRows}
          idBase={idBase}
        />
      </FormSection>

      <DeliveryAndPaymentFields defaultValues={emptyFieldValues} currency={currency} />

      {state.status === "error" && <FormError message={state.message} />}

      <div className="flex flex-wrap items-center gap-3">
        <OrderSubmitButton>Create order</OrderSubmitButton>
        <span className="text-xs text-muted">Totals are calculated on the server.</span>
      </div>
    </form>
  );
}

export function EditOrderForm({
  businessId,
  currency,
  orderId,
  products,
  defaultValues,
  initialRows,
}: {
  businessId: string;
  currency: string;
  orderId: string;
  products: ProductOption[];
  defaultValues: OrderFieldValues;
  initialRows: Array<{ productId: string | null; quantity: number }>;
}) {
  const [state, formAction] = useActionState(updateOrderAction, initialUpdateState);
  const idBase = useId();
  const [rows, setRows] = useState<ItemRow[]>(() =>
    initialRows.map((row, index) => ({
      key: rowKey(idBase, index + 1),
      productId: row.productId ?? "",
      quantity: String(row.quantity),
    })),
  );

  return (
    <form action={formAction} className="flex max-w-4xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="orderId" value={orderId} />
      {/* The customer on an existing order cannot be changed (M5 scope
          decision): the field is absent from the update action entirely. */}

      <FormSection title="Items">
        <ItemRows
          rows={rows}
          products={products}
          currency={currency}
          onRowsChange={setRows}
          idBase={idBase}
        />
      </FormSection>

      <DeliveryAndPaymentFields defaultValues={defaultValues} currency={currency} />

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "success" && <FormSuccess message="Order updated." />}

      <div className="flex flex-wrap items-center gap-3">
        <OrderSubmitButton>Save changes</OrderSubmitButton>
        <span className="text-xs text-muted">Totals are recalculated on the server.</span>
      </div>
    </form>
  );
}

/**
 * Status change controls (M6/DEC-013). Only the statuses the server would
 * accept from the order's CURRENT status are offered (docs/ui-ux.md §7: "The
 * UI must not offer transitions that the server rejects. The server remains
 * authoritative."). Each option is a radio input named `status` whose value is
 * the target status, so a hand-crafted request is still re-validated by the
 * service. Terminal orders render no controls at all.
 */
export function UpdateStatusForm({
  businessId,
  orderId,
  nextStatuses,
}: {
  businessId: string;
  orderId: string;
  nextStatuses: OrderStatusValue[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateOrderStatusAction,
    initialUpdateStatusState,
  );
  const [noteDraft, setNoteDraft] = useState("");

  // After a successful change the field shows empty again (the submitted note
  // belongs to the change that just happened, not to the next one).
  const note = state.status === "success" ? "" : noteDraft;

  if (nextStatuses.length === 0) {
    return null;
  }

  function confirmDestructiveChange(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    if (
      data.get("status") === "CANCELLED" &&
      !window.confirm("Cancel this order? This cannot be undone.")
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmDestructiveChange} className="flex flex-col gap-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="orderId" value={orderId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink">Next status</legend>
        {nextStatuses.map((status) => (
          <label
            key={status}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-control bg-surface px-3 text-sm text-ink transition-colors hover:bg-raised"
          >
            <input
              type="radio"
              name="status"
              value={status}
              required
              disabled={isPending}
              className="h-4 w-4 accent-accent"
            />
            <span className={status === "CANCELLED" ? "text-status-negative-fg" : ""}>
              {status === "CANCELLED"
                ? "Cancel order"
                : `Mark ${orderStatusLabel(status).toLowerCase()}`}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status-note" className="text-sm font-medium text-ink">
          Note (optional)
        </label>
        <textarea
          id="status-note"
          name="note"
          rows={2}
          autoComplete="off"
          value={note}
          onChange={(event) => setNoteDraft(event.target.value)}
          className={fieldClass}
        />
      </div>

      <OrderSubmitButton>Update status</OrderSubmitButton>

      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "success" && (
        <FormSuccess message={`Status updated to ${orderStatusLabel(state.orderStatus)}.`} />
      )}
    </form>
  );
}
