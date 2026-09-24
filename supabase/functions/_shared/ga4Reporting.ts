const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GA4_API_ROOT = 'https://analyticsdata.googleapis.com/v1beta';
const GA4_REPORT_KIND = 'acquisition_by_channel_v1';
const GA4_REPORT_VERSION = 1;
const GA4_CACHE_TTL_MS = 15 * 60 * 1000;
const GA4_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const GA4_CACHE_TABLE = 'admin_ga_report_cache';
const GA4_DEFAULT_PROPERTY_ID = '552904382';
const GA4_REPORT_LIMIT = 25;
const REPORTING_TIME_ZONES = new Set(['Asia/Tbilisi', 'UTC']);

type Ga4Totals = {
  sessions: number | null;
  totalUsers: number | null;
  newUsers: number | null;
  signUpSessionConversionRate: number | null;
};

type Ga4Channel = {
  channel: string;
  sessions: number | null;
  totalUsers: number | null;
  newUsers: number | null;
  signUpSessionConversionRate: number | null;
};

type Ga4ReportPayload = {
  available: true;
  source: 'google_analytics_4';
  propertyId: string;
  propertyTimeZone: string | null;
  window: { startDate: string; endDate: string; reportingTimeZone: string };
  totals: Ga4Totals;
  channels: Ga4Channel[];
  qualityReasons: string[];
};

type CacheRow = {
  report_payload?: unknown;
  fetched_at?: unknown;
  expires_at?: unknown;
};

type CacheError = { code?: string } | null;
type CacheClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: CacheError }>;
      };
    };
    upsert: (row: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: CacheError }>;
    delete: () => {
      lt: (column: string, value: string) => PromiseLike<unknown>;
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const isoTimestamp = (value: unknown) => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null
);

const unavailableReport = (
  status: 'not_connected' | 'unavailable',
  reason: string,
  propertyId: string | null,
  window: { startDate: string | null; endDate: string | null; reportingTimeZone: string },
  propertyTimeZone: string | null = null,
) => ({
  available: false,
  status,
  source: 'google_analytics_4',
  reason,
  propertyId,
  propertyTimeZone,
  window,
  totals: { sessions: null, totalUsers: null, newUsers: null, signUpSessionConversionRate: null },
  channels: [],
  qualityReasons: [reason],
  fetchedAt: null,
  expiresAt: null,
  stale: false,
  cacheHit: false,
});

const formatDateInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const normalizeMetric = (value: unknown, allowFraction = false) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  if (allowFraction && number > 1) return null;
  return number;
};

const normalizeGa4Response = (
  response: unknown,
  propertyId: string,
  window: { startDate: string; endDate: string; reportingTimeZone: string },
): Ga4ReportPayload | null => {
  if (!isRecord(response)) return null;
  const metricHeaders = Array.isArray(response.metricHeaders) ? response.metricHeaders : [];
  const metricIndex = (name: string) => metricHeaders.findIndex((header) => isRecord(header) && header.name === name);
  const metrics = {
    sessions: metricIndex('sessions'),
    totalUsers: metricIndex('totalUsers'),
    newUsers: metricIndex('newUsers'),
    signUpSessionConversionRate: metricIndex('sessionKeyEventRate:sign_up'),
  };
  const qualityReasons = Object.values(metrics).some((index) => index < 0)
    ? ['ga4_report_metric_missing']
    : [];
  const rows = Array.isArray(response.rows) ? response.rows : [];
  const totalsRow = Array.isArray(response.totals) && isRecord(response.totals[0])
    ? response.totals[0]
    : null;
  const totalValues = totalsRow && Array.isArray(totalsRow.metricValues)
    ? totalsRow.metricValues
    : null;
  const rowCount = Number(response.rowCount);
  const noRows = Number.isFinite(rowCount) && rowCount === 0;
  const metricAt = (values: unknown, index: number, isRate = false) => {
    if (index < 0) return null;
    if (!Array.isArray(values) || index >= values.length || !isRecord(values[index])) return noRows && !isRate ? 0 : null;
    return normalizeMetric(values[index].value, isRate);
  };

  const totals: Ga4Totals = {
    sessions: metricAt(totalValues, metrics.sessions),
    totalUsers: metricAt(totalValues, metrics.totalUsers),
    newUsers: metricAt(totalValues, metrics.newUsers),
    signUpSessionConversionRate: metricAt(totalValues, metrics.signUpSessionConversionRate, true),
  };
  const channels: Ga4Channel[] = rows.slice(0, GA4_REPORT_LIMIT).flatMap((row) => {
    if (!isRecord(row) || !Array.isArray(row.dimensionValues) || !isRecord(row.dimensionValues[0])) return [];
    const metricValues = Array.isArray(row.metricValues) ? row.metricValues : null;
    const rawChannel = row.dimensionValues[0].value;
    return [{
      channel: typeof rawChannel === 'string' && rawChannel.trim() ? rawChannel.slice(0, 80) : '(not set)',
      sessions: metricAt(metricValues, metrics.sessions),
      totalUsers: metricAt(metricValues, metrics.totalUsers),
      newUsers: metricAt(metricValues, metrics.newUsers),
      signUpSessionConversionRate: metricAt(metricValues, metrics.signUpSessionConversionRate, true),
    }];
  });
  const metadata = isRecord(response.metadata) ? response.metadata : {};
  const propertyTimeZone = typeof metadata.timeZone === 'string' && metadata.timeZone.length <= 80
    ? metadata.timeZone
    : null;

  return {
    available: true,
    source: 'google_analytics_4',
    propertyId,
    propertyTimeZone,
    window,
    totals,
    channels,
    qualityReasons,
  };
};

const parseServiceAccount = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)
      || typeof parsed.client_email !== 'string'
      || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(parsed.client_email)
      || typeof parsed.private_key !== 'string'
      || !parsed.private_key.includes('PRIVATE KEY')) return null;
    return {
      type: 'service_account',
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      token_uri: 'https://oauth2.googleapis.com/token',
    };
  } catch {
    return null;
  }
};

const responseErrorReason = (error: unknown) => {
  const status = isRecord(error) && isRecord(error.response) ? Number(error.response.status) : NaN;
  if (status === 429) return 'google_quota_exceeded';
  if (status === 401 || status === 403) return 'google_access_denied';
  if (status === 400) return 'google_report_unavailable';
  return 'google_api_unavailable';
};

const usableCachedPayload = (value: unknown): value is Ga4ReportPayload => (
  isRecord(value)
  && value.available === true
  && value.source === 'google_analytics_4'
  && isRecord(value.totals)
  && Array.isArray(value.channels)
  && isRecord(value.window)
);

const withCacheState = (
  payload: Ga4ReportPayload,
  status: 'connected' | 'stale',
  fetchedAt: string | null,
  expiresAt: string | null,
  cacheHit: boolean,
  reason: string | null = null,
) => ({
  ...payload,
  status,
  fetchedAt,
  expiresAt,
  stale: status === 'stale',
  cacheHit,
  reason,
});

export const fetchGa4AcquisitionReport = async (
  adminClient: CacheClient,
  range: { from: string; to: string; timeZone: string },
  now = new Date(),
) => {
  const timeZone = typeof range?.timeZone === 'string' ? range.timeZone : '';
  if (!REPORTING_TIME_ZONES.has(timeZone)
    || typeof range?.from !== 'string' || typeof range?.to !== 'string') {
    return unavailableReport('unavailable', 'invalid_reporting_window', null, {
      startDate: null, endDate: null, reportingTimeZone: timeZone || 'Asia/Tbilisi',
    });
  }
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())
    || from >= to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return unavailableReport('unavailable', 'invalid_reporting_window', null, {
      startDate: null, endDate: null, reportingTimeZone: timeZone,
    });
  }

  const startDate = formatDateInTimeZone(from, timeZone);
  const endDate = formatDateInTimeZone(new Date(to.getTime() - 1), timeZone);
  const reportWindow = { startDate, endDate, reportingTimeZone: timeZone };
  const propertyId = Deno.env.get('GA4_PROPERTY_ID') || GA4_DEFAULT_PROPERTY_ID;
  if (!/^\d{1,20}$/.test(propertyId)) {
    return unavailableReport('unavailable', 'property_configuration_invalid', null, reportWindow);
  }
  const serviceAccount = parseServiceAccount(Deno.env.get('GA4_SERVICE_ACCOUNT_JSON') || '');
  if (!serviceAccount) {
    const reason = Deno.env.get('GA4_SERVICE_ACCOUNT_JSON') ? 'credential_configuration_invalid' : 'credentials_missing';
    return unavailableReport('not_connected', reason, propertyId, reportWindow);
  }

  const cacheIdentity = JSON.stringify({
    reportVersion: GA4_REPORT_VERSION,
    propertyId,
    ...reportWindow,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheIdentity));
  const cacheKey = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');

  let cached: CacheRow | null = null;
  const { data: cacheData, error: cacheError } = await adminClient
    .from(GA4_CACHE_TABLE)
    .select('report_payload,fetched_at,expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (cacheError) {
    const reason = ['42P01', 'PGRST205'].includes(cacheError.code || '')
      ? 'cache_not_configured'
      : 'cache_unavailable';
    return unavailableReport('unavailable', reason, propertyId, reportWindow);
  }
  if (isRecord(cacheData)) cached = cacheData as CacheRow;

  const cachedFetchedAt = cached ? isoTimestamp(cached.fetched_at) : null;
  const cachedExpiresAt = cached ? isoTimestamp(cached.expires_at) : null;
  const cachedPayload = cached && usableCachedPayload(cached.report_payload) ? cached.report_payload : null;
  const cachedWindowMatches = cachedPayload
    && cachedPayload.propertyTimeZone === timeZone
    && cachedPayload.window.reportingTimeZone === timeZone;
  if (cachedPayload && cachedWindowMatches && cachedFetchedAt && cachedExpiresAt && Date.parse(cachedExpiresAt) > now.getTime()) {
    return withCacheState(cachedPayload, 'connected', cachedFetchedAt, cachedExpiresAt, true);
  }

  const stalePayload = cachedPayload && cachedWindowMatches && cachedFetchedAt
    && now.getTime() - Date.parse(cachedFetchedAt) <= GA4_MAX_STALE_MS
    ? cachedPayload
    : null;
  let reason = 'google_api_unavailable';
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ credentials: serviceAccount, scopes: [GA4_SCOPE] });
    const authClient = await auth.getClient();
    const requestOptions = {
      method: 'POST',
      url: `${GA4_API_ROOT}/properties/${propertyId}:runReport`,
      timeout: 8000,
      data: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'sessionKeyEventRate:sign_up' },
        ],
        metricAggregations: ['TOTAL'],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: String(GA4_REPORT_LIMIT),
        returnPropertyQuota: false,
      },
    };
    const response = await authClient.request(requestOptions);
    const payload = normalizeGa4Response(response.data, propertyId, reportWindow);
    if (!payload) {
      reason = 'google_report_invalid';
      throw new Error('Invalid Google Analytics report response');
    }
    if (!payload.propertyTimeZone) {
      return unavailableReport('unavailable', 'reporting_timezone_missing', propertyId, reportWindow);
    }
    if (payload.propertyTimeZone !== timeZone) {
      return unavailableReport('unavailable', 'reporting_timezone_mismatch', propertyId, reportWindow, payload.propertyTimeZone);
    }
    const fetchedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + GA4_CACHE_TTL_MS).toISOString();
    const { error: cacheWriteError } = await adminClient.from(GA4_CACHE_TABLE).upsert({
      cache_key: cacheKey,
      property_id: propertyId,
      report_kind: GA4_REPORT_KIND,
      start_date: startDate,
      end_date: endDate,
      report_payload: payload,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
      updated_at: fetchedAt,
    }, { onConflict: 'cache_key' });
    if (cacheWriteError) {
      reason = 'cache_write_failed';
      throw new Error('Could not save the Google Analytics report cache');
    }
    try {
      await adminClient.from(GA4_CACHE_TABLE)
        .delete()
        .lt('expires_at', new Date(now.getTime() - GA4_MAX_STALE_MS).toISOString());
    } catch {
      // Cache cleanup is best-effort; report freshness and confidentiality do not depend on pruning.
    }
    return withCacheState(payload, 'connected', fetchedAt, expiresAt, false);
  } catch (error) {
    if (reason !== 'google_report_invalid' && reason !== 'cache_write_failed') {
      reason = responseErrorReason(error);
    }
  }

  if (stalePayload && cachedFetchedAt && cachedExpiresAt) {
    return withCacheState(stalePayload, 'stale', cachedFetchedAt, cachedExpiresAt, true, reason);
  }
  return unavailableReport('unavailable', reason, propertyId, reportWindow);
};
