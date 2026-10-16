// Server-component helpers. These read the session cookie via next/headers.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authFromToken, SESSION_COOKIE, type Auth } from "./session";
import { can, type Permission } from "./rbac";

export async function getAuth(): Promise<Auth> {
  const store = await cookies();
  return authFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireUserPage(next = "/dashboard") {
  const auth = await getAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(next)}`);
  return auth;
}

export async function requirePermissionPage(permission: Permission, next = "/admin") {
  const auth = await requireUserPage(next);
  if (!can(auth.user.roles, permission)) redirect("/dashboard?denied=1");
  return auth;
}
