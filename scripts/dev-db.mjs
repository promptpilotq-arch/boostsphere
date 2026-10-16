// Starts a local PostgreSQL server for development without Docker or a system install.
// Uses the `embedded-postgres` package, which ships official PostgreSQL binaries via npm.
// Data persists in ./.pgdata. Stop with Ctrl+C.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.PGPORT ?? 5433);
const dataDir = path.resolve(process.env.PGDATA_DIR ?? ".pgdata");
const databases = (process.env.PG_DATABASES ?? "boostsphere,boostsphere_test").split(",");

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres",
  port,
  persistent: true,
  // Force UTF-8 regardless of the OS locale (Windows defaults to WIN1252).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
for (const db of databases) {
  try {
    await pg.createDatabase(db);
    console.log(`created database ${db}`);
  } catch {
    /* already exists */
  }
}
console.log(`PostgreSQL ready on port ${port} (data: ${dataDir})`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
