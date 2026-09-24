import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const defaultPsqlBinary = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin/psql.exe' : 'psql';
const binary = process.env.AUDIT_PSQL || defaultPsqlBinary;
const port = process.env.AUDIT_PG_PORT;
assert.ok(port, 'Set AUDIT_PG_PORT to the mapped loopback port of a disposable PostgreSQL 17 test instance');
assert.match(port, /^\d{4,5}$/);
assert.notEqual(port, '5432', 'Never run audit replay against the installed PostgreSQL service');
const database = `resumeats_replay_${Date.now()}`;
const authServiceRole = 'audit_auth_admin';
const args = (db = database) => ['-X','-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq'];
const query = (sql, db = database) => execFileSync(binary,args(db),{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const prepareAuthServiceRole = () => query(`
  GRANT USAGE ON SCHEMA private TO ${authServiceRole};
  GRANT EXECUTE ON FUNCTION private.create_auth_profile(uuid,text,jsonb),
    private.update_auth_profile_email(uuid,text) TO ${authServiceRole};
`);
const concurrent = (sql) => new Promise((resolve,reject) => {
  const child = spawn(binary,args(),{stdio:['pipe','pipe','pipe']});
  let output=''; let error='';
  child.stdout.on('data',(chunk) => { output+=chunk; });
  child.stderr.on('data',(chunk) => { error+=chunk; });
  child.on('error',reject);
  child.on('exit',(code) => code===0 ? resolve(output.trim()) : reject(new Error(error)));
  child.stdin.end(sql);
});
const read = (path) => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const userA='10000000-0000-4000-8000-000000000001';
const userB='10000000-0000-4000-8000-000000000002';
const userC='10000000-0000-4000-8000-000000000003';
const userD='10000000-0000-4000-8000-000000000004';
const userE='10000000-0000-4000-8000-000000000005';
const actor=(id,sessionId='20000000-0000-4000-8000-000000000001',aal='aal2') => `SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SET request.jwt.claims='{"role":"authenticated","sub":"${id}","session_id":"${sessionId}","aal":"${aal}"}';`;
const resumeCall=(id,resumeId='NULL') => `public.save_resume('${id}','Test resume','','basic','Arial',false,'{"fullName":"Test"}','[]','[]','[]','[]','[]','[]',${resumeId})`;
const versionedCall=(id,resumeId=null,revision=null,title='Versioned resume',name=title) =>
  `public.save_resume_versioned('${id}',${literal(title)},'versioned description','modern','Arial',false,${literal(JSON.stringify({fullName:name}))},'["experience"]','["education"]','["skills"]','["certifications"]','["projects"]','["sections"]',${resumeId ? literal(resumeId) : 'NULL'},${revision ?? 'NULL'})`;
const profileCall=(id) => `public.save_user_profile('${id}','{"fullName":"Profile"}','[]','[]','[]','[]','[]','[]','[]','[]')`;
const versionedProfileCall=(id,profileId=null,revision=null,name='Versioned profile') =>
  `public.save_user_profile_versioned('${id}',${literal(JSON.stringify({fullName:name,applicationProfile:{requiresSponsorship:'Yes'}}))},'["work"]','["education"]','["skills"]','["certifications"]','["projects"]','["languages"]','["interests"]','["references"]',${profileId ? literal(profileId) : 'NULL'},${revision ?? 'NULL'})`;
const literal=(value) => `'${String(value).replaceAll("'", "''")}'`;
const snapshot=(id) => query(`SELECT jsonb_build_object('parent',to_jsonb(r),'content',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.resume_content c WHERE c.resume_id=r.id)) FROM public.resumes r WHERE r.id='${id}';`);
const profileSnapshot=(id) => query(`SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at,p.id),'[]') FROM public.user_profiles p WHERE p.user_id='${id}';`);
let upgradeResume;
let upgradeSnapshot;
let upgradeProfile;
let upgradeProfileSnapshot;
query(`CREATE DATABASE ${database};`,'postgres');
query(read('tests/sql/supabase-platform-base.sql'));
assert.equal(query(`SELECT current_user;`),'postgres','Run migration replay as the production-verified application migration owner');
const migrations = readdirSync(fileURLToPath(new URL('../supabase/migrations',import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
for (const name of migrations) {
  if (name.endsWith('_versioned_resume_saves.sql')) {
    // A real pre-versioning application row and historical column grants test
    // upgrade preservation as well as fresh chain replay. All data is synthetic.
    prepareAuthServiceRole();
    query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES ('${userA}','a@test.invalid','{"full_name":"A","is_premium":true}');`);
    upgradeResume=query(`${actor(userA)} SELECT ${resumeCall(userA)};`);
    upgradeSnapshot=snapshot(upgradeResume);
    query(`GRANT INSERT,UPDATE ON public.resumes,public.resume_content TO authenticated;
      GRANT INSERT(title),UPDATE(title) ON public.resumes TO authenticated;
      GRANT INSERT(personal_info),UPDATE(personal_info) ON public.resume_content TO authenticated;`);
  }
  if (name.endsWith('_versioned_user_profile_saves.sql')) {
    upgradeProfile=query(`${actor(userA)} SELECT ${profileCall(userA)};`);
    query(`INSERT INTO public.user_profiles(user_id,personal,created_at)
      VALUES('${userA}','{"fullName":"Legacy duplicate must remain"}','2999-01-01T00:00:00Z');
      GRANT INSERT,UPDATE ON public.user_profiles TO authenticated;
      GRANT INSERT(personal),UPDATE(personal) ON public.user_profiles TO PUBLIC,anon,authenticated;`);
    upgradeProfileSnapshot=profileSnapshot(userA);
  }
  try { query(`BEGIN;\n${read(`supabase/migrations/${name}`)}\nCOMMIT;`); }
  catch (error) { console.error(`Migration failed: ${name}`); throw error; }
}
// The Supabase image reserves the real Auth role, so the replay uses a
// dedicated synthetic Auth role and grants it only the private-schema usage
// needed by the signup trigger under test.
prepareAuthServiceRole();
query(`CREATE TABLE public.default_privilege_probe (id bigint);
  CREATE SEQUENCE public.default_privilege_probe_sequence;
  CREATE FUNCTION public.default_privilege_probe() RETURNS integer
    LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;`);
for (const role of ['anon','authenticated','service_role']) {
  for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) {
    assert.equal(query(`SELECT has_table_privilege('${role}','public.default_privilege_probe','${privilege}');`),'f');
  }
  for (const privilege of ['USAGE','SELECT','UPDATE']) {
    assert.equal(query(`SELECT has_sequence_privilege('${role}','public.default_privilege_probe_sequence','${privilege}');`),'f');
  }
  assert.equal(query(`SELECT has_function_privilege('${role}','public.default_privilege_probe()','EXECUTE');`),'f');
}
query(`DROP FUNCTION public.default_privilege_probe();
  DROP SEQUENCE public.default_privilege_probe_sequence;
  DROP TABLE public.default_privilege_probe;`);
console.log('PASS future public tables, sequences, and functions require explicit grants');
console.log(`PASS all ${migrations.length} application migrations replay in order on empty ${database} at 127.0.0.1:${port}`);
const nonPostgresPublicObjects = JSON.parse(query(`SELECT coalesce(jsonb_agg(
    jsonb_build_object('kind', object_kind, 'name', object_name, 'owner', owner_name)
  ), '[]'::jsonb)
  FROM (
    SELECT CASE c.relkind WHEN 'S' THEN 'sequence' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'table' END AS object_kind,
      c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
    UNION ALL
    SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_userbyid(p.proowner)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid
        AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
    )
  ) public_objects WHERE owner_name<>'postgres';`));
assert.deepEqual(nonPostgresPublicObjects, [], 'Application migrations must leave public API objects owned by postgres');
console.log('PASS migration replay uses postgres as creator and leaves every public table/view/sequence/function postgres-owned');
assert.equal(query(`SELECT has_schema_privilege('anon','public','CREATE');`),'f');
assert.equal(query(`SELECT has_schema_privilege('authenticated','public','CREATE');`),'f');
assert.equal(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE');`),'0');
assert.equal(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE');`),'33');
assert.equal(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'));`),'0');
assert.equal(query(`SELECT has_function_privilege('anon','public.admin_review_analytics_cohort_quality(uuid)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('authenticated','public.admin_review_analytics_cohort_quality(uuid)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','public.admin_review_analytics_cohort_quality(uuid)','EXECUTE');`),'t');
console.log('PASS public SECURITY DEFINER RPC grants, pinned search paths, and schema CREATE boundary');
const activeSessionId='20000000-0000-4000-8000-000000000001';
const expiredSessionId='20000000-0000-4000-8000-000000000002';
const customerSessionId='20000000-0000-4000-8000-000000000004';
const expiredCustomerSessionId='20000000-0000-4000-8000-000000000005';
const customerCSessionId='20000000-0000-4000-8000-000000000006';
query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('${userA}','a@test.invalid','{"full_name":"A","is_premium":true}'),('${userB}','b@test.invalid','{"full_name":"B"}') ON CONFLICT(id) DO NOTHING;`);
const supportBucket = JSON.parse(query(`SELECT jsonb_build_object(
    'private', public = false,
    'fileSizeLimit', file_size_limit,
    'allowedMimeTypes', allowed_mime_types
  )
  FROM storage.buckets WHERE id='support-attachments';`));
assert.deepEqual(supportBucket, {
  private: true,
  fileSizeLimit: 10485760,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
});
const privacyExportBucket = JSON.parse(query(`SELECT jsonb_build_object(
    'private', public = false,
    'fileSizeLimit', file_size_limit,
    'allowedMimeTypes', allowed_mime_types
  )
  FROM storage.buckets WHERE id='privacy-exports';`));
assert.deepEqual(privacyExportBucket, {
  private: true,
  fileSizeLimit: 52428800,
  allowedMimeTypes: ['application/json'],
});
query(`SET ROLE service_role; INSERT INTO storage.objects(bucket_id,name) VALUES
  ('resumes','${userA}/replay-owned-resume.pdf'),
  ('resumes','${userB}/replay-other-resume.pdf'),
  ('support-attachments','replay-conversation/replay-attachment.pdf');`);
assert.equal(query(`${actor(userA)} SELECT count(*) FROM storage.objects WHERE bucket_id='resumes';`),'1');
assert.equal(query(`${actor(userA)} SELECT count(*) FROM storage.objects WHERE bucket_id='resumes' AND name='${userB}/replay-other-resume.pdf';`),'0');
assert.equal(query(`${actor(userA)} SELECT count(*) FROM storage.objects WHERE bucket_id='support-attachments';`),'0');
assert.equal(query(`${actor(userB)} SELECT count(*) FROM storage.objects WHERE bucket_id='resumes' AND name='${userA}/replay-owned-resume.pdf';`),'0');
assert.equal(query(`SET ROLE anon; SELECT count(*) FROM storage.objects;`),'0');
query(`${actor(userA)} INSERT INTO storage.objects(bucket_id,name)
  VALUES ('resumes','${userA}/replay-user-upload.pdf');`);
assert.equal(query(`${actor(userA)} SELECT count(*) FROM storage.objects WHERE bucket_id='resumes';`),'2');
assert.throws(() => query(`${actor(userA)} INSERT INTO storage.objects(bucket_id,name)
  VALUES ('resumes','${userB}/replay-forbidden-upload.pdf');`),/row-level security policy/);
assert.throws(() => query(`${actor(userA)} INSERT INTO storage.objects(bucket_id,name)
  VALUES ('support-attachments','replay-forbidden-direct-upload.pdf');`),/row-level security policy/);
assert.throws(() => query(`${actor(userA)} UPDATE storage.objects
  SET name='${userB}/replay-moved-resume.pdf'
  WHERE bucket_id='resumes' AND name='${userA}/replay-owned-resume.pdf';`),/row-level security policy/);
assert.equal(query(`SET ROLE service_role; SELECT count(*) FROM storage.objects
  WHERE bucket_id='resumes' AND name='${userB}/replay-other-resume.pdf';`),'1');
console.log('PASS synthetic Storage bucket restrictions and resume-folder RLS isolate two users; support files deny direct client access');
query(`SET ROLE ${authServiceRole}; INSERT INTO auth.sessions(id,user_id,not_after) VALUES
  ('${activeSessionId}','${userA}',NULL),
  ('${expiredSessionId}','${userA}','2000-01-01T00:00:00Z'),
  ('${customerSessionId}','${userB}',NULL),
  ('${expiredCustomerSessionId}','${userB}','2000-01-01T00:00:00Z');`);
assert.equal(query(`SELECT has_function_privilege('anon','public.admin_auth_session_is_active(uuid,uuid)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('authenticated','public.admin_auth_session_is_active(uuid,uuid)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','public.admin_auth_session_is_active(uuid,uuid)','EXECUTE');`),'t');
assert.equal(query(`SET ROLE service_role; SELECT public.admin_auth_session_is_active('${userA}','${activeSessionId}');`),'t');
assert.equal(query(`SET ROLE service_role; SELECT public.admin_auth_session_is_active('${userB}','${activeSessionId}');`),'f');
assert.equal(query(`SET ROLE service_role; SELECT public.admin_auth_session_is_active('${userA}','${expiredSessionId}');`),'f');
assert.equal(query(`SET ROLE service_role; SELECT public.admin_auth_session_is_active('${userA}','20000000-0000-4000-8000-000000000003');`),'f');
console.log('PASS admin Auth-session guard accepts only existing, unexpired sessions bound to the verified user');
assert.equal(query(`SELECT to_regprocedure('public.current_auth_session_is_active()') IS NULL;`),'t');
assert.equal(query(`SELECT has_function_privilege('authenticated','private.current_auth_session_is_active()','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','private.current_auth_session_is_active()','EXECUTE');`),'f');
assert.equal(query(`SELECT p.prosecdef FROM pg_proc p WHERE p.oid='private.current_auth_session_is_active()'::regprocedure;`),'t');
assert.equal(query(`SELECT to_regprocedure('public.current_admin_session_is_aal2()') IS NULL;`),'t');
assert.equal(query(`SELECT has_function_privilege('authenticated','private.current_admin_session_is_aal2()','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','private.current_admin_session_is_aal2()','EXECUTE');`),'f');
console.log('PASS active-session predicate stays private with no direct Auth or service execution grant');
assert.throws(
  () => query(`${actor(userA)} SELECT public.record_analytics_event('nested-analytics', 'upgrade_click', '{"metadata":{"email":"not-storable"}}'::jsonb);`),
  /Analytics properties must be flat/
);
assert.throws(
  () => query(`${actor(userA)} SELECT public.record_analytics_event('stale-analytics-time', 'resume_exported', '{}'::jsonb, clock_timestamp()-interval '45 days');`),
  /Invalid analytics event timestamp/
);
assert.equal(query(`SELECT count(*) FROM public.users;`),'2');
assert.equal(query(`SELECT is_premium FROM public.users WHERE id='${userA}';`),'f');
query(`SET ROLE ${authServiceRole}; UPDATE auth.users SET email='changed@test.invalid' WHERE id='${userA}';`);
assert.equal(query(`SELECT email FROM public.users WHERE id='${userA}';`),'changed@test.invalid');
console.log('PASS Auth-role signup and email update triggers work without trusting premium metadata');

query(`SET ROLE service_role; INSERT INTO public.admin_members(email,user_id,role,is_active)
  VALUES ('changed@test.invalid','${userA}','owner',true);`);
query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email) VALUES('${userE}','owner-race@test.invalid');`);
query(`SET ROLE service_role; INSERT INTO public.admin_members(email,user_id,role,is_active)
  VALUES ('owner-race@test.invalid','${userE}','owner',true);`);
const ownerMemberA=query(`SELECT id FROM public.admin_members WHERE user_id='${userA}' AND is_active;`);
const ownerMemberE=query(`SELECT id FROM public.admin_members WHERE user_id='${userE}' AND is_active;`);

const cohortUserIds = Array.from({ length: 15 }, (_, index) => `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const cohortUserValues = cohortUserIds.slice(0, 12).map((id, index) =>
  `('${id}','cohort-${index + 1}@test.invalid',clock_timestamp()-interval '45 days',clock_timestamp()-interval '45 days')`).join(',');
query(`UPDATE private.analytics_metric_coverage SET coverage_start=clock_timestamp()-interval '60 days' WHERE metric_key='signup_to_paid_30d';
  UPDATE private.analytics_metric_coverage SET coverage_start=clock_timestamp()-interval '60 days' WHERE metric_key='resume_activation_7d';
  UPDATE private.analytics_metric_coverage SET coverage_start=clock_timestamp()-interval '60 days' WHERE metric_key='product_retention_exact_day';
  SET ROLE ${authServiceRole};
  INSERT INTO auth.users(id,email,confirmed_at,email_confirmed_at) VALUES ${cohortUserValues};`);
query(`INSERT INTO private.analytics_identity_exclusion_periods(user_id,reason_code,source,effective_from)
    SELECT id,'staff','owner_review',confirmed_at-interval '1 second' FROM auth.users WHERE id='${cohortUserIds[10]}';
  INSERT INTO private.analytics_identity_exclusion_periods(user_id,reason_code,source,effective_from,qa_category)
    SELECT id,'qa','owner_review',confirmed_at-interval '1 second','synthetic_fixture' FROM auth.users WHERE id='${cohortUserIds[11]}';
  INSERT INTO public.billing_transactions(user_id,provider,environment,transaction_id,transaction_type,subscription_id,status,currency,amount_minor,occurred_at,created_at)
    SELECT u.id,p.provider,p.environment,p.transaction_id,p.transaction_type,p.subscription_id,'paid','usd',p.amount_minor,
      u.confirmed_at+p.payment_after,clock_timestamp()
    FROM (VALUES
      ('${cohortUserIds[0]}'::uuid,'stripe','live','cohort-paid-stripe','invoice','cohort-sub-stripe',interval '10 days',1000),
      ('${cohortUserIds[1]}'::uuid,'paypal','live','cohort-paid-paypal','payment','cohort-sub-paypal',interval '10 days',1000),
      ('${cohortUserIds[2]}'::uuid,'stripe','live','cohort-late-31d','invoice','cohort-sub-late',interval '31 days',1000),
      ('${cohortUserIds[3]}'::uuid,'stripe','test','cohort-sandbox','invoice','cohort-sub-sandbox',interval '10 days',1000),
      ('${cohortUserIds[4]}'::uuid,'stripe','live','cohort-zero-value','payment','cohort-sub-zero',interval '10 days',0)
    ) AS p(user_id,provider,environment,transaction_id,transaction_type,subscription_id,payment_after,amount_minor)
    JOIN auth.users u ON u.id=p.user_id;
  INSERT INTO public.billing_transactions(user_id,provider,environment,transaction_id,transaction_type,subscription_id,status,currency,amount_minor,occurred_at,created_at)
    SELECT id,'stripe','live','cohort-later-refund','refund','cohort-sub-stripe','succeeded','usd',1000,confirmed_at+interval '11 days',clock_timestamp()
    FROM auth.users WHERE id='${cohortUserIds[0]}';
  INSERT INTO public.manual_access_grants(user_id,granted_by,reason)
    VALUES ('${cohortUserIds[5]}','${userA}','cohort replay manual grant only');`);
query(`INSERT INTO public.analytics_events(event_key,event_name,actor_user_id,properties,occurred_at,created_at) VALUES
  ('activation-export-1','resume_exported','${cohortUserIds[0]}','{"format":"pdf"}',(SELECT confirmed_at+interval '2 days' FROM auth.users WHERE id='${cohortUserIds[0]}'),clock_timestamp()),
  ('activation-export-2','resume_exported','${cohortUserIds[1]}','{"format":"docx"}',(SELECT confirmed_at+interval '6 days 23 hours 59 minutes' FROM auth.users WHERE id='${cohortUserIds[1]}'),clock_timestamp()),
  ('activation-export-3','resume_exported','${cohortUserIds[2]}','{"format":"pdf"}',(SELECT confirmed_at+interval '3 days' FROM auth.users WHERE id='${cohortUserIds[2]}'),clock_timestamp()),
  ('activation-export-4','resume_exported','${cohortUserIds[3]}','{"format":"docx"}',(SELECT confirmed_at+interval '6 days' FROM auth.users WHERE id='${cohortUserIds[3]}'),clock_timestamp()),
  ('activation-export-day7','resume_exported','${cohortUserIds[4]}','{"format":"pdf"}',(SELECT confirmed_at+interval '7 days' FROM auth.users WHERE id='${cohortUserIds[4]}'),clock_timestamp()),
  ('activation-export-day8','resume_exported','${cohortUserIds[6]}','{"format":"pdf"}',(SELECT confirmed_at+interval '8 days' FROM auth.users WHERE id='${cohortUserIds[6]}'),clock_timestamp()),
  ('activation-export-staff','resume_exported','${cohortUserIds[10]}','{"format":"pdf"}',(SELECT confirmed_at+interval '2 days' FROM auth.users WHERE id='${cohortUserIds[10]}'),clock_timestamp()),
  ('activation-export-qa','resume_exported','${cohortUserIds[11]}','{"format":"pdf"}',(SELECT confirmed_at+interval '2 days' FROM auth.users WHERE id='${cohortUserIds[11]}'),clock_timestamp());`);
query(`INSERT INTO public.analytics_events(event_key,event_name,actor_user_id,properties,occurred_at,created_at) VALUES
  ('retention-d7-resume','resume_created','${cohortUserIds[0]}','{}',(SELECT confirmed_at+interval '7 days 1 hour' FROM auth.users WHERE id='${cohortUserIds[0]}'),clock_timestamp()),
  ('retention-d7-app','application_created','${cohortUserIds[1]}','{}',(SELECT confirmed_at+interval '7 days 2 hours' FROM auth.users WHERE id='${cohortUserIds[1]}'),clock_timestamp()),
  ('retention-d7-duplicate','resume_exported','${cohortUserIds[1]}','{"format":"pdf"}',(SELECT confirmed_at+interval '7 days 3 hours' FROM auth.users WHERE id='${cohortUserIds[1]}'),clock_timestamp()),
  ('retention-d7-day8','resume_created','${cohortUserIds[2]}','{}',(SELECT confirmed_at+interval '8 days' FROM auth.users WHERE id='${cohortUserIds[2]}'),clock_timestamp()),
  ('retention-d7-staff','resume_created','${cohortUserIds[10]}','{}',(SELECT confirmed_at+interval '7 days 1 hour' FROM auth.users WHERE id='${cohortUserIds[10]}'),clock_timestamp()),
  ('retention-d7-qa','application_created','${cohortUserIds[11]}','{}',(SELECT confirmed_at+interval '7 days 1 hour' FROM auth.users WHERE id='${cohortUserIds[11]}'),clock_timestamp()),
  ('retention-d30-resume','resume_created','${cohortUserIds[0]}','{}',(SELECT confirmed_at+interval '30 days 1 hour' FROM auth.users WHERE id='${cohortUserIds[0]}'),clock_timestamp()),
  ('retention-d30-app','application_created','${cohortUserIds[1]}','{}',(SELECT confirmed_at+interval '30 days 2 hours' FROM auth.users WHERE id='${cohortUserIds[1]}'),clock_timestamp()),
  ('retention-d30-ai','ai_generation_completed','${cohortUserIds[2]}','{}',(SELECT confirmed_at+interval '30 days 3 hours' FROM auth.users WHERE id='${cohortUserIds[2]}'),clock_timestamp()),
  ('retention-d30-day31','resume_created','${cohortUserIds[3]}','{}',(SELECT confirmed_at+interval '31 days' FROM auth.users WHERE id='${cohortUserIds[3]}'),clock_timestamp());`);
const unreviewedCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(unreviewedCohort.numerator, 2);
assert.equal(unreviewedCohort.denominator, 10);
assert.equal(unreviewedCohort.rate, null);
assert.equal(unreviewedCohort.isComplete, false);
assert.ok(unreviewedCohort.qualityReasons.includes('qa_exclusion_review_required'));
assert.equal(query(`SELECT has_function_privilege('anon','public.admin_resume_activation_7d_cohort(timestamptz,timestamptz,timestamptz)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('authenticated','public.admin_resume_activation_7d_cohort(timestamptz,timestamptz,timestamptz)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','public.admin_resume_activation_7d_cohort(timestamptz,timestamptz,timestamptz)','EXECUTE');`),'t');
assert.equal(query(`SELECT has_function_privilege('anon','public.admin_product_retention_cohort(timestamptz,timestamptz,text,timestamptz)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('authenticated','public.admin_product_retention_cohort(timestamptz,timestamptz,text,timestamptz)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','public.admin_product_retention_cohort(timestamptz,timestamptz,text,timestamptz)','EXECUTE');`),'t');
const unreviewedActivation = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_resume_activation_7d_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(unreviewedActivation.numerator, 4);
assert.equal(unreviewedActivation.denominator, 10);
assert.equal(unreviewedActivation.observedRate, 40);
assert.equal(unreviewedActivation.rate, null);
assert.ok(unreviewedActivation.qualityReasons.includes('qa_exclusion_review_required'));
assert.ok(unreviewedActivation.qualityReasons.includes('consent_limited_export_event_coverage'));
query(`INSERT INTO public.billing_reconciliation_runs(provider,environment,status,worker_id,locked_until,started_at,completed_at,processed_count,failed_count)
    VALUES
      ('stripe','live','completed','cohort-replay-worker',clock_timestamp(),clock_timestamp()-interval '1 minute',clock_timestamp(),5,0),
      ('paypal','live','completed','cohort-replay-worker',clock_timestamp(),clock_timestamp()-interval '1 minute',clock_timestamp(),5,0);`);
const qualityReview = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_review_analytics_cohort_quality('${userA}');`));
assert.equal(qualityReview.qaExclusionPeriodCount, 1);
const paidCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(paidCohort.numerator, 2);
assert.equal(paidCohort.denominator, 10);
assert.equal(paidCohort.rate, 20);
assert.equal(paidCohort.isComplete, true);
assert.equal(paidCohort.excludedAtConfirmation, 2);
assert.equal(paidCohort.qaExcludedAtConfirmation, 1);
assert.equal(paidCohort.qaExclusionPeriodCountReviewed, 1);
assert.equal(paidCohort.refundedOrDisputedAccounts, 1);
assert.deepEqual(paidCohort.qualityReasons, []);
const activationCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_resume_activation_7d_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(activationCohort.numerator, 4);
assert.equal(activationCohort.denominator, 10);
assert.equal(activationCohort.observedRate, 40);
assert.equal(activationCohort.rate, null);
assert.equal(activationCohort.isComplete, false);
assert.equal(activationCohort.excludedAtConfirmation, 2);
assert.equal(activationCohort.qaExcludedAtConfirmation, 1);
assert.deepEqual(activationCohort.qualityReasons, ['consent_limited_export_event_coverage']);
const retentionCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_product_retention_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days','Asia/Tbilisi',clock_timestamp());`));
assert.equal(retentionCohort.d7.numerator, 3);
assert.equal(retentionCohort.d7.denominator, 10);
assert.equal(retentionCohort.d7.observedRate, 30);
assert.equal(retentionCohort.d7.rate, null);
assert.equal(retentionCohort.d30.numerator, 3);
assert.equal(retentionCohort.d30.denominator, 10);
assert.equal(retentionCohort.d30.observedRate, 30);
assert.equal(retentionCohort.d30.rate, null);
assert.equal(retentionCohort.isComplete, false);
assert.equal(retentionCohort.excludedAtConfirmation, 2);
assert.equal(retentionCohort.qaExcludedAtConfirmation, 1);
assert.ok(retentionCohort.qualityReasons.includes('product_action_event_coverage_incomplete'));
assert.equal(retentionCohort.window.timezone, 'Asia/Tbilisi');
assert.throws(() => query(`SET ROLE service_role;
  SELECT public.admin_product_retention_cohort(clock_timestamp()-interval '10 days',clock_timestamp()-interval '1 day','Europe/Paris',clock_timestamp());`), /Invalid product-retention cohort window/);
assert.throws(() => query(`SET ROLE service_role; SELECT public.admin_review_analytics_cohort_quality('${userB}');`), /Owner access required/);
query(`UPDATE private.analytics_identity_exclusion_periods
  SET effective_to=clock_timestamp()
  WHERE user_id='${cohortUserIds[11]}' AND reason_code='qa';`);
const changedQaPolicyCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(changedQaPolicyCohort.rate, null);
assert.equal(changedQaPolicyCohort.isComplete, false);
assert.ok(changedQaPolicyCohort.qualityReasons.includes('qa_exclusion_review_required'));
JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_review_analytics_cohort_quality('${userA}');`));
const managedQaUserId = cohortUserIds[12];
query(`SET ROLE ${authServiceRole};
  INSERT INTO auth.users(id,email,confirmed_at,email_confirmed_at)
    VALUES ('${managedQaUserId}','cohort-managed-qa@test.invalid',clock_timestamp()-interval '45 days',clock_timestamp()-interval '45 days');`);
assert.equal(query(`SELECT has_function_privilege('anon','public.admin_set_analytics_qa_exclusion(uuid,uuid,text,text,text)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('authenticated','public.admin_set_analytics_qa_exclusion(uuid,uuid,text,text,text)','EXECUTE');`),'f');
assert.equal(query(`SELECT has_function_privilege('service_role','public.admin_set_analytics_qa_exclusion(uuid,uuid,text,text,text)','EXECUTE');`),'t');
assert.throws(() => query(`SET ROLE service_role; SELECT public.admin_set_analytics_qa_exclusion('${userB}','${managedQaUserId}','exclude','synthetic_fixture','from_confirmation');`), /Owner access required/);
const qaExclusion = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_set_analytics_qa_exclusion('${userA}','${managedQaUserId}','exclude','synthetic_fixture','from_confirmation');`));
assert.equal(qaExclusion.changed, true);
assert.equal(qaExclusion.operation, 'exclude');
assert.equal(qaExclusion.category, 'synthetic_fixture');
assert.equal(query(`SELECT effective_from=(SELECT confirmed_at FROM auth.users WHERE id='${managedQaUserId}')
  FROM private.analytics_identity_exclusion_periods WHERE user_id='${managedQaUserId}' AND reason_code='qa' AND effective_to IS NULL;`),'t');
const unreviewedManagedQa = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(unreviewedManagedQa.rate, null);
assert.ok(unreviewedManagedQa.qualityReasons.includes('qa_exclusion_review_required'));
const reviewedManagedQa = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_review_analytics_cohort_quality('${userA}');`));
assert.equal(reviewedManagedQa.qaExclusionPeriodCount, 2);
const qaInclusion = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_set_analytics_qa_exclusion('${userA}','${managedQaUserId}','include',NULL,NULL);`));
assert.equal(qaInclusion.changed, true);
assert.equal(qaInclusion.operation, 'include');
assert.equal(query(`SELECT count(*) FROM private.analytics_identity_exclusion_periods
  WHERE user_id='${managedQaUserId}' AND reason_code='qa' AND effective_to IS NULL;`),'0');
assert.equal(query(`SELECT count(*) FROM public.admin_audit_events
  WHERE admin_user_id='${userA}' AND target_user_id='${managedQaUserId}'
    AND action IN ('analytics.qa_exclusion.created','analytics.qa_exclusion.ended');`),'2');
const unreviewedQaInclusion = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.ok(unreviewedQaInclusion.qualityReasons.includes('qa_exclusion_review_required'));
JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_review_analytics_cohort_quality('${userA}');`));
const zeroDenominatorCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '25 days',clock_timestamp()-interval '20 days',clock_timestamp());`));
assert.equal(zeroDenominatorCohort.denominator, 0);
assert.equal(zeroDenominatorCohort.rate, null);
assert.equal(zeroDenominatorCohort.isComplete, true);
const maturingUserId = cohortUserIds[13];
query(`SET ROLE ${authServiceRole};
  INSERT INTO auth.users(id,email,confirmed_at,email_confirmed_at)
    VALUES ('${maturingUserId}','cohort-maturing@test.invalid',clock_timestamp()-interval '10 days',clock_timestamp()-interval '10 days');`);
query(`INSERT INTO public.billing_transactions(user_id,provider,environment,transaction_id,transaction_type,subscription_id,status,currency,amount_minor,occurred_at,created_at)
    SELECT id,'stripe','live','cohort-maturing-payment','invoice','cohort-sub-maturing','paid','usd',1000,confirmed_at+interval '5 days',clock_timestamp()
    FROM auth.users WHERE id='${maturingUserId}';`);
const maturingCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '15 days',clock_timestamp()-interval '5 days',clock_timestamp());`));
assert.equal(maturingCohort.denominator, 0);
assert.equal(maturingCohort.maturing.confirmed, 1);
assert.equal(maturingCohort.maturing.firstPaidToDate, 1);
assert.equal(maturingCohort.rate, null);
const autoExcludedUserId = cohortUserIds[14];
query(`SET ROLE ${authServiceRole};
  INSERT INTO auth.users(id,email) VALUES ('${autoExcludedUserId}','cohort-trigger-staff@test.invalid');`);
query(`INSERT INTO public.admin_members(email,user_id,role,is_active) VALUES ('cohort-trigger-staff@test.invalid','${autoExcludedUserId}','support',true);`);
query(`SET ROLE ${authServiceRole};
  UPDATE auth.users SET confirmed_at=clock_timestamp(),email_confirmed_at=clock_timestamp() WHERE id='${autoExcludedUserId}';`);
assert.equal(query(`SELECT count(*) FROM private.analytics_identity_exclusion_periods
  WHERE user_id='${autoExcludedUserId}' AND reason_code='staff' AND source='admin_membership' AND effective_to IS NULL;`), '1');
const autoExcludedCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '5 minutes',clock_timestamp(),clock_timestamp());`));
assert.equal(autoExcludedCohort.denominator, 0);
assert.equal(autoExcludedCohort.excludedAtConfirmation, 1);
console.log('PASS paid-conversion cohort counts only first live paid subscription payments in 30 days; 20% fixture, exclusions, maturing, zero denominator, and quality gates hold');
const activationMaturingUserId='71000000-0000-4000-8000-000000000001';
query(`SET ROLE ${authServiceRole};
  INSERT INTO auth.users(id,email,confirmed_at,email_confirmed_at)
    VALUES ('${activationMaturingUserId}','activation-maturing@test.invalid',clock_timestamp()-interval '3 days',clock_timestamp()-interval '3 days');`);
query(`INSERT INTO public.analytics_events(event_key,event_name,actor_user_id,properties,occurred_at,created_at)
  SELECT 'activation-maturing-export','resume_exported','${activationMaturingUserId}','{"format":"pdf"}',confirmed_at+interval '1 day',clock_timestamp()
  FROM auth.users WHERE id='${activationMaturingUserId}';`);
const maturingActivation = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_resume_activation_7d_cohort(clock_timestamp()-interval '4 days',clock_timestamp()-interval '2 days',clock_timestamp());`));
assert.equal(maturingActivation.denominator, 0);
assert.equal(maturingActivation.maturing.confirmed, 1);
assert.equal(maturingActivation.maturing.resumeExportToDate, 1);
assert.equal(maturingActivation.rate, null);
const maturingRetention = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_product_retention_cohort(clock_timestamp()-interval '4 days',clock_timestamp()-interval '2 days','Asia/Tbilisi',clock_timestamp());`));
assert.equal(maturingRetention.d7.denominator, 0);
assert.equal(maturingRetention.d7.maturing.accounts, 1);
assert.equal(maturingRetention.d7.maturing.observedActive, 0);
assert.equal(maturingRetention.d30.denominator, 0);
assert.equal(maturingRetention.d30.maturing.accounts, 1);
assert.equal(maturingRetention.d30.rate, null);
const timezoneRetentionUserId='72000000-0000-4000-8000-000000000001';
query(`SET ROLE ${authServiceRole};
  INSERT INTO auth.users(id,email,confirmed_at,email_confirmed_at)
    VALUES ('${timezoneRetentionUserId}','retention-timezone@test.invalid','2026-09-01 22:30:00+00','2026-09-01 22:30:00+00');`);
query(`SET ROLE service_role;
  INSERT INTO public.analytics_events(event_key,event_name,actor_user_id,properties,occurred_at,created_at)
    VALUES ('retention-timezone-action','resume_created','${timezoneRetentionUserId}','{}','2026-09-09 01:00:00+00',clock_timestamp());`);
const tbilisiRetentionBoundary = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_product_retention_cohort('2026-09-01 21:00:00+00','2026-09-02 00:00:00+00','Asia/Tbilisi',clock_timestamp());`));
const utcRetentionBoundary = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_product_retention_cohort('2026-09-01 21:00:00+00','2026-09-02 00:00:00+00','UTC',clock_timestamp());`));
assert.equal(tbilisiRetentionBoundary.d7.denominator, 1);
assert.equal(tbilisiRetentionBoundary.d7.numerator, 1);
assert.equal(utcRetentionBoundary.d7.denominator, 1);
assert.equal(utcRetentionBoundary.d7.numerator, 0);
assert.throws(() => query(`SET ROLE service_role;
  SELECT public.admin_product_retention_cohort(clock_timestamp()-interval '10 days',clock_timestamp()-interval '1 day',NULL,clock_timestamp());`), /Invalid product-retention cohort window/);
console.log('PASS 7-day activation cohort counts distinct mature accounts, respects exact 7-day boundary and exclusions, and exposes consent/maturity quality');
console.log('PASS exact-day D7/D30 retention counts distinct users across timezones, respects maturity/exclusions, and withholds incomplete rates');

const concurrentOwnerRevokes=await Promise.all([
  [userA,ownerMemberE],
  [userE,ownerMemberA],
].map(([actorId,memberId]) => concurrent(`SET ROLE service_role; SELECT public.admin_revoke_member('${actorId}','${memberId}');`)
  .then((value) => ({ok:true,value}),(error) => ({ok:false,error:error.message}))));
assert.equal(concurrentOwnerRevokes.filter((result) => result.ok).length,1);
assert.equal(concurrentOwnerRevokes.filter((result) => !result.ok && /Owner access required/.test(result.error)).length,1);
assert.equal(query(`SELECT count(*) FROM public.admin_members WHERE user_id IN ('${userA}','${userE}') AND role='owner' AND is_active;`),'1');
assert.equal(query(`SELECT count(*) FROM public.admin_audit_events WHERE action='admin.revoke' AND target_user_id IN ('${userA}','${userE}');`),'1');
console.log('PASS concurrent reciprocal owner revocations leave exactly one active owner and one transactional audit receipt');

query(`SET ROLE service_role; UPDATE public.admin_members SET role='owner',is_active=true WHERE user_id IN ('${userA}','${userE}');`);
const concurrentOwnerDemotions=await Promise.all([
  [userA,ownerMemberE],
  [userE,ownerMemberA],
].map(([actorId,memberId]) => concurrent(`SET ROLE service_role; SELECT public.admin_update_member_role('${actorId}','${memberId}','support');`)
  .then((value) => ({ok:true,value}),(error) => ({ok:false,error:error.message}))));
assert.equal(concurrentOwnerDemotions.filter((result) => result.ok).length,1);
assert.equal(concurrentOwnerDemotions.filter((result) => !result.ok && /Owner access required/.test(result.error)).length,1);
assert.equal(query(`SELECT count(*) FROM public.admin_members WHERE user_id IN ('${userA}','${userE}') AND role='owner' AND is_active;`),'1');
assert.equal(query(`SELECT count(*) FROM public.admin_audit_events WHERE action='admin.role.updated' AND target_user_id IN ('${userA}','${userE}');`),'1');
query(`SET ROLE service_role; UPDATE public.admin_members SET role=CASE WHEN user_id='${userA}' THEN 'owner' ELSE 'support' END,
  is_active=(user_id='${userA}') WHERE user_id IN ('${userA}','${userE}');`);
console.log('PASS concurrent reciprocal owner demotions leave exactly one active owner and one transactional audit receipt');

const directoryServiceResult = JSON.parse(query(`SET ROLE service_role; SET request.jwt.claims='{"role":"service_role"}'; SELECT public.admin_list_user_directory('',NULL,NULL,50);`));
assert.ok(directoryServiceResult.items.some((item) => item.id === userA));
const directoryAdminResult = JSON.parse(query(`${actor(userA)} SELECT public.admin_list_user_directory('',NULL,NULL,50);`));
assert.ok(directoryAdminResult.items.some((item) => item.id === userA));
assert.throws(() => query(`${actor(userA,expiredSessionId)} SELECT public.admin_list_user_directory('',NULL,NULL,50);`),/Admin access required/);
assert.throws(() => query(`${actor(userB)} SELECT public.admin_list_user_directory('',NULL,NULL,50);`),/Admin access required/);
assert.equal(query(`${actor(userA)} SELECT public.is_support_operator();`),'t');
assert.equal(query(`${actor(userA)} SELECT public.is_knowledge_manager();`),'t');
assert.equal(query(`${actor(userA,expiredSessionId)} SELECT public.is_support_operator();`),'f');
assert.equal(query(`${actor(userA,expiredSessionId)} SELECT public.is_knowledge_manager();`),'f');
assert.equal(query(`${actor(userA,'not-a-uuid')} SELECT public.is_support_operator();`),'f');
assert.equal(query(`${actor(userA,activeSessionId,'aal1')} SELECT public.is_support_operator();`),'f');
assert.equal(query(`${actor(userA,activeSessionId,'aal1')} SELECT public.is_knowledge_manager();`),'f');
assert.throws(() => query(`${actor(userA,activeSessionId,'aal1')} SELECT public.admin_list_user_directory('',NULL,NULL,50);`),/Admin access required/);
assert.equal(query(`${actor(userB)} SELECT public.is_support_operator();`),'f');
assert.equal(query(`${actor(userB)} SELECT public.is_knowledge_manager();`),'f');
query(`DELETE FROM auth.sessions WHERE id='${activeSessionId}';`);
assert.equal(query(`${actor(userA)} SELECT public.is_support_operator();`),'f');
assert.throws(() => query(`${actor(userA)} SELECT public.admin_list_user_directory('',NULL,NULL,50);`),/Admin access required/);
assert.throws(() => query(`${actor(userA)} SELECT public.support_set_presence('available',90);`),/Support operator access required/);
query(`INSERT INTO auth.sessions(id,user_id,not_after) VALUES ('${activeSessionId}','${userA}',NULL);`);
console.log('PASS admin directory service and authenticated-owner RPC calls resolve the current JWT role accessor');
console.log('PASS an ordinary customer is denied admin directory and support/knowledge operator capabilities');
console.log('PASS AAL1 keeps no direct operator, knowledge, or user-directory access while AAL2 remains valid');

// Exercise the cursor contract at the scale called out in the execution plan.
// All synthetic rows share one created_at value so the UUID tie-breaker is
// exercised rather than relying on naturally distinct timestamps.
query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email,raw_user_meta_data)
  SELECT ('20000000-0000-4000-8000-' || lpad(to_hex(i),12,'0'))::uuid,
    'scale-' || lpad(i::text,5,'0') || '@test.invalid',
    jsonb_build_object('full_name','Scale User ' || lpad(i::text,5,'0'))
  FROM generate_series(1,10000) AS values(i);`);
query(`SET ROLE service_role;
  UPDATE public.users SET created_at='2026-01-01T00:00:00Z'::timestamptz WHERE email LIKE 'scale-%@test.invalid';
  UPDATE public.admin_user_directory SET created_at='2026-01-01T00:00:00Z'::timestamptz WHERE email LIKE 'scale-%@test.invalid';`);
query(`SET ROLE service_role; SET request.jwt.claims='{"role":"service_role"}';
  DO $$
  DECLARE
    page jsonb;
    cursor_created timestamptz := null;
    cursor_user_id uuid := null;
    page_count integer := 0;
    seen_count integer := 0;
    inserted_count integer := 0;
    item_count integer := 0;
  BEGIN
    CREATE TEMP TABLE directory_scale_seen(user_id uuid primary key) ON COMMIT DROP;
    LOOP
      page_count := page_count + 1;
      page := public.admin_list_user_directory('scale-', cursor_created, cursor_user_id, 100);
      item_count := jsonb_array_length(page->'items');
      INSERT INTO directory_scale_seen(user_id)
      SELECT (item->>'id')::uuid
      FROM jsonb_array_elements(page->'items') AS rows(item);
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
      IF inserted_count <> item_count THEN
        RAISE EXCEPTION 'Directory cursor returned a duplicate item on page %', page_count;
      END IF;
      seen_count := seen_count + item_count;
      IF item_count < 100 THEN
        EXIT;
      END IF;
      IF jsonb_typeof(page->'nextCursor') <> 'object' THEN
        RAISE EXCEPTION 'Full directory page did not include a cursor';
      END IF;
      cursor_created := (page->'nextCursor'->>'createdAt')::timestamptz;
      cursor_user_id := (page->'nextCursor'->>'id')::uuid;
      IF page_count > 100 THEN
        RAISE EXCEPTION 'Directory cursor did not terminate';
      END IF;
    END LOOP;
    IF page_count <> 101 OR seen_count <> 10000 THEN
      RAISE EXCEPTION 'Expected 100 data pages plus an empty terminator and 10000 rows, got % calls and % rows', page_count, seen_count;
    END IF;
    IF jsonb_array_length((public.admin_list_user_directory('scale-09999@test.invalid',NULL,NULL,100))->'items') <> 1 THEN
      RAISE EXCEPTION 'Directory search did not isolate one synthetic user';
    END IF;
  END;
  $$;`);
query(`SET ROLE ${authServiceRole}; DELETE FROM auth.users WHERE email LIKE 'scale-%@test.invalid';`);
assert.equal(query(`SELECT count(*) FROM public.users WHERE email LIKE 'scale-%@test.invalid';`), '0');
assert.equal(query(`SELECT count(*) FROM public.admin_user_directory WHERE email LIKE 'scale-%@test.invalid';`), '0');
console.log('PASS 10,000-user admin directory replay traverses 100 stable cursor pages without duplicates and preserves search isolation');

const resumeA=query(`${actor(userA)} SELECT ${resumeCall(userA)};`);
const resumeB=query(`${actor(userB)} SELECT ${resumeCall(userB)};`);
assert.equal(query(`${actor(userA)} SELECT id FROM public.user_resumes WHERE id='${resumeA}';`),resumeA);
assert.equal(query(`${actor(userA)} SELECT id FROM public.get_resume_with_content('${resumeB}');`),'');
assert.throws(() => query(`${actor(userA)} SELECT ${resumeCall(userB)};`),/only save your own/);
assert.throws(() => query(`${actor(userA)} SELECT ${versionedCall(userA,resumeB,1)};`),/permission/);
assert.throws(() => query(`${actor(userA)} SELECT public.delete_resume('${resumeB}','${userA}');`),/permission/);
assert.throws(() => query(`SET ROLE authenticated; SELECT ${resumeCall(userA)};`),/only save your own/);
assert.throws(() => query(`${actor(userA)} SELECT ${resumeCall(userA,`'${resumeA}'`)};`),/RESUME_VERSION_REQUIRED/);
assert.equal(JSON.parse(query(`${actor(userA)} SELECT ${versionedCall(userA,resumeA,1)};`)).revision,2);
assert.equal(query(`${actor(userA)} SELECT public.delete_resume('${resumeA}','${userA}');`),'t');
console.log('PASS real resume save/read/update/delete RPCs preserve owner isolation and reject missing identity');

const upgraded=JSON.parse(snapshot(upgradeResume));
assert.equal(upgraded.parent.revision,1);
delete upgraded.parent.revision;
// Auth email update does not modify the resume, so all legacy fields remain exact.
assert.deepEqual(upgraded,JSON.parse(upgradeSnapshot));
for (const [table,column] of [['resumes','title'],['resume_content','personal_info']]) {
  for (const privilege of ['INSERT','UPDATE']) {
    assert.equal(query(`SELECT has_table_privilege('authenticated','public.${table}','${privilege}');`),'f');
    assert.equal(query(`SELECT has_column_privilege('authenticated','public.${table}','${column}','${privilege}');`),'f');
  }
}
console.log('PASS pre-versioning data is preserved at revision 1 and historical table/column write grants are revoked');

const created=JSON.parse(query(`${actor(userA)} SELECT ${versionedCall(userA)};`));
assert.equal(created.revision,1);
assert.ok(Number.isFinite(Date.parse(created.updated_at)));
const resumeV=created.resume_id;
const loaded=JSON.parse(query(`${actor(userA)} SELECT to_jsonb(v) FROM public.get_resume_versioned('${resumeV}') v;`));
assert.equal(loaded.id,resumeV);
assert.equal(loaded.user_id,userA);
assert.equal(loaded.revision,1);
assert.equal(loaded.personal_info.fullName,'Versioned resume');
assert.equal(query(`${actor(userA)} SELECT revision FROM public.user_resumes WHERE id='${resumeV}';`),'1');
const beforeLoad=snapshot(resumeV);
query(`${actor(userA)} SELECT * FROM public.get_resume_versioned('${resumeV}');`);
assert.equal(snapshot(resumeV),beforeLoad);
assert.equal(query(`${actor(userB)} SELECT * FROM public.get_resume_versioned('${resumeV}');`),'');
assert.throws(() => query(`SET ROLE anon; SELECT * FROM public.get_resume_versioned('${resumeV}');`),/permission denied/);
console.log('PASS versioned create/load/list shapes include atomic content and revision without read-side writes');

const racing=await Promise.all(Array.from({length:16},(_,index) =>
  concurrent(`${actor(userA)} SELECT ${versionedCall(userA,resumeV,1,`writer-${index}`)};`)
    .then((value) => ({ok:true,value:JSON.parse(value)}),(error) => ({ok:false,error:error.message}))));
assert.equal(racing.filter((result) => result.ok).length,1);
assert.equal(
  racing.filter((result) => !result.ok && /PT409.*RESUME_CONFLICT/.test(result.error)).length,
  15,
  `Unexpected concurrent-save failures: ${JSON.stringify(racing.filter((result) => !result.ok && !/PT409.*RESUME_CONFLICT/.test(result.error)).map((result) => result.error))}`,
);
const winner=JSON.parse(query(`${actor(userA)} SELECT to_jsonb(v) FROM public.get_resume_versioned('${resumeV}') v;`));
assert.equal(winner.revision,2);
assert.equal(winner.personal_info.fullName,winner.title);
assert.deepEqual(winner.work_experience,['experience']);
const winningSnapshot=snapshot(resumeV);
assert.throws(() => query(`${actor(userA)} SELECT ${versionedCall(userA,resumeV,1,'stale-title','stale-content')};`),/PT409.*RESUME_CONFLICT/);
assert.equal(snapshot(resumeV),winningSnapshot);
console.log('PASS 16 callers with revision 1 produce one complete winner, 15 typed conflicts, and no stale parent/content changes');

for (const invalidRevision of [null,0,-1]) {
  assert.throws(() => query(`${actor(userA)} SELECT ${versionedCall(userA,resumeV,invalidRevision)};`),/22023.*RESUME_VERSION_REQUIRED/);
}
assert.throws(() => query(`${actor(userA)} SELECT ${versionedCall(userA,null,1)};`),/RESUME_VERSION_REQUIRED/);
assert.throws(() => query(`${actor(userB)} SELECT ${versionedCall(userA,resumeV,2)};`),/42501/);
assert.throws(() => query(`${actor(userB)} SELECT ${versionedCall(userB,resumeV,2)};`),/42501/);
assert.throws(() => query(`SET ROLE authenticated; SELECT ${versionedCall(userA,resumeV,2)};`),/42501/);
assert.throws(() => query(`SET ROLE anon; SELECT ${versionedCall(userA,resumeV,2)};`),/permission denied/);
for (const namespace of ['public','private']) {
  assert.throws(() => query(`${actor(userA)} SELECT ${resumeCall(userA,`'${resumeV}'`).replace('public.',`${namespace}.`)};`),/RESUME_VERSION_REQUIRED/);
}
assert.throws(() => query(`${actor(userA)} UPDATE public.resumes SET title='bypass' WHERE id='${resumeV}';`),/permission denied/);
assert.throws(() => query(`${actor(userA)} UPDATE public.resume_content SET personal_info='{}' WHERE resume_id='${resumeV}';`),/permission denied/);
assert.throws(() => query(`${actor(userA)} INSERT INTO public.resumes(user_id,title) VALUES('${userA}','bypass');`),/permission denied/);
assert.throws(() => query(`${actor(userA)} INSERT INTO public.resume_content(resume_id,personal_info) VALUES('${resumeV}','{}');`),/permission denied/);
assert.equal(snapshot(resumeV),winningSnapshot);
console.log('PASS invalid revisions, wrong owners, missing auth, old public/private updates and direct writes cannot bypass concurrency');

query(`ALTER TABLE public.resume_content ADD CONSTRAINT fixture_content_failure
  CHECK (personal_info->>'fullName' IS DISTINCT FROM 'reject-content');`);
assert.throws(() => query(`${actor(userA)} SELECT ${versionedCall(userA,resumeV,2,'must-rollback','reject-content')};`),/fixture_content_failure/);
assert.equal(snapshot(resumeV),winningSnapshot);
const parentCount=query('SELECT count(*) FROM public.resumes;');
assert.throws(() => query(`${actor(userA)} SELECT ${versionedCall(userA,null,null,'must-not-orphan','reject-content')};`),/fixture_content_failure/);
assert.equal(query('SELECT count(*) FROM public.resumes;'),parentCount);
query('ALTER TABLE public.resume_content DROP CONSTRAINT fixture_content_failure;');
console.log('PASS content constraint failures roll back metadata/revision and new parent insertion together');

const repair=JSON.parse(query(`${actor(userA)} SELECT ${versionedCall(userA)};`));
query(`DELETE FROM public.resume_content WHERE resume_id='${repair.resume_id}';`);
assert.equal(JSON.parse(query(`${actor(userA)} SELECT ${versionedCall(userA,repair.resume_id,1,'repaired')};`)).revision,2);
assert.equal(query(`SELECT count(*) FROM public.resume_content WHERE resume_id='${repair.resume_id}';`),'1');
query(`INSERT INTO public.resume_content(resume_id,personal_info) VALUES('${repair.resume_id}','{"fullName":"legacy duplicate"}');`);
assert.equal(query(`${actor(userA)} SELECT count(*) FROM public.get_resume_versioned('${repair.resume_id}');`),'1');
query(`${actor(userA)} SELECT ${versionedCall(userA,repair.resume_id,2,'all-content-consistent')};`);
assert.equal(query(`SELECT count(*) FROM public.resume_content WHERE resume_id='${repair.resume_id}';`),'2');
assert.equal(query(`SELECT count(DISTINCT personal_info) FROM public.resume_content WHERE resume_id='${repair.resume_id}';`),'1');
console.log('PASS missing content repair and legacy duplicate preservation stay in the successful versioned transaction');

assert.throws(
  () => query(`${actor(userA)} SELECT ${versionedCall(userA,null,null,'free-limit-rejection')};`),
  /FREE_RESUME_LIMIT/
);
query(`SET ROLE service_role; UPDATE public.users SET is_premium=true, premium_until='2999-01-01T00:00:00Z' WHERE id='${userA}';`);
console.log('PASS free resume storage limit rejects the fourth resume before the premium concurrency fixture');

const atomic=JSON.parse(query(`${actor(userA)} SELECT ${versionedCall(userA,null,null,'1')};`));
const writeSeries=(async () => {
  for (let revision=1;revision<8;revision++) {
    await concurrent(`${actor(userA)} SELECT ${versionedCall(userA,atomic.resume_id,revision,String(revision+1))};`);
  }
})();
const readSeries=(async () => {
  for (let index=0;index<12;index++) {
    const row=JSON.parse(await concurrent(`${actor(userA)} SELECT to_jsonb(v) FROM public.get_resume_versioned('${atomic.resume_id}') v;`));
    assert.equal(row.title,String(row.revision));
    assert.equal(row.personal_info.fullName,String(row.revision));
  }
})();
await Promise.all([writeSeries,readSeries]);
assert.equal(query(`${actor(userA)} SELECT revision FROM public.get_resume_versioned('${atomic.resume_id}');`),'8');
query(`SET ROLE service_role; UPDATE public.resumes SET last_accessed_at=now() WHERE id='${atomic.resume_id}';`);
assert.equal(query(`${actor(userA)} SELECT revision FROM public.get_resume_versioned('${atomic.resume_id}');`),'8');
console.log('PASS concurrent loads observe matching content/revision snapshots and last-access bookkeeping does not advance revision');

const upgradedProfiles=JSON.parse(profileSnapshot(userA));
assert.equal(upgradedProfiles.length,2);
for (const profile of upgradedProfiles) { assert.equal(profile.revision,1); delete profile.revision; }
assert.deepEqual(upgradedProfiles,JSON.parse(upgradeProfileSnapshot));
for (const role of ['anon','authenticated']) {
  for (const privilege of ['INSERT','UPDATE']) {
    assert.equal(query(`SELECT has_table_privilege('${role}','public.user_profiles','${privilege}');`),'f');
    assert.equal(query(`SELECT has_column_privilege('${role}','public.user_profiles','personal','${privilege}');`),'f');
  }
}
console.log('PASS profile revision upgrade preserves every canonical/duplicate field and revokes historical table/column grants');

assert.equal(query(`${actor(userB)} SELECT * FROM public.get_user_profile_versioned('${userB}');`),'');
const profileCreates=await Promise.all(Array.from({length:16},(_,index) =>
  concurrent(`${actor(userB)} SELECT ${versionedProfileCall(userB,null,null,`creator-${index}`)};`)
    .then((value) => ({ok:true,value:JSON.parse(value)}),(error) => ({ok:false,error:error.message}))));
assert.equal(profileCreates.filter((result) => result.ok).length,1);
assert.equal(profileCreates.filter((result) => !result.ok && /PT409.*PROFILE_CONFLICT/.test(result.error)).length,15);
const profileB=profileCreates.find((result) => result.ok).value;
assert.equal(profileB.revision,1);
assert.ok(Number.isFinite(Date.parse(profileB.updated_at)));
assert.equal(query(`SELECT count(*) FROM public.user_profiles WHERE user_id='${userB}';`),'1');
const loadedProfile=JSON.parse(query(`${actor(userB)} SELECT to_jsonb(p) FROM public.get_user_profile_versioned('${userB}') p;`));
assert.equal(loadedProfile.id,profileB.profile_id);
assert.equal(loadedProfile.user_id,userB);
assert.equal(loadedProfile.revision,1);
assert.equal(loadedProfile.personal.applicationProfile.requiresSponsorship,'Yes');
const beforeProfileRead=profileSnapshot(userB);
query(`${actor(userB)} SELECT * FROM public.get_user_profile_versioned('${userB}');`);
assert.equal(profileSnapshot(userB),beforeProfileRead);
console.log('PASS 16 absent-profile creates produce one revision-1 profile and 15 conflicts; versioned read is complete and read-only');

const profileWriters=await Promise.all(Array.from({length:16},(_,index) =>
  concurrent(`${actor(userA)} SELECT ${versionedProfileCall(userA,upgradeProfile,1,`profile-writer-${index}`)};`)
    .then((value) => ({ok:true,value:JSON.parse(value)}),(error) => ({ok:false,error:error.message}))));
assert.equal(profileWriters.filter((result) => result.ok).length,1);
assert.equal(profileWriters.filter((result) => !result.ok && /PT409.*PROFILE_CONFLICT/.test(result.error)).length,15);
const winnerProfile=JSON.parse(query(`${actor(userA)} SELECT to_jsonb(p) FROM public.get_user_profile_versioned('${userA}') p;`));
assert.equal(winnerProfile.id,upgradeProfile);
assert.equal(winnerProfile.revision,2);
assert.match(winnerProfile.personal.fullName,/^profile-writer-\d+$/);
for (const [field,expected] of [['work_experience','work'],['education','education'],['skills','skills'],['certifications','certifications'],
  ['projects','projects'],['languages','languages'],['interests','interests'],['reference_list','references']]) {
  assert.deepEqual(winnerProfile[field],[expected]);
}
const winningProfileSnapshot=profileSnapshot(userA);
assert.throws(() => query(`${actor(userA)} SELECT ${versionedProfileCall(userA,upgradeProfile,1,'stale-profile')};`),/PT409.*PROFILE_CONFLICT/);
assert.equal(profileSnapshot(userA),winningProfileSnapshot);
const duplicateAfter=JSON.parse(winningProfileSnapshot)[1];
delete duplicateAfter.revision;
assert.deepEqual(duplicateAfter,JSON.parse(upgradeProfileSnapshot)[1]);
console.log('PASS 16 profile updates from one revision produce one full winner and 15 conflicts without changing stale or duplicate rows');

assert.equal(query(`${actor(userA)} SELECT user_id FROM public.get_user_profile('${userA}');`),userA);
assert.throws(() => query(`${actor(userB)} SELECT * FROM public.get_user_profile('${userA}');`),/only access your own/);
assert.throws(() => query(`${actor(userB)} SELECT * FROM public.get_user_profile_versioned('${userA}');`),/42501/);
assert.throws(() => query(`${actor(userB)} SELECT ${profileCall(userA)};`),/only save your own/);
assert.throws(() => query(`SET ROLE authenticated; SELECT ${profileCall(userA)};`),/only save your own/);
assert.throws(() => query(`SET ROLE anon; SELECT ${profileCall(userA)};`),/permission denied/);
assert.throws(() => query(`${actor(userB)} SELECT ${versionedProfileCall(userA,upgradeProfile,2)};`),/42501/);
assert.throws(() => query(`${actor(userB)} SELECT ${versionedProfileCall(userB,upgradeProfile,2)};`),/PT409.*PROFILE_CONFLICT/);
assert.throws(() => query(`SET ROLE authenticated; SELECT ${versionedProfileCall(userA,upgradeProfile,2)};`),/42501/);
assert.throws(() => query(`SET ROLE anon; SELECT ${versionedProfileCall(userA,upgradeProfile,2)};`),/permission denied/);
assert.throws(() => query(`SET ROLE anon; SELECT * FROM public.get_user_profile_versioned('${userA}');`),/permission denied/);
for (const invalidRevision of [null,0,-1]) {
  assert.throws(() => query(`${actor(userA)} SELECT ${versionedProfileCall(userA,upgradeProfile,invalidRevision)};`),/22023.*PROFILE_VERSION_REQUIRED/);
}
assert.throws(() => query(`${actor(userA)} SELECT ${versionedProfileCall(userA,null,1)};`),/22023.*PROFILE_VERSION_REQUIRED/);
for (const namespace of ['public','private']) {
  assert.throws(() => query(`${actor(userA)} SELECT ${profileCall(userA).replace('public.',`${namespace}.`)};`),/22023.*PROFILE_VERSION_REQUIRED/);
  assert.throws(() => query(`${actor(userB)} SELECT ${versionedProfileCall(userA,upgradeProfile,2).replace('public.',`${namespace}.`)};`),/42501/);
}
assert.throws(() => query(`${actor(userA)} UPDATE public.user_profiles SET personal='{}' WHERE id='${upgradeProfile}';`),/permission denied/);
assert.throws(() => query(`${actor(userA)} INSERT INTO public.user_profiles(user_id,personal) VALUES('${userA}','{}');`),/permission denied/);
assert.equal(profileSnapshot(userA),winningProfileSnapshot);
console.log('PASS profile owner/auth, invalid revision, identity mismatch, legacy public/private updates and direct-write boundaries fail closed');

const publicEngagementClaim = `SET ROLE service_role; SELECT to_jsonb(c) FROM public.claim_public_engagement_attempt(
  'submitContactInquiry', 'atomic-key', 'atomic-email', 'atomic-ip', '2000-01-01T00:00:00Z', 1, NULL, NULL, NULL
) c;`;
const publicEngagementClaims = await Promise.all(Array.from({ length: 8 }, () =>
  concurrent(publicEngagementClaim).then((value) => JSON.parse(value))));
assert.equal(publicEngagementClaims.filter((claim) => claim.allowed).length, 1);
assert.equal(publicEngagementClaims.filter((claim) => claim.reason === 'rate_limited_key').length, 7);
const winningClaim = publicEngagementClaims.find((claim) => claim.allowed);
assert.equal(query(`SET ROLE service_role; SELECT public.finalize_public_engagement_attempt('${winningClaim.attempt_id}', true, NULL);`), 't');
assert.equal(query(`SELECT count(*) FROM public.public_engagement_attempts WHERE scope='submitContactInquiry' AND key_hash='atomic-key';`), '8');
assert.equal(query(`SELECT count(*) FROM public.public_engagement_attempts WHERE scope='submitContactInquiry' AND accepted;`), '1');
assert.equal(query(`SELECT has_table_privilege('service_role','public.public_engagement_attempts','INSERT');`), 'f');
console.log('PASS 8 concurrent public-engagement claims produce one allowed reservation, seven denials, and no direct service-role table insert');

const gmailScanClaim = (id) => `SET ROLE service_role; SELECT to_jsonb(c) FROM public.claim_gmail_scan('${id}') c;`;
const gmailClaims = await Promise.all(Array.from({ length: 8 }, () =>
  concurrent(gmailScanClaim(userA)).then((value) => JSON.parse(value))));
assert.equal(gmailClaims.filter((claim) => claim.allowed).length, 1);
assert.equal(gmailClaims.filter((claim) => claim.reason === 'already_running').length, 7);
const winningGmailClaim = gmailClaims.find((claim) => claim.allowed);
const gmailWorkCall = (messages, aiCalls) => `SET ROLE service_role; SELECT to_jsonb(r) FROM public.reserve_gmail_scan_work('${userA}','${winningGmailClaim.scan_id}',${messages},${aiCalls}) r;`;
assert.equal(JSON.parse(query(gmailWorkCall(500, 0))).allowed, true);
assert.equal(JSON.parse(query(gmailWorkCall(1, 0))).allowed, false);
assert.equal(JSON.parse(query(gmailWorkCall(0, 100))).allowed, true);
assert.equal(JSON.parse(query(gmailWorkCall(0, 1))).allowed, false);
assert.equal(query(`SET ROLE service_role; SELECT public.release_gmail_scan('${userA}','${winningGmailClaim.scan_id}');`), 't');
assert.equal(query(`SELECT has_table_privilege('service_role','private.gmail_scan_control','UPDATE');`), 'f');
console.log('PASS 8 concurrent Gmail claims produce one lease, message/AI budgets stop overflow, and direct control-table writes are denied');

query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email) VALUES('${userC}','c@test.invalid');`);
query(`SET ROLE ${authServiceRole}; INSERT INTO auth.sessions(id,user_id,not_after) VALUES ('${customerCSessionId}','${userC}',NULL);`);
query(`ALTER TABLE public.user_profiles ADD CONSTRAINT fixture_profile_failure CHECK(personal->>'fullName' IS DISTINCT FROM 'reject-profile');`);
assert.throws(() => query(`${actor(userA)} SELECT ${versionedProfileCall(userA,upgradeProfile,2,'reject-profile')};`),/fixture_profile_failure/);
assert.equal(profileSnapshot(userA),winningProfileSnapshot);
assert.throws(() => query(`${actor(userC)} SELECT ${versionedProfileCall(userC,null,null,'reject-profile')};`),/fixture_profile_failure/);
assert.equal(profileSnapshot(userC),'[]');
query('ALTER TABLE public.user_profiles DROP CONSTRAINT fixture_profile_failure;');
const legacyProfile=query(`${actor(userC)} SELECT ${profileCall(userC)};`);
assert.equal(query(`${actor(userC)} SELECT id FROM public.get_user_profile_versioned('${userC}');`),legacyProfile);
assert.throws(() => query(`${actor(userC)} SELECT ${profileCall(userC)};`),/PROFILE_VERSION_REQUIRED/);
console.log('PASS profile constraint failures preserve all content/revision and absent-row state; legacy creates work once only');

query(`${actor(userB)} SELECT ${versionedProfileCall(userB,profileB.profile_id,1,'2')};`);
const profileWriteSeries=(async () => {
  for (let revision=2;revision<8;revision++) {
    await concurrent(`${actor(userB)} SELECT ${versionedProfileCall(userB,profileB.profile_id,revision,String(revision+1))};`);
  }
})();
const profileReadSeries=(async () => {
  for (let index=0;index<12;index++) {
    const row=JSON.parse(await concurrent(`${actor(userB)} SELECT to_jsonb(p) FROM public.get_user_profile_versioned('${userB}') p;`));
    assert.equal(row.personal.fullName,String(row.revision));
  }
})();
await Promise.all([profileWriteSeries,profileReadSeries]);
query(`DELETE FROM public.user_profiles WHERE user_id='${userB}';`);
assert.throws(() => query(`${actor(userB)} SELECT ${versionedProfileCall(userB,profileB.profile_id,8)};`),/PT409.*PROFILE_CONFLICT/);
const replacement=JSON.parse(query(`${actor(userB)} SELECT ${versionedProfileCall(userB)};`));
assert.notEqual(replacement.profile_id,profileB.profile_id);
assert.equal(replacement.revision,1);
const replacementSnapshot=profileSnapshot(userB);
assert.throws(() => query(`${actor(userB)} SELECT ${versionedProfileCall(userB,profileB.profile_id,1)};`),/PT409.*PROFILE_CONFLICT/);
assert.equal(profileSnapshot(userB),replacementSnapshot);
console.log('PASS concurrent profile loads match content/revision; deleted or recreated identities reject stale callers even when revision matches');

query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email) VALUES('${userD}','deletion-target@test.invalid');`);
const deletionMemberId = query(`SET ROLE service_role; INSERT INTO public.admin_members(email,user_id,role,is_active)
  VALUES ('deletion-target@test.invalid','${userD}','support',true) RETURNING id;`);
const privacyDeletionJob = query(`SET ROLE service_role; INSERT INTO public.privacy_deletion_jobs(target_user_id,requested_by_user_id,status,next_attempt_at)
  VALUES('${userD}','${userA}','pending',clock_timestamp()) RETURNING id;`);
const providerReview = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_initialize_provider_cancellation_reviews('${privacyDeletionJob}');`));
assert.equal(providerReview.providerReviewCount, 0);
JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_approve_deletion_job('${privacyDeletionJob}','${userA}');`));
const deletionClaim = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_claim_deletion_execution('${privacyDeletionJob}','replay-worker-0001',60);`));
assert.equal(deletionClaim.claimed, true);
assert.equal(deletionClaim.step, 'delete_data');
const deletionArtifacts = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_get_deletion_artifacts('${privacyDeletionJob}','replay-worker-0001');`));
assert.deepEqual(deletionArtifacts.attachmentPaths, []);
assert.deepEqual(deletionArtifacts.exportPaths, []);
assert.throws(
  () => query(`SET ROLE service_role; SELECT public.privacy_delete_user_data('${privacyDeletionJob}','replay-worker-0001');`),
  /Active admin membership blocks account deletion/
);
query(`SET ROLE service_role; SELECT public.admin_revoke_member('${userA}','${deletionMemberId}');`);
const deletionData = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_delete_user_data('${privacyDeletionJob}','replay-worker-0001');`));
assert.equal(deletionData.authUserId, userD);
query(`SET ROLE ${authServiceRole}; DELETE FROM auth.users WHERE id='${userD}';`);
JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_mark_auth_deleted('${privacyDeletionJob}','replay-worker-0001');`));
const deletionComplete = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_complete_deletion_job('${privacyDeletionJob}','replay-worker-0001');`));
assert.equal(deletionComplete.status, 'completed');
assert.equal(query(`SELECT count(*) FROM public.users WHERE id='${userD}';`), '0');
assert.equal(query(`SELECT count(*) FROM auth.users WHERE id='${userD}';`), '0');
assert.equal(query(`SELECT status FROM public.privacy_deletion_jobs WHERE id='${privacyDeletionJob}';`), 'completed');
assert.equal(query(`SELECT count(*) FROM public.admin_members WHERE user_id='${userD}' AND is_active;`), '0');
const privacyAffectedCohort = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_paid_conversion_cohort(clock_timestamp()-interval '46 days',clock_timestamp()-interval '44 days',clock_timestamp());`));
assert.equal(privacyAffectedCohort.rate, null);
assert.equal(privacyAffectedCohort.isComplete, false);
assert.ok(privacyAffectedCohort.qualityReasons.includes('privacy_deletion_history_may_be_incomplete'));
console.log('PASS deletion refuses an active administrator, then completes only after the separately audited membership revoke');

for (const table of ['gmail_connections','admin_members','stripe_webhook_events']) {
  assert.throws(() => query(`${actor(userA)} SELECT * FROM public.${table};`),/permission denied/);
}
assert.equal(query(`${actor(userA)} SELECT id FROM public.users;`),userA);
assert.throws(() => query(`${actor(userA)} UPDATE public.users SET is_premium=true WHERE id='${userA}';`),/permission denied/);
assert.equal(query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;`),'0');
assert.equal(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('save_resume','save_resume_versioned','get_resume_versioned','delete_resume','save_user_profile','get_user_profile','save_user_profile_versioned','get_user_profile_versioned','handle_new_user','handle_user_update') AND p.prosecdef;`),'0');
assert.equal(query(`SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='privacy_export_jobs' AND column_name='worker_id';`),'1');
assert.equal(query(`SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='support_delivery_outbox' AND column_name='worker_id';`),'1');
assert.match(query(`SELECT pg_get_functiondef('public.privacy_complete_export_job(uuid,text,text,integer,timestamptz)'::regprocedure);`),/worker_id = btrim\(p_worker_id\)/);
assert.match(query(`SELECT pg_get_functiondef('public.privacy_release_export_job(uuid,text,boolean,text)'::regprocedure);`),/worker_id = btrim\(p_worker_id\)/);
assert.match(query(`SELECT pg_get_functiondef('public.support_complete_email_outbox(uuid,text,text)'::regprocedure);`),/worker_id = btrim\(p_worker_id\)/);
assert.match(query(`SELECT pg_get_functiondef('public.support_release_email_outbox(uuid,text,boolean,text)'::regprocedure);`),/worker_id = btrim\(p_worker_id\)/);
console.log('PASS privacy and support delivery workers bind completion/retry to their leased worker identity');

const supportConversation = query(`SET ROLE service_role;
  INSERT INTO public.support_conversations(customer_user_id, subject, status, mode)
  VALUES ('${userB}', 'Presence and SLA replay', 'open', 'queued')
  RETURNING id;`);
const preparedAttachmentId='30000000-0000-4000-8000-000000000001';
const preparedAttachment=JSON.parse(query(`${actor(userB,customerSessionId)} SELECT public.support_prepare_attachment(
  '${supportConversation}','${preparedAttachmentId}','${supportConversation}/${preparedAttachmentId}',
  'resume.pdf','application/pdf',128,clock_timestamp()+interval '1 hour');`));
assert.equal(preparedAttachment.status,'pending');
const revokedAttachmentId='30000000-0000-4000-8000-000000000002';
assert.throws(() => query(`${actor(userB,expiredCustomerSessionId)} SELECT public.support_prepare_attachment(
  '${supportConversation}','${revokedAttachmentId}','${supportConversation}/${revokedAttachmentId}',
  'resume.pdf','application/pdf',128,clock_timestamp()+interval '1 hour');`),/Authentication required/);
assert.equal(query(`SELECT count(*) FROM public.support_attachments WHERE id='${revokedAttachmentId}';`),'0');
const staleSupportWrite = `${actor(userC,'20000000-0000-4000-8000-000000000099','aal1')}`;
const customerConversationCount = query(`SELECT count(*) FROM public.support_conversations WHERE customer_user_id='${userC}';`);
assert.throws(() => query(`${staleSupportWrite} SELECT public.support_start_conversation(
  'Stale session must fail','No support message should be stored','stale-start-0001');`),/Authentication required/);
assert.equal(query(`SELECT count(*) FROM public.support_conversations WHERE customer_user_id='${userC}';`),customerConversationCount);
const customerSupport = JSON.parse(query(`${actor(userC,customerCSessionId,'aal1')} SELECT public.support_start_conversation(
  'Private customer conversation','Synthetic customer message','customer-start-0001');`));
const customerConversationId = customerSupport.conversationId;
assert.equal(query(`${actor(userA)} SELECT public.support_mark_read('${customerConversationId}',0);`),'0',
  'AAL2 operators can mark queued conversations read before taking ownership');
assert.throws(() => query(`${actor(userA,activeSessionId,'aal1')} SELECT public.support_mark_read('${customerConversationId}',0);`),
  /Support conversation not found/,
  'AAL1 operators cannot mark queued conversations read before taking ownership');
JSON.parse(query(`${actor(userA)} SELECT public.support_add_internal_note(
  '${customerConversationId}','Operator-only synthetic note','private-note-0001');`));
assert.throws(() => query(`${staleSupportWrite} SELECT public.support_send_message(
  '${customerConversationId}','Stale session message','stale-message-0001');`),/Authentication required/);
assert.equal(query(`SELECT last_sequence FROM public.support_conversations WHERE id='${customerConversationId}';`),'1');
assert.throws(() => query(`${staleSupportWrite} SELECT public.support_request_handoff(
  '${customerConversationId}','stale-handoff-0001',NULL);`),/Authentication required/);
assert.equal(query(`SELECT count(*) FROM public.support_conversation_events
  WHERE conversation_id='${customerConversationId}' AND event_type='handoff.requested';`),'0');
const customerMessage = JSON.parse(query(`${actor(userC,customerCSessionId,'aal1')} SELECT public.support_send_message(
  '${customerConversationId}','Live session message','live-message-0001');`));
assert.equal(customerMessage.sequence,2);
const customerHandoff = JSON.parse(query(`${actor(userC,customerCSessionId,'aal1')} SELECT public.support_request_handoff(
  '${customerConversationId}','live-handoff-0001',NULL);`));
assert.equal(customerHandoff.mode,'queued');
const customerOwnRead = JSON.parse(query(`${actor(userC,customerCSessionId,'aal1')} SELECT public.support_read_conversation('${customerConversationId}',0,100);`));
assert.equal(customerOwnRead.conversation.id, customerConversationId);
assert.deepEqual(customerOwnRead.internalNotes, []);
assert.equal(JSON.stringify(customerOwnRead).includes('Operator-only synthetic note'), false);
assert.throws(() => query(`${actor(userC,'20000000-0000-4000-8000-000000000099','aal1')} SELECT public.support_read_conversation('${customerConversationId}',0,100);`),/Authentication required/);
assert.throws(() => query(`${actor(userB,customerSessionId,'aal1')} SELECT public.support_read_conversation('${customerConversationId}',0,100);`),/Support conversation not found/);
assert.throws(() => query(`${actor(userB,customerSessionId,'aal1')} SELECT public.support_send_message('${customerConversationId}','Cross-user write','cross-user-message-0001');`),/Support conversation not found/);
assert.throws(() => query(`${actor(userB,customerSessionId,'aal1')} SELECT public.support_request_handoff('${customerConversationId}','cross-user-handoff-0001',NULL);`),/Support conversation not found/);
const customerFeedbackConversation = query(`SET ROLE service_role;
  INSERT INTO public.support_conversations(customer_user_id, subject, status, mode)
  VALUES ('${userC}', 'Resolved feedback session replay', 'resolved', 'human')
  RETURNING id;`);
assert.throws(() => query(`${staleSupportWrite} SELECT public.support_submit_feedback(
  '${customerFeedbackConversation}',5,'support','Stale session feedback','stale-feedback-0001');`),/Authentication required/);
assert.equal(query(`SELECT count(*) FROM public.customer_feedback WHERE conversation_id='${customerFeedbackConversation}';`),'0');
const customerFeedback = JSON.parse(query(`${actor(userC,customerCSessionId,'aal1')} SELECT public.support_submit_feedback(
  '${customerFeedbackConversation}',5,'support','Live session feedback','live-feedback-0001');`));
assert.equal(customerFeedback.submitted,true);
query(`SET ROLE service_role; DELETE FROM public.support_conversations WHERE id='${customerFeedbackConversation}';`);

const assignedSupportConversation = query(`SET ROLE service_role;
  INSERT INTO public.support_conversations(customer_user_id, subject, status, mode)
  VALUES ('${userB}', 'Assigned agent AAL2 guard replay', 'open', 'queued')
  RETURNING id;`);
JSON.parse(query(`${actor(userA)} SELECT public.support_take_conversation('${assignedSupportConversation}','take-aal2-0001');`));
JSON.parse(query(`${actor(userA)} SELECT public.support_add_internal_note(
  '${assignedSupportConversation}','Assigned-agent private note','assigned-private-note-0001');`));
assert.throws(() => query(`${actor(userA,activeSessionId,'aal1')} SELECT public.support_send_message(
  '${assignedSupportConversation}','AAL1 assigned agent reply','aal1-agent-message-0001');`),/Support conversation not found/);
const assignedAgentMessage = JSON.parse(query(`${actor(userA)} SELECT public.support_send_message(
  '${assignedSupportConversation}','AAL2 assigned agent reply','aal2-agent-message-0001');`));
assert.equal(assignedAgentMessage.sequence,1);
const assignedRead = JSON.parse(query(`${actor(userA)} SELECT public.support_read_conversation('${assignedSupportConversation}',0,100);`));
assert.equal(assignedRead.conversation.id, assignedSupportConversation);
assert.equal(JSON.stringify(assignedRead.internalNotes).includes('Assigned-agent private note'), true);
assert.throws(() => query(`${actor(userA,activeSessionId,'aal1')} SELECT public.support_read_conversation('${assignedSupportConversation}',0,100);`),/Support conversation not found/);
assert.throws(() => query(`${actor(userA,activeSessionId,'aal1')} SELECT public.support_mark_read('${assignedSupportConversation}',0);`),/Support conversation not found/);
assert.throws(() => query(`${actor(userA,expiredSessionId,'aal2')} SELECT public.support_read_conversation('${assignedSupportConversation}',0,100);`),/Authentication required/);
assert.equal(query(`${actor(userA)} SELECT public.support_mark_read('${assignedSupportConversation}',0);`),'0');
query(`SET ROLE service_role; UPDATE public.admin_members SET is_active=false WHERE user_id='${userA}';`);
assert.throws(() => query(`${actor(userA)} SELECT public.support_read_conversation('${assignedSupportConversation}',0,100);`),/Support conversation not found/);
query(`SET ROLE service_role; UPDATE public.admin_members SET is_active=true WHERE user_id='${userA}';`);
console.log('PASS support conversation reads and cursors require a live session; assigned or revoked agent rows cannot bypass AAL2');
assert.throws(() => query(`${actor(userB)} SELECT public.support_set_presence('available',90);`),/Support operator access required/);
assert.throws(() => query(`${actor(userB)} SELECT public.support_list_queue('open',50,NULL,'');`),/Support operator access required/);
assert.throws(() => query(`${actor(userB)} SELECT public.support_add_internal_note('${customerConversationId}','forbidden note','forbidden-note-0001');`),/Support operator access required/);
assert.throws(() => query(`${actor(userB)} SELECT public.support_create_knowledge_draft(
  'forbidden-draft','en','Forbidden','Synthetic body','test','forbidden-draft-0001');`),/Knowledge manager access required/);
for (const signature of [
  'public.support_start_guest_conversation(text,text,text,text,timestamptz)',
  'public.support_guest_send_message(uuid,text,text,text,uuid)',
  'public.support_guest_request_handoff(uuid,text,text,text)',
  'public.support_guest_read_conversation(uuid,bigint,integer,text)',
]) {
  assert.equal(query(`SELECT has_function_privilege('anon','${signature}','EXECUTE');`),'f');
  assert.equal(query(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE');`),'f');
}
query(`SET ROLE service_role; DELETE FROM public.support_conversations WHERE id='${customerConversationId}';`);
console.log('PASS support RPC role matrix: own-conversation access only, internal-note isolation, operator/knowledge gates, and service-only guest functions');
const presence = JSON.parse(query(`${actor(userA)} SELECT public.support_set_presence('available', 90);`));
assert.equal(presence.status, 'available');
const presenceList = JSON.parse(query(`${actor(userA)} SELECT public.support_list_presence();`));
assert.equal(presenceList.items.find((item) => item.userId === userA)?.status, 'available');
const routingContext = JSON.parse(query(`SET ROLE service_role; SELECT public.support_get_routing_context();`));
assert.ok(routingContext.onlineAgentCount >= 1);
const triaged = JSON.parse(query(`${actor(userA)} SELECT public.support_triage_conversation('${supportConversation}', 0, 'urgent', ARRAY['billing', 'replay']);`));
assert.equal(triaged.priority, 'urgent');
assert.deepEqual(triaged.tags, ['billing', 'replay']);
const queueBeforeResponse = JSON.parse(query(`${actor(userA)} SELECT public.support_list_queue('open', 50, NULL, 'SLA replay');`));
const queuedItem = queueBeforeResponse.items.find((item) => item.id === supportConversation);
assert.equal(queuedItem.firstResponseSlaStatus, 'pending');
assert.ok(queuedItem.firstResponseDueAt);
assert.equal(queuedItem.priority, 'urgent');
assert.deepEqual(queuedItem.tags, ['billing', 'replay']);
query(`SET ROLE service_role;
  INSERT INTO public.support_messages(conversation_id, sequence_no, sender_user_id, sender_type, client_message_id, body)
  VALUES ('${supportConversation}', 1, '${userA}', 'agent', 'replay-agent-message', 'A verified human response');`);
assert.ok(query(`SELECT first_responded_at FROM public.support_conversations WHERE id='${supportConversation}';`));
const resolved = JSON.parse(query(`${actor(userA)} SELECT public.support_resolve_conversation('${supportConversation}', 'replay-resolve-0001', 'replay resolution');`));
assert.equal(resolved.status, 'resolved');
const reopened = JSON.parse(query(`${actor(userA)} SELECT public.support_reopen_conversation('${supportConversation}', 'replay-reopen-0001');`));
assert.equal(reopened.status, 'open');
const queueAfterResponse = JSON.parse(query(`${actor(userA)} SELECT public.support_list_queue('open', 50, NULL, 'SLA replay');`));
assert.equal(queueAfterResponse.items.find((item) => item.id === supportConversation).firstResponseSlaStatus, 'met');
JSON.parse(query(`${actor(userA)} SELECT public.support_set_presence('offline', 90);`));
query(`SET ROLE service_role; DELETE FROM public.support_conversations WHERE id='${supportConversation}';`);
console.log('PASS support presence TTL, queue search/triage, business-hour response deadline, SLA status, reopen, and first human response clock');

assert.equal(query(`SELECT count(*) FROM public.billing_action_capabilities;`), '16');
assert.equal(query(`SELECT count(*) FROM public.billing_action_capabilities WHERE enabled;`), '0');
assert.deepEqual(JSON.parse(query(`SET ROLE service_role; SET request.jwt.claims='{"role":"service_role"}'; SELECT public.billing_claim_action_intents('replay-billing-worker', 10, 60);`)), []);
assert.throws(
  () => query(`SET ROLE service_role; SET request.jwt.claims='{"role":"service_role"}'; SELECT public.billing_create_action_intent('${userA}','${userB}','stripe','test','refund','billing-replay-0001',repeat('a',64),NULL,NULL,'pi_replay',NULL,NULL,NULL,'usd',1000,'replay refund','{}'::jsonb,NULL);`),
  /Billing action unsupported/
);
console.log('PASS billing actions remain disabled until capability review and cannot create a mocked intent');

const autoApplyOperation = '11111111-1111-4111-8111-111111111111';
const autoApplyJob = '22222222-2222-4222-8222-222222222222';
query(`SET ROLE service_role;
  INSERT INTO private.admin_operation_requests(id, actor_user_id, actor_email, action, idempotency_key, request_hash)
  VALUES ('${autoApplyOperation}', '${userA}', 'a@test.invalid', 'autoApplyJobAction', 'auto-apply-replay-0001', repeat('b', 32));
  INSERT INTO public.auto_apply_jobs(id, user_id, title, company, status, match_score, source)
  VALUES ('${autoApplyJob}', '${userB}', 'Synthetic replay job', 'Replay Co', 'applying', 88, 'replay');
  INSERT INTO public.auto_apply_job_admin_actions(operation_id, job_id, actor_user_id, action, status, reason, result)
  VALUES ('${autoApplyOperation}', '${autoApplyJob}', '${userA}', 'reconcile', 'pending_reconciliation', 'Synthetic reconciliation review', '{"externalReceiptPresent":true}');`);
assert.throws(
  () => query(`SET ROLE service_role; INSERT INTO public.auto_apply_job_admin_actions(operation_id, job_id, actor_user_id, action, status, reason) VALUES ('${autoApplyOperation}', '${autoApplyJob}', '${userA}', 'reconcile', 'requested', 'Duplicate operation');`),
  /duplicate key|unique/i
);
assert.throws(
  () => query(`${actor(userA)} SELECT * FROM public.auto_apply_job_admin_actions;`),
  /permission denied|row-level security/i
);
assert.throws(
  () => query(`SET ROLE service_role; INSERT INTO public.auto_apply_job_admin_actions(operation_id, job_id, actor_user_id, action, reason) VALUES (gen_random_uuid(), '${autoApplyJob}', '${userA}', 'retry', 'x');`),
  /violates check constraint/i
);
query(`DELETE FROM public.auto_apply_job_admin_actions WHERE operation_id='${autoApplyOperation}';
  DELETE FROM public.auto_apply_jobs WHERE id='${autoApplyJob}';
  DELETE FROM private.admin_operation_requests WHERE id='${autoApplyOperation}';`);
console.log('PASS auto-apply admin action ledger enforces operation uniqueness, service-only access, bounded states, and pending reconciliation semantics');

for (const signature of [
  'public.admin_rebuild_analytics_daily_event_aggregates(timestamptz,timestamptz,text)',
  'public.admin_read_analytics_daily_event_aggregates(timestamptz,timestamptz,text)',
]) {
  assert.equal(query(`SELECT has_function_privilege('anon','${signature}','EXECUTE');`), 'f');
  assert.equal(query(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE');`), 'f');
  assert.equal(query(`SELECT has_function_privilege('service_role','${signature}','EXECUTE');`), 't');
}
assert.equal(query(`SELECT has_table_privilege('anon','private.analytics_daily_event_aggregates','SELECT');`), 'f');
assert.equal(query(`SELECT has_table_privilege('authenticated','private.analytics_daily_event_aggregates','SELECT');`), 'f');
assert.equal(query(`SELECT has_table_privilege('service_role','private.analytics_daily_event_aggregates','SELECT');`), 't');
assert.equal(query(`SELECT has_table_privilege('authenticated','private.analytics_daily_aggregate_versions','SELECT');`), 'f');
assert.equal(query(`SELECT has_table_privilege('service_role','private.analytics_daily_aggregate_versions','UPDATE');`), 't');
query(`SET ROLE service_role;
  INSERT INTO public.analytics_events(event_key,event_name,actor_user_id,properties,occurred_at) VALUES
    ('aggregate-replay-ai-a','ai_generation_completed','${userA}','{}','2030-01-04T00:30:00Z'),
    ('aggregate-replay-ai-b','ai_generation_completed','${userB}','{}','2030-01-04T12:00:00Z'),
    ('aggregate-replay-app-a','application_created','${userA}','{}','2030-01-04T13:00:00Z');`);
const aggregateRebuild = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_rebuild_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
assert.equal(aggregateRebuild.available, true);
assert.equal(aggregateRebuild.metricVersion, 1);
assert.equal(aggregateRebuild.rows, 14);
const aggregateSnapshot = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_read_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
assert.equal(aggregateSnapshot.available, true);
assert.equal(aggregateSnapshot.actualRows, 14);
assert.equal(aggregateSnapshot.staleRows, 0);
const aggregateAiRow = aggregateSnapshot.rows.find((row) => row.eventName === 'ai_generation_completed');
assert.equal(aggregateAiRow.eventCount, 2);
assert.equal(aggregateAiRow.distinctActors, 2);
assert.ok(aggregateAiRow.computedAt);
assert.equal(aggregateSnapshot.rows.find((row) => row.eventName === 'support_started').eventCount, 0);
query(`SET ROLE service_role;
  INSERT INTO public.analytics_events(event_key,event_name,actor_user_id,properties,occurred_at)
  VALUES ('aggregate-replay-ai-c','ai_generation_completed','${userC}','{}','2030-01-04T14:00:00Z');`);
const invalidatedAggregate = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_read_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
assert.equal(invalidatedAggregate.available, false);
assert.equal(invalidatedAggregate.actualRows, 14);
assert.equal(invalidatedAggregate.staleRows, 14);
JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_rebuild_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
query(`SET ROLE service_role;
  UPDATE public.analytics_events SET actor_user_id=NULL WHERE event_key='aggregate-replay-ai-b';`);
const privacyInvalidatedAggregate = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_read_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
assert.equal(privacyInvalidatedAggregate.available, false);
assert.equal(privacyInvalidatedAggregate.staleRows, 14);
JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_rebuild_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
const privacyRebuiltAggregate = JSON.parse(query(`SET ROLE service_role;
  SELECT public.admin_read_analytics_daily_event_aggregates('2030-01-03T20:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`));
assert.equal(privacyRebuiltAggregate.rows.find((row) => row.eventName === 'ai_generation_completed').eventCount, 3);
assert.equal(privacyRebuiltAggregate.rows.find((row) => row.eventName === 'ai_generation_completed').distinctActors, 2);
assert.throws(() => query(`SET ROLE service_role;
  SELECT public.admin_rebuild_analytics_daily_event_aggregates('2030-01-03T21:00:00Z','2030-01-04T20:00:00Z','Asia/Tbilisi');`), /complete local calendar days/);
console.log('PASS daily first-party aggregates are versioned, timezone-bounded, zero-filled, service-only, rebuildable, and invalidated by event/privacy changes');

const feedbackConversation = query(`SET ROLE service_role;
  INSERT INTO public.support_conversations(customer_user_id, subject, status, mode)
  VALUES ('${userB}', 'Feedback backlog replay', 'resolved', 'human')
  RETURNING id;`);
const feedbackId = query(`SET ROLE service_role;
  INSERT INTO public.customer_feedback(conversation_id, customer_user_id, rating, category, comment, client_request_id)
  VALUES ('${feedbackConversation}', '${userB}', 4, 'product', 'Synthetic feedback only', 'feedback-replay-0001')
  RETURNING id;`);
const taggedFeedback = JSON.parse(query(`${actor(userA)} SELECT public.support_update_feedback_tags('${feedbackId}', ARRAY['Onboarding', 'slow load'], 'feedback-tags-replay-0001');`));
assert.deepEqual(taggedFeedback.tags, ['onboarding', 'slow load']);
const replayedTags = JSON.parse(query(`${actor(userA)} SELECT public.support_update_feedback_tags('${feedbackId}', ARRAY['different'], 'feedback-tags-replay-0001');`));
assert.deepEqual(replayedTags.tags, ['onboarding', 'slow load']);
const feedbackInsights = JSON.parse(query(`${actor(userA)} SELECT public.support_list_feedback(50, NULL);`));
assert.equal(feedbackInsights.summary.count, 1);
assert.equal(feedbackInsights.summary.byCategory.product, 1);
assert.equal(feedbackInsights.summary.byTag.onboarding, 1);
const improvement = JSON.parse(query(`${actor(userA)} SELECT public.support_create_improvement_item('Improve onboarding', 'Synthetic sanitized summary', 'product', 'medium', 'high', '${feedbackId}', 'improvement-create-replay-0001');`));
assert.equal(improvement.status, 'backlog');
const improvementList = JSON.parse(query(`${actor(userA)} SELECT public.support_list_improvement_items('all', 50);`));
assert.equal(improvementList.items.find((item) => item.id === improvement.improvementId).sourceFeedbackId, feedbackId);
const improvementUpdate = JSON.parse(query(`${actor(userA)} SELECT public.support_update_improvement_item('${improvement.improvementId}', 'planned', 'urgent', '${userA}', 'Synthetic outcome', 'improvement-update-replay-0001');`));
assert.equal(improvementUpdate.status, 'planned');
query(`SET ROLE service_role; DELETE FROM public.support_conversations WHERE id='${feedbackConversation}';`);
console.log('PASS feedback tags, aggregate themes, sanitized improvement linkage, operator authorization, and idempotent updates');
console.log('PASS every public table has RLS; token/admin/billing tables and restored RPC privileges are protected');
console.log('Migration/RPC proof passed. Supabase Auth/Storage HTTP, production parity, and PostgreSQL 15 remain separate staging gates.');
