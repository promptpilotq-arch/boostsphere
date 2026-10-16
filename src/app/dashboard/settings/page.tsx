import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Card, Field, PageHeader } from "@/components/ui";

export default async function ProfileSettings() {
  const auth = await requireUserPage("/dashboard/settings");
  const p = await db.userProfile.findUnique({ where: { userId: auth.user.id } });
  return (
    <>
      <PageHeader title="Profile" description="We only collect what we need to deliver your orders." />
      <Card className="max-w-2xl p-6">
        <ApiForm action="/api/v1/me" method="PATCH" success={{ message: "Profile saved" }} className="space-y-4">
          <Field label="Email" htmlFor="email" hint="Contact support to change your sign-in email.">
            <input id="email" value={auth.user.email} disabled className="input" readOnly />
          </Field>
          <Field label="Display name" htmlFor="displayName" required>
            <input id="displayName" name="displayName" defaultValue={p?.displayName ?? ""} required className="input" />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="Optional. Used only for order-related contact.">
            <input id="phone" name="phone" defaultValue={p?.phone ?? ""} className="input" type="tel" autoComplete="tel" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country" htmlFor="country">
              <select id="country" name="country" defaultValue={p?.country ?? "NG"} className="input">
                {[["NG", "Nigeria"], ["GH", "Ghana"], ["KE", "Kenya"], ["ZA", "South Africa"], ["GB", "United Kingdom"], ["US", "United States"], ["CA", "Canada"]].map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Preferred currency" htmlFor="preferredCurrency">
              <select id="preferredCurrency" name="preferredCurrency" defaultValue={p?.preferredCurrency ?? "NGN"} className="input">
                <option>NGN</option>
                <option>USD</option>
                <option>GBP</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="marketingOptIn" defaultChecked={p?.marketingOptIn} className="h-4 w-4" /> Send me occasional product updates
          </label>
          <SubmitButton>Save profile</SubmitButton>
        </ApiForm>
      </Card>
    </>
  );
}
