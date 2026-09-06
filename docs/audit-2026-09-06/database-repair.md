# Reviewable production database repair

Status: **applied and verified in production on 6 September 2026**, following the owner's approval.

Browser control was restored after an initial connection failure. The production preflight found legacy public SECURITY DEFINER saves and no authenticated private-schema usage. A compatibility migration routes those old signatures through the new revision guards, preventing stale clients from bypassing concurrency checks.

The three migrations were applied in one transaction through the signed-in SQL editor, with migration-history entries and a PostgREST schema reload. Production PostgreSQL is 17.6. The transaction tested create/read/update and stale/legacy rejection for resumes and profiles under the authenticated role, then rolled back the test account and records to a savepoint before committing. Hash checks proved all pre-existing resume, resume-content, and profile values were unchanged apart from the new revision columns. Final counts: 76 resumes, 31 profiles; no test account retained.

The affected schema definitions were saved locally before application. The exact bundle passed a separate local rehearsal using production's legacy function definitions and synthetic data. Local full-chain replay passed all 38 migrations. Evidence is in `playwright-audit/browser-2026-09-06/production-schema-before.json`, `release-migrations.sql`, `release-rehearsal.log`, `migration-release.log`, and `production-migration-result.txt`.

Target: Supabase project `onuxzcectniowxqtmjpg`, used by the current live ResumeATS frontend.

## Exact changes

Applied these migrations in this order:

1. `supabase/migrations/20260904141918_versioned_resume_saves.sql`
   - SHA-256: `D0D7B60B6958456B09D1BB0B7150B604B70592EE51018A6762C40E9086A6B308`
   - Adds positive resume revisions, versioned read/save RPCs, and the revision column to the owner-filtered resume view.
   - Requires the revision actually loaded before an existing resume can be updated; revokes direct client writes that could bypass this check.
2. `supabase/migrations/20260904144841_versioned_user_profile_saves.sql`
   - SHA-256: `2E81A889E77BA762415AAF4950CD7FBD7DB98094546431D7061D24F3DAF592FC`
   - Adds positive profile revisions and versioned read/save RPCs with profile identity checks.
   - Preserves existing profile rows, including historical duplicates; rejects stale and unversioned updates.
3. `supabase/migrations/20260906160253_versioned_legacy_rpc_compatibility.sql`
   - Adapts production's legacy public save functions into invoker wrappers for the private revision guards.
   - Grants authenticated users schema usage and only the required owner-checked save execution; anonymous and service-role legacy saves remain denied.

The two original migrations were unchanged. No migration deletes existing resume/profile rows. Existing rows start at revision 1. Old clients must reload/update before editing existing data; the current frontend already uses the version-aware functions.

## Execution and checks after approval

1. Refresh the read-only production schema preflight: migration history, required tables/columns/types, private schema, existing function signatures, view column order, and absence of the new revisions/RPCs. Stop if production drift makes either migration incompatible. Confirm an available database backup/recovery point.
2. Apply only the two named migrations through a migration-aware administrative connection, transactionally, with a short lock timeout. Do not bulk-push all pending September migrations: unrelated migrations need their own deployment review. If using SQL Editor because CLI privileges are unavailable, explicitly reconcile these two entries in Supabase migration history after successful application; never mark unapplied migrations as applied.
3. Reload the PostgREST schema cache and verify the owner-scoped resume projection and both read RPCs return successful responses with revisions. Confirm anonymous access remains denied.
4. Use a disposable test account to create/load/update a resume and profile; verify a stale revision fails with conflict rather than overwriting content. Confirm the original account's dashboard and profile load, without changing its saved content.
5. Release only intended frontend files, wait for the deployment to be ready, and repeat production browser checks. Record the deployment identifier and exact checks; a passing local build is not production proof.

The isolated PostgreSQL replay validated the complete local migration chain and versioned-save behavior. It is not a restored production clone and does not replace this preflight. The connector and CLI currently lack production administrative privileges; the signed-in Supabase browser supported read-only SQL inspection.
