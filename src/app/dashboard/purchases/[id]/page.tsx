import { notFound } from "next/navigation";
import { requireUserPage } from "@/server/auth/current";
import { getPurchaseForViewer } from "@/server/marketplace";
import { PurchaseView } from "@/components/purchase-view";

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUserPage(`/dashboard/purchases/${id}`);
  const data = await getPurchaseForViewer(id, auth.user).catch(() => null);
  if (!data || data.role === "STAFF") notFound();
  return <PurchaseView {...data} />;
}
