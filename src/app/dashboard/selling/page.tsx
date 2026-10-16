import Link from "next/link";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { FileUpload } from "@/components/client/file-upload";
import { Badge, Card, EmptyState, Field, Money, Notice, PageHeader, StatusBadge, Table, Td, fmtDate } from "@/components/ui";

export default async function SellingPage() {
  const auth = await requireUserPage("/dashboard/selling");
  const profile = await db.sellerProfile.findUnique({ where: { userId: auth.user.id } });
  const listings = profile ? await db.marketplaceListing.findMany({ where: { sellerId: profile.id }, orderBy: { updatedAt: "desc" }, include: { platform: true } }) : [];

  return (
    <>
      <PageHeader
        title="Selling"
        description="List digital assets that you own and that the platform allows to be transferred."
        actions={
          profile && (
            <Link href="/dashboard/selling/new" className="btn-primary">
              New listing
            </Link>
          )
        }
      />
      <div className="mb-6">
        <Notice tone="amber" title="Seller rules">
          Only list assets you own whose transfer the platform permits. Never list stolen, hacked or purchased-credential accounts. Transfers must use the platform&apos;s official tools — never share passwords or login codes. Violations lead to removal and account suspension.
        </Notice>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Seller profile</h2>
          <ApiForm action="/api/v1/seller" extra={{ action: "save_profile" }} success={{ message: "Seller profile saved" }} className="mt-4 space-y-4">
            <Field label="Public display name" htmlFor="displayName" required>
              <input id="displayName" name="displayName" defaultValue={profile?.displayName ?? auth.user.displayName} required className="input" />
            </Field>
            <Field label="Bio" htmlFor="bio">
              <textarea id="bio" name="bio" rows={3} defaultValue={profile?.bio ?? ""} className="input" />
            </Field>
            <SubmitButton>{profile ? "Save profile" : "Create seller profile"}</SubmitButton>
          </ApiForm>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Verification</h2>
            <StatusBadge status={profile?.verificationStatus ?? "UNVERIFIED"} />
          </div>
          {!profile ? (
            <p className="mt-3 text-sm text-slate-600">Create a seller profile first.</p>
          ) : profile.verificationStatus === "VERIFIED" ? (
            <p className="mt-3 text-sm text-slate-600">You&apos;re verified. Listings you submit go to moderation.</p>
          ) : profile.verificationStatus === "PENDING" ? (
            <p className="mt-3 text-sm text-slate-600">Our team is reviewing your request. You can add more documents below if we ask for them.</p>
          ) : (
            <ApiForm action="/api/v1/seller" extra={{ action: "request_verification" }} success={{ message: "Verification requested" }} className="mt-4 space-y-4">
              {profile.verificationStatus === "REJECTED" && profile.verificationNote && <Notice tone="red">Previous request declined: {profile.verificationNote}</Notice>}
              <Field label="Tell us who you are" htmlFor="statement" hint="Your legal name or business name, and how you own the assets you plan to list. Then upload your documents below.">
                <textarea id="statement" name="statement" rows={4} required minLength={30} className="input" />
              </Field>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="attest" required className="mt-0.5 h-4 w-4" /> I confirm I will only list assets I lawfully own and that the platform allows to be transferred.
              </label>
              <SubmitButton>Request verification</SubmitButton>
            </ApiForm>
          )}
          {profile && profile.verificationStatus !== "VERIFIED" && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium">Verification documents ({profile.verificationDocKeys.length}/5)</p>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                Government ID and, for businesses, CAC registration or proof of ownership of the assets you&apos;ll list. Stored privately; only our verification team can view them.
              </p>
              {profile.verificationDocKeys.length > 0 && (
                <ul className="mb-3 space-y-1 text-sm">
                  {profile.verificationDocKeys.map((k, i) => (
                    <li key={k}>
                      <a className="link" href={`/api/v1/files/${k}`} target="_blank" rel="noopener">
                        Document {i + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {profile.verificationDocKeys.length < 5 && <FileUpload endpoint="/api/v1/seller" field="document" accept="image/png,image/jpeg,image/webp,application/pdf" label="PNG, JPEG, WebP or PDF, up to 5 MB" successMessage="Document uploaded" />}
            </div>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Your listings</h2>
      {listings.length ? (
        <Table head={["Listing", "Platform", "Price", "Status", "Updated", ""]}>
          {listings.map((l) => (
            <tr key={l.id}>
              <Td className="max-w-[260px] truncate">
                <Link href={`/dashboard/selling/${l.id}`} className="link">
                  {l.title}
                </Link>
              </Td>
              <Td>{l.platform.name}</Td>
              <Td>
                <Money minor={l.askingPriceMinor} currency={l.currency} />
              </Td>
              <Td>
                <StatusBadge status={l.status} />
                {l.status === "REJECTED" && l.moderationNote && <span className="ml-2 text-xs text-slate-500">{l.moderationNote}</span>}
              </Td>
              <Td>{fmtDate(l.updatedAt)}</Td>
              <Td className="space-x-2">
                {["DRAFT", "REJECTED", "WITHDRAWN"].includes(l.status) && (
                  <ActionButton endpoint={`/api/v1/seller/listings/${l.id}`} body={{ action: "submit" }} className="btn-primary px-3 py-1.5" successMessage="Submitted for review">
                    Submit for review
                  </ActionButton>
                )}
                {["APPROVED", "PENDING_REVIEW", "DRAFT"].includes(l.status) && (
                  <ActionButton endpoint={`/api/v1/seller/listings/${l.id}`} body={{ action: "withdraw" }} className="btn-ghost px-3 py-1.5" confirm="Withdraw this listing?">
                    Withdraw
                  </ActionButton>
                )}
                {l.status === "APPROVED" && <Badge tone="green">Live</Badge>}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No listings yet" description={profile ? "Create your first listing. It stays private until approved." : "Create a seller profile to start."} />
      )}
    </>
  );
}
