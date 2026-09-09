type AnalyticsDatabase = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => Promise<{ error: { code?: string } | null }>;
  };
};

type ServerAnalyticsEvent = {
  eventKey: string;
  eventName: 'account_created' | 'resume_created' | 'resume_exported' | 'application_created' |
    'upgrade_click' | 'checkout_started' | 'checkout_created' | 'purchase_confirmed' | 'support_started' | 'support_resolved';
  userId?: string | null;
  provider?: 'stripe' | 'paypal' | 'manual';
  properties?: Record<string, unknown>;
  occurredAt?: string;
};

export async function recordServerAnalyticsEvent(
  db: AnalyticsDatabase,
  event: ServerAnalyticsEvent,
) {
  const { error } = await db.from('analytics_events').insert({
    event_key: event.eventKey,
    event_name: event.eventName,
    actor_user_id: event.userId || null,
    provider: event.provider || null,
    properties: event.properties || {},
    occurred_at: event.occurredAt || new Date().toISOString(),
  });

  if (error && error.code !== '23505') {
    throw new Error('Could not record first-party analytics event');
  }
}
