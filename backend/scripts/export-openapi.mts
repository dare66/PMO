/** Writes docs/api/openapi.json from the registry and the live route table. Usage: npm run openapi (needs DATABASE_URL & JWT_SECRET env, no DB writes). */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { buildApp } = await import('../src/app.js');
const { buildOpenApi } = await import('../src/openapi.js');
const app = await buildApp(); await app.ready();
const doc = buildOpenApi();
const out = fileURLToPath(new URL('../../docs/api/openapi.json', import.meta.url));
writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
console.log(`openapi.json: ${Object.keys(doc.paths).length} paths, ${Object.values(doc.paths).reduce((a: number, p: any) => a + Object.keys(p).length, 0)} operations`);
await app.close(); process.exit(0);
