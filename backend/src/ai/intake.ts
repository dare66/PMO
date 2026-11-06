/**
 * AI intake workspace (from the earlier platform specification, phases 2.2–2.8):
 * source text → classification, facts, open questions → (answers) → draft brief, requirements,
 * work breakdown and RAID → HUMAN acceptance creates records with origin='ai' and status 'draft'.
 * The default engine is deterministic (no data leaves the platform). Nothing is persisted as a
 * business record until a person accepts it; acceptance uses the person's own permissions.
 */
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { audit } from '../core/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.js';
import { createRow, getRow } from '../resources/crud.js';
import { requirementQuality } from '../domain/calc.js';
import { detectInjection } from './assistant.js';

const sentences = (t: string) => t.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^[\s\-*•\d.)]+/, '').trim()).filter((s) => s.length > 8);

const DOMAINS: [string, RegExp][] = [['payments', /payment|card|gateway|settlement/i], ['customer channels', /mobile|app|portal|customer|onboard/i], ['data & analytics', /data|report|analytics|dashboard/i],
  ['infrastructure', /cloud|server|network|infrastructure|migration|datacent/i], ['regulatory & privacy', /regulat|compliance|pdpa|privacy|audit/i], ['operations', /operation|service desk|incident|support|field/i], ['AI', /\bai\b|machine learning|model|llm|assistant/i]];
const TYPES: [string, RegExp][] = [['regulatory initiative', /regulat|compliance|mandatory|pdpa/i], ['AI initiative', /\bai\b|llm|machine learning/i], ['infrastructure change', /migrat|infrastructure|cloud|data ?cent/i], ['product enhancement', /feature|enhance|app|portal|customer/i], ['operational improvement', /reduce|improve|efficien|handling time|cost/i]];

export function analyseText(text: string) {
  const s = sentences(text);
  const domain = DOMAINS.filter(([, re]) => re.test(text)).map(([d]) => d);
  const type = TYPES.find(([, re]) => re.test(text))?.[0] ?? 'business change';
  const facts = s.filter((x) => /\b(\d+[%kKmM]?|RM|MYR|USD|deadline|by \w+ \d{4}|currently|today)\b/.test(x)).slice(0, 8);
  const questions: { key: string; question: string; required: boolean; answer: string | null; skipped: boolean }[] = [];
  const ask = (key: string, q: string, required = true) => questions.push({ key, question: q, required, answer: null, skipped: false });
  if (!/sponsor|owner|accountable/i.test(text)) ask('sponsor', 'Who is the accountable sponsor / business owner?');
  if (!/(RM|MYR|USD|budget|\$)\s?\d/i.test(text)) ask('budget', 'What is the expected budget or cost range?');
  if (!/\b(20\d\d|Q[1-4]|deadline|by (end of )?\w+)\b/i.test(text)) ask('timeline', 'What is the target date or deadline?');
  if (!/success|measure|kpi|target|reduce|increase/i.test(text)) ask('success', 'How will success be measured (KPIs and targets)?');
  if (/customer|personal data|pdpa|privacy/i.test(text)) ask('personal_data', 'Will personal data be processed? Which categories?', true);
  if (/vendor|supplier|third.party|partner/i.test(text)) ask('vendors', 'Which third parties are involved and are contracts in place?', false);
  ask('out_of_scope', 'What is explicitly out of scope?', false);
  return { classification: { type, domains: domain, confidence: domain.length ? 'medium' : 'low' }, facts, questions: questions.slice(0, 8) };
}

export function generateDrafts(text: string, answers: Record<string, string>) {
  const s = sentences(text);
  const reqS = s.filter((x) => /\b(must|shall|should|need(s)? to|required|allow|enable|support|provide|able to)\b/i.test(x));
  const requirements = reqS.slice(0, 25).map((x, i) => {
    const name = x.length > 90 ? x.slice(0, 87) + '…' : x;
    const description = /\b(shall|must)\b/i.test(x) ? x : `The solution shall ${x.charAt(0).toLowerCase()}${x.slice(1)}`;
    const priority = /\b(must|shall|required|mandatory)\b/i.test(x) ? 'must' : /\bshould\b/i.test(x) ? 'should' : 'could';
    const q = requirementQuality({ name, description, acceptance_criteria: null, priority });
    return { key: `R${i + 1}`, name, description, priority, req_type: /secur|privacy|pdpa|regulat|audit/i.test(x) ? 'regulatory' : /performance|available|uptime|response time|scal/i.test(x) ? 'non_functional' : 'functional', acceptance_criteria: null as string | null, quality: q };
  });
  const work_items = requirements.flatMap((r) => [
    { key: `${r.key}-A`, name: `Analyse & design: ${r.name.slice(0, 60)}`, requirement_key: r.key, work_type: 'task' },
    { key: `${r.key}-B`, name: `Build: ${r.name.slice(0, 60)}`, requirement_key: r.key, work_type: 'story' },
    { key: `${r.key}-C`, name: `Test: ${r.name.slice(0, 60)}`, requirement_key: r.key, work_type: 'task' },
  ]);
  const riskS = s.filter((x) => /\b(risk|concern|delay|depend|uncertain|may not|issue|constraint|legacy|shortage|limited)\b/i.test(x));
  const risks = riskS.slice(0, 10).map((x, i) => ({ key: `K${i + 1}`, name: x.length > 120 ? x.slice(0, 117) + '…' : x, category: /secur/i.test(x) ? 'security' : /privacy|pdpa|personal/i.test(x) ? 'privacy' : /vendor|supplier/i.test(x) ? 'vendor' : /cost|budget/i.test(x) ? 'financial' : 'delivery', likelihood: 3, impact: /critical|severe|major|regulat/i.test(x) ? 4 : 3 }));
  if (answers.personal_data && !/^no\b/i.test(answers.personal_data)) risks.push({ key: `K${risks.length + 1}`, name: 'Personal data processing obligations (Malaysia PDPA) not met', category: 'privacy', likelihood: 3, impact: 4 });
  const assumptions = s.filter((x) => /\b(assum|expect|will be available|presum)\b/i.test(x)).slice(0, 8).map((x, i) => ({ key: `A${i + 1}`, name: x.slice(0, 200) }));
  const brief = {
    purpose: s[0] ?? null, sponsor: answers.sponsor ?? null, budget: answers.budget ?? null, timeline: answers.timeline ?? null,
    success_measures: answers.success ?? null, out_of_scope: answers.out_of_scope ?? null,
    missing: ['sponsor', 'budget', 'timeline', 'success'].filter((k) => !answers[k]),
  };
  return { brief, requirements, work_items, risks, assumptions };
}

export async function createIntake(db: Db, ctx: Ctx, input: { name: string; context_type: string; context_id: string; source_text: string }) {
  if (!can(ctx, 'ai:use')) throw forbidden('AI assistant access is not enabled for your role');
  if (input.source_text.length > 100_000) throw badRequest('Source text too long (max 100,000 characters)');
  const a = analyseText(input.source_text);
  const row = await createRow({ ...ctx, perms: new Set([...ctx.perms, 'ai_intakes:write']) }, 'ai_intakes', { name: input.name, context_type: input.context_type, context_id: input.context_id, source_text: input.source_text, status: a.questions.some((q) => q.required) ? 'clarifying' : 'ready' }, { db });
  await db.query(`UPDATE ai_intakes SET intake_classification=$2, facts=$3, questions=$4, injection_flags=$5 WHERE id=$1`, [row.id, JSON.stringify(a.classification), JSON.stringify(a.facts), JSON.stringify(a.questions), JSON.stringify(detectInjection(input.source_text))]);
  return getIntake(db, ctx, row.id);
}

export async function getIntake(db: Db, ctx: Ctx, id: string) {
  const r = (await db.query(`SELECT * FROM ai_intakes WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL AND (created_by=$3 OR $4)`, [id, ctx.orgId, ctx.userId, can(ctx, 'ai_intakes:read')])).rows[0];
  if (!r) throw notFound('Intake');
  return r;
}

export async function answerIntake(db: Db, ctx: Ctx, id: string, answers: { key: string; answer?: string | null; skip?: boolean }[]) {
  const it = await getIntake(db, ctx, id);
  if (it.created_by !== ctx.userId) throw forbidden('Only the author can answer this intake');
  const qs = (it.questions as any[]).map((q) => { const a = answers.find((x) => x.key === q.key); return a ? { ...q, answer: a.skip ? null : (a.answer ?? null), skipped: !!a.skip } : q; });
  const ready = qs.every((q) => !q.required || q.answer || q.skipped);
  await db.query(`UPDATE ai_intakes SET questions=$2, status=$3 WHERE id=$1`, [id, JSON.stringify(qs), ready ? 'ready' : 'clarifying']);
  return getIntake(db, ctx, id);
}

export async function generateIntake(db: Db, ctx: Ctx, id: string) {
  const it = await getIntake(db, ctx, id);
  if (it.status === 'clarifying') throw conflict('Answer or skip the required clarification questions first');
  if (it.status === 'accepted') throw conflict('Intake already accepted');
  const answers = Object.fromEntries((it.questions as any[]).filter((q) => q.answer).map((q) => [q.key, q.answer]));
  const g = generateDrafts(it.source_text, answers);
  await db.query(`UPDATE ai_intakes SET generated=$2, status='generated' WHERE id=$1`, [id, JSON.stringify(g)]);
  await db.query(`INSERT INTO ai_interactions (org_id, user_id, capability, provider, model, prompt, response, citations, confidence, injection_flags) VALUES ($1,$2,'intake_generate','local','rules-v1',$3,$4,'[]',$5,$6)`,
    [ctx.orgId, ctx.userId, it.source_text.slice(0, 8000), JSON.stringify({ requirements: g.requirements.length, work: g.work_items.length, risks: g.risks.length }), g.requirements.length ? 'medium' : 'low', JSON.stringify(it.injection_flags)]);
  return getIntake(db, ctx, id);
}

/** Human acceptance: creates DRAFT records via normal permission-checked CRUD (origin = ai). */
export async function acceptIntake(db: Db, ctx: Ctx, id: string, select: { requirements?: string[]; work_items?: string[]; risks?: string[]; assumptions?: string[] }) {
  if (ctx.actorType !== 'user') throw forbidden('Only a person can accept AI drafts');
  const it = await getIntake(db, ctx, id);
  if (it.status !== 'generated') throw conflict('Generate drafts before accepting');
  const g = it.generated;
  const base = { context_type: it.context_type, context_id: it.context_id };
  const created: Record<string, string[]> = { requirements: [], work_items: [], risks: [], assumptions: [] };
  const reqIds = new Map<string, string>();
  for (const r of g.requirements.filter((x: any) => !select.requirements || select.requirements.includes(x.key))) {
    const row = await createRow(ctx, 'requirements', { ...base, name: r.name, description: r.description, priority: r.priority, req_type: r.req_type, source: `AI intake ${it.code}`, status: 'draft' }, { db });
    await db.query(`UPDATE requirements SET origin='ai' WHERE id=$1`, [row.id]);
    reqIds.set(r.key, row.id); created.requirements.push(row.code);
  }
  for (const w of g.work_items.filter((x: any) => (!select.work_items || select.work_items.includes(x.key)) && reqIds.has(x.requirement_key))) {
    const row = await createRow(ctx, 'work_items', { ...base, name: w.name, work_type: w.work_type, requirement_id: reqIds.get(w.requirement_key), description: `Drafted from AI intake ${it.code}` }, { db });
    created.work_items.push(row.code);
  }
  for (const k of g.risks.filter((x: any) => !select.risks || select.risks.includes(x.key))) {
    const row = await createRow(ctx, 'risks', { ...base, name: k.name, category: k.category, likelihood: k.likelihood, impact: k.impact, description: `AI-suggested from intake ${it.code}; review likelihood/impact.`, status: 'open' }, { db });
    created.risks.push(row.code);
  }
  for (const a of g.assumptions.filter((x: any) => !select.assumptions || select.assumptions.includes(x.key))) {
    const row = await createRow(ctx, 'assumptions', { ...base, name: a.name, description: `From AI intake ${it.code}` }, { db });
    created.assumptions.push(row.code);
  }
  await db.query(`UPDATE ai_intakes SET status='accepted' WHERE id=$1`, [id]);
  await audit(db, ctx, 'ai_drafts_accepted', { type: 'ai_intakes', id, code: it.code }, null, created);
  return { created };
}
