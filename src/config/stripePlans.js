const TEST_PRICE_IDS = {
  premium_monthly: import.meta.env.VITE_STRIPE_PRICE_PREMIUM_MONTHLY_TEST || 'price_1SxvKjBFInekdfRO3fwa3rZo',
  premium_yearly: import.meta.env.VITE_STRIPE_PRICE_PREMIUM_YEARLY_TEST || 'price_1SxvKkBFInekdfROB5wh3cTM',
};

const LIVE_PRICE_IDS = {
  premium_monthly: import.meta.env.VITE_STRIPE_PRICE_PREMIUM_MONTHLY_LIVE || '',
  premium_yearly: import.meta.env.VITE_STRIPE_PRICE_PREMIUM_YEARLY_LIVE || '',
};

const toAmount = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
export const STRIPE_BILLING_MODE = stripePublishableKey.startsWith('pk_live_') ? 'live' : 'test';
export const STRIPE_CURRENCY = (import.meta.env.VITE_STRIPE_CURRENCY || 'USD').toUpperCase();

const activePriceIds = STRIPE_BILLING_MODE === 'live' ? LIVE_PRICE_IDS : TEST_PRICE_IDS;

export const STRIPE_PLAN_CONFIG = {
  premium_monthly: {
    planId: 'premium_monthly',
    label: 'Monthly',
    subtitle: 'Most flexible',
    amount: toAmount(import.meta.env.VITE_STRIPE_PREMIUM_MONTHLY_AMOUNT, 9.99),
    priceId: activePriceIds.premium_monthly,
    interval: 'month',
    priceSuffix: '/month',
  },
  premium_yearly: {
    planId: 'premium_yearly',
    label: 'Yearly',
    subtitle: 'Best value',
    amount: toAmount(import.meta.env.VITE_STRIPE_PREMIUM_YEARLY_AMOUNT, 99.99),
    priceId: activePriceIds.premium_yearly,
    interval: 'year',
    priceSuffix: '/year',
  },
};

export const getStripePlanConfig = (planId = 'premium_monthly') =>
  STRIPE_PLAN_CONFIG[planId] || STRIPE_PLAN_CONFIG.premium_monthly;

export const formatStripePrice = (amount, currency = STRIPE_CURRENCY) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

export const getPremiumAnnualSavings = () => {
  const monthlyTotal = STRIPE_PLAN_CONFIG.premium_monthly.amount * 12;
  return Math.max(0, monthlyTotal - STRIPE_PLAN_CONFIG.premium_yearly.amount);
};

export const getPremiumPlanLabel = (planId) => {
  if (planId === 'premium_yearly') return 'Premium (Yearly)';
  if (planId === 'premium_monthly' || planId === 'premium' || planId === 'pro') return 'Premium (Monthly)';
  return 'Premium';
};
