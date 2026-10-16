import type { ServiceOrder } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Fulfillment adapters for services delivered through an authorized third-party API
 * (e.g. an advertising platform's official Marketing API).
 *
 * No adapters are registered by default — BoostSphere does not ship integrations with
 * fictitious or unauthorized providers. To add one, implement FulfillmentAdapter against the
 * provider's documented, authorized API and register it in ADAPTERS. Until then, PROVIDER_API
 * services fall back to the manual fulfillment queue with an internal note.
 */
export interface FulfillmentAdapter {
  key: string;
  name: string;
  isConfigured(): boolean;
  /** Submit the order to the provider. Must be idempotent on order.id. */
  submit(order: ServiceOrder): Promise<{ externalId: string }>;
  /** Poll provider status. */
  status(externalId: string): Promise<{ state: "in_progress" | "completed" | "failed"; detail?: string }>;
}

export const ADAPTERS: Record<string, FulfillmentAdapter> = {};

export async function dispatchFulfillment(orderId: string) {
  const order = await db.serviceOrder.findUnique({ where: { id: orderId }, include: { service: true } });
  if (!order || order.status !== "PAYMENT_CONFIRMED") return;

  const note = (message: string) =>
    db.orderEvent.create({ data: { orderId, type: "INTERNAL_NOTE", internal: true, message, actorType: "SYSTEM" } });

  switch (order.fulfillmentType) {
    case "PROVIDER_API": {
      const adapter = order.service.providerKey ? ADAPTERS[order.service.providerKey] : undefined;
      if (!adapter || !adapter.isConfigured()) {
        await note(`Provider adapter "${order.service.providerKey ?? "none"}" is not configured — routed to the manual queue.`);
        return;
      }
      try {
        const { externalId } = await adapter.submit(order);
        await note(`Submitted to ${adapter.name} (ref ${externalId}).`);
      } catch (e) {
        await note(`Provider submission failed: ${String(e).slice(0, 300)} — routed to the manual queue.`);
      }
      return;
    }
    case "AD_CAMPAIGN":
      await note("Ad campaign setup required: create the campaign in the platform's official ads manager and attach the campaign report as evidence.");
      return;
    case "CONSULTATION":
      await note("Consultation: contact the customer to schedule, then attach session notes as evidence.");
      return;
    case "DIGITAL_DELIVERABLE":
      await note("Digital deliverable: prepare the deliverable and attach a link as completion evidence.");
      return;
    default:
      await note("Queued for manual fulfillment.");
  }
}
