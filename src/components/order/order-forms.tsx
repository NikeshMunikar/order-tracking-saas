"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { createOrderAction, updateOrderAction } from "@/server/order/actions";
import type {
  CreateOrderActionState,
  UpdateOrderActionState,
} from "@/server/order/action-states";

const initialCreateState: CreateOrderActionState = { status: "idle" };
const initialUpdateState: UpdateOrderActionState = { status: "idle" };

// Per-order line cap mirrors src/lib/validation/order.ts (ORDER_ITEM_QUANTITY_MAX).
const ITEM_QUANTITY_MAX = 999;

type CustomerOption = { id: string; name: string; phone: string };
type ProductOption = { id: string; name: string; price: string };
type ItemRow = { key: number; productId: string; quantity: string };

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

let rowKeyCounter = 0;

function makeRow(productId: string, quantity: string): ItemRow {
  rowKeyCounter += 1;
  return { key: rowKeyCounter, productId, quantity };
}

function ItemRows({
  rows,
  products,
  onRowsChange,
}: {
  rows: ItemRow[];
  products: ProductOption[];
  onRowsChange: (next: ItemRow[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-neutral-700">Items</span>
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-end gap-2">
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
              {products.map((product) => (
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
              onClick={() => onRowsChange([...rows, makeRow("", "1")])}
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
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="customerId" className="text-sm font-medium text-neutral-700">
        Customer
      </label>
      <select
        id="customerId"
        name="customerId"
        defaultValue={defaultCustomerId ?? ""}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
      >
        <option value="">Select a customer…</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name} ({customer.phone})
          </option>
        ))}
      </select>
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
  const [rows, setRows] = useState<ItemRow[]>([makeRow(products[0]?.id ?? "", "1")]);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${businessId}/orders/${state.orderId}`);
    }
  }, [state, router, businessId]);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />

      <CustomerField customers={customers} />
      <ItemRows rows={rows} products={products} onRowsChange={setRows} />
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
  const [rows, setRows] = useState<ItemRow[]>(
    initialRows.map((row) => makeRow(row.productId ?? "", String(row.quantity))),
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="orderId" value={orderId} />
      {/* The customer on an existing order cannot be changed (M5 scope
          decision): the field is absent from the update action entirely. */}

      <ItemRows rows={rows} products={products} onRowsChange={setRows} />
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
