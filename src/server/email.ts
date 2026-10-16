import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Transactional email. Every message is recorded in email_outbox first.
 * With RESEND_API_KEY configured it is delivered through Resend's HTTP API;
 * otherwise it is only logged (status LOGGED) — useful in development, and clearly not "sent".
 */
export async function sendEmail(to: string, subject: string, text: string) {
  const row = await db.emailOutbox.create({ data: { to, subject, text } });
  if (!env.resendApiKey) {
    if (!env.isProduction) console.info(`[email:logged] to=${to} subject="${subject}"\n${text}`);
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: "LOGGED" } });
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date() } });
    return { delivered: true };
  } catch (e) {
    await db.emailOutbox.update({ where: { id: row.id }, data: { status: "FAILED", error: String(e).slice(0, 500) } });
    console.error("[email] delivery failed", e);
    return { delivered: false };
  }
}
