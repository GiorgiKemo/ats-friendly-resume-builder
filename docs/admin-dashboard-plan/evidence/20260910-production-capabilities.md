# Production capability audit — 2026-09-10

## Scope

Read-only inventory of the linked Supabase project, covering named secrets, deployed Edge Functions, migration visibility, and scheduler status. Secret values are never printed or persisted by the audit.

## Command

`npm run audit:production:capabilities`

## Interpretation

- `present` means only that the provider secret name exists in the project; it does not prove the credential is valid, the provider is configured correctly, or that a real transaction/message was delivered.
- `missing` keeps the corresponding worker or provider feature fail-closed.
- `blocked` means the Supabase CLI could not read that category and no production claim is made.
- Scheduler status remains `unverified` because scheduler configuration is external to Git and this audit is intentionally non-mutating.

The 2026-09-10 run found the Stripe, PayPal, and Brevo secret names; all 29 local Edge Functions were represented among 31 deployed functions; and all 76 local migration versions were visible remotely. Billing-worker, support-worker, privacy-worker, invitation-worker, and support-AI secret groups were still missing their required names, so those paths remain fail-closed.

## Current release context

- Frontend commit: `dc9a4105ce7063d65837a2413e4cfef61c2ca7fc` (`Keep workspace consent compact`).
- Vercel production deployment reached `Ready` after the GitHub push; the canonical aliases are `https://www.resumeats.cv` and `https://resumeats.cv`.
- `npm run audit:production:http` passed with `failures: []` after the release.
- The analytics consent banner was verified at desktop and mobile viewport sizes; the actions are centered on desktop and remain stacked without horizontal overflow on mobile.
- Production GA4 client delivery was checked in an isolated browser session: no `googletagmanager.com` or `google-analytics.com` request occurred before consent; after accepting analytics, the page sent a `page_view` to `https://www.google-analytics.com/g/collect` using measurement ID `G-1M08TLZ4CB`. This proves client delivery and consent gating only, not GA processed-report freshness or server-side reporting access.

## Remaining gates

The capability report is evidence for discovery only. It does not close E18–E20. Authenticated production QA, provider sandbox replay/reconciliation, scheduler configuration, scanner/provider selection, support-AI evaluation, invitation delivery, backup/restore drills, alert delivery, and any destructive or financial live test still require their respective owners, policies, staging evidence, and action-time authorization.
