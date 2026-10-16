/**
 * Create (or promote) a super administrator.
 *   npm run admin:create -- owner@example.com "Owner Name"
 * The password is read interactively and never passed on the command line.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { db } from "../src/lib/db";
import { hashPassword, passwordSchema } from "../src/server/auth/password";
import { humanId } from "../src/lib/crypto";

const ROLES = [
  { key: "CUSTOMER", name: "Customer", description: "Can order services and buy marketplace listings" },
  { key: "SELLER", name: "Seller", description: "Can list eligible digital assets for sale" },
  { key: "SUPPORT", name: "Support agent", description: "Handles tickets, order fulfillment and disputes" },
  { key: "ADMIN", name: "Administrator", description: "Manages catalog, payments, users and settings" },
  { key: "SUPER_ADMIN", name: "Super administrator", description: "Full access, including granting admin roles" },
] as const;

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email) throw new Error('Usage: npm run admin:create -- <email> "<display name>"');
  const displayName = nameParts.join(" ") || email.split("@")[0];
  for (const r of ROLES) await db.role.upsert({ where: { key: r.key }, create: r, update: {} });

  let user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    const rl = createInterface({ input: stdin, output: stdout });
    const password = await rl.question("Password for the new super admin: ");
    rl.close();
    passwordSchema.parse(password);
    user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
        referralCode: humanId("R", 7).replace("-", ""),
        profile: { create: { displayName } },
      },
    });
    console.log(`Created ${user.email}`);
  } else {
    console.log(`Promoting existing user ${user.email}`);
  }
  for (const key of ["CUSTOMER", "SUPER_ADMIN"] as const) {
    const role = await db.role.findUniqueOrThrow({ where: { key } });
    await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  }
  await db.auditLog.create({ data: { action: "user.super_admin_bootstrapped", entityType: "user", entityId: user.id } });
  console.log("Done. Sign in and enable two-factor authentication under Dashboard → Security.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
