import type { OrderStatus, Prisma, ServiceOrder } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { humanId } from "@/lib/crypto";
import { canTransition, ORDER_STATUS_LABEL, type Actor } from "@/lib/order-status";
import { parseInputFields, validateInputs } from "@/lib/service-inputs";
import { computePrice, resolveCoupon } from "./pricing";
import { getSettings } from "./settings";
import { notify } from "./notify";
import { audit } from "./audit";
import { dispatchFulfillment } from "./fulfillment";
import type { AuthUser } from "./auth/session";
import { isStaff } from "./auth/rbac";

export const createOrderSchema = z.object({
  serviceId: z.string().min(1),
  packageId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().positive().default(1),
  inputs: z.record(z.unknown()).default({}),
  couponCode: z.string().trim().max(40).optional().nullable(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the service terms" }) }),
});

export const quoteSchema = createOrderSchema.omit({ acceptTerms: true, inputs: true });

async function loadOrderableService(serviceId: string, packageId?: string | null) {
  const service = await db.service.findUnique({ where: { id: serviceId }, include: { platform: true, packages: true } });
  if (!service || service.status !== "PUBLISHED" || service.platform.status !== "PUBLISHED") {
    throw new AppError("VALIDATION_ERROR", "This service is not currently available");
  }
  let pkg = null;
  if (service.pricingModel === "PACKAGE") {
    pkg = service.packages.find((p) => p.id === packageId && p.active) ?? null;
    if (!pkg) throw new AppError("VALIDATION_ERROR", "Choose an available package");
  }
  return { service, pkg };
}

/** Server-side quote. Used for the checkout preview and again when the order is created. */
export async function quote(input: z.infer<typeof quoteSchema>, userId: string | null) {
  const { service, pkg } = await loadOrderableService(input.serviceId, input.packageId);
  const coupon = await resolveCoupon(input.couponCode, userId, service);
  const settings = await getSettings();
  return computePrice({ service, pkg, quantity: input.quantity, coupon, commerce: settings.commerce });
}

export async function createOrder(user: AuthUser, input: z.infer<typeof createOrderSchema>) {
  if (user.status !== "ACTIVE") throw forbidden("Your account cannot place orders");
  if (!user.emailVerifiedAt) throw new AppError("FORBIDDEN", "Please verify your email address before placing an order");
  const { service, pkg } = await loadOrderableService(input.serviceId, input.packageId);
  const fields = parseInputFields(service.inputFields);
  const checked = validateInputs(fields, input.inputs);
  if (!checked.ok) throw new AppError("VALIDATION_ERROR", checked.errors[0].message, checked.errors);
  const coupon = await resolveCoupon(input.couponCode, user.id, service);
  const settings = await getSettings();
  const price = computePrice({ service, pkg, quantity: input.quantity, coupon, commerce: settings.commerce });

  const order = await db.$transaction(async (tx) => {
    const o = await tx.serviceOrder.create({
      data: {
        number: humanId("BS"),
        userId: user.id,
        serviceId: service.id,
        packageId: pkg?.id ?? null,
        quantity: price.quantity,
        inputs: checked.values,
        currency: price.currency,
        subtotalMinor: price.subtotalMinor,
        discountMinor: price.discountMinor,
        taxMinor: price.taxMinor,
        feeMinor: price.feeMinor,
        totalMinor: price.totalMinor,
        pricingSnapshot: price as unknown as Prisma.InputJsonValue,
        couponId: price.couponId,
        fulfillmentType: service.fulfillmentType,
        termsAcceptedAt: new Date(),
      },
    });
    await tx.orderEvent.create({
      data: { orderId: o.id, toStatus: "PENDING_PAYMENT", type: "STATUS_CHANGE", message: "Order created", actorId: user.id, actorType: "CUSTOMER" },
    });
    return o;
  });
  return order;
}

/** The single place where order status changes happen. Validates the transition and records an event. */
export async function transitionOrder(
  tx: Tx,
  orderId: string,
  to: OrderStatus,
  actor: { type: Actor; id?: string | null },
  message?: string,
  extra: Prisma.ServiceOrderUpdateInput = {},
): Promise<ServiceOrder> {
  await tx.$queryRaw`SELECT id FROM service_orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order");
  if (order.status === to) return order;
  if (!canTransition(order.status, to, actor.type)) {
    throw new AppError("CONFLICT", `Order cannot move from ${ORDER_STATUS_LABEL[order.status]} to ${ORDER_STATUS_LABEL[to]}`);
  }
  const updated = await tx.serviceOrder.update({
    where: { id: orderId },
    data: {
      status: to,
      ...(to === "COMPLETED" ? { completedAt: new Date() } : {}),
      ...extra,
    },
  });
  await tx.orderEvent.create({
    data: { orderId, fromStatus: order.status, toStatus: to, type: "STATUS_CHANGE", message: message ?? null, actorId: actor.id ?? null, actorType: actor.type },
  });
  return updated;
}

/** Called by payment processing (inside its transaction) once a payment is verified. */
export async function markOrderPaid(tx: Tx, orderId: string, paymentId: string) {
  const order = await transitionOrder(tx, orderId, "PAYMENT_CONFIRMED", { type: "SYSTEM" }, "Payment verified", { paidAt: new Date() });
  if (order.couponId) {
    const created = await tx.couponRedemption.createMany({
      data: [{ couponId: order.couponId, userId: order.userId, orderId: order.id, discountMinor: order.discountMinor }],
      skipDuplicates: true,
    });
    if (created.count) await tx.coupon.update({ where: { id: order.couponId }, data: { redemptionCount: { increment: 1 } } });
  }
  await audit({ action: "order.paid", entityType: "order", entityId: orderId, metadata: { paymentId } }, tx);
  return order;
}

/** Post-commit side effects after payment: notifications and fulfillment dispatch. */
export async function afterOrderPaid(orderId: string) {
  const order = await db.serviceOrder.findUnique({ where: { id: orderId }, include: { service: true } });
  if (!order) return;
  await notify(order.userId, {
    type: "order.paid",
    title: `Payment confirmed for order ${order.number}`,
    body: `We've received your payment for ${order.service.name}. Our team will begin work shortly.`,
    link: `/dashboard/orders/${order.id}`,
  });
  await dispatchFulfillment(order.id);
}

export async function getOrderForViewer(orderId: string, viewer: AuthUser) {
  const order = await db.serviceOrder.findUnique({
    where: { id: orderId },
    include: {
      service: { include: { platform: true } },
      package: true,
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      assignee: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
    },
  });
  if (!order) throw notFound("Order");
  const staff = isStaff(viewer.roles);
  // Return 404 rather than 403 so order ids can't be probed.
  if (order.userId !== viewer.id && !staff) throw notFound("Order");
  if (!staff) {
    order.events = order.events.filter((e) => !e.internal);
    (order as { assignee: unknown }).assignee = null;
    (order.service as { providerKey: unknown }).providerKey = undefined;
  }
  return order;
}

export async function cancelOrder(orderId: string, user: AuthUser) {
  const order = await db.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) throw notFound("Order");
  const result = await db.$transaction((tx) => transitionOrder(tx, orderId, "CANCELLED", { type: "CUSTOMER", id: user.id }, "Cancelled by customer"));
  await db.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "ABANDONED" } });
  return result;
}

/** Customer supplies information requested by staff (AWAITING_CUSTOMER_INFO → PROCESSING). */
export async function provideOrderInfo(orderId: string, user: AuthUser, message: string) {
  const order = await db.serviceOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) throw notFound("Order");
  if (order.status !== "AWAITING_CUSTOMER_INFO") throw new AppError("CONFLICT", "This order is not waiting for information");
  return db.$transaction(async (tx) => {
    await tx.orderEvent.create({ data: { orderId, type: "INFO_PROVIDED", message, actorId: user.id, actorType: "CUSTOMER" } });
    return transitionOrder(tx, orderId, "PROCESSING", { type: "CUSTOMER", id: user.id }, "Customer provided the requested information");
  });
}

export const staffOrderUpdateSchema = z.object({
  status: z.nativeEnum({
    PROCESSING: "PROCESSING",
    IN_PROGRESS: "IN_PROGRESS",
    AWAITING_CUSTOMER_INFO: "AWAITING_CUSTOMER_INFO",
    COMPLETED: "COMPLETED",
    UNDER_REVIEW: "UNDER_REVIEW",
  } as const).nullable().optional(),
  message: z.string().max(2000).optional(),
  internalNote: z.string().max(2000).optional(),
  assigneeId: z.string().nullable().optional(),
  completionEvidence: z.string().max(4000).optional(),
});

export async function staffUpdateOrder(orderId: string, staff: AuthUser, input: z.infer<typeof staffOrderUpdateSchema>, ip?: string) {
  const order = await db.serviceOrder.findUnique({ where: { id: orderId }, include: { service: true } });
  if (!order) throw notFound("Order");
  if (input.status === "COMPLETED" && !input.completionEvidence && !order.completionEvidence) {
    throw new AppError("VALIDATION_ERROR", "Add evidence of completion (report link, campaign summary or deliverable) before completing");
  }
  const updated = await db.$transaction(async (tx) => {
    if (input.assigneeId !== undefined && input.assigneeId !== order.assigneeId) {
      let assigneeLabel = "nobody";
      if (input.assigneeId) {
        const assignee = await tx.user.findUnique({ where: { id: input.assigneeId }, include: { roles: { include: { role: true } } } });
        if (!assignee || !isStaff(assignee.roles.map((r) => r.role.key))) throw new AppError("VALIDATION_ERROR", "Assignee must be a staff member");
        assigneeLabel = assignee.email;
      }
      await tx.serviceOrder.update({ where: { id: orderId }, data: { assigneeId: input.assigneeId } });
      await tx.orderEvent.create({ data: { orderId, type: "INTERNAL_NOTE", internal: true, message: `Assigned to ${assigneeLabel}`, actorId: staff.id, actorType: "STAFF" } });
    }
    if (input.completionEvidence) {
      await tx.serviceOrder.update({ where: { id: orderId }, data: { completionEvidence: input.completionEvidence } });
      await tx.orderEvent.create({ data: { orderId, type: "EVIDENCE", message: input.completionEvidence, actorId: staff.id, actorType: "STAFF" } });
    }
    if (input.internalNote) {
      await tx.orderEvent.create({ data: { orderId, type: "INTERNAL_NOTE", internal: true, message: input.internalNote, actorId: staff.id, actorType: "STAFF" } });
    }
    if (input.status) {
      await transitionOrder(tx, orderId, input.status, { type: "STAFF", id: staff.id }, input.message);
    } else if (input.message) {
      await tx.orderEvent.create({ data: { orderId, type: "NOTE", message: input.message, actorId: staff.id, actorType: "STAFF" } });
    }
    await audit({ actorId: staff.id, action: "order.staff_update", entityType: "order", entityId: orderId, metadata: { ...input }, ip }, tx);
    return tx.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
  });
  if (input.status || input.message) {
    await notify(order.userId, {
      type: "order.update",
      title: `Order ${order.number}: ${ORDER_STATUS_LABEL[updated.status]}`,
      body: input.message ?? `Your order for ${order.service.name} is now "${ORDER_STATUS_LABEL[updated.status]}".`,
      link: `/dashboard/orders/${orderId}`,
    });
  }
  return updated;
}

/** Cancel unpaid orders whose payment window has elapsed. Safe to run repeatedly (cron). */
export async function expireStaleOrders() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.commerce.orderPaymentWindowHours * 3_600_000);
  const stale = await db.serviceOrder.findMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: cutoff } }, select: { id: true } });
  for (const o of stale) {
    await db
      .$transaction((tx) => transitionOrder(tx, o.id, "CANCELLED", { type: "SYSTEM" }, "Payment window expired"))
      .catch(() => {});
  }
  return stale.length;
}
