import { BusinessSettingsForm } from "@/components/business/business-forms";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { requireSession } from "@/server/auth/session";

export default async function BusinessSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const session = await requireSession();
  const { businessId } = await params;
  const { business, role } = await getAuthorizedBusiness(session.user.id, businessId);

  if (role !== "OWNER") {
    return (
      <div className="max-w-lg">
        <h2 className="text-base font-semibold text-neutral-900">Business settings</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Only owners can change business settings.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-neutral-900">Business settings</h2>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Your business profile, currency, and contact details.
      </p>

      <BusinessSettingsForm
        businessId={business.id}
        defaultValues={{
          name: business.name,
          currency: business.currency,
          timezone: business.timezone,
          logoUrl: business.logoUrl,
          phone: business.phone,
          email: business.email,
          address: business.address,
          description: business.description,
        }}
      />
    </div>
  );
}
