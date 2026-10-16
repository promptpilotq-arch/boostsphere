import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ListingForm } from "@/components/listing-form";
import { Card, PageHeader } from "@/components/ui";

export default async function NewListing() {
  const auth = await requireUserPage("/dashboard/selling/new");
  const profile = await db.sellerProfile.findUnique({ where: { userId: auth.user.id } });
  if (!profile) redirect("/dashboard/selling");
  const platforms = await db.socialPlatform.findMany({ where: { status: "PUBLISHED", marketplaceEnabled: true }, orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader title="New listing" description="Listings are saved as drafts. Submit for review when ready." />
      <Card className="max-w-3xl p-6">
        <ListingForm platforms={platforms} />
      </Card>
    </>
  );
}
