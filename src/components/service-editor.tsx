import type { Service, ServiceCategory, ServicePackage, SocialPlatform } from "@prisma/client";
import { ApiForm, SubmitButton } from "./client/api-form";
import { Card, Field } from "./ui";

const EXAMPLE_FIELDS = JSON.stringify(
  [
    { key: "target_url", label: "Public post URL", type: "url", required: true, allowedHosts: ["instagram.com"] },
    { key: "goals", label: "Campaign goals", type: "textarea", required: false },
  ],
  null,
  2,
);

/** Admin editor for a service and its packages. Prices are entered in major units (₦). */
export function ServiceEditor({ service, platforms }: { service?: Service & { packages: ServicePackage[] }; platforms: (SocialPlatform & { categories: ServiceCategory[] })[] }) {
  const pk = [...(service?.packages ?? []), ...Array.from({ length: 3 }, () => null)];
  const m = (minor?: number | null) => (minor != null ? minor / 100 : undefined);
  return (
    <ApiForm action={service ? `/api/v1/admin/services/${service.id}` : "/api/v1/admin/services"} method={service ? "PUT" : "POST"} success={{ message: "Service saved", redirect: service ? undefined : "/admin/services/{service.id}" }} className="space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Basics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required>
            <input id="name" name="name" defaultValue={service?.name} required className="input" />
          </Field>
          <Field label="URL slug" htmlFor="slug" required hint="lowercase-with-dashes">
            <input id="slug" name="slug" defaultValue={service?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input" />
          </Field>
          <Field label="Category" htmlFor="categoryId" required hint="Platform is derived from the category.">
            <select id="categoryId" name="categoryId" defaultValue={service?.categoryId} className="input" required>
              {platforms.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {p.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {p.name} — {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Platform" htmlFor="platformId" required hint="Must match the category's platform.">
            <select id="platformId" name="platformId" defaultValue={service?.platformId} className="input" required>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Summary" htmlFor="summary" required>
          <input id="summary" name="summary" defaultValue={service?.summary} required className="input" maxLength={240} />
        </Field>
        <Field label="Description" htmlFor="description" required>
          <textarea id="description" name="description" defaultValue={service?.description} rows={6} required className="input" />
        </Field>
        <Field label="Image URL" htmlFor="imageUrl">
          <input id="imageUrl" name="imageUrl" defaultValue={service?.imageUrl ?? ""} className="input" type="url" />
        </Field>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pricing model" htmlFor="pricingModel">
            <select id="pricingModel" name="pricingModel" defaultValue={service?.pricingModel ?? "PACKAGE"} className="input">
              <option value="PACKAGE">Fixed packages</option>
              <option value="PER_UNIT">Per unit (quantity)</option>
            </select>
          </Field>
          <Field label="Currency" htmlFor="currency">
            <input id="currency" name="currency" defaultValue={service?.currency ?? "NGN"} className="input" maxLength={3} />
          </Field>
          <Field label="Unit price (per unit size)" htmlFor="unitPriceMinor" hint="Per-unit services only">
            <input id="unitPriceMinor" name="unitPriceMinor" data-money type="number" step="0.01" min="0" defaultValue={m(service?.unitPriceMinor)} className="input" />
          </Field>
          <Field label="Unit size" htmlFor="unitSize">
            <input id="unitSize" name="unitSize" type="number" min={1} defaultValue={service?.unitSize ?? 1} className="input" />
          </Field>
          <Field label="Unit label" htmlFor="unitLabel">
            <input id="unitLabel" name="unitLabel" defaultValue={service?.unitLabel ?? "unit"} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min qty" htmlFor="minQuantity">
              <input id="minQuantity" name="minQuantity" type="number" min={1} defaultValue={service?.minQuantity ?? undefined} className="input" />
            </Field>
            <Field label="Max qty" htmlFor="maxQuantity">
              <input id="maxQuantity" name="maxQuantity" type="number" min={1} defaultValue={service?.maxQuantity ?? undefined} className="input" />
            </Field>
          </div>
        </div>
        <h3 className="pt-2 text-sm font-semibold">Packages</h3>
        <p className="text-xs text-slate-500">Leave a row's name empty to skip it. Removing a package that has orders deactivates it instead of deleting.</p>
        <div className="space-y-3">
          {pk.map((p, i) => (
            <div key={p?.id ?? `new-${i}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_140px_1fr_90px]">
              {p && <input type="hidden" name={`packages[${i}].id`} value={p.id} />}
              <input name={`packages[${i}].name`} defaultValue={p?.name} placeholder="Package name" className="input" aria-label="Package name" />
              <input name={`packages[${i}].priceMinor`} data-money type="number" step="0.01" min="0" defaultValue={m(p?.priceMinor)} placeholder="Price" className="input" aria-label="Package price" />
              <textarea name={`packages[${i}].features`} data-lines rows={2} defaultValue={p?.features.join("\n")} placeholder="Features, one per line" className="input" aria-label="Package features" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`packages[${i}].active`} defaultChecked={p?.active ?? true} /> Active
              </label>
              <input type="hidden" name={`packages[${i}].description`} value={p?.description ?? ""} />
              <input type="hidden" name={`packages[${i}].currency`} value={p?.currency ?? service?.currency ?? "NGN"} />
              <input type="hidden" name={`packages[${i}].sortOrder`} value={i} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Delivery & customer input</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fulfillment type" htmlFor="fulfillmentType">
            <select id="fulfillmentType" name="fulfillmentType" defaultValue={service?.fulfillmentType ?? "MANUAL"} className="input">
              <option value="MANUAL">Manual</option>
              <option value="AD_CAMPAIGN">Advertising campaign setup</option>
              <option value="CONSULTATION">Consultation</option>
              <option value="DIGITAL_DELIVERABLE">Digital deliverable</option>
              <option value="PROVIDER_API">Authorized provider API</option>
            </select>
          </Field>
          <Field label="Provider adapter key" htmlFor="providerKey" hint="Only for provider API fulfillment.">
            <input id="providerKey" name="providerKey" defaultValue={service?.providerKey ?? ""} className="input" data-nullable />
          </Field>
          <Field label="Estimated duration" htmlFor="estimatedDuration" required>
            <input id="estimatedDuration" name="estimatedDuration" defaultValue={service?.estimatedDuration} required className="input" />
          </Field>
        </div>
        <Field label="Customer input fields (JSON)" htmlFor="inputFields" hint='Types: url, text, textarea, number, select, email. Credential-like fields (password, code, cookie…) are rejected.'>
          <textarea id="inputFields" name="inputFields" data-json rows={8} defaultValue={service ? JSON.stringify(service.inputFields, null, 2) : EXAMPLE_FIELDS} className="input font-mono text-xs" />
        </Field>
        <Field label="Delivery notes" htmlFor="deliveryNotes">
          <textarea id="deliveryNotes" name="deliveryNotes" rows={2} defaultValue={service?.deliveryNotes} className="input" />
        </Field>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Policies</h2>
        <Field label="Outcome disclaimer" htmlFor="outcomeDisclaimer" required>
          <input id="outcomeDisclaimer" name="outcomeDisclaimer" defaultValue={service?.outcomeDisclaimer ?? "Promotion increases visibility to real audiences. Results such as follows, views or sales are not guaranteed."} required className="input" />
        </Field>
        <Field label="Eligibility" htmlFor="eligibility" required>
          <textarea id="eligibility" name="eligibility" rows={2} defaultValue={service?.eligibility} required className="input" />
        </Field>
        <Field label="Refund & cancellation policy" htmlFor="refundPolicy" required>
          <textarea id="refundPolicy" name="refundPolicy" rows={2} defaultValue={service?.refundPolicy} required className="input" />
        </Field>
        <Field label="Terms" htmlFor="terms" required>
          <textarea id="terms" name="terms" rows={3} defaultValue={service?.terms} required className="input" />
        </Field>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="refundable" defaultChecked={service?.refundable ?? true} /> Refundable
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="featured" defaultChecked={service?.featured} /> Featured
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={service?.status ?? "DRAFT"} className="input">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>
          <Field label="Sort order" htmlFor="sortOrder">
            <input id="sortOrder" name="sortOrder" type="number" defaultValue={service?.sortOrder ?? 0} className="input" />
          </Field>
        </div>
      </Card>
      <SubmitButton>{service ? "Save service" : "Create service"}</SubmitButton>
    </ApiForm>
  );
}
