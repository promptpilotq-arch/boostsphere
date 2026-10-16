import type { OrderStatus, PurchaseStatus } from "@prisma/client";

export type Actor = "CUSTOMER" | "STAFF" | "SYSTEM";

/**
 * Allowed service-order transitions and who may perform them.
 * PAYMENT_CONFIRMED can only be reached by SYSTEM (verified payment processing) — never by a person.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>> = {
  PENDING_PAYMENT: { PAYMENT_CONFIRMED: ["SYSTEM"], CANCELLED: ["CUSTOMER", "STAFF", "SYSTEM"] },
  PAYMENT_CONFIRMED: { PROCESSING: ["STAFF", "SYSTEM"], REFUND_PENDING: ["CUSTOMER", "STAFF", "SYSTEM"], UNDER_REVIEW: ["STAFF"] },
  PROCESSING: {
    IN_PROGRESS: ["STAFF", "SYSTEM"],
    AWAITING_CUSTOMER_INFO: ["STAFF"],
    COMPLETED: ["STAFF", "SYSTEM"],
    REFUND_PENDING: ["CUSTOMER", "STAFF", "SYSTEM"],
    UNDER_REVIEW: ["STAFF"],
  },
  IN_PROGRESS: {
    AWAITING_CUSTOMER_INFO: ["STAFF"],
    COMPLETED: ["STAFF", "SYSTEM"],
    REFUND_PENDING: ["CUSTOMER", "STAFF", "SYSTEM"],
    UNDER_REVIEW: ["STAFF"],
  },
  AWAITING_CUSTOMER_INFO: { PROCESSING: ["CUSTOMER", "STAFF"], IN_PROGRESS: ["STAFF"], REFUND_PENDING: ["CUSTOMER", "STAFF", "SYSTEM"], UNDER_REVIEW: ["STAFF"] },
  UNDER_REVIEW: { PROCESSING: ["STAFF"], IN_PROGRESS: ["STAFF"], COMPLETED: ["STAFF"], REFUND_PENDING: ["STAFF", "SYSTEM"] },
  COMPLETED: { UNDER_REVIEW: ["STAFF"], REFUND_PENDING: ["CUSTOMER", "STAFF", "SYSTEM"] },
  // Restoring the pre-refund status after a rejected refund is handled by the refund service (SYSTEM).
  REFUND_PENDING: {
    REFUNDED: ["SYSTEM"],
    PAYMENT_CONFIRMED: ["SYSTEM"],
    PROCESSING: ["SYSTEM"],
    IN_PROGRESS: ["SYSTEM"],
    AWAITING_CUSTOMER_INFO: ["SYSTEM"],
    COMPLETED: ["SYSTEM"],
    UNDER_REVIEW: ["SYSTEM"],
  },
  CANCELLED: {},
  REFUNDED: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return ORDER_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending payment",
  PAYMENT_CONFIRMED: "Payment confirmed",
  PROCESSING: "Processing",
  IN_PROGRESS: "In progress",
  AWAITING_CUSTOMER_INFO: "Awaiting your information",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
  UNDER_REVIEW: "Under review",
};

/** The "happy path" shown as a progress timeline. */
export const ORDER_TIMELINE: OrderStatus[] = ["PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "COMPLETED"];

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "AWAITING_CUSTOMER_INFO", "UNDER_REVIEW"];

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  PENDING_PAYMENT: "Pending payment",
  PAID: "Paid — transfer not started",
  TRANSFER_IN_PROGRESS: "Transfer in progress",
  AWAITING_VERIFICATION: "Awaiting verification",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};

export function statusTone(s: string): "gray" | "blue" | "amber" | "green" | "red" | "purple" {
  if (["COMPLETED", "SUCCEEDED", "APPROVED", "VERIFIED", "RESOLVED", "PUBLISHED", "CONFIRMED", "RESOLVED_BUYER", "RESOLVED_SELLER"].includes(s)) return "green";
  if (["CANCELLED", "FAILED", "REJECTED", "SUSPENDED", "REFUNDED", "ABANDONED", "ARCHIVED", "WITHDRAWN"].includes(s)) return "red";
  if (["PENDING_PAYMENT", "PENDING", "PENDING_REVIEW", "REQUESTED", "AWAITING_CUSTOMER_INFO", "REFUND_PENDING", "PAUSED", "OPEN", "SUBMITTED", "RESERVED"].includes(s)) return "amber";
  if (["DISPUTED", "UNDER_REVIEW"].includes(s)) return "purple";
  if (["DRAFT", "UNVERIFIED", "NOT_DUE", "CLOSED"].includes(s)) return "gray";
  return "blue";
}

export const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
