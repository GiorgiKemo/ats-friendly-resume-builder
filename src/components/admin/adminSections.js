export const ADMIN_NAVIGATION_GROUPS = [
  {
    id: 'monitor',
    label: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', icon: 'overview' },
      { id: 'analytics', label: 'Analytics', icon: 'analytics' },
      { id: 'errors', label: 'Client errors', icon: 'errors' },
      { id: 'audit', label: 'Audit log', icon: 'audit' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      { id: 'users', label: 'Users', icon: 'users' },
      { id: 'subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
      { id: 'support', label: 'Support', icon: 'support' },
      { id: 'feedback', label: 'Feedback', icon: 'feedback' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'jobs', label: 'AI & Jobs', icon: 'jobs' },
      { id: 'admins', label: 'Admin access', icon: 'admins' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

// Page titles are intentionally different from each section's own h2 so the
// page keeps exactly one h1 and section headings stay uniquely addressable.
export const ADMIN_PAGE_META = {
  overview: { title: 'What needs attention today?', description: 'A live pulse of accounts, revenue mix, and platform health.', tone: 'indigo' },
  users: { title: 'Customer directory', description: 'Search accounts, adjust access, and open customer records.', tone: 'sky' },
  errors: { title: 'Error monitor', description: 'Client-side failures reported from the product, newest first.', tone: 'rose' },
  analytics: { title: 'Product analytics', description: 'First-party funnels, cohorts, and acquisition reporting.', tone: 'violet' },
  admins: { title: 'Team and permissions', description: 'Invite operators and manage who can change what.', tone: 'indigo' },
  subscriptions: { title: 'Billing and revenue', description: 'Provider projections, entitlements, and reconciliation health.', tone: 'emerald' },
  support: { title: 'Customer support', description: 'Live conversations, handoffs, and operator presence.', tone: 'sky' },
  jobs: { title: 'Automation', description: 'AI usage and auto-apply pipeline states with safe controls.', tone: 'amber' },
  feedback: { title: 'Voice of the customer', description: 'Satisfaction feedback and the improvement backlog.', tone: 'violet' },
  audit: { title: 'Activity trail', description: 'Every administrative change, recorded with its context.', tone: 'slate' },
  settings: { title: 'Workspace settings', description: 'Security, integrations, routing, and knowledge base.', tone: 'slate' },
};

export const ADMIN_SECTION_ICONS = Object.fromEntries(
  ADMIN_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.icon])),
);

export const ADMIN_NAV_LABELS = Object.fromEntries(
  ADMIN_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label])),
);
