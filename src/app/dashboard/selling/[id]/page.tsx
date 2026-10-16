import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ListingForm } from "@/components/listing-form";
import { ImageUpload } from "@/components/client/image-upload";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/ui";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUserPage(`/dashboard/selling/${id}`);
  const listing = await db.marketplaceListing.findUnique({ where: { id }, include: { seller: true, images: { orderBy: { sortOrder: "asc" } } } });
  if (!listing || listing.seller.userId !== auth.user.id) notFound();
  const platforms = await db.socialPlatform.findMany({ where: { status: "PUBLISHED", marketplaceEnabled: true }, orderBy: { sortOrder: "asc" } });
  const locked = ["RESERVED", "SOLD", "SUSPENDED"].includes(listing.status);
  return (
    <>
      <PageHeader title={listing.title} actions={<StatusBadge status={listing.status} />} />
      {listing.moderationNote && (
        <div className="mb-6 max-w-3xl">
          <Notice tone={listing.status === "REJECTED" ? "red" : "blue"} title="Moderator note">
            {listing.moderationNote}
          </Notice>
        </div>
      )}
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="p-6">{locked ? <p className="text-sm text-slate-600">This listing can no longer be edited.</p> : <ListingForm platforms={platforms} listing={listing} />}</Card>
        <Card className="h-fit p-6">
          <h2 className="font-semibold">Images</h2>
          <p className="mt-1 text-xs text-slate-500">PNG, JPEG or WebP, up to 5 MB. Redact usernames of followers, messages and any login details.</p>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {listing.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <li key={img.id}><img src={`/api/v1/files/${img.storageKey}`} alt={img.alt} className="aspect-square w-full rounded-lg object-cover" /></li>
            ))}
          </ul>
          {!locked && <ImageUpload listingId={listing.id} />}
        </Card>
      </div>
    </>
  );
}
