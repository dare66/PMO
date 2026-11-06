/** In-process scheduled jobs (single-node). For multi-node, move to a queue worker – see ADR-0004. */
import { pool, tx } from './db.js';
import { notify, usersWithRole } from './core/notify.js';
import { processQueue } from './integrations/framework.js';
import { runEscalations } from './domain/frs.js';

async function logged(job: string, fn: () => Promise<unknown>) {
  const run = (await pool.query(`INSERT INTO job_runs (job) VALUES ($1) RETURNING id`, [job])).rows[0].id;
  try {
    const detail = await fn();
    await pool.query(`UPDATE job_runs SET finished_at=now(), status='ok', detail=$2 WHERE id=$1`, [run, JSON.stringify(detail ?? {})]);
  } catch (e) {
    await pool.query(`UPDATE job_runs SET finished_at=now(), status='error', detail=$2 WHERE id=$1`, [run, JSON.stringify({ error: (e as Error).message })]);
  }
}

export async function runDailyChecks() {
  return logged('daily_checks', async () => {
    let n = 0;
    // contracts entering their renewal-notice window
    for (const c of (await pool.query(`SELECT id, org_id, code, name, owner_id, end_date FROM contracts WHERE deleted_at IS NULL AND status IN ('active','expiring') AND end_date IS NOT NULL AND end_date - renewal_notice_days <= current_date`)).rows) {
      await pool.query(`UPDATE contracts SET status = CASE WHEN end_date < current_date THEN 'expired' ELSE 'expiring' END WHERE id=$1`, [c.id]);
      await notify(pool, c.org_id, [c.owner_id], { kind: 'contract_expiry', title: `Contract ${c.code} expires ${c.end_date}`, body: c.name, link: '/procurement', dedupe: `contract:${c.id}:${c.end_date}` }); n++;
    }
    // BIA reviews due
    for (const b of (await pool.query(`SELECT id, org_id, code, name, owner_id, next_review_date FROM bia_assessments WHERE deleted_at IS NULL AND next_review_date IS NOT NULL AND next_review_date <= current_date + 14`)).rows) {
      await notify(pool, b.org_id, [b.owner_id], { kind: 'bia_review', title: `BIA review due: ${b.code}`, body: `Review due ${b.next_review_date}`, link: `/resilience/bia/${b.id}`, dedupe: `biareview:${b.id}:${b.next_review_date}` }); n++;
    }
    // overdue milestones
    for (const m of (await pool.query(`SELECT m.id, m.org_id, m.code, m.name, m.owner_id, m.due_date FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.deleted_at IS NULL AND p.status='active' AND m.status IN ('planned','at_risk') AND m.due_date < current_date`)).rows) {
      await notify(pool, m.org_id, [m.owner_id], { kind: 'milestone_overdue', title: `Milestone overdue: ${m.code} ${m.name}`, link: '/projects', dedupe: `ms:${m.id}:${m.due_date}` }); n++;
    }
    // approval escalation
    for (const a of (await pool.query(`SELECT id, org_id, code, approver_role FROM approvals WHERE status='pending' AND due_at < now()`)).rows) {
      await notify(pool, a.org_id, await usersWithRole(pool, a.org_id, 'pmo_manager'), { kind: 'approval_escalation', title: `Approval ${a.code} is overdue (${a.approver_role})`, link: '/governance/approvals', dedupe: `esc:${a.id}` }); n++;
    }
    // FRS v1.1 exception alerts & escalations (risks, issues, actions, SLA, emergency changes, finance, product reviews, deferred requests)
    const escalations: Record<string, unknown> = {};
    for (const o of (await pool.query(`SELECT id FROM organisations`)).rows) escalations[o.id] = await tx((c) => runEscalations(c, o.id));
    return { notifications: n, escalations };
  });
}

export function startJobs() {
  const q = setInterval(() => { tx((c) => processQueue(c)).catch(() => undefined); }, 30_000);
  const d = setInterval(() => { runDailyChecks().catch(() => undefined); }, 6 * 3600_000);
  setTimeout(() => runDailyChecks().catch(() => undefined), 5_000);
  return () => { clearInterval(q); clearInterval(d); };
}
