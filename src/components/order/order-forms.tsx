"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { orderStatusLabel } from "@/lib/order-status";
import type { OrderStatusValue } from "@/lib/order-status";
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

/**
 * Deterministic row keys (browser-pass fix 2026-10-19).
 *
 * The row keys previously came from a module-level counter, which diverges
 * between the server render and client hydration (each module instance starts
 * its own counter), producing a React hydration mismatch on the row input
 * id/name attributes. Keys are now derived from React's `useId()` — an
 * SSR-stable per-form seed — plus a per-instance counter for rows added later,
 * so server HTML and hydrated HTML always agree.
 */
function rowKey(idBase: string, number: number): string {
  return `${idBase}-row-${number}`;
}

function ItemRows({
  rows,
  products,
  onRowsChange,
  idBase,
}: {
  rows: ItemRow[];
  products: ProductOption[];
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="order-item-search" className="text-sm font-medium text-neutral-700">
          Items
        </label>
        <input
          id="order-item-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter products by name"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
      {term !== "" && matching.length === 0 && (
        <p className="text-xs text-neutral-500">No products match &ldquo;{search}&rdquo;.</p>
      )}
      {rows.map((row, index) => (
        <div key={row.key} className="flex flex-wrap items-end gap-2">
          <div className="flex grow flex-col gap-1.5">
            <label
              className="text-xs text-neutral-500"
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
                  rows.map((r) => (r.key === row.key ? { ...r, productId: event.target.value } : r)),
                );
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
            >
              <option value="">Select a product…</option>
              {optionsForRow(row.productId).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} (NPR {product.price})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs text-neutral-500"
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
                  rows.map((r) => (r.key === row.key ? { ...r, quantity: event.target.value } : r)),
                );
              }}
              className="w-24 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onRowsChange(rows.filter((r) => r.key !== row.key))}
              className="rounded-md border border-neutral-300 px-2 py-2 text-xs text-neutral-600 transition hover:bg-neutral-100"
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
                  { key: rowKey(idBase, nextRowNumber.current), productId: "", quantity: "1" },
                ]);
              }}
              className="rounded-md border border-neutral-300 px-2 py-2 text-xs text-neutral-600 transition hover:bg-neutral-100"
            >
              Add item
            </button>
          )}
        </div>
      ))}
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

function DeliveryAndPaymentFields({ defaultValues }: { defaultValues: OrderFieldValues }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryType" className="text-sm font-medium text-neutral-700">
          Delivery type
        </label>
        <select
          id="deliveryType"
          name="deliveryType"
          defaultValue={defaultValues.deliveryType}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        >
          <option value="DELIVERY">Delivery</option>
          <option value="PICKUP">Pickup</option>
        </select>
      </div>
      {/* Recipient fields: required by the service for DELIVERY (§28); for
          PICKUP the order snapshots the customer's own name/phone instead. */}
      <TextField
        label="Recipient name"
        name="deliveryName"
        type="text"
        autoComplete="off"
        defaultValue={defaultValues.deliveryName}
      />
      <TextField
        label="Recipient phone"
        name="deliveryPhone"
        type="text"
        autoComplete="off"
        defaultValue={defaultValues.deliveryPhone}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryAddress" className="text-sm font-medium text-neutral-700">
          Delivery address
        </label>
        <textarea
          id="deliveryAddress"
          name="deliveryAddress"
          rows={2}
          defaultValue={defaultValues.deliveryAddress}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
      {/* Money is entered as decimal STRINGS end-to-end (DEC-006); the schema
          and the service — not the browser — decide what a valid amount is. */}
      <TextField
        label="Delivery fee (NPR)"
        name="deliveryFee"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultValues.deliveryFee}
        required
      />
      <TextField
        label="Discount (NPR)"
        name="discount"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultValues.discount}
        required
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="estimatedDeliveryAt" className="text-sm font-medium text-neutral-700">
          Estimated delivery
        </label>
        <input
          id="estimatedDeliveryAt"
          name="estimatedDeliveryAt"
          type="datetime-local"
          defaultValue={defaultValues.estimatedDeliveryAt}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="paymentStatus" className="text-sm font-medium text-neutral-700">
          Payment status
        </label>
        <select
          id="paymentStatus"
          name="paymentStatus"
          defaultValue={defaultValues.paymentStatus}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        >
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-neutral-700">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues.notes}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor="customerId" className="text-sm font-medium text-neutral-700">
        Customer
      </label>
      <input
        type="search"
        aria-label="Filter customers"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Filter customers by name or phone"
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
      />
      <select
        id="customerId"
        name="customerId"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
      >
        <option value="">Select a customer…</option>
        {options.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name} ({customer.phone})
          </option>
        ))}
      </select>
      {term !== "" && matching.length === 0 && (
        <p className="text-xs text-neutral-500">No customers match &ldquo;{search}&rdquo;.</p>
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
  customers,
  products,
}: {
  businessId: string;
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
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />

      <CustomerField customers={customers} />
      <ItemRows rows={rows} products={products} onRowsChange={setRows} idBase={idBase} />
      <DeliveryAndPaymentFields defaultValues={emptyFieldValues} />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <SubmitButton>Create order</SubmitButton>
    </form>
  );
}

export function EditOrderForm({
  businessId,
  orderId,
  products,
  defaultValues,
  initialRows,
}: {
  businessId: string;
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
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="orderId" value={orderId} />
      {/* The customer on an existing order cannot be changed (M5 scope
          decision): the field is absent from the update action entirely. */}

      <ItemRows rows={rows} products={products} onRowsChange={setRows} idBase={idBase} />
      <DeliveryAndPaymentFields defaultValues={defaultValues} />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          Order updated.
        </p>
      )}

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

/**
 * Status change controls (M6/DEC-013). Only the statuses the server would
 * accept from the order's CURRENT status are offered (docs/ui-ux.md §7: "The
 * UI must not offer transitions that the server rejects. The server remains
 * authoritative.") — each option is a radio input named `status` whose value is
 * the target status, so a hand-crafted request is still re-validated by the
 * service. A radio (rather than one submit button per status) is deliberate:
 * browser pass 2026-10-19 found that a React server action does not reliably
 * include the *clicked submit button's* `name`/`value` pair, while regular form
 * controls (like radio inputs) travel in FormData with and without JavaScript.
 * Terminal orders render no controls at all.
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
  // belongs to the change that just happened, not to the next one). Derived
  // rather than cleared in an effect: resetting controlled state from an
  // effect body is an anti-pattern the lint rules reject.
  const note = state.status === "success" ? "" : noteDraft;

  if (nextStatuses.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-neutral-200 pt-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="orderId" value={orderId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status-note" className="text-sm font-medium text-neutral-700">
          Note (optional)
        </label>
        <input
          id="status-note"
          name="note"
          type="text"
          autoComplete="off"
          value={note}
          onChange={(event) => setNoteDraft(event.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>

      {/* One radio per allowed next status: large tap targets on mobile (§34)
          and no invalid option can be submitted from the UI. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-neutral-700">Next status</legend>
        {nextStatuses.map((status) => (
          <label key={status} className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="radio"
              name="status"
              value={status}
              required
              disabled={isPending}
              className="accent-neutral-900"
            />
            {status === "CANCELLED" ? "Cancel order" : `Mark ${orderStatusLabel(status).toLowerCase()}`}
          </label>
        ))}
      </fieldset>

      <div>
        <SubmitButton>Update status</SubmitButton>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          Status updated to {orderStatusLabel(state.orderStatus)}.
        </p>
      )}
    </form>
  );
}
