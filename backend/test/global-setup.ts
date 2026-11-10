import pg from 'pg';
/** Recreates an isolated test database. Never point TEST_DATABASE_URL at a real database. */
export default async function () {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:devpass@localhost:5433/pmo_test');
  const db = url.pathname.slice(1);
  if (!/test/.test(db)) throw new Error('Refusing to reset a database whose name does not contain "test"');
  const admin = new URL(url.toString()); admin.pathname = '/postgres';
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${db}`);
  await c.end();
}
