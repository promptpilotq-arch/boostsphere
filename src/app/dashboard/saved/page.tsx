import Link from "next/link";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { publicListing } from "@/server/marketplace";
import { ListingCard } from "@/components/cards";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function SavedPage() {
  const auth = await requireUserPage("/dashboard/saved");
  const saved = await db.savedListing.findMany({
    where: { userId: auth.user.id, listing: { status: { in: ["APPROVED", "RESERVED", "SOLD"] } } },
    orderBy: { createdAt: "desc" },
    include: { listing: { include: { platform: true, seller: { select: { displayName: true, verificationStatus: true, completedSales: true } } } } },
  });
  return (
    <>
      <PageHeader title="Saved listings" />
      {saved.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {saved.map((s) => (
            <ListingCard key={s.listingId} l={publicListing(s.listing)} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing saved yet" description="Tap “Save listing” on any marketplace listing to keep track of it." action={<Link href="/marketplace" className="btn-primary">Browse marketplace</Link>} />
      )}
    </>
  );
}
