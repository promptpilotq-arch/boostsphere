import { requirePermissionPage } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { providerStatuses } from "@/server/payments/registry";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  await requirePermissionPage("settings:manage");
  const s = await getSettings();
  const text = (section: string, key: string, label: string, value: string, hint?: string) => (
    <Field key={key} label={label} htmlFor={`${section}-${key}`} hint={hint}>
      <input id={`${section}-${key}`} name={`value.${key}`} defaultValue={value} className="input" />
    </Field>
  );
  const num = (section: string, key: string, label: string, value: number, hint?: string) => (
    <Field key={key} label={label} htmlFor={`${section}-${key}`} hint={hint}>
      <input id={`${section}-${key}`} name={`value.${key}`} type="number" defaultValue={value} className="input" />
    </Field>
  );
  const bool = (key: string, label: string, value: boolean) => (
    <label key={key} className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={`value.${key}`} defaultChecked={value} /> {label}
    </label>
  );
  return (
    <>
      <PageHeader title="Website settings" description="Branding, homepage copy, taxes, fees and feature switches. Changes apply immediately and are audit-logged." />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Brand</h2>
          <ApiForm action="/api/v1/admin/settings" method="PUT" extra={{ section: "brand" }} success={{ message: "Brand saved" }} className="mt-4 space-y-3">
            {text("brand", "name", "Brand name", s.brand.name)}
            {text("brand", "tagline", "Tagline", s.brand.tagline)}
            <div className="grid grid-cols-3 gap-2">
              {text("brand", "logoText", "Logo mark", s.brand.logoText, "1–4 chars")}
              {text("brand", "primaryColor", "Primary", s.brand.primaryColor)}
              {text("brand", "accentColor", "Accent", s.brand.accentColor)}
            </div>
            {text("brand", "supportEmail", "Support email", s.brand.supportEmail)}
            {text("brand", "companyLegalName", "Company legal name", s.brand.companyLegalName)}
            {text("brand", "companyAddress", "Company address", s.brand.companyAddress)}
            <SubmitButton>Save brand</SubmitButton>
          </ApiForm>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Homepage content</h2>
          <ApiForm action="/api/v1/admin/settings" method="PUT" extra={{ section: "home" }} success={{ message: "Homepage saved" }} className="mt-4 space-y-3">
            {text("home", "heroHeadline", "Hero headline", s.home.heroHeadline)}
            <Field label="Hero supporting text" htmlFor="home-sub">
              <textarea id="home-sub" name="value.heroSubtext" defaultValue={s.home.heroSubtext} rows={3} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {text("home", "primaryCta", "Primary CTA", s.home.primaryCta)}
              {text("home", "secondaryCta", "Secondary CTA", s.home.secondaryCta)}
            </div>
            {bool("showSampleContentNotice", "Show “sample content” notice (keep on until real data exists)", s.home.showSampleContentNotice)}
            <SubmitButton>Save homepage</SubmitButton>
          </ApiForm>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Commerce</h2>
          <ApiForm action="/api/v1/admin/settings" method="PUT" extra={{ section: "commerce" }} success={{ message: "Commerce settings saved" }} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {text("commerce", "baseCurrency", "Base currency", s.commerce.baseCurrency)}
              {text("commerce", "taxLabel", "Tax label", s.commerce.taxLabel)}
              {num("commerce", "taxRateBps", "Tax rate (bps)", s.commerce.taxRateBps, "750 = 7.5%")}
              {num("commerce", "orderPaymentWindowHours", "Payment window (hours)", s.commerce.orderPaymentWindowHours)}
              {num("commerce", "processingFeeBps", "Processing fee (bps)", s.commerce.processingFeeBps)}
              {num("commerce", "processingFeeFixedMinor", "Processing fee fixed (kobo)", s.commerce.processingFeeFixedMinor)}
              {num("commerce", "marketplaceBuyerFeeBps", "Marketplace buyer fee (bps)", s.commerce.marketplaceBuyerFeeBps)}
              {num("commerce", "marketplaceSellerCommissionBps", "Seller commission (bps)", s.commerce.marketplaceSellerCommissionBps)}
              {num("commerce", "minWithdrawalMinor", "Minimum withdrawal (kobo)", s.commerce.minWithdrawalMinor)}
            </div>
            {bool("taxEnabled", "Charge tax", s.commerce.taxEnabled)}
            <SubmitButton>Save commerce</SubmitButton>
          </ApiForm>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Features</h2>
          <ApiForm action="/api/v1/admin/settings" method="PUT" extra={{ section: "features" }} success={{ message: "Features saved" }} className="mt-4 space-y-3">
            {bool("walletEnabled", "Wallet", s.features.walletEnabled)}
            {bool("referralsEnabled", "Referral programme", s.features.referralsEnabled)}
            {num("features", "referralRewardMinor", "Referral reward (kobo, promotional credit)", s.features.referralRewardMinor)}
            {bool("marketplaceEnabled", "Marketplace", s.features.marketplaceEnabled)}
            {bool("withdrawalsEnabled", "Wallet withdrawals", s.features.withdrawalsEnabled)}
            {bool("registrationsOpen", "Allow new registrations", s.features.registrationsOpen)}
            <SubmitButton>Save features</SubmitButton>
          </ApiForm>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold">Payment providers</h2>
          <p className="mt-1 text-sm text-slate-600">Credentials are read from environment variables only and never stored in the database. See docs/PAYMENTS.md.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {providerStatuses().map((p) => (
              <li key={p.key} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                <span>{p.displayName}</span>
                <span className="space-x-1">
                  <Badge tone={p.enabled ? "blue" : "gray"}>{p.enabled ? "enabled" : "disabled"}</Badge>
                  <Badge tone={p.configured ? "green" : "amber"}>{p.configured ? "configured" : "needs credentials"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
