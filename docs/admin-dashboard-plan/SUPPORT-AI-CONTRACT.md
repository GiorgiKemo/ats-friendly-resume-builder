# Support AI worker contract

This slice adds the durable boundary for a future support assistant. It does not enable a provider or claim production readiness.

## Safety defaults

- `support_ai_settings.enabled` is seeded `false`.
- The worker requires `SUPPORT_AI_ENABLED=true`, a private worker secret, a provider URL and a provider token before it will claim work.
- The provider receives only recent public support messages, published knowledge, and a bounded authenticated account summary. Internal notes, credentials, raw resumes, unrelated conversations, and hidden reasoning are excluded.
- Provider output must be structured JSON. Citations are reduced to published knowledge slugs/version IDs; unknown citations are discarded.
- The worker stores usage metadata and the final customer-visible answer, never the prompt or chain of thought.

## Durable lifecycle

1. A trigger on a customer/guest message can enqueue a run only when the conversation is in `ai` mode and the database feature flag is enabled.
2. `support_ai_claim_runs` leases bounded work with `SKIP LOCKED`.
3. The worker calls the configured provider with an eight-second timeout and retries only through the durable lease contract.
4. `support_ai_complete_run` checks the conversation ID, AI epoch, revision, last sequence, mode, and unresolved status before inserting an AI message.
5. A human handoff increments `ai_epoch`/revision and changes mode, so a late provider response becomes a canceled stale run rather than a customer-visible reply.
6. Provider failure preserves the customer message and returns the conversation to the human queue after the retry budget is exhausted.

## Release gates still open

- Select and approve the production provider/model, data-region policy, pricing, budget owner, and evaluation set.
- Configure the worker secret/provider secret and scheduler in an isolated staging project.
- Apply the migration and verify the trigger, lease, stale-commit, budget, refusal, timeout, and cross-customer tests against a real isolated database.
- Add the owner/admin settings UI for feature flag, circuit breaker, budget, and health history before enabling the flag.
- The Settings panel now exposes the kill switch, bounded budget controls, recent revision history, an audited AAL2 circuit-clear action, and a confirmed audited rollback to an older revision; provider/model identity remains environment/configuration-owned and secret values are never returned. Automatic circuit tuning and longer-range history/reporting remain separate work.
- Run adversarial evaluation and named human review before any production enablement.
