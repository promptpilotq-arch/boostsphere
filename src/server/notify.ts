import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "./email";

/** In-app notification plus (optionally) an email. Never put secrets or credentials in notifications. */
export async function notify(userId: string, n: { type: string; title: string; body: string; link?: string; email?: boolean }) {
  await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, link: n.link } });
  if (n.email !== false) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
    if (user && user.status !== "DELETED") {
      await sendEmail(user.email, n.title, `${n.body}${n.link ? `\n\n${env.appUrl}${n.link}` : ""}`);
    }
  }
}

export async function notifyStaff(n: { type: string; title: string; body: string; link?: string }) {
  const staff = await db.user.findMany({
    where: { roles: { some: { role: { key: { in: ["ADMIN", "SUPER_ADMIN"] } } } }, status: "ACTIVE" },
    select: { id: true },
  });
  await db.notification.createMany({ data: staff.map((s) => ({ userId: s.id, ...n })) });
}
