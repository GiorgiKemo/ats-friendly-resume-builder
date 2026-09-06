# Version-bound email PDF implementation plan

Date: 2026-09-04. Stage B is implemented and locally verified; no production deployment, managed database/Storage access, provider call, or email send was performed. Stage A local-only download/profile-sync work is owned separately. See [the consumer audit](legacy-pdf-consumers.md) for the original path trace.

Implementation status: the auto-apply handler now uses one caller-authorized,
revisioned snapshot and one shared Unicode/paginated renderer. The mutable
Storage lookup, raw one-page generator, and attachmentless Gmail fallback are
removed. The managed-runtime packaging gate remains open because Docker is not
available on this host.

## Implemented renderer boundary: shared source under `supabase/functions`

Reuse the existing verified rendering behavior, but do **not** make the Edge entry point depend on `src/` paths. Supabase documents outside-`supabase/` imports through API-based deployment; the current static-files guide requires Docker-based bundling rather than `--use-api`. That does not establish a documented common packaging path for an external app import plus a binary font. This is a deployment-confidence limitation, not a claim that every cross-root import fails. [Outside-directory imports](https://supabase.com/changelog/33613-deploy-edge-functions-from-cli-without-needing-docker-import-files-outside-of-supabase-directory), [static-file bundling restriction](https://supabase.com/docs/guides/functions/wasm).

The runtime-neutral implementation now lives in one authoritative shared source tree, with thin app and Edge adapters. This avoids a new predeploy generation dependency and code drift. The implemented graph is:

```text
src/services/resumePdfDocument.js
  browser font loader + stable buildTextPdf API
  -> supabase/functions/_shared/resume/pdfCore.js
       -> jspdf (same version in both runtimes)
       -> ./exportText.js
       -> ./committedResume.js

src/utils/resumeExportText.js
  re-exports -> _shared/resume/exportText.js

src/utils/resumeTailoringReview.js
  retains review creation/resolution; imports/re-exports only the committed guard
  -> _shared/resume/committedResume.js

supabase/functions/auto-apply-run/resumeAttachment.ts
  Deno font loader + bounded PDF encoding
  -> ../_shared/resume/pdfCore.js
  -> ./assets/DejaVuSans.ttf
```

Only the `assertCommittedResume` predicate moved into the shared guard; the review UI/provenance engine remains app-only. The app and Edge adapters supply explicit local font bytes to the core, and both reject pending/malformed review packets before font/network work. The formatter is shared without semantic changes: canonical/legacy field aliases, Unicode, negative quantities, target-heading qualification, all sections and pagination remain covered by tests.

Use a per-function `deno.json` mapping `jspdf` to **`npm:jspdf@4.2.1`**. The app declares `^4.2.0`, but its installed/locked version used by the spike is **4.2.1**. Pin exact compatibility in the Edge configuration; do not silently test a different version. Supabase recommends npm imports and function-local Deno configuration. [Dependency guidance](https://supabase.com/docs/guides/functions/dependencies).

Bundle a function-local copy of the existing licensed DejaVu font and its license; configure an explicit path under `[functions.auto-apply-run]`, for example `static_files = ["./functions/auto-apply-run/assets/DejaVuSans.ttf", "./functions/auto-apply-run/assets/LICENSE-DejaVu.txt"]`. Assert its SHA-256 equals the app font at build/test time. The Edge adapter reads a fixed `new URL('./assets/DejaVuSans.ttf', import.meta.url)` with `Deno.readFile`, never a caller-supplied path or remote URL. Static files require CLI 2.7.0+ and paths within `functions`; the local CLI reported 2.116.0. [Static-file configuration](https://supabase.com/docs/guides/local-development/cli/config#functions.function_name.static_files), [feature introduction](https://supabase.com/changelog/32815-add-static-files-to-edge-functions).

## One owned/versioned database snapshot

`supabase/functions/auto-apply-run/resumeAttachment.ts` now calls the existing
authenticated `get_resume_versioned(p_resume_id)` RPC. That RPC returns parent
metadata, content and revision in one SQL statement, with `auth.uid()` filtering
and RLS, and selects one deterministic content row. Its grant is
authenticated-only; the implementation never calls it with `adminClient`, widens
grants, or adds a legacy/read-latest fallback
(`supabase/migrations/20260904141918_versioned_resume_saves.sql:122–163`).

After `authenticateUser(req)` succeeds, capture the same request Authorization header locally. Construct a separate read client using the project's existing publishable/anon-key aliases:

```js
const authorization = req.headers.get('Authorization');
const reader = createClient(SUPABASE_URL, publicKey, {
  global: { headers: { Authorization: authorization } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data, error } = await reader.rpc('get_resume_versioned', {
  p_resume_id: selectedResumeId,
});
```

Validate the header before constructing the client; never log/store/return it or derive the owner from request JSON. Reusing the immutable header does not require changing the shared auth helper's return shape. Use the same configured public-key resolution as `_shared/cors.ts`, with no service-key fallback. Verify exactly one returned row, expected `id`, verified `user_id`, positive integer `revision`, valid timestamp and renderable content. Supabase explicitly documents passing the caller's Authorization header to establish the client RLS context; API keys and user bearer tokens are separate credentials. [Authenticated client pattern](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [header roles](https://supabase.com/docs/guides/functions/auth-headers).

The existing admin client remains responsible for budgets, preferences, job
records and provider credentials. The handler freezes the selected snapshot at
run preparation and derives both resume text and PDF from that same object; it
does not read mutable Storage, use a second content source, or merge the current
profile. The internal package is `{ resumeId, userId, revision, updatedAt,
resumeText, attachmentBase64, attachmentFilename, byteLength, sha256 }`; bytes
are never returned in ordinary run/status responses or logs. The handler
revalidates owner/id/revision before each send without replacing the captured
package, and marks the current job failed before stopping when that check fails.

## Recommended behavior and explicit policy boundary

The implemented behavior is:

| Situation | Proposed result using existing status vocabulary |
| --- | --- |
| Discovery-only, no default resume selected | Preserved: discovery works without resume text; no renderer, Storage read or email send occurs. |
| A configured resume is missing, wrong-owner or malformed | Fails with a typed actionable error; no empty/different resume is substituted. |
| Send run has no selected resume | Fails closed before discovery/paid generation/email with `RESUME_REQUIRED`; the run is marked `failed` and its lease is released. |
| Gmail PDF/font/encoding/size validation fails | Fails before any send with `RESUME_ATTACHMENT_UNAVAILABLE`; there is no attachmentless Gmail or legacy Storage fallback. |
| Revision/deletion/auth changes during an active run | The current inserted job is marked `failed` with a bounded reason, the run stops as `failed`, previous sends remain, and the lease is released. It is not counted as an eligibility `skipped` job. |
| Brevo route | Remains text-only and never claims a PDF was attached; its text comes from the same owned snapshot package. |

Prepare and validate the outreach package once, before discovery/send work.
Revalidation immediately before provider dispatch is not a database-to-Gmail
atomic transaction: an edit or revocation after dispatch starts cannot retract
an external request. The handler does not hold a SQL transaction/lock over
network calls or advertise stronger cancellation guarantees.

No additional request fields are necessary for containment: capture the configured default's current revision at run start. Requiring a caller-approved `expected_revision` would be a separate API/product decision. Recommended attachment policy is fail-closed; an explicit user-approved text-only Gmail option would require separate design rather than an implicit fallback.

API error visibility is now aligned with the app contract: typed resume
preparation failures return non-2xx (422 for missing/unrenderable resume and
409 for a changed selection) with a bounded error/code/run ID, while the run
record is failed and its lease is released. General legacy run failures retain
their existing response shape for compatibility. `triggerAutoApplyRun` treats
the typed responses as failures; no resume-preparation error produces a success
acknowledgement.

## Test plan and release gates

- **Actual helper/client tests (passed):** `tests/legacyResumeAttachment.test.js` covers the verified bearer/public key, RPC name/args, one owned snapshot, wrong owner/ID, invalid revision/content, missing authorization, RPC failure, no admin fallback, immutable package metadata, SHA-256 and no log/response exposure. Supabase's testing guide recommends isolated logic tests and mocked-network handler integration. [Testing guidance](https://supabase.com/docs/guides/functions/unit-test).
- **Actual handler tests (passed for the guarded boundaries):** poisoned legacy Storage and the removed one-page fallback are absent from the source; `tests/backendResumeAttachment.test.js` proves send-without-resume fails before discovery/attachment work, discovery-only remains possible without a resume, and the lease is released. `tests/legacyResumeAttachment.test.js` proves revision/owner revalidation. Provider and paid calls remain stubbed; a managed/provider round trip is not claimed.
- **Deno renderer test (passed locally):** the shared production core with the function-local packaged font rendered an actual three-page PDF (59,992 bytes), and `pypdf` extraction retained the Unicode name, all 90 `-20%` occurrences and the final sentinel. All three Poppler page renders were inspected. Unsupported-glyph and pending-review rejection remain covered by Node and Deno spike tests. Never promote the removed corrupt one-page ASCII fallback.
- **Static asset/source assertions (passed):** the configured font/license files exist under the function, the function and app font hashes match (`7DA195A74C55BEF988D0D48F9508BD5D849425C1770DBA5D7BFC6CE9ED848954`), `deno.json` pins 4.2.1, and the handler has no mutable Storage reader or legacy generator. The Edge import closure stays under `supabase/functions`.
- **Packaging gate, still open:** run an isolated Docker-based Supabase Edge Runtime/bundle test, with no deployment and no external provider access. Docker is unavailable on this host, so the actual packaged runtime's asset lookup, cold start, output size and runtime limits are not certified. Host Deno execution and static config assertions do not substitute for this gate.
- The local gate reran **987/987 Node tests** with zero skipped, global ESLint,
  `tsc --noEmit`, all Edge entrypoint typechecks, production build/prerender
  (**1,210 modules**), repository hygiene/diff checks, and both Chrome/Firefox
  extension packages. Existing SQL snapshot tests remain relevant; no new
  migration is proposed.

## Isolated spike evidence and provenance

Ignored scratch only: `playwright-audit/edge-pdf-spike/{deno.json,probe_test.ts,deno-renderer.pdf,page-1.png,page-2.png,page-3.png}`. These are local evidence, not committed production artifacts.

- Deno **2.7.13**, V8 **14.7.173.20**, jsPDF **4.2.1** from existing local `node_modules`; no runtime network permission, and a throwing fetch stub during rendering.
- Runtime-only command: `deno test --config playwright-audit/edge-pdf-spike/deno.json --cached-only --allow-read --allow-write=playwright-audit/edge-pdf-spike --no-check playwright-audit/edge-pdf-spike/probe_test.ts`.
- **2 Deno tests passed** (87 ms reported): actual app renderer with injected local font; unsupported Japanese glyphs and malformed review packet fail closed.
- This explicit-config run used `--no-check`, so it proves cached runtime execution only. It does **not** prove that the explicit `npm:jspdf@4.2.1` pin type-checks. An ordinary explicit-config type-check remained blocked because the manual `node_modules` configuration requested uncached `npm:@types/node`; network fetching was intentionally not allowed. Before source freeze or deployment, cache/install the declared per-function dependency closure and pass the actual Edge-function type-check and packaging gates.
- Actual PDF: **3 pages, 64,006 bytes**. `pypdf` extraction found `José Müller გიორგი`, `Evidence 90`, canonical institution and certification text, and the final-page sentinel. All **92** `-20%` occurrences survived.
- Poppler rendered **all three pages**; all three PNGs were inspected. Evidence lines 1–90 remain visible across page boundaries; no observed clipping, overflow or missing Unicode glyphs. This synthetic layout does not certify every possible resume.
- The spike imports actual app modules outside `supabase/functions` to test **Deno runtime portability only**. It does not prove Docker/Supabase packaging, hosted runtime compatibility, real database authorization, provider success, or deployment correctness.

SHA-256 at the spike:

| Input/output | SHA-256 |
| --- | --- |
| `src/services/resumePdfDocument.js` | `6CE46FC228FFD9F5DA21822AD66DBA674394C588D772324D2E37B2356F498F96` |
| `src/utils/resumeExportText.js` (stable adapter) | `A0335D8D1AF0AA7EC553EA9511255F61479DAF0C45D6E1A6259B6E92C362D295` |
| `_shared/resume/exportText.js` (canonical formatter) | `7307C0DE9C9FA0668C3B3D5EE075F3667BE27718FFFC43177C84E188F4433B67` |
| `src/utils/resumeTailoringReview.js` | `4D8384EBB0901FF2C7B709628889F4B118CB6406504A04DB272A71970832B58D` |
| `_shared/resume/pdfCore.js` | `079301F01277D061A6D09070D0398471DBE5313F691394B90A7F004B53690922` |
| `_shared/resume/committedResume.js` | `BDC75A5B25761763FD78562DB1D3727211808933EC296620EB1FF700FE760BC3` |
| `auto-apply-run/resumeAttachment.ts` | `B51F63BF721D69EFBC4698E08722EDD81BC8F505A9D6C62A67082DAA69190BA6` |
| `auto-apply-run/assets/DejaVuSans.ttf` | `7DA195A74C55BEF988D0D48F9508BD5D849425C1770DBA5D7BFC6CE9ED848954` |
| `src/assets/fonts/DejaVuSans.ttf` | `7DA195A74C55BEF988D0D48F9508BD5D849425C1770DBA5D7BFC6CE9ED848954` |

The generated PDF hash is intentionally omitted because jsPDF metadata makes it
change on regeneration. Source/font hashes record precisely which local inputs
this spike exercised.

### Stage B function-local asset check

After the Edge source was wired, an explicit-configured Deno evaluation imported
`loadResumeFontData` from the function itself and read the packaged font without
network access (`1,009,436` base64 characters). The same run passed those bytes to
`buildTextPdfCore`; the resulting PDF was **3 pages / 59,992 bytes**. `pypdf`
extracted the Unicode name `José Müller გიორგი`, all **90** `-20%` occurrences
and the final `evidence 90` sentinel. Poppler rendered all three pages and each
was inspected. This validates the function-local host path and renderer output,
but not Docker/Supabase bundling; that packaging gate remains open.
