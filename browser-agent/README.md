# ResumeATS Browser Agent

This is a Manifest V3 Chrome extension scaffold for the ResumeATS browser-powered auto-apply flow.

## What it does

- Receives a synced candidate profile from the ResumeATS Auto-Apply page
- Queues supported jobs from the dashboard
- Captures structured job details from open job tabs for ResumeATS imports
- Shows a redesigned floating edge companion on job pages with fit scoring, direct ResumeATS routes, and autofill access
- Uses a Chromium side panel or Firefox sidebar as the persistent companion surface for scan/autofill/import flows
- Opens discovered job links in the user's own browser session
- Tries to follow Apply buttons until it reaches the application form
- Fills common text fields
- Opens an in-app saved-resume picker or explicit tailoring review for the exact active job
- Keeps the selected saved revision's validated PDF in extension session memory, then attaches it only after a separate Autofill action
- Requires manual employer submission; selecting a resume never starts or advances the queue
- Updates `auto_apply_jobs` back in Supabase when submission succeeds or fails

## Supported providers

- Greenhouse
- Lever
- Workday
- Ashby
- iCIMS
- SmartRecruiters
- Workable
- BambooHR
- Jobvite
- Generic job pages with visible Apply buttons

## Local install

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this `browser-agent` folder
5. Refresh the ResumeATS app tab
6. Open a job posting tab and let the extension detect it, or use the popup action to capture it manually
7. Use the popup for quick actions, or open the side panel for the persistent companion UI while browsing jobs

## Production build

To build production-ready extension packages without local bridge hosts in the manifest:

1. Run `npm run build:extension`
2. Load `dist-extension` in a Chromium-family browser (`chrome://extensions`, `edge://extensions`, Brave, or Opera)
3. Load `dist-extension-firefox` in Firefox via `about:debugging`

The source `browser-agent/manifest.json` intentionally keeps localhost bridge matches for local development. The generated `dist-extension/manifest.json` and `dist-extension-firefox/manifest.json` strip those and keep only the production ResumeATS hosts.

## Current limitations

- The field mapping is heuristic-based, so custom employer questions can still fail
- Some multi-step flows still need richer per-platform adapters
- Ambiguous JavaScript-only Apply/Continue buttons and in-form controls require
  manual navigation; only ordinary web links and explicit disclosure controls
  can be followed automatically before the submission review gate
- CAPTCHAs, forced logins, and unusual upload widgets can still interrupt a run
- The extension is meant as a strong universal foundation, not a final perfect autopilot

## Account and submission safety

Autofill verifies the signed-in ResumeATS account before using cached profile data.
An account mismatch clears the cache and queue and requires reconnecting. Existing
profiles from older extension versions must be rebuilt by refreshing the app and
syncing again. The identity check shares a user ID, never an authentication token.
Profile writes are serialized and session-bound so a delayed sync cannot restore
an earlier account after logout or overwrite a newly connected account.

Unanswered work-authorization, sponsorship, consent, demographic, and other
personal questions are not guessed. Forms containing sensitive questions,
unresolved review flags, or inaccessible cross-origin frames pause the queue for
manual review and final submission. Embedded frames cannot independently submit.
Always review the employer's form and terms before submitting.

## Saved-resume selection and retention

Choose a saved version in ResumeATS, preview it, confirm **Use this saved version
for this job**, then return to the original job tab and explicitly click Autofill.
No generation, resume write, preference write or Storage upload is required on
this saved path. Background profile synchronization requests field data only; it does not
prepare or upload a default PDF. Tailoring remains an explicit in-app generation,
review and confirmed-save workflow, never an Autofill fallback.

The extension keeps one owner/job/revision-bound PDF (maximum 1 MiB) in
`storage.session`, not in its persistent profile or ordinary status responses.
Selection is available for 30 minutes. The `alarms` permission schedules cleanup;
expiry checks deny use immediately, and expired bytes are removed on the next
cleanup or extension-worker wake (alarms can be delayed while a device sleeps).
Logout, account change, cancellation, replacement and target-tab closure or
navigation invalidate the selection. Browser-session termination also clears it.
There is no persistent-storage fallback if session storage is unavailable/full.
The existing web host permissions are unchanged.

Only the original employer top frame receives bytes. It asks for fresh account,
revision and target authorization immediately before assigning the PDF to the
file input. Embedded upload widgets and main-world-only upload controls require
manual attachment. Attaching a file can share it with the employer before final
submission. Every saved-version or job-URL change needs a fresh explicit selection.
Queued jobs without a matching selection pause as `needs_resume_selection`;
completing a choice does not resume them. Explicit Start can resume that paused
job in its original tab, and final submission remains manual.

Local tests cover session and bridge behavior with synthetic browser APIs. A
packaged Chrome/Firefox run, memory-quota behavior, worker suspension, native file
inputs, and real employer compatibility remain separately approved release gates.

The protocol, cached-account boundary, and submission gates have automated runtime
tests with synthetic inputs. They are not a substitute for a separately approved
real-browser extension compatibility and employer-workflow release check.
