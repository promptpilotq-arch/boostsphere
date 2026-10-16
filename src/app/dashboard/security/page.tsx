import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { TwoFactorSetup } from "@/components/client/two-factor";
import { Badge, Card, Field, Notice, PageHeader, fmtDateTime } from "@/components/ui";

export default async function SecurityPage() {
  const auth = await requireUserPage("/dashboard/security");
  const [sessions, deletion] = await Promise.all([
    db.session.findMany({ where: { userId: auth.user.id, twoFactorPending: false, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    db.accountDeletionRequest.findFirst({ where: { userId: auth.user.id, status: "PENDING" } }),
  ]);
  return (
    <>
      <PageHeader title="Security" />
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="font-semibold">Password</h2>
          <ApiForm action="/api/v1/me/security" extra={{ action: "change_password" }} success={{ message: "Password changed. Other sessions were signed out.", reset: true }} className="mt-4 space-y-4">
            <Field label="Current password" htmlFor="cur">
              <input id="cur" name="currentPassword" type="password" autoComplete="current-password" required className="input" />
            </Field>
            <Field label="New password" htmlFor="new" hint="At least 10 characters with letters and numbers.">
              <input id="new" name="newPassword" type="password" autoComplete="new-password" minLength={10} required className="input" />
            </Field>
            <SubmitButton>Change password</SubmitButton>
          </ApiForm>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Two-factor authentication</h2>
            {auth.user.twoFactorEnabled ? <Badge tone="green">Enabled</Badge> : <Badge>Off</Badge>}
          </div>
          <div className="mt-4">
            {auth.user.twoFactorEnabled ? (
              <details>
                <summary className="btn-secondary cursor-pointer list-none">Turn off 2FA</summary>
                <ApiForm action="/api/v1/me/security" extra={{ action: "2fa_disable" }} success={{ message: "Two-factor authentication disabled" }} className="mt-4 space-y-3">
                  <input name="password" type="password" placeholder="Password" required className="input" aria-label="Password" />
                  <input name="code" placeholder="Authenticator or backup code" required className="input" aria-label="Code" />
                  <SubmitButton className="btn-danger">Disable 2FA</SubmitButton>
                </ApiForm>
              </details>
            ) : (
              <TwoFactorSetup />
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Active sessions</h2>
            {sessions.length > 1 && (
              <ActionButton endpoint="/api/v1/me/security" body={{ action: "revoke_other_sessions" }} successMessage="Other sessions signed out">
                Sign out other sessions
              </ActionButton>
            )}
          </div>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.userAgent ?? "Unknown device"}</p>
                  <p className="text-xs text-slate-500">
                    {s.ip ?? "unknown IP"} · last active {fmtDateTime(s.lastSeenAt)}
                  </p>
                </div>
                {s.id === auth.sessionId ? (
                  <Badge tone="blue">This device</Badge>
                ) : (
                  <ActionButton endpoint="/api/v1/me/security" body={{ action: "revoke_session", sessionId: s.id }} className="btn-ghost">
                    Revoke
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="border-red-200 p-6">
          <h2 className="font-semibold text-red-800">Delete account</h2>
          {deletion ? (
            <p className="mt-2 text-sm text-slate-600">Your deletion request from {fmtDateTime(deletion.createdAt)} is being processed.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">We&apos;ll remove your personal data. Financial records are retained in pseudonymised form as required by law. Open marketplace transactions must be finished first.</p>
              <ApiForm action="/api/v1/me/security" extra={{ action: "request_deletion" }} success={{ message: "Deletion requested" }} className="mt-4 space-y-3">
                <textarea name="reason" rows={2} className="input" placeholder="Optional: tell us why" aria-label="Reason" />
                <Field label='Type "DELETE" to confirm' htmlFor="confirm">
                  <input id="confirm" name="confirm" className="input max-w-[200px]" required pattern="DELETE" />
                </Field>
                <SubmitButton className="btn-danger">Request deletion</SubmitButton>
              </ApiForm>
            </>
          )}
        </Card>
        <Notice>We will never email or message you asking for your password or a login code.</Notice>
      </div>
    </>
  );
}
