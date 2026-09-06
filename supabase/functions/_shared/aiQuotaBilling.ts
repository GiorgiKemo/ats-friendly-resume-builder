type QuotaClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
};

export const syncAiQuotaForSubscription = async (
  client: QuotaClient,
  userId: string,
  subscription: { current_period_start?: unknown; start_date?: unknown },
) => {
  const periodStart = subscription.current_period_start ?? subscription.start_date;
  if (typeof periodStart !== 'number' || !Number.isFinite(periodStart) || periodStart <= 0) {
    throw new Error('Subscription quota period is missing');
  }
  const { error } = await client.rpc('sync_ai_quota_period_for_user', {
    p_user_id: userId,
    p_period_start: new Date(periodStart * 1000).toISOString(),
  });
  if (error) throw new Error(`Could not synchronize subscription quota: ${error.message || 'database error'}`);
};
