/** OpenAPI 3.1 document generated from the resource registry + domain route catalogue. */
import { RESOURCES, type FieldDef } from './resources/registry.js';

const typeOf = (f: FieldDef): any => {
  switch (f.t) {
    case 'int': return { type: 'integer', minimum: f.min, maximum: f.max };
    case 'number': case 'money': case 'pct': return { type: 'number' };
    case 'bool': return { type: 'boolean' };
    case 'date': return { type: 'string', format: 'date' };
    case 'datetime': return { type: 'string', format: 'date-time' };
    case 'enum': return { type: 'string', enum: f.opts };
    case 'ref': return { type: 'string', format: 'uuid', description: `Reference to ${f.ref}` };
    case 'numarray': return { type: 'array', items: { type: 'number' } };
    default: return { type: 'string' };
  }
};

const DOMAIN: [string, string, string][] = [
  ['post', '/api/auth/login', 'Sign in (returns bearer token and sets httpOnly cookie)'],
  ['get', '/api/auth/me', 'Current user, roles and permissions'],
  ['get', '/api/dashboard/executive', 'Executive command-centre metrics computed live'],
  ['get', '/api/projects/{id}/summary', 'Project workspace summary incl. health and linked products'],
  ['post', '/api/projects/{id}/products', 'Link a product to a project (many-to-many)'],
  ['post', '/api/projects/{id}/bia-screening', 'BIA screening; may create a draft BIA'],
  ['post', '/api/projects/{id}/close', 'Close a project (does not close products)'],
  ['get', '/api/projects/{id}/evm', 'Earned value metrics'],
  ['get', '/api/products/{id}/summary', 'Product workspace summary'],
  ['post', '/api/workflows/start', 'Start a configurable workflow for a record'],
  ['post', '/api/workflows/instances/{id}/advance', 'Request stage exit (gate checks, approvals, exceptions)'],
  ['get', '/api/approvals', 'Approvals (scope=mine for my inbox)'],
  ['post', '/api/approvals/{id}/decide', 'Approve / approve with conditions / reject (humans only)'],
  ['post', '/api/approvals/{id}/delegate', 'Delegate or change approver'],
  ['post', '/api/budgets/{id}/submit', 'Submit budget for financial approval (delegated authority)'],
  ['post', '/api/change-requests/{id}/submit', 'Submit change after impact assessments'],
  ['post', '/api/risks/{id}/request-acceptance', 'Request risk acceptance (human approval)'],
  ['get', '/api/bia/{id}/analysis', 'BIA derived MTPD, tier and validation findings'],
  ['put', '/api/bia/{id}/impacts', 'Upsert impact-over-time matrix'],
  ['get', '/api/bia/traceability', 'Process → service → product → infrastructure → data → vendor → recovery'],
  ['get', '/api/finance/summary', 'Budget / actual / commitment / forecast reconciliation'],
  ['get', '/api/resources/capacity', 'Weekly capacity, utilisation and conflicts'],
  ['get', '/api/releases/{id}/readiness', 'Release readiness checks'],
  ['post', '/api/releases/{id}/deploy', 'Record production deployment (human only, readiness enforced)'],
  ['post', '/api/documents/generate', 'Generate a document from structured data'],
  ['get', '/api/search', 'Permission-trimmed global search'],
  ['post', '/api/ai/ask', 'Ask the AI assistant (citations, confidence, audit)'],
  ['post', '/api/ai/analyse/{capability}', 'Deterministic AI analyses'],
  ['get', '/api/audit', 'Audit trail'], ['get', '/api/audit/verify', 'Verify audit hash chain'],
  ['get', '/api/integrations', 'Integration catalogue (mock vs live clearly labelled)'],
];

export function buildOpenApi() {
  const paths: Record<string, any> = {};
  const schemas: Record<string, any> = {};
  for (const r of RESOURCES) {
    const props: Record<string, any> = { id: { type: 'string', format: 'uuid', readOnly: true }, code: { type: 'string', readOnly: true }, status: { type: 'string', enum: r.statusOptions }, row_version: { type: 'integer' } };
    for (const f of r.fields) props[f.n] = { ...typeOf(f), readOnly: f.ro || undefined, description: f.help };
    if (r.contexts) { props.context_type = { type: 'string', enum: r.contexts }; props.context_id = { type: 'string', format: 'uuid' }; }
    schemas[r.key] = { type: 'object', description: r.description, properties: props, required: r.fields.filter((f) => f.req).map((f) => f.n) };
    const ref = { $ref: `#/components/schemas/${r.key}` };
    paths[`/api/r/${r.key}`] = {
      get: { tags: [r.module], summary: `List ${r.plural}`, parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: 500 } }, { name: 'sort', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Page of records' } } },
      post: { tags: [r.module], summary: `Create ${r.label}`, requestBody: { content: { 'application/json': { schema: ref } } }, responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' }, 403: { description: 'Forbidden' } } },
    };
    paths[`/api/r/${r.key}/{id}`] = {
      get: { tags: [r.module], summary: `Get ${r.label}`, responses: { 200: { description: 'Record', content: { 'application/json': { schema: ref } } }, 404: { description: 'Not found' } } },
      patch: { tags: [r.module], summary: `Update ${r.label} (send row_version for optimistic locking)`, responses: { 200: { description: 'Updated' }, 409: { description: 'Version conflict' }, 422: { description: 'Business rule' } } },
      delete: { tags: [r.module], summary: `Soft-delete ${r.label}`, responses: { 200: { description: 'Deleted' } } },
    };
  }
  for (const [m, p, s] of DOMAIN) { paths[p] ??= {}; paths[p][m] = { tags: ['Domain services'], summary: s, responses: { 200: { description: 'OK' } } }; }
  return {
    openapi: '3.1.0',
    info: { title: 'Enterprise Strategy, Portfolio, Product, Project & Work Platform API', version: '0.1.0', description: 'Generated from the resource registry. All endpoints require authentication unless stated.' },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, cookie: { type: 'apiKey', in: 'cookie', name: 'pmo_session' } }, schemas },
    security: [{ bearer: [] }, { cookie: [] }],
    paths,
  };
}
