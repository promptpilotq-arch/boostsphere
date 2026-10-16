import Link from "next/link";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ActionButton } from "@/components/client/action-button";
import { EmptyState, PageHeader, fmtDateTime } from "@/components/ui";

export default async function NotificationsPage() {
  const auth = await requireUserPage("/dashboard/notifications");
  const items = await db.notification.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 && (
            <ActionButton endpoint="/api/v1/me/notifications" body={{}} successMessage="All caught up">
              Mark all as read
            </ActionButton>
          )
        }
      />
      {items.length ? (
        <ul className="card divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? "" : "bg-brand/5"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} aria-label={n.readAt ? undefined : "Unread"} />
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                <p className="text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No notifications" />
      )}
    </>
  );
}
