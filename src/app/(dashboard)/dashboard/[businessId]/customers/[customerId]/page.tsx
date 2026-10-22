import Link from "next/link";

import { CustomerForm, DeleteCustomerButton } from "@/components/customer/customer-forms";
import { OrderStatusBadge } from "@/components/order/order-status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getCustomer } from "@/server/customer/customer-service";
import { listCustomerOrders } from "@/server/order/order-service";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>;
}) {
  const { businessId, customerId } = await params;
  const session = await requireSession();
  const authorized = await getAuthorizedBusiness(session.user.id, businessId);
  const isOwner = authorized.role === "OWNER";

  const customer = await getCustomer(session.user.id, businessId, customerId);
  if (!customer) {
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Customer not found</h2>
        <p className="mt-2 text-sm text-muted">
          This customer is not in {authorized.business.name}, or has been removed.
        </p>
        <Link
          href={`/dashboard/${businessId}/customers`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          &larr; Back to customers
        </Link>
      </div>
    );
  }

  const listHref = `/dashboard/${businessId}/customers`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={listHref}
        backLabel="Customers"
        title={customer.name}
        description={`Added ${customer.createdAt.toLocaleDateString()}`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <SectionCard title="Customer details">
          <CustomerForm
            businessId={businessId}
            customerId={customer.id}
            defaultValues={{
              name: customer.name,
              phone: customer.phone,
              email: customer.email ?? "",
              address: customer.address ?? "",
              notes: customer.notes ?? "",
            }}
          />
        </SectionCard>

        <div className="flex flex-col gap-4">
          <OrderHistorySection
            businessId={businessId}
            customerId={customer.id}
            currency={authorized.business.currency}
          />

          {isOwner && (
            <SectionCard title="Delete customer">
              <DeleteCustomerButton businessId={businessId} customerId={customer.id} />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

async function OrderHistorySection({
  businessId,
  customerId,
  currency,
}: {
  businessId: string;
  customerId: string;
  currency: string;
}) {
  const session = await requireSession();
  const orders = await listCustomerOrders(session.user.id, businessId, customerId);

  return (
    <SectionCard title="Order history">
      {orders.length === 0 ? (
        <p className="text-sm text-muted">No orders for this customer yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {orders.map((order) => (
            <li key={order.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/dashboard/${businessId}/orders/${order.id}`}
                  className="font-mono text-[13px] font-medium text-ink underline underline-offset-2"
                >
                  {order.orderNumber}
                </Link>
                <span className="text-sm font-medium text-ink tabular-nums">
                  {formatMoney(currency, order.total)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <OrderStatusBadge status={order.status} />
                <span>{order.createdAt.toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
