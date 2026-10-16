import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { humanId } from "@/lib/crypto";
import { isStaff } from "./auth/rbac";
import type { AuthUser } from "./auth/session";
import { audit } from "./audit";
import { notify, notifyStaff } from "./notify";

export const ticketSchema = z.object({
  subject: z.string().trim().min(4).max(140),
  category: z.enum(["ORDER", "PAYMENT", "REFUND", "MARKETPLACE", "ACCOUNT", "OTHER"]),
  body: z.string().trim().min(10).max(5000),
  relatedOrderId: z.string().optional().nullable(),
  relatedPurchaseId: z.string().optional().nullable(),
});

export async function createTicket(user: AuthUser, input: z.infer<typeof ticketSchema>) {
  if (input.relatedOrderId) {
    const o = await db.serviceOrder.findUnique({ where: { id: input.relatedOrderId } });
    if (!o || o.userId !== user.id) throw new AppError("VALIDATION_ERROR", "Related order not found");
  }
  const t = await db.supportTicket.create({
    data: {
      number: humanId("T"),
      userId: user.id,
      subject: input.subject,
      category: input.category,
      relatedOrderId: input.relatedOrderId ?? null,
      relatedPurchaseId: input.relatedPurchaseId ?? null,
      status: "PENDING_STAFF",
      messages: { create: { authorId: user.id, authorRole: "CUSTOMER", body: input.body } },
    },
  });
  await notifyStaff({ type: "ticket.new", title: `New ticket ${t.number}`, body: input.subject, link: `/admin/support/${t.id}` });
  return t;
}

export async function getTicketForViewer(ticketId: string, viewer: AuthUser) {
  const t = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" } }, user: { select: { email: true, profile: { select: { displayName: true } } } } },
  });
  const staff = isStaff(viewer.roles);
  if (!t || (t.userId !== viewer.id && !staff)) throw notFound("Ticket");
  if (!staff) t.messages = t.messages.filter((m) => !m.internal);
  return t;
}

export const replySchema = z.object({ body: z.string().trim().min(1).max(5000), internal: z.boolean().default(false), status: z.enum(["OPEN", "PENDING_CUSTOMER", "PENDING_STAFF", "RESOLVED", "CLOSED"]).optional() });

export async function replyToTicket(viewer: AuthUser, ticketId: string, input: z.infer<typeof replySchema>, ip?: string) {
  const t = await getTicketForViewer(ticketId, viewer);
  const staff = isStaff(viewer.roles) && t.userId !== viewer.id;
  if (t.status === "CLOSED" && !staff) throw new AppError("CONFLICT", "This ticket is closed. Open a new ticket if you need more help.");
  await db.supportMessage.create({ data: { ticketId, authorId: viewer.id, authorRole: staff ? "STAFF" : "CUSTOMER", body: input.body, internal: staff && input.internal } });
  const status = staff ? (input.status ?? (input.internal ? t.status : "PENDING_CUSTOMER")) : "PENDING_STAFF";
  await db.supportTicket.update({ where: { id: ticketId }, data: { status, ...(staff && !t.assigneeId ? { assigneeId: viewer.id } : {}) } });
  if (staff) {
    await audit({ actorId: viewer.id, action: "ticket.reply", entityType: "ticket", entityId: ticketId, metadata: { internal: input.internal, status }, ip });
    if (t.userId && !input.internal) await notify(t.userId, { type: "ticket.reply", title: `Reply on ticket ${t.number}`, body: input.body.slice(0, 200), link: `/dashboard/support/${t.id}` });
  }
}

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(10).max(5000),
});

export async function submitContact(input: z.infer<typeof contactSchema>) {
  const m = await db.contactMessage.create({ data: input });
  await notifyStaff({ type: "contact", title: "New contact message", body: `${input.name}: ${input.subject}`, link: "/admin/support" });
  return m;
}

// ───────────── Reviews (verified purchasers only) ─────────────

export const reviewSchema = z.object({
  orderId: z.string().optional(),
  purchaseId: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(100),
  body: z.string().trim().min(10).max(2000),
});

export async function submitReview(user: AuthUser, input: z.infer<typeof reviewSchema>) {
  if (input.orderId) {
    const o = await db.serviceOrder.findUnique({ where: { id: input.orderId } });
    if (!o || o.userId !== user.id) throw notFound("Order");
    if (o.status !== "COMPLETED") throw new AppError("CONFLICT", "You can review an order once it is completed");
    return db.review.create({ data: { userId: user.id, orderId: o.id, serviceId: o.serviceId, rating: input.rating, title: input.title, body: input.body } }).catch(() => {
      throw new AppError("CONFLICT", "You have already reviewed this order");
    });
  }
  if (input.purchaseId) {
    const p = await db.purchaseTransaction.findUnique({ where: { id: input.purchaseId } });
    if (!p || p.buyerId !== user.id) throw notFound("Purchase");
    if (p.status !== "COMPLETED") throw new AppError("CONFLICT", "You can review a purchase once it is completed");
    return db.review.create({ data: { userId: user.id, purchaseId: p.id, rating: input.rating, title: input.title, body: input.body } }).catch(() => {
      throw new AppError("CONFLICT", "You have already reviewed this purchase");
    });
  }
  throw new AppError("VALIDATION_ERROR", "A review must reference a completed order or purchase");
}

export async function moderateReview(staff: AuthUser, id: string, status: "APPROVED" | "REJECTED", featured: boolean, ip?: string) {
  const r = await db.review.update({ where: { id }, data: { status, featured: status === "APPROVED" && featured } });
  await audit({ actorId: staff.id, action: `review.${status.toLowerCase()}`, entityType: "review", entityId: id, ip });
  return r;
}
