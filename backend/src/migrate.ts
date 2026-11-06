import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// works from src/ (tsx) and dist/src/ (compiled)
const candidates = [path.resolve(here, '../migrations'), path.resolve(here, '../../migrations')];
const dir = candidates.find((d) => fs.existsSync(d))!;

export async function migrate(): Promise<string[]> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      done.push(f);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }
  return done;
}

if (process.argv[1] && process.argv[1].includes('migrate')) {
  migrate().then((d) => { console.log('migrations applied:', d); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
