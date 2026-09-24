type AnalyticsResult = { data: Record<string, unknown> | null; error: { code?: string } | null };
type AnalyticsQuery = {
  select: (columns?: string) => AnalyticsQuery;
  eq: (column: string, value: string) => AnalyticsQuery;
  maybeSingle: () => Promise<AnalyticsResult>;
};
type AnalyticsInsertQuery = {
  select: (columns: string) => { maybeSingle: () => Promise<AnalyticsResult> };
};
type AnalyticsDatabase = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => AnalyticsInsertQuery;
    select: (columns?: string) => AnalyticsQuery;
  };
};

type ServerAnalyticsEvent = {
  eventKey: string;
  eventName: 'account_created' | 'resume_created' | 'resume_exported' | 'application_created' |
    'upgrade_click' | 'checkout_started' | 'checkout_created' | 'purchase_confirmed' | 'support_started' | 'support_resolved' |
    'ai_generation_started' | 'ai_generation_completed' | 'ai_generation_failed';
  userId?: string | null;
  provider?: 'stripe' | 'paypal' | 'manual';
  properties?: Record<string, unknown>;
  occurredAt?: string;
};

export async function recordServerAnalyticsEvent(
  db: AnalyticsDatabase,
  event: ServerAnalyticsEvent,
) : Promise<string | null> {
  const { data, error } = await db.from('analytics_events').insert({
    event_key: event.eventKey,
    event_name: event.eventName,
    actor_user_id: event.userId || null,
    provider: event.provider || null,
    properties: event.properties || {},
    occurred_at: event.occurredAt || new Date().toISOString(),
  }).select('id').maybeSingle();

  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await db.from('analytics_events')
      .select('id')
      .eq('event_key', event.eventKey)
      .maybeSingle();
    if (lookupError) throw new Error('Could not read existing first-party analytics event');
    return typeof existing?.id === 'string' ? existing.id : null;
  }
  if (error) {
    throw new Error('Could not record first-party analytics event');
  }
  return typeof data?.id === 'string' ? data.id : null;
}
