import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const binary = process.env.AUDIT_PSQL || 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const port = process.env.AUDIT_PG_PORT || '55432';
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
const userD='10000000-0000-4000-8000-000000000004';
const actor=(id) => `SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SET request.jwt.claims='{"role":"authenticated","sub":"${id}"}';`;
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
console.log(`PASS all ${migrations.length} application migrations replay in order on empty ${database} at 127.0.0.1:${port}`);

query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('${userA}','a@test.invalid','{"full_name":"A","is_premium":true}'),('${userB}','b@test.invalid','{"full_name":"B"}') ON CONFLICT(id) DO NOTHING;`);
assert.throws(
  () => query(`${actor(userA)} SELECT public.record_analytics_event('nested-analytics', 'upgrade_click', '{"metadata":{"email":"not-storable"}}'::jsonb);`),
  /Analytics properties must be flat/
);
assert.equal(query(`SELECT count(*) FROM public.users;`),'2');
assert.equal(query(`SELECT is_premium FROM public.users WHERE id='${userA}';`),'f');
query(`SET ROLE ${authServiceRole}; UPDATE auth.users SET email='changed@test.invalid' WHERE id='${userA}';`);
assert.equal(query(`SELECT email FROM public.users WHERE id='${userA}';`),'changed@test.invalid');
console.log('PASS Auth-role signup and email update triggers work without trusting premium metadata');

query(`SET ROLE service_role; INSERT INTO public.admin_members(email,user_id,role,is_active)
  VALUES ('changed@test.invalid','${userA}','owner',true);`);
const directoryServiceResult = JSON.parse(query(`SET ROLE service_role; SET request.jwt.claims='{"role":"service_role"}'; SELECT public.admin_list_user_directory('',NULL,NULL,50);`));
assert.ok(directoryServiceResult.items.some((item) => item.id === userA));
const directoryAdminResult = JSON.parse(query(`${actor(userA)} SELECT public.admin_list_user_directory('',NULL,NULL,50);`));
assert.ok(directoryAdminResult.items.some((item) => item.id === userA));
console.log('PASS admin directory service and authenticated-owner RPC calls resolve the current JWT role accessor');

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
assert.equal(racing.filter((result) => !result.ok && /PT409.*RESUME_CONFLICT/.test(result.error)).length,15);
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

const userC='10000000-0000-4000-8000-000000000003';
query(`SET ROLE ${authServiceRole}; INSERT INTO auth.users(id,email) VALUES('${userC}','c@test.invalid');`);
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
const deletionData = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_delete_user_data('${privacyDeletionJob}','replay-worker-0001');`));
assert.equal(deletionData.authUserId, userD);
query(`SET ROLE ${authServiceRole}; DELETE FROM auth.users WHERE id='${userD}';`);
JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_mark_auth_deleted('${privacyDeletionJob}','replay-worker-0001');`));
const deletionComplete = JSON.parse(query(`SET ROLE service_role; SELECT public.privacy_complete_deletion_job('${privacyDeletionJob}','replay-worker-0001');`));
assert.equal(deletionComplete.status, 'completed');
assert.equal(query(`SELECT count(*) FROM public.users WHERE id='${userD}';`), '0');
assert.equal(query(`SELECT count(*) FROM auth.users WHERE id='${userD}';`), '0');
assert.equal(query(`SELECT status FROM public.privacy_deletion_jobs WHERE id='${privacyDeletionJob}';`), 'completed');
console.log('PASS approved privacy deletion execution removes synthetic app/Auth data and preserves the durable completed job record');

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
