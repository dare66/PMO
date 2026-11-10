/**
 * Evidence & attachment storage (FR-DOC-003).
 * - Allow-listed types by extension AND magic bytes; 10 MB limit; SHA-256 recorded.
 * - Malware scanning: ClamAV clamd INSTREAM when CLAMAV_HOST is configured; otherwise a built-in
 *   signature check (EICAR test string, executable headers) labelled scan_engine='builtin-signatures'.
 *   Infected or unscanned-by-policy files are quarantined and cannot be downloaded.
 * - Access follows the parent record: you can attach/download only if you can read/write the parent.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { audit } from '../core/audit.js';
import { config } from '../config.js';
import { badRequest, forbidden, notFound } from '../core/errors.js';
import { getRow, requirePerm } from '../resources/crud.js';

export const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, { mime: string; magic?: (b: Buffer) => boolean }> = {
  pdf: { mime: 'application/pdf', magic: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  png: { mime: 'image/png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 }, jpeg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  csv: { mime: 'text/csv' }, txt: { mime: 'text/plain' }, md: { mime: 'text/markdown' }, bpmn: { mime: 'application/xml' }, xml: { mime: 'application/xml' },
};

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export async function clamdScan(buf: Buffer, host: string, port: number): Promise<{ clean: boolean; detail: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    let out = '';
    sock.setTimeout(30000, () => { sock.destroy(); reject(new Error('clamd timeout')); });
    sock.on('data', (d) => (out += d.toString()));
    sock.on('end', () => { const r = out.replace(/\0/g, '').trim(); resolve({ clean: /:\s*OK$/.test(r), detail: r }); });
    sock.on('error', reject);
  });
}

export function builtinScan(buf: Buffer): { clean: boolean; detail: string } {
  const head = buf.subarray(0, 4096).toString('latin1');
  if (buf.includes(Buffer.from(EICAR))) return { clean: false, detail: 'EICAR test signature' };
  if (head.startsWith('MZ')) return { clean: false, detail: 'Windows executable header' };
  if (head.startsWith('\x7fELF')) return { clean: false, detail: 'ELF executable header' };
  if (/<script[\s>]/i.test(head) && !head.startsWith('%PDF')) return { clean: false, detail: 'Embedded script in text content' };
  return { clean: true, detail: 'No built-in signature matched (not a full antivirus scan)' };
}

async function scan(buf: Buffer) {
  const host = process.env.CLAMAV_HOST;
  if (host) {
    const r = await clamdScan(buf, host, Number(process.env.CLAMAV_PORT ?? 3310));
    return { ...r, engine: 'clamav' };
  }
  return { ...builtinScan(buf), engine: 'builtin-signatures' };
}

async function parentCheck(ctx: Ctx, entityType: string, entityId: string, mode: 'read' | 'write') {
  requirePerm(ctx, `${entityType}:${mode}`);
  return getRow(ctx, entityType, entityId); // enforces org + ABAC visibility
}

export async function storeFile(db: Db, ctx: Ctx, input: { entityType: string; entityId: string; filename: string; buffer: Buffer; classification?: string }) {
  const parent = await parentCheck(ctx, input.entityType, input.entityId, 'write');
  if (!input.buffer.length) throw badRequest('Empty file');
  if (input.buffer.length > MAX_BYTES) throw badRequest('File exceeds 10 MB limit');
  const safeName = path.basename(input.filename).replace(/[^\w.\- ()]/g, '_').slice(0, 200);
  const ext = safeName.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES[ext];
  if (!type) throw badRequest(`File type .${ext} is not allowed. Allowed: ${Object.keys(TYPES).join(', ')}`);
  if (type.magic && !type.magic(input.buffer)) throw badRequest('File content does not match its extension');
  const sha = crypto.createHash('sha256').update(input.buffer).digest('hex');
  const result = await scan(input.buffer);
  const id = crypto.randomUUID();
  const storageKey = `${ctx.orgId}/${id.slice(0, 2)}/${id}`;
  if (result.clean) {
    const full = path.join(config.fileDir, storageKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.buffer, { mode: 0o600 });
  }
  const row = (await db.query(`INSERT INTO files (id, org_id, entity_type, entity_id, filename, mime_type, size_bytes, sha256, storage_key, scan_status, scan_engine, scan_detail, classification, created_by, owner_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id, filename, mime_type, size_bytes, sha256, scan_status, scan_engine, scan_detail, created_at`,
  [id, ctx.orgId, input.entityType, input.entityId, safeName, type.mime, input.buffer.length, sha, storageKey, result.clean ? 'clean' : 'infected', result.engine, result.detail, input.classification ?? parent.classification ?? 'internal', ctx.userId])).rows[0];
  await audit(db, ctx, result.clean ? 'file_uploaded' : 'file_quarantined', { type: input.entityType, id: input.entityId, code: parent.code }, null, { file: safeName, sha256: sha, bytes: input.buffer.length, scan: result });
  return row;
}

export async function listFiles(db: Db, ctx: Ctx, entityType: string, entityId: string) {
  await parentCheck(ctx, entityType, entityId, 'read');
  return (await db.query(`SELECT f.id, f.filename, f.mime_type, f.size_bytes, f.sha256, f.scan_status, f.scan_engine, f.scan_detail, f.created_at, u.name AS uploaded_by FROM files f LEFT JOIN users u ON u.id=f.created_by
     WHERE f.org_id=$1 AND f.entity_type=$2 AND f.entity_id=$3 AND f.deleted_at IS NULL ORDER BY f.created_at DESC`, [ctx.orgId, entityType, entityId])).rows;
}

export async function readFileForDownload(db: Db, ctx: Ctx, fileId: string) {
  const f = (await db.query(`SELECT * FROM files WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [fileId, ctx.orgId])).rows[0];
  if (!f) throw notFound('File');
  await parentCheck(ctx, f.entity_type, f.entity_id, 'read');
  if (f.scan_status !== 'clean') throw forbidden('File is quarantined and cannot be downloaded');
  const buf = await fs.readFile(path.join(config.fileDir, f.storage_key));
  if (crypto.createHash('sha256').update(buf).digest('hex') !== f.sha256) throw forbidden('Integrity check failed – stored file does not match its recorded hash');
  await audit(db, ctx, 'file_downloaded', { type: f.entity_type, id: f.entity_id }, null, { file: f.filename });
  return { file: f, buffer: buf };
}
