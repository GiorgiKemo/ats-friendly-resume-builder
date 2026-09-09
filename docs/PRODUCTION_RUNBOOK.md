# Production Runbook

## Release Checklist

Run these gates before pushing or deploying:

```bash
npm ci
npm run lint
npm test
npm audit --audit-level=high
npm run check:repo
npm run check:supabase:functions
npm run build
npm run test:website:smoke
npm run test:website:full
npm run test:website:support
npm run build:extension
npm run test:extension:chromium
npm run test:extension:firefox
```

## Deploy Order

1. Confirm the project-scoped CLI can see the linked project with `npx --no-install supabase projects list` and `npx --no-install supabase migration list --linked`.
2. Apply database migrations with `npm run deploy:supabase:db`.
3. Deploy all Edge Functions with `npm run deploy:supabase:functions`.
4. Deploy the Vercel app from `main`.
5. Run `npm run audit:production:http` against the intended production host and
   keep the release unverified if any route, asset, header, or function gate fails.
6. Run a live authenticated smoke check with disposable fixtures where the
   provider and database release gates permit it; never use real customer data.

## Monitoring

- Stripe webhook failures: Stripe Dashboard > Developers > Webhooks.
- Supabase function errors: Supabase Dashboard > Edge Functions > Logs.
- Client and CSP reports: `app_error_events`, surfaced in the admin dashboard.
- Auth/security telemetry: emitted through `report-client-error`; keep `VITE_DISABLE_SYSTEM_LOGGING` unset or `false` in production.

## Rollback

1. Revert the Vercel deployment to the last healthy production deployment.
2. If a function deploy caused the incident, redeploy the previous commit's functions with `supabase functions deploy`.
3. If a migration caused the incident, apply a forward-only corrective migration. Do not manually edit production schema outside migrations.
4. Record the incident, affected release SHA, rollback action, and follow-up fix.
