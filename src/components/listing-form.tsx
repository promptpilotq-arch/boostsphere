import type { MarketplaceListing, SocialPlatform } from "@prisma/client";
import { ApiForm, SubmitButton } from "./client/api-form";
import { Field } from "./ui";

/** Create/edit form for a seller's listing. Price is entered in major units and converted to minor units. */
export function ListingForm({ platforms, listing }: { platforms: SocialPlatform[]; listing?: MarketplaceListing }) {
  const action = listing ? `/api/v1/seller/listings/${listing.id}` : "/api/v1/seller/listings";
  return (
    <ApiForm action={action} method={listing ? "PUT" : "POST"} success={{ message: listing ? "Listing saved" : "Listing created as a draft", redirect: listing ? undefined : "/dashboard/selling/{listing.id}" }} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Platform" htmlFor="platformId" required hint="Only platforms with an official transfer process are available.">
          <select id="platformId" name="platformId" defaultValue={listing?.platformId} className="input" required>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account type" htmlFor="accountType" required>
          <select id="accountType" name="accountType" defaultValue={listing?.accountType ?? "CREATOR"} className="input">
            <option value="CREATOR">Creator profile</option>
            <option value="BUSINESS">Established business profile</option>
            <option value="BRAND">Brand / organization</option>
            <option value="COMMUNITY">Community / publisher property</option>
            <option value="OTHER">Other transferable asset</option>
          </select>
        </Field>
      </div>
      <Field label="Title" htmlFor="title" required>
        <input id="title" name="title" defaultValue={listing?.title} minLength={8} maxLength={120} required className="input" />
      </Field>
      <Field label="Description" htmlFor="description" required hint="Describe the asset honestly. Do not include login details or private messages.">
        <textarea id="description" name="description" rows={6} defaultValue={listing?.description} minLength={40} required className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Niche" htmlFor="niche" required>
          <input id="niche" name="niche" defaultValue={listing?.niche} required className="input" />
        </Field>
        <Field label="Asking price (NGN)" htmlFor="askingPriceMinor" required>
          <input id="askingPriceMinor" name="askingPriceMinor" data-money type="number" min={1} step="0.01" defaultValue={listing ? listing.askingPriceMinor / 100 : undefined} required className="input" />
        </Field>
        <input type="hidden" name="currency" value="NGN" />
        <Field label="Audience size" htmlFor="audienceSize" hint="Seller-reported until verified.">
          <input id="audienceSize" name="audienceSize" type="number" min={0} defaultValue={listing?.audienceSize ?? undefined} className="input" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Year created" htmlFor="accountCreatedYear">
          <input id="accountCreatedYear" name="accountCreatedYear" type="number" min={2004} max={new Date().getFullYear()} defaultValue={listing?.accountCreatedYear ?? undefined} className="input" />
        </Field>
        <Field label="Audience location" htmlFor="audienceLocation">
          <input id="audienceLocation" name="audienceLocation" defaultValue={listing?.audienceLocation ?? ""} className="input" data-nullable />
        </Field>
        <Field label="Language" htmlFor="audienceLanguage">
          <input id="audienceLanguage" name="audienceLanguage" defaultValue={listing?.audienceLanguage ?? ""} className="input" data-nullable />
        </Field>
      </div>
      <Field label="Engagement summary" htmlFor="engagementSummary">
        <textarea id="engagementSummary" name="engagementSummary" rows={2} defaultValue={listing?.engagementSummary ?? ""} className="input" data-nullable />
      </Field>
      <Field label="Historical analytics (redacted)" htmlFor="analyticsSummary" hint="Summaries only. Remove personal data about followers.">
        <textarea id="analyticsSummary" name="analyticsSummary" rows={3} defaultValue={listing?.analyticsSummary ?? ""} className="input" data-nullable />
      </Field>
      <Field label="Authorized transfer method" htmlFor="transferMethod" required hint="Which official platform feature will you use? e.g. 'Transfer primary ownership of the Google Brand Account'.">
        <textarea id="transferMethod" name="transferMethod" rows={3} defaultValue={listing?.transferMethod} minLength={20} required className="input" />
      </Field>
      <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <input type="checkbox" name="transferEligibilityConfirmed" defaultChecked={listing?.transferEligibilityConfirmed} required className="mt-0.5 h-4 w-4" />
        <span>I confirm I am the lawful owner of this asset, it was not obtained through compromised or leaked credentials, and its transfer is permitted by the platform&apos;s terms.</span>
      </label>
      <SubmitButton>{listing ? "Save changes" : "Create draft"}</SubmitButton>
      {listing?.status === "APPROVED" && <p className="text-xs text-slate-500">Saving changes to an approved listing sends it back for moderation.</p>}
    </ApiForm>
  );
}
