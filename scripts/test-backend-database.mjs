import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';

// Explicitly local only. Each execution creates a fresh synthetic database and
// never resets/drops an existing database or uses the app's production config.
const binary = process.env.AUDIT_PSQL || 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const port = process.env.AUDIT_PG_PORT || '55432';
assert.match(port, /^\d{4,5}$/);
const database = `resumeats_audit_${Date.now()}`;
const args = (db = database) => ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq'];
const query = (sql, db = database) => execFileSync(binary, args(db), { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const concurrentQuery = (sql) => new Promise((resolve, reject) => {
  const child = spawn(binary, args(), { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
  child.stdin.end(sql);
});
const read = (relative) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
query(`CREATE DATABASE ${database};`, 'postgres');
query(read('tests/sql/backend-budget-base.sql'));
query(read('supabase/migrations/20260904125121_atomic_ai_period_and_auto_apply_budgets.sql'));
console.log(`Isolated test database: ${database} at 127.0.0.1:${port}`);

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
query(`INSERT INTO public.users(id,email,is_premium,premium_until,premium_updated_at,ai_generations_used)
  VALUES ('${userA}','a@test.invalid',true,now()+interval '1 year',now()-interval '2 months',30),
         ('${userB}','b@test.invalid',true,now()+interval '1 year',now(),0);
  INSERT INTO public.job_preferences(user_id) VALUES ('${userA}'),('${userB}');`);

assert.equal(query(`SELECT private.ai_month_start('2024-01-31 12:00Z','2024-02-29 13:00Z') AT TIME ZONE 'UTC';`), '2024-02-29 12:00:00');
assert.equal(query(`SELECT private.ai_month_start('2024-01-31 12:00Z','2024-03-31 13:00Z') AT TIME ZONE 'UTC';`), '2024-03-31 12:00:00');
console.log('PASS monthly anniversary windows preserve leap years and month-end anchors');

const reservations = await Promise.all(Array.from({ length: 40 }, () => concurrentQuery(`SET ROLE service_role; SELECT allowed FROM public.reserve_ai_generation_for_user('${userA}');`)));
assert.equal(reservations.filter((result) => result === 't').length, 30);
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userA}';`), '30');
console.log('PASS 40 concurrent requests cause one monthly reset and exactly 30 reservations');

query(`UPDATE public.users SET ai_generations_used=7 WHERE id='${userA}';`);
const period = query(`SELECT period_start FROM private.ai_quota_periods WHERE user_id='${userA}';`);
await Promise.all(Array.from({ length: 12 }, () => concurrentQuery(`SET ROLE service_role; SELECT public.sync_ai_quota_period_for_user('${userA}','${period}');`)));
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userA}';`), '7');
query(`SET ROLE service_role; SELECT public.sync_ai_quota_period_for_user('${userA}','2020-01-01Z');`);
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userA}';`), '7');
console.log('PASS duplicate/concurrent/reordered billing notifications cannot reset a current quota twice');

const yearlyAnchor = query(`SELECT now()-interval '7 months';`);
query(`INSERT INTO private.ai_quota_periods(user_id,anchor_at,period_start) VALUES ('${userB}','${yearlyAnchor}','${yearlyAnchor}'); UPDATE public.users SET ai_generations_used=30 WHERE id='${userB}';`);
assert.equal(query(`SET ROLE authenticated; SET request.jwt.claim.sub='${userB}'; SELECT public.get_remaining_ai_generations();`), '30');
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userB}';`), '0');
console.log('PASS annual subscriptions replenish monthly without waiting for an annual invoice');

query(`UPDATE public.users SET ai_generations_used=2 WHERE id='${userB}';`);
assert.equal(query(`SET ROLE service_role; SELECT public.refund_ai_generation_for_user('${userB}',now()-interval '2 months');`), 'f');
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userB}';`), '2');
console.log('PASS refunds from previous quota periods cannot reduce current-period usage');

const reservedPeriod = query(`SET ROLE service_role; SELECT period_start FROM public.reserve_ai_generation_with_period('${userB}');`);
assert.equal(reservedPeriod, query(`SELECT period_start FROM private.ai_quota_periods WHERE user_id='${userB}';`));
assert.equal(query(`SET ROLE service_role; SELECT public.refund_ai_generation_for_user('${userB}','${reservedPeriod}');`), 't');
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userB}';`), '2');
console.log('PASS database-issued reservation periods refund correctly without Edge clock assumptions');

query(`UPDATE public.users SET premium_until=now()-interval '1 day' WHERE id='${userB}';`);
assert.equal(query(`SET ROLE service_role; SELECT allowed FROM public.reserve_ai_generation_for_user('${userB}');`), 'f');
console.log('PASS expired subscriptions never regain quota');

query(`UPDATE public.users SET premium_until=now()+interval '1 year',ai_generations_used=6 WHERE id='${userB}';
  UPDATE private.ai_quota_periods SET anchor_at=now()-interval '1 day',period_start=now()-interval '1 day',billing_anchor=false WHERE user_id='${userB}';`);
const verifiedAnchor = query(`SELECT now()-interval '15 days';`);
query(`SET ROLE service_role; SELECT public.sync_ai_quota_period_for_user('${userB}','${verifiedAnchor}');`);
assert.equal(query(`SELECT anchor_at='${verifiedAnchor}'::timestamptz AND billing_anchor FROM private.ai_quota_periods WHERE user_id='${userB}';`), 't');
assert.equal(query(`SELECT ai_generations_used FROM public.users WHERE id='${userB}';`), '6');
console.log('PASS a late verified billing anchor corrects a provisional period without a second reset');

const claims = await Promise.all(Array.from({ length: 16 }, () => concurrentQuery(`SET ROLE service_role; SELECT allowed FROM public.claim_auto_apply_run('${userA}',true);`)));
assert.equal(claims.filter((result) => result === 't').length, 1);
const runId = query(`SELECT active_run_id FROM private.auto_apply_control WHERE user_id='${userA}';`);
assert.equal(query(`SELECT count(*) FROM public.auto_apply_runs WHERE user_id='${userA}';`), '1');
console.log('PASS 16 concurrent auto-apply requests create exactly one active run');

const slots = await Promise.all(Array.from({ length: 20 }, () => concurrentQuery(`SET ROLE service_role; SELECT public.reserve_auto_apply_job_slot('${userA}','${runId}');`)));
assert.equal(slots.filter((result) => result === 't').length, 10);
assert.equal(query(`SET ROLE service_role; SELECT public.reserve_auto_apply_job_slot('${userB}','${runId}');`), 'f');
assert.equal(query(`SET ROLE service_role; SELECT public.release_auto_apply_run('${userB}','${runId}');`), 'f');
console.log('PASS concurrent job attempts respect the daily cap and cross-user run IDs cannot consume/release it');

query(`SET ROLE service_role; SELECT public.release_auto_apply_run('${userA}','${runId}');`);
assert.equal(query(`SET ROLE service_role; SELECT reason FROM public.claim_auto_apply_run('${userA}',true);`), 'cooldown');
query(`UPDATE private.auto_apply_control SET last_started_at=now()-interval '2 minutes' WHERE user_id='${userA}';`);
assert.equal(query(`SET ROLE service_role; SELECT reason FROM public.claim_auto_apply_run('${userA}',true);`), 'daily_job_limit');
query(`UPDATE private.auto_apply_control SET jobs_processed=0,runs_started=10 WHERE user_id='${userA}';`);
assert.equal(query(`SET ROLE service_role; SELECT reason FROM public.claim_auto_apply_run('${userA}',true);`), 'daily_run_limit');
console.log('PASS cooldown, daily job budget and daily run budget persist after a run ends');

query(`UPDATE private.auto_apply_control SET budget_day=(now() AT TIME ZONE 'UTC')::date-1 WHERE user_id='${userA}';`);
assert.equal(query(`SET ROLE service_role; SELECT allowed FROM public.claim_auto_apply_run('${userA}',true);`), 't');
const abandonedId = query(`SELECT active_run_id FROM private.auto_apply_control WHERE user_id='${userA}';`);
query(`UPDATE private.auto_apply_control SET lease_expires_at=now()-interval '1 second',last_started_at=now()-interval '16 minutes' WHERE user_id='${userA}';`);
assert.equal(query(`SET ROLE service_role; SELECT allowed FROM public.claim_auto_apply_run('${userA}',true);`), 't');
assert.equal(query(`SELECT status FROM public.auto_apply_runs WHERE id='${abandonedId}';`), 'failed');
assert.equal(query(`SET ROLE service_role; SELECT public.release_auto_apply_run('${userA}','${abandonedId}');`), 'f');
console.log('PASS UTC-day rollover and abandoned-lease recovery do not let old workers release a new run');

for (const role of ['anon', 'authenticated']) {
  for (const sql of [
    `SELECT * FROM private.auto_apply_control`, `SELECT * FROM private.ai_quota_periods`,
    `SELECT * FROM public.claim_auto_apply_run('${userA}',true)`,
    `SELECT * FROM public.reserve_ai_generation_for_user('${userA}')`,
    `SELECT * FROM public.reserve_ai_generation_with_period('${userA}')`,
    `SELECT public.refund_ai_generation_for_user('${userA}',now())`,
    `SELECT public.sync_ai_quota_period_for_user('${userA}',now())`,
  ]) {
    assert.throws(() => query(`SET ROLE ${role}; ${sql};`), /permission denied/);
  }
}
console.log('PASS anon/authenticated roles cannot mutate server-owned budgets or invoke privileged wrappers');
assert.equal(query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname IN ('ai_quota_periods','auto_apply_control') AND c.relrowsecurity;`), '2');
assert.equal(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('claim_auto_apply_run','reserve_auto_apply_job_slot','release_auto_apply_run','sync_ai_quota_period_for_user','reserve_ai_generation_for_user','reserve_ai_generation_with_period','get_remaining_ai_generations','refund_ai_generation_for_user')
  AND p.prosecdef;`), '0');
console.log('PASS private budget tables have RLS and exposed wrappers are SECURITY INVOKER');

query(read('tests/sql/core-ownership-base.sql'));
query(read('supabase/migrations/20260306100000_restrict_users_update_policy.sql'));
query(read('supabase/migrations/20260326400000_add_resume_storage_policies.sql'));
query(read('supabase/migrations/20260904131330_enforce_core_data_ownership.sql'));
query(`INSERT INTO public.resumes(id,user_id,is_public) VALUES ('${userA}','${userA}',true),('${userB}','${userB}',true);
  INSERT INTO public.resume_content(id,resume_id,personal_info) VALUES ('${userA}','${userA}','{"name":"A"}'),('${userB}','${userB}','{"name":"B"}');
  INSERT INTO storage.objects(bucket_id,name) VALUES ('resumes','${userA}/a.pdf'),('resumes','${userB}/b.pdf');`);
for (const owner of [userA, userB]) {
  const actor = `SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';`;
  for (const table of ['users', 'resumes', 'resume_content']) {
    assert.equal(query(`${actor} SELECT id FROM public.${table};`), owner);
    assert.throws(() => query(`SET ROLE anon; SELECT * FROM public.${table};`), /permission denied/);
  }
  assert.equal(query(`${actor} SELECT name FROM storage.objects;`), `${owner}/${owner === userA ? 'a' : 'b'}.pdf`);
}
console.log('PASS user A/B cannot read each other profiles, resumes, content or PDFs even with legacy broad policies');

const actorA = `SET ROLE authenticated; SET request.jwt.claim.sub='${userA}';`;
assert.equal(query(`${actorA} UPDATE public.users SET full_name='Own name' WHERE id='${userA}' RETURNING full_name;`), 'Own name');
assert.equal(query(`${actorA} UPDATE public.users SET full_name='Cross-account' WHERE id='${userB}' RETURNING id;`), '');
for (const column of ['is_premium', 'ai_generations_used', 'ai_generations_limit', 'premium_until', 'premium_plan']) {
  assert.throws(() => query(`${actorA} UPDATE public.users SET ${column}=NULL WHERE id='${userA}';`), /permission denied/);
}
assert.throws(() => query(`${actorA} UPDATE public.resumes SET user_id='${userA}' WHERE id='${userB}';`), /permission denied/);
assert.throws(() => query(`${actorA} DELETE FROM public.resume_content WHERE id='${userB}';`), /permission denied/);
assert.equal(query(`SET ROLE service_role; SELECT count(*) FROM public.users;`), '2');
console.log('PASS safe own-profile updates work but client subscription changes and direct resume mutations are denied');

assert.equal(query(`SELECT public FROM storage.buckets WHERE id='resumes';`), 'f');
assert.equal(query(`SET ROLE anon; SELECT count(*) FROM storage.objects;`), '0');
assert.throws(() => query(`${actorA} INSERT INTO storage.objects(bucket_id,name) VALUES ('resumes','${userB}/attack.pdf');`), /row-level security/);
assert.throws(() => query(`${actorA} UPDATE storage.objects SET name='${userB}/moved.pdf' WHERE name='${userA}/a.pdf';`), /row-level security/);
assert.equal(query(`${actorA} INSERT INTO storage.objects(bucket_id,name) VALUES ('resumes','${userA}/own.pdf') RETURNING name;`), `${userA}/own.pdf`);
assert.equal(query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('users','resumes','resume_content') AND c.relrowsecurity;`), '3');
console.log('PASS resume bucket is private, owner uploads work and cross-owner PDF upload/rename is denied');
console.log('All database budget checks passed. Synthetic database retained for inspection; no production connection used.');
