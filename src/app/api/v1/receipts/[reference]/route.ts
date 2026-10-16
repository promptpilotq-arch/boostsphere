import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { isStaff } from "@/server/auth/rbac";
import { route } from "@/server/http";
import { getSettings } from "@/server/settings";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Downloadable HTML receipt for a successful payment. */
export const GET = route<{ reference: string }>(
  async ({ auth, params }) => {
    const p = await db.payment.findUnique({
      where: { reference: params.reference },
      include: { order: { include: { service: true, package: true } }, purchase: { include: { listing: true } }, refunds: { where: { status: "SUCCEEDED" } }, user: { include: { profile: true } } },
    });
    if (!p || (p.userId !== auth.user.id && !isStaff(auth.user.roles))) throw notFound("Receipt");
    if (!["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status)) throw notFound("Receipt");
    const s = await getSettings();
    const lines: [string, number][] = [];
    if (p.order) {
      const snap = p.order.pricingSnapshot as { lines?: { label: string; amountMinor: number }[] };
      for (const l of snap.lines ?? []) lines.push([l.label, l.amountMinor]);
    } else if (p.purchase) {
      lines.push([`Marketplace purchase: ${p.purchase.listing.title}`, p.purchase.priceMinor]);
      if (p.purchase.buyerFeeMinor) lines.push(["Marketplace service fee", p.purchase.buyerFeeMinor]);
    } else lines.push(["Wallet deposit", p.amountMinor]);
    const refunded = p.refunds.reduce((n, r) => n + r.amountMinor, 0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.reference)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#0f172a;padding:0 16px}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #e2e8f0}td:last-child{text-align:right}.muted{color:#64748b;font-size:14px}h1{font-size:22px}</style></head><body>
<h1>${esc(s.brand.name)} — Receipt</h1>
<p class="muted">${esc(s.brand.companyLegalName)}<br>${esc(s.brand.companyAddress)}<br>${esc(s.brand.supportEmail)}</p>
<p><strong>Receipt:</strong> ${esc(p.reference)}<br><strong>Date:</strong> ${(p.verifiedAt ?? p.createdAt).toISOString().slice(0, 10)}<br><strong>Billed to:</strong> ${esc(p.user.profile?.displayName ?? "")} (${esc(p.user.email)})<br><strong>Paid via:</strong> ${esc(p.provider)}${p.order ? `<br><strong>Order:</strong> ${esc(p.order.number)}` : ""}${p.purchase ? `<br><strong>Purchase:</strong> ${esc(p.purchase.number)}` : ""}</p>
<table>${lines.map(([l, a]) => `<tr><td>${esc(l)}</td><td>${formatMoney(a, p.currency)}</td></tr>`).join("")}
<tr><td><strong>Total paid</strong></td><td><strong>${formatMoney(p.amountMinor, p.currency)}</strong></td></tr>
${refunded ? `<tr><td>Refunded</td><td>−${formatMoney(refunded, p.currency)}</td></tr>` : ""}</table>
<p class="muted">Card details are processed by the payment provider and are never stored by ${esc(s.brand.name)}.</p></body></html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="receipt-${p.reference}.html"`, "Cache-Control": "private, no-store" },
    });
  },
  { auth: "required" },
);
