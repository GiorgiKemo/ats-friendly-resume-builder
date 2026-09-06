# Profile editing and version safety

## Result

Profile writes now require the identity and revision that the editor loaded.
Concurrent or outdated saves cannot silently overwrite newer profile details.
Unfinished entries and committed-but-unsaved edits survive in-app navigation in
the same account/tab, with explicit guidance about what still needs Add or Update.

This is memory-only recovery. Reloading, closing the tab or signing out loses
unsaved profile changes; the page says so and registers a browser unload warning.
Profiles can include sensitive application answers and third-party contacts, so
this change does not silently copy them into localStorage or sessionStorage.
Persistent recovery needs an explicit privacy/retention decision and design.

## Verified behavior

- Work, education, certification, project and skill forms share parent-owned entry
  drafts. Switching sections or leaving and returning does not implicitly add an
  incomplete item or discard its text. Add/Update commits; Discard/Cancel clears.
- Save is blocked while entries are unfinished. The status panel links directly
  to the relevant section. Valid edits remain available after failures.
- Every save uses the loaded profile ID/revision. Missing or malformed version
  metadata and acknowledgments fail closed; no latest-version pre-read or legacy
  write fallback can silently overwrite a competing editor.
- A successful receipt advances only the editor's matching local branch, even
  when the page is left and reopened during the request. A delayed initial read
  can use the entire accepted submitted snapshot, not merely attach a newer
  revision to unrelated local content. Newer typing and selected section survive.
- Account changes discard the session store. Same-account token refresh retains
  it. StrictMode effect replay, stale callbacks and delayed acknowledgments are
  covered by runtime tests; inactive account stores reject late work.
- Conflict reload uses an inline confirmation. Cancel keeps local content. Failed
  loads preserve it. Typing during a reload cancels replacement and asks the user
  to retry when ready. No automatic field merge or profile copy is claimed.

## Browser evidence

The local synthetic premium fixture was restarted with the versioned profile RPC.
In the in-app browser, `Accessibility Researcher` was typed without completing
the work entry, then the tester switched to Skills and clicked Save. The page
identified the unfinished work entry instead of reporting a successful save.
After visiting My resumes and returning through Account settings, Skills remained
selected and the work-title draft was recovered exactly. Adding the entry and
saving cleared pending/dirty guidance.

Two separate tabs then loaded the same profile version. One saved `Denver, CO`.
The other tried `Seattle, WA`: its save was rejected and the local location stayed
visible. Keep editing retained Seattle. Explicit Replace local edits loaded Denver,
removed the conflict and enabled saving. Only synthetic fixture data was replaced.

Desktop and 390×844 mobile light/dark screenshots were inspected. Mobile page
width was 375px within a 390px viewport (scrollbar excluded), with no horizontal
overflow. The explicit mobile confirmation stacks its actions without clipping.

- `42-profile-entry-recovered.png`: exact recovered partial entry.
- `43-profile-conflict-confirmation.png`: desktop explicit confirmation.
- `44-profile-conflict-mobile-dark.png`: dark mobile conflict guidance.
- `45-profile-conflict-mobile-light.png`: light mobile conflict guidance.
- `46-profile-confirmation-mobile-light.png`: explicit mobile replacement controls.

A browser check also exposed missing Add-time date validation despite required
labels. The repaired form now blocks Update for the missing start date and retains
the entry. The browser automation's month fill changed the visible DOM value but
not the React-controlled value; an actual keyboard edit committed `2026-01`.
Update and Save then produced the expected `2026-01 - Present` work-history card.
The earlier screenshot alone is not evidence of saved start-date correctness.

Twenty-one focused date/field-of-study tests cover required fields, month format,
chronology, optional dates and inactive current/no-expiration fields. No dates are
invented, and future dates are not categorically forbidden. Thirty-three separate
lifecycle/store/account-boundary tests cover memory recovery and async ownership.
The full repository verification now passes 473 Node tests; this does not resolve
the separate failing semantic-tailoring benchmark or external release gates.

The final clean desktop profile (`47-profile-verified-after.png`) was compared
with the same-state initial capture (`41-profile-recovery-before.png`). The
existing spacing, hierarchy and controls remain unchanged; only the intentional
synthetic location edit differs. Error discovery/focus on long entry forms and
task-based accessibility/usability testing remain follow-up acceptance work.

## Database and integration proof

Migration `20260904144841_versioned_user_profile_saves.sql` was created and replayed
with all 37 migrations on isolated PostgreSQL 17 using Supabase-managed-schema
scaffolding. Six profile proof groups cover ownership, duplicate preservation,
atomic creation/update, legacy/direct-write rejection, rollback, deletion/recreation
and consistent versioned reads. Sixteen competing creates yield one success and
15 conflicts; the same result holds for sixteen updates from one revision.

Actual service/SDK HTTP tests verify the RPC contract and error mapping. See
[backend audit](../BACKEND_SECURITY_AUDIT.md) for rollout and platform limits.
Managed Supabase HTTP/RLS, existing-deployment upgrade and cross-device tests
remain release gates; local PostgreSQL proof is not a deployment certification.
