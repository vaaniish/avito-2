import { spawnSync } from "node:child_process";
import pg from "pg";
import "./prepare-catalog.mjs";

function run(script) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
}

const target = new URL(process.env.DATABASE_URL ?? "");
if (target.hostname !== "127.0.0.1" || target.pathname !== "/diploma_demo") {
  throw new Error("Demo bootstrap only accepts the isolated local diploma_demo database");
}
run("db:migrate:deploy");
const pool = new pg.Pool({ connectionString: target.toString() });
const initializationMarker = "avito-diploma-demo:initialized-v1";
let hasUsers;
let initialized;
try {
  const result = await pool.query('SELECT EXISTS (SELECT 1 FROM "AppUser") AS populated');
  hasUsers = result.rows[0].populated;
  const metadata = await pool.query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()");
  initialized = metadata.rows[0].marker === initializationMarker;
} finally {
  await pool.end();
}
if (hasUsers) {
  if (!initialized) {
    throw new Error("Demo database has data but initialization was not completed. See RESTORE.md before resetting the isolated demo volume.");
  }
  console.log("[demo] existing database preserved; seed skipped");
} else {
  run("db:seed:demo");
  const connection = new pg.Client({ connectionString: target.toString() });
  await connection.connect();
  try {
    await connection.query(`COMMENT ON DATABASE diploma_demo IS '${initializationMarker}'`);
  } finally {
    await connection.end();
  }
  console.log("[demo] fresh database seeded with the archived catalog");
}
