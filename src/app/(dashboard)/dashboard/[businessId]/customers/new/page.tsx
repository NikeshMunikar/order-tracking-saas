import { CreateCustomerForm } from "@/components/customer/customer-forms";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}/customers`}
        backLabel="Customers"
        title="Add customer"
        description="Create a customer record for future orders."
      />
      <CreateCustomerForm businessId={businessId} />
    </div>
  );
}
