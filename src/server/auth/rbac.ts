import type { RoleKey } from "@prisma/client";

export const PERMISSIONS = {
  "admin:access": ["SUPPORT", "ADMIN", "SUPER_ADMIN"],
  "orders:manage": ["SUPPORT", "ADMIN", "SUPER_ADMIN"],
  "support:manage": ["SUPPORT", "ADMIN", "SUPER_ADMIN"],
  "disputes:manage": ["SUPPORT", "ADMIN", "SUPER_ADMIN"],
  "payments:read": ["SUPPORT", "ADMIN", "SUPER_ADMIN"],
  "payments:manage": ["ADMIN", "SUPER_ADMIN"],
  "refunds:approve": ["ADMIN", "SUPER_ADMIN"],
  "catalog:manage": ["ADMIN", "SUPER_ADMIN"],
  "coupons:manage": ["ADMIN", "SUPER_ADMIN"],
  "marketplace:moderate": ["ADMIN", "SUPER_ADMIN"],
  "users:manage": ["ADMIN", "SUPER_ADMIN"],
  "roles:grant_admin": ["SUPER_ADMIN"],
  "wallet:adjust": ["ADMIN", "SUPER_ADMIN"],
  "payouts:manage": ["ADMIN", "SUPER_ADMIN"],
  "settings:manage": ["ADMIN", "SUPER_ADMIN"],
  "analytics:read": ["ADMIN", "SUPER_ADMIN"],
  "audit:read": ["ADMIN", "SUPER_ADMIN"],
  "reviews:moderate": ["SUPPORT", "ADMIN", "SUPER_ADMIN"],
} as const satisfies Record<string, readonly RoleKey[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly RoleKey[], permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly RoleKey[];
  return roles.some((r) => allowed.includes(r));
}

export const STAFF_ROLES: RoleKey[] = ["SUPPORT", "ADMIN", "SUPER_ADMIN"];
export const isStaff = (roles: readonly RoleKey[]) => roles.some((r) => STAFF_ROLES.includes(r));
