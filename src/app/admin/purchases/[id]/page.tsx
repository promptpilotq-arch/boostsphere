import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/server/auth/current";
import { getPurchaseForViewer } from "@/server/marketplace";
import { PurchaseView } from "@/components/purchase-view";

export default async function AdminPurchase({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionPage("disputes:manage");
  const data = await getPurchaseForViewer((await params).id, auth.user).catch(() => null);
  if (!data) notFound();
  return <PurchaseView {...data} />;
}
