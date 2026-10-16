import { execSync } from "node:child_process";

/** Apply migrations to the test database once before the suite. Requires `npm run db:start`. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/boostsphere_test?schema=public";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
