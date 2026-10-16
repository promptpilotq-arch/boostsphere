import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { route } from "@/server/http";
import { audit } from "@/server/audit";

// Neutralise spreadsheet formula injection and quote every cell.
function cell(v: unknown): string {
  let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

/** CSV exports for accounting and analysis: orders | payments | refunds | transactions */
export const GET = route<{ kind: string }>(
  async ({ auth, params, query, ip }) => {
    const since = new Date(Date.now() - Math.min(730, Number(query.get("days")) || 90) * 86_400_000);
    let body: string;
    switch (params.kind) {
      case "orders": {
        const rows = await db.serviceOrder.findMany({ where: { createdAt: { gte: since } }, include: { service: true, user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
        body = csv(["number", "created", "customer", "service", "status", "currency", "subtotal_minor", "discount_minor", "tax_minor", "fee_minor", "total_minor", "paid_at"], rows.map((o) => [o.number, o.createdAt, o.user.email, o.service.name, o.status, o.currency, o.subtotalMinor, o.discountMinor, o.taxMinor, o.feeMinor, o.totalMinor, o.paidAt]));
        break;
      }
      case "payments": {
        const rows = await db.payment.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });
        body = csv(["reference", "created", "provider", "provider_reference", "purpose", "status", "currency", "amount_minor", "provider_fee_minor", "verified_at"], rows.map((p) => [p.reference, p.createdAt, p.provider, p.providerReference, p.purpose, p.status, p.currency, p.amountMinor, p.providerFeeMinor, p.verifiedAt]));
        break;
      }
      case "refunds": {
        const rows = await db.refund.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });
        body = csv(["id", "created", "status", "destination", "currency", "amount_minor", "reason", "processed_at"], rows.map((r) => [r.id, r.createdAt, r.status, r.destination, r.currency, r.amountMinor, r.reason, r.processedAt]));
        break;
      }
      case "transactions": {
        const rows = await db.transaction.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });
        body = csv(["id", "created", "type", "source_type", "source_id", "currency", "amount_minor", "description"], rows.map((t) => [t.id, t.createdAt, t.type, t.sourceType, t.sourceId, t.currency, t.amountMinor, t.description]));
        break;
      }
      default:
        throw notFound("Export");
    }
    await audit({ actorId: auth.user.id, action: "export.downloaded", entityType: "export", entityId: params.kind, ip });
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  },
  { permission: "analytics:read" },
);
