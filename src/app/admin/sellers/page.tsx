import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Card, EmptyState, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

export default async function AdminSellers() {
  await requirePermissionPage("marketplace:moderate");
  const sellers = await db.sellerProfile.findMany({ orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }], include: { user: { select: { email: true, createdAt: true } }, _count: { select: { listings: true } } }, take: 100 });
  const pending = sellers.filter((s) => s.verificationStatus === "PENDING");
  const others = sellers.filter((s) => s.verificationStatus !== "PENDING");
  return (
    <>
      <PageHeader title="Seller verification" description="Verify identity and ownership through a support ticket before approving. Document what you checked in the note." />
      <h2 className="mb-3 text-lg font-semibold">Pending ({pending.length})</h2>
      {pending.length === 0 && <EmptyState title="No pending verification requests" />}
      <div className="space-y-4">
        {pending.map((s) => (
          <Card key={s.id} className="p-5">
            <p className="font-semibold">
              {s.displayName} · <span className="font-normal text-slate-600">{s.user.email}</span>
            </p>
            <p className="text-xs text-slate-500">
              Joined {fmtDateTime(s.user.createdAt)} · requested {s.verificationSubmittedAt ? fmtDateTime(s.verificationSubmittedAt) : "—"}
            </p>
            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{s.verificationNote}</p>
            <p className="mt-2 text-sm">
              Documents:{" "}
              {s.verificationDocKeys.length
                ? s.verificationDocKeys.map((k, i) => (
                    <a key={k} className="link mr-3" href={`/api/v1/files/${k}`} target="_blank" rel="noopener">
                      Document {i + 1}
                    </a>
                  ))
                : <span className="text-amber-700">none uploaded — request them via a support ticket before verifying</span>}
            </p>
            <ApiForm action="/api/v1/admin/marketplace" extra={{ action: "verify_seller", sellerId: s.id }} success={{ message: "Saved" }} className="mt-3 flex flex-wrap gap-2">
              <select name="decision" className="input max-w-[160px]" aria-label="Decision">
                <option value="VERIFIED">Verify</option>
                <option value="REJECTED">Reject</option>
              </select>
              <input name="note" className="input max-w-md" placeholder="What did you check? / reason" aria-label="Note" />
              <SubmitButton>Save</SubmitButton>
            </ApiForm>
          </Card>
        ))}
      </div>
      <h2 className="mb-3 mt-10 text-lg font-semibold">All sellers</h2>
      <Card className="divide-y divide-slate-100">
        {others.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span>
              {s.displayName} · {s.user.email} · {s._count.listings} listings · {s.completedSales} sales
            </span>
            <StatusBadge status={s.verificationStatus} />
          </div>
        ))}
      </Card>
    </>
  );
}
