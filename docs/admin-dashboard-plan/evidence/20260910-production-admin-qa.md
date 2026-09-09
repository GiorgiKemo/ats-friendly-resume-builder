# Authenticated production admin QA — 2026-09-10

## Scope

- URL: `https://www.resumeats.cv/admin`.
- Method: read-only owner-browser verification using the existing authenticated Chrome session.
- No customer records, email addresses, credentials, payment details, or provider secrets were copied into this evidence.

## Result

- The hosted admin shell loaded successfully with the expected sections: Overview, Users, Client errors, Analytics, Admin access, Subscriptions, Support, AI & Jobs, Feedback, Audit log, and Settings.
- The overview loaded live data without presenting unavailable rates as fabricated zeroes: 67 total users, 0 premium users, 80 unresolved client errors, 34 applications, and 35 AI-usage records were visible at check time.
- The overview explicitly reported paid conversion as `Not available`; account-created and verified-purchase event counts were both 0 for the displayed window, so a percentage was not inferred.
- The Analytics section loaded the first-party source `first_party_analytics_events` for the displayed UTC window. Signup-to-purchase, signup-to-resume, resume-to-export, upgrade-to-checkout, checkout-to-purchase, upgrade-to-purchase, and support-resolution rates were all shown as `Not available`; the supporting event counts were 0.
- The Subscriptions section loaded source-backed entitlement rows and webhook-reconciliation receipts. It explicitly reported that no scheduled reconciliation run had completed and that provider subscription and transaction projections were not available yet.
- The default Light theme was visible. The Dark theme toggle was exercised and restored to Light; the admin content remained present after both transitions.

## Boundary

This verifies that an authenticated production admin owner can reach the main overview, analytics, subscriptions, and theme controls, and that unavailable production metrics are represented honestly. It does not prove the full role/session matrix, customer-detail or export/deletion flows, provider sandbox replay, scheduler execution, real billing mutations, support delivery, AI enablement, or backup/restore readiness. No grants, refunds, cancellations, deletions, invitations, messages, or other external mutations were performed.

Checked at approximately `2026-09-09T23:03:06Z`.
