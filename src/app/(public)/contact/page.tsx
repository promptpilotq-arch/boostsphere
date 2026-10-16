import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Field, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Contact", description: "Get in touch with the team." };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const s = await getSettings();
  return (
    <div className="container-page grid max-w-5xl gap-10 py-12 md:grid-cols-[1fr_320px]">
      <div>
        <PageHeader title="Contact us" description="Questions about a service, partnership or the marketplace? Send us a message." />
        <ApiForm action="/api/v1/contact" success={{ message: "Thanks! We'll reply by email.", reset: true }} className="card space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <input id="name" name="name" className="input" required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <input id="email" name="email" type="email" className="input" required autoComplete="email" />
            </Field>
          </div>
          <Field label="Subject" htmlFor="subject" required>
            <input id="subject" name="subject" className="input" required />
          </Field>
          <Field label="Message" htmlFor="message" required hint="Please don't include passwords or payment card details.">
            <textarea id="message" name="message" rows={6} className="input" required minLength={10} />
          </Field>
          <SubmitButton>Send message</SubmitButton>
        </ApiForm>
      </div>
      <aside className="space-y-4 pt-2 md:pt-24">
        <div className="card p-5">
          <p className="font-semibold">Email</p>
          <a href={`mailto:${s.brand.supportEmail}`} className="link text-sm">
            {s.brand.supportEmail}
          </a>
        </div>
        <div className="card p-5">
          <p className="font-semibold">Address</p>
          <p className="text-sm text-slate-600">{s.brand.companyAddress}</p>
        </div>
        <div className="card p-5">
          <p className="font-semibold">Existing order?</p>
          <p className="text-sm text-slate-600">Open a support ticket from your dashboard so we can see your order details.</p>
        </div>
      </aside>
    </div>
  );
}
