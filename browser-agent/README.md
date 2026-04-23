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
- Uploads the selected resume PDF from a signed Supabase Storage URL
- Clicks the submit button
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
- CAPTCHAs, forced logins, and unusual upload widgets can still interrupt a run
- The extension is meant as a strong universal foundation, not a final perfect autopilot
