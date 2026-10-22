import { BusinessSettingsForm } from "@/components/business/business-forms";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();
  const authorized = await getAuthorizedBusiness(session.user.id, businessId);

  if (authorized.role !== "OWNER") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          backHref={`/dashboard/${businessId}`}
          backLabel="Dashboard"
          title="Business settings"
        />
        <SectionCard title="Owner access required">
          <p className="text-sm text-muted">Only owners can change business settings.</p>
        </SectionCard>
      </div>
    );
  }

  const business = authorized.business;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}`}
        backLabel="Dashboard"
        title="Business settings"
        description="Your business profile, currency, and contact details."
      />
      <BusinessSettingsForm
        businessId={businessId}
        defaultValues={{
          name: business.name,
          currency: business.currency,
          timezone: business.timezone,
          logoUrl: business.logoUrl ?? "",
          phone: business.phone ?? "",
          email: business.email ?? "",
          address: business.address ?? "",
          description: business.description ?? "",
        }}
      />
    </div>
  );
}
