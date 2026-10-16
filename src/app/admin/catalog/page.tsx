import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { PlatformIcon } from "@/components/platform-icon";
import { Card, Field, PageHeader, StatusBadge } from "@/components/ui";

export default async function AdminCatalog() {
  await requirePermissionPage("catalog:manage");
  const platforms = await db.socialPlatform.findMany({ orderBy: { sortOrder: "asc" }, include: { categories: { orderBy: { sortOrder: "asc" } } } });
  const faqs = await db.faqItem.findMany({ orderBy: [{ platformId: "asc" }, { sortOrder: "asc" }], include: { platform: true } });
  return (
    <>
      <PageHeader title="Platforms & content" description="Control which platforms are visible, whether their marketplace is open, categories, and help-center FAQs." />
      <div className="space-y-4">
        {platforms.map((p) => (
          <details key={p.id} className="card p-5">
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <PlatformIcon iconKey={p.iconKey} name={p.name} color={p.brandColor} size="sm" />
              <span className="font-semibold">{p.name}</span>
              <StatusBadge status={p.status} />
              {p.marketplaceEnabled && <span className="text-xs text-emerald-700">marketplace open</span>}
              <span className="ml-auto text-xs text-slate-500">{p.categories.length} categories</span>
            </summary>
            <ApiForm action="/api/v1/admin/catalog" extra={{ entity: "platform", id: p.id }} success={{ message: "Platform saved" }} className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor={`n-${p.id}`}>
                <input id={`n-${p.id}`} name="data.name" defaultValue={p.name} className="input" />
              </Field>
              <Field label="Slug" htmlFor={`s-${p.id}`}>
                <input id={`s-${p.id}`} name="data.slug" defaultValue={p.slug} className="input" />
              </Field>
              <Field label="Tagline" htmlFor={`t-${p.id}`}>
                <input id={`t-${p.id}`} name="data.tagline" defaultValue={p.tagline} className="input" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Icon key" htmlFor={`i-${p.id}`}>
                  <input id={`i-${p.id}`} name="data.iconKey" defaultValue={p.iconKey} className="input" />
                </Field>
                <Field label="Colour" htmlFor={`c-${p.id}`}>
                  <input id={`c-${p.id}`} name="data.brandColor" defaultValue={p.brandColor} className="input" />
                </Field>
                <Field label="Order" htmlFor={`o-${p.id}`}>
                  <input id={`o-${p.id}`} name="data.sortOrder" type="number" defaultValue={p.sortOrder} className="input" />
                </Field>
              </div>
              <Field label="Description" htmlFor={`d-${p.id}`}>
                <textarea id={`d-${p.id}`} name="data.description" defaultValue={p.description} rows={3} className="input" />
              </Field>
              <Field label="Official transfer guidance (marketplace)" htmlFor={`g-${p.id}`}>
                <textarea id={`g-${p.id}`} name="data.transferGuidance" defaultValue={p.transferGuidance} rows={3} className="input" />
              </Field>
              <Field label="Status" htmlFor={`st-${p.id}`}>
                <select id={`st-${p.id}`} name="data.status" defaultValue={p.status} className="input">
                  {["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input type="checkbox" name="data.marketplaceEnabled" defaultChecked={p.marketplaceEnabled} /> Marketplace open (only if the platform permits ownership transfer)
              </label>
              <div className="sm:col-span-2">
                <SubmitButton>Save platform</SubmitButton>
              </div>
            </ApiForm>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold">Categories</p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {p.categories.map((c) => (
                  <li key={c.id} className="rounded-full bg-slate-100 px-3 py-1">
                    {c.name} <span className="text-slate-400">/{c.slug}</span>
                  </li>
                ))}
              </ul>
              <ApiForm action="/api/v1/admin/catalog" extra={{ entity: "category" }} success={{ message: "Category added", reset: true }} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="data.platformId" value={p.id} />
                <input name="data.name" placeholder="New category name" className="input max-w-[200px]" required aria-label="Category name" />
                <input name="data.slug" placeholder="slug" className="input max-w-[160px]" required aria-label="Category slug" />
                <SubmitButton className="btn-secondary">Add category</SubmitButton>
              </ApiForm>
            </div>
          </details>
        ))}
      </div>

      <Card className="mt-10 p-6">
        <h2 className="font-semibold">Add a platform</h2>
        <ApiForm action="/api/v1/admin/catalog" extra={{ entity: "platform" }} success={{ message: "Platform created", reset: true }} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input name="data.name" placeholder="Name" required className="input" aria-label="Name" />
          <input name="data.slug" placeholder="slug" required className="input" aria-label="Slug" />
          <input name="data.iconKey" placeholder="simple-icons key, e.g. reddit" required className="input" aria-label="Icon key" />
          <input name="data.brandColor" placeholder="#000000" required className="input" aria-label="Brand colour" />
          <input name="data.tagline" placeholder="Tagline" className="input sm:col-span-2" aria-label="Tagline" />
          <input type="hidden" name="data.description" value="" />
          <input type="hidden" name="data.status" value="DRAFT" />
          <SubmitButton>Create (as draft)</SubmitButton>
        </ApiForm>
      </Card>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Help-center FAQs</h2>
      <Card className="divide-y divide-slate-100">
        {faqs.map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{f.question}</p>
              <p className="text-sm text-slate-600">{f.answer}</p>
              <p className="text-xs text-slate-400">{f.platform?.name ?? "General"}</p>
            </div>
            <ActionButton endpoint="/api/v1/admin/catalog" body={{ entity: "faq_delete", id: f.id }} className="btn-ghost text-red-700" confirm="Delete this FAQ?">
              Delete
            </ActionButton>
          </div>
        ))}
      </Card>
      <Card className="mt-4 p-6">
        <h3 className="font-semibold">Add FAQ</h3>
        <ApiForm action="/api/v1/admin/catalog" extra={{ entity: "faq" }} success={{ message: "FAQ added", reset: true }} className="mt-3 space-y-3">
          <select name="data.platformId" className="input" data-nullable aria-label="Platform">
            <option value="">General</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input name="data.question" placeholder="Question" required className="input" aria-label="Question" />
          <textarea name="data.answer" placeholder="Answer" required rows={3} className="input" aria-label="Answer" />
          <SubmitButton>Add FAQ</SubmitButton>
        </ApiForm>
      </Card>
    </>
  );
}
