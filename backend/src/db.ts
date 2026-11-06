import pg from 'pg';
import { config } from './config.js';

pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric -> number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint -> number
pg.types.setTypeParser(1082, (v) => v);                              // date stays 'YYYY-MM-DD'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 15 });

export type Db = pg.Pool | pg.PoolClient;

export async function q<T = any>(db: Db, text: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(text, params as any[]);
  return r.rows as T[];
}
export async function one<T = any>(db: Db, text: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await db.query(text, params as any[]);
  return r.rows[0] as T | undefined;
}
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
