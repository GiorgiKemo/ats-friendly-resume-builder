# Supabase Database Setup

This directory is managed by Supabase migrations and Edge Functions.

## Production Setup

Apply the database from migrations:

```bash
npm run deploy:supabase:db
```

Deploy Edge Functions:

```bash
npm run deploy:supabase:functions
```

The old schema snapshot has been removed because it could drift behind migrations. Treat `supabase/migrations/` and `supabase/config.toml` as the authoritative deployment source.

## Runtime Checks

Run this before deploying function changes:

```bash
npm run check:supabase:functions
```

External webhook functions are configured in `supabase/config.toml` with JWT verification disabled where required by Stripe, Brevo, Gmail OAuth callbacks, or inbound email providers.
