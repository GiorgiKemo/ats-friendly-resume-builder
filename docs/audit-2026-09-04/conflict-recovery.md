# Resume conflict and draft recovery audit

Date: 2026-09-04. Local implementation and deterministic verification complete;
managed deployment and complete browser acceptance remain open.

## Failure modes corrected

1. Two devices could overwrite the same resume because writes had no expected
   revision. The versioned RPC now atomically checks ownership and revision before
   changing the parent and content. Stale writes receive a typed conflict.
2. Tabs shared a recovery key. A successful save in one tab could delete another
   tab's unsaved recovery point. Each provider lifetime now has its own writer key;
   duplicated session pointers fork before writing or clearing. Other and legacy
   drafts remain explicit recovery candidates, not automatic newest-clock winners.
3. A queued request could reuse an obsolete revision or continue after conflict.
   Each loaded branch now advances only on its own acknowledged saves; stale
   branches and conflicted queues cannot continue writing.
4. Reload could overwrite edits typed while waiting. Same-resume loads retain the
   prior branch, reject replacement after new edits, and restore the branch on
   failure. An unsuccessful reload does not clear the recovery draft.
5. An old autosave timer survived a later edit that disabled autosave. Its stale
   payload then looked current at acknowledgment and replaced the new text. Every
   edit cancels the prior timer; callbacks recheck the saved preference before any
   request starts. Already-started requests cannot be recalled.
6. The editor disappeared on save failure, and the copy route temporarily showed
   “Create New Resume” in its switcher. Save errors now leave the editor available;
   the switcher refreshes by route and always includes its current saved resume.
7. Previewing/exporting an unsaved or conflicted draft could replace the saved
   resume's optional cloud PDF. Such preview downloads now omit the upload ID and
   remain local; clean saved exports retain the normal owner-bound upload path.

## User-visible behavior

- A conflict pauses manual overwrite and autosave but keeps the editable draft.
- “Save my version as a copy” creates a new resume ID. Original content and recovery
  points remain intact. Plan limits and save errors can prevent creating a copy;
  the draft remains available and the error is displayed.
- “Reload saved version” requires confirmation. New typing during the request
  prevents replacement; the user must choose again.
- Other browser drafts are listed with their edit time and base revision. Time is
  a display hint only. Opening or discarding one is explicit and confirmation-bound.
- Unavailable browser persistence produces a warning to keep the tab open until
  saving/exporting. In-memory retention is not promised across browser closure.

## Evidence

- All 34 SQL migrations replayed on isolated PostgreSQL 17 with a documented
  Supabase platform scaffold. Seven versioning groups verify ownership, grants,
  legacy bypass prevention, whole-content rollback and atomic read snapshots.
  Sixteen competing same-revision saves produce one winner and fifteen conflicts.
  Seventeen existing budget/RLS/storage groups also pass. The audit cluster is stopped.
- Unit and actual-component tests exercise version metadata validation, account
  switches, duplicated tabs, clock skew, failed storage, queued saves, interrupted
  reloads, copy failures, confirmations and autosave transitions.
- Seven independent integration tests execute the actual Context, draft store,
  service and Supabase SDK over an ephemeral loopback HTTP fixture. They are not
  evidence of managed Auth, PostgREST, Storage or real React browser scheduling.
- The final combined repository gate passes 388 Node tests, lint, TypeScript,
  repository checks, production build/prerender, both extension builds, 18 Edge
  entrypoint typechecks, 3 native Deno tests and dependency audit (zero advisories).
- Actual in-app browser sequence: open original in tabs 3 and 4; save “Lead Product
  Designer” in the first; attempt “Principal UX Designer” from the stale second;
  observe paused saving with retained input; recover after a hot reload; save as
  a separate copy; verify distinct copy route and unchanged original title.
- At a 390×844 viewport, the recovery actions measure 48px/50px high and document
  scroll width does not exceed the viewport. Light and dark states were inspected.

Screenshots: `35-conflict-editor-before.png` is the baseline;
`36-two-tab-save-conflict.png` records the intermediate conflict before removing a
duplicate alert; `37-recovered-draft-controls.png` records the consolidated controls;
`38-recovered-copy-saved.png` records the discovered stale switcher label, now fixed;
`39-recovery-mobile.png` and `40-recovery-mobile-dark.png` show the corrected current
switcher and responsive recovery controls. Intermediate screenshots are not final
visual acceptance evidence.

## Explicit limits and rollout

- Deploy the versioned migration with the matching frontend. Legacy existing-ID
  saves fail closed; there is no unsafe old-RPC fallback. Test representative
  existing-database upgrades and managed HTTP behavior before production release.
- Native reload confirmation stalled the in-app browser control. No accepted or
  cancelled browser reload is claimed. Component tests verify confirmation gates;
  full browser verification remains pending. The temporary viewport override was reset.
- Direct Playwright CLI/MCP execution still requires user approval under the Product
  Design workflow. The authored full suite has not been run or accepted as a CI gate.
- Recovery copies can accumulate; there is no automatic retention/deletion policy,
  complete version history, field-level merge or cross-device offline synchronization.
- Trusted service-role writes remain an administrative boundary. Existing duplicate
  content/list-row cleanup is not silently performed by this migration.
- No production data, deployed functions, billing, credentials, emails or employer
  applications were changed by these tests.
