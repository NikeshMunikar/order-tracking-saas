import Link from "next/link";

import { DeleteCustomerButton, CustomerForm } from "@/components/customer/customer-forms";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getCustomer } from "@/server/customer/customer-service";
import { listCustomerOrders } from "@/server/order/order-service";

/**
 * Customer detail + edit (MASTER_SPEC.md §19: "Customer profile: Name, Phone,
 * Email, Address, Order History"; milestone 3 = CRUD, search, details).
 *
 * ORDER HISTORY (MASTER_SPEC.md §19): since milestone 5 the customer's
 * tracked orders are listed here through `listCustomerOrders`, which is
 * tenant-scoped and membership-guarded like every other order entry point.
 *
 * The lookup is scoped to the business server-side, so a customerId belonging
 * to another tenant resolves to the same "not found" state as a customerId
 * that does not exist. Deleting is OWNER-only (MASTER_SPEC.md §4 gives STAFF
 * "view/create/update customers" but not deletion), so STAFF never sees the
 * delete control — and the service enforces it regardless of the UI.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>;
}) {
  const session = await requireSession();
  const { businessId, customerId } = await params;

  const authorized = await getAuthorizedBusiness(session.user.id, businessId);
  const customer = await getCustomer(session.user.id, businessId, customerId);

  if (!customer) {    return (
      <div className="mx-auto max-w-lg">
        <h2 className="text-base font-semibold text-neutral-900">Customer not found</h2>
        <p className="mt-2 text-sm text-neutral-500">
          This customer is not in {authorized.business.name}, or has been removed.
        </p>
        <Link
          href={`/dashboard/${businessId}/customers`}
          className="mt-4 inline-block text-sm font-medium text-neutral-900 underline underline-offset-2"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/dashboard/${businessId}/customers`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          &larr; Customers
        </Link>
        <h2 className="mt-1 text-base font-semibold text-neutral-900">{customer.name}</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Added {customer.createdAt.toLocaleDateString()}
        </p>
      </div>

      <section aria-label="Customer details" className="flex flex-col gap-4">
        <h3 className="text-sm font-medium text-neutral-700">Details</h3>
        <CustomerForm
          businessId={businessId}
          customerId={customer.id}
          defaultValues={{
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            notes: customer.notes,
          }}
        />
      </section>

      <OrderHistorySection businessId={businessId} customerId={customer.id} />

      {authorized.role === "OWNER" && (
        <section
          aria-label="Delete customer"
          className="flex flex-col gap-3 border-t border-neutral-200 pt-6"
        >
          <h3 className="text-sm font-medium text-neutral-700">Delete</h3>
          <DeleteCustomerButton businessId={businessId} customerId={customer.id} />
        </section>
      )}
    </div>
  );
}

/**
 * §19 Order History: the customer's orders, newest first, each linking to the
 * order detail. Fetched through the membership-guarded order service — a
 * customerId from another tenant can never reach this point anyway, because
 * the page itself renders the shared "not found" card first.
 */
async function OrderHistorySection({
  businessId,
  customerId,
}: {
  businessId: string;
  customerId: string;
}) {
  const session = await requireSession();
  const orders = await listCustomerOrders(session.user.id, businessId, customerId);

  return (
    <section aria-label="Order history" className="flex flex-col gap-3 border-t border-neutral-200 pt-6">
      <h3 className="text-sm font-medium text-neutral-700">Orders</h3>
      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">No orders for this customer yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/dashboard/${businessId}/orders/${order.id}`}
                className="font-medium text-neutral-900 underline underline-offset-2"
              >
                {order.orderNumber}
              </Link>
              <span className="text-neutral-500">
                {order.status} &middot; {order.total} &middot;{" "}
                {order.createdAt.toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
