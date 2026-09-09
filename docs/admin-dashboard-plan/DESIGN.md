# Light-first design specification

## Direction selected by the user

The admin dashboard defaults to a **light sidebar and light content**. Provide a complete Dark mode and an explicit System option. Do not ship the earlier dark-sidebar/light-content concept as the default.

Generated visual examples:

- [Light mode: Overview and Support inbox](admin-light-concept.png) — primary design direction.
- [Dark mode companion](admin-dark-concept.png) — same application and layout in the optional theme.
- [Exact generation/edit prompts and provenance](DESIGN-PROMPTS.md).

These are raster design examples with fictional data, not functioning software or proof of production activity. Behavioral, metric, permission and accessibility specifications in this package take precedence over illustrative labels. In particular, “Grant Premium” in a support context is shown only to an appropriately authorized owner/admin/billing user; it is not granted to the Support role. Implement the coherent-cohort funnel from `MEASUREMENT.md`, not an unvalidated join of visitor and account counts in the image.

## Theme contract

1. An administrator with no saved admin preference sees Light, regardless of the OS theme. Light includes the sidebar, header, cards, tables, filters, dialogs, support panes and widget previews.
2. Persist the explicit admin choice as `resumeats.admin.theme = light | dark | system`. This stores no account information. If storage is unavailable, use the choice in memory and default safely to light on reload.
3. A deliberate System selection follows `prefers-color-scheme`, including runtime changes. A deliberate Light/Dark choice ignores later system changes until System is selected.
4. Reuse mechanics from `src/context/ThemeContext.jsx` but give the admin surface its own scoped theme state. Do not change the public/customer app's stored `theme` or global default just to satisfy the admin design. Avoid two contexts competing to toggle `document.documentElement.dark`.
5. Use an admin-root `data-admin-theme` and semantic CSS variables, with `color-scheme` set for native controls. Scope dialog/tooltip portals under that theme root or propagate its theme explicitly. Existing global `.dark` utilities must not override admin light surfaces.
6. Apply the resolved preference before rendering the admin shell to prevent a dark flash. Theme switching preserves focus, route, filters, draft reply and scroll; it never refetches business data solely because colors changed.
7. The selector has visible labels Light, Dark and System, a programmatic selected state, keyboard support and a non-color-only active indicator. Expose it in the sidebar footer and in the mobile menu.
8. No hardcoded white backgrounds or dark text in shared admin charts, tables, date pickers, code blocks, attachments, toast messages or dialogs. Screenshots/export print views use a deliberately legible print scheme, independent of dark mode.
9. The customer support widget follows the customer's own site preference/system policy, not an agent's admin setting. Both widget themes receive the same quality checks.

### Starting tokens

Colors are a starting design palette, not a claim of tested contrast. Measure actual rendered foreground/background pairs and adjust to meet the acceptance criteria.

| Semantic token | Light | Dark |
| --- | --- | --- |
| Page | `#F6F8FC` | `#0F172A` |
| Sidebar | `#FFFFFF` | `#111C2E` |
| Surface | `#FFFFFF` | `#172235` |
| Subtle surface | `#F8FAFC` | `#1E293B` |
| Border | `#E2E8F0` | `#334155` |
| Primary text | `#0F172A` | `#F1F5F9` |
| Secondary text | `#475569` | `#CBD5E1` |
| Primary action | `#1D4ED8` with white text | `#93C5FD` with `#0F172A` text |
| Selected navigation | `#EFF6FF` with `#1D4ED8` text | `#1E3A5F` with `#BFDBFE` text |
| Focus | High-contrast 2px ring plus offset | High-contrast 2px ring plus offset |

Use separate semantic success/warning/danger/info tokens with text/icon labels. Charts need theme-specific series colors, visible gridlines and accessible data tables. Do not invert the light screenshot with a CSS filter.

## Layout and component dimensions

Use the repository's existing font stack and icon components. Prefer a readable 14–16px body, 12px secondary metadata minimum, 24–28px page headings and 28–32px headline values. Use a 4px/8px spacing scale, 10–12px card radius, thin borders and restrained shadows. Prioritize whitespace and alignment over decorative gradients.

Desktop admin shell: sidebar approximately 224px, header minimum 64px, main content padding 24–32px, content `min-width: 0`. Navigation does not compete with primary work. Controls are generally 40–44px tall. Avoid fixed heights on content cards; align only peer summary cards. A long email or translated label must wrap/truncate with accessible full text without pushing buttons offscreen.

Overview order: date/timezone/freshness -> primary outcomes -> trend and ordered funnel -> needs-attention list -> bounded recent activity. A card click leads to the matching filtered detail view. Operational queue counters are live/as-of counters and do not silently inherit an unrelated historical date filter.

User directory: server search, account/plan/status/date filters, sortable supported columns, 25/50/100 page size and cursor navigation. Open customer detail in a routed drawer on large screens and a full page on smaller screens. Keep destructive actions behind a clearly labeled actions menu, not beside routine navigation.

Support desktop: queue approximately 280–320px; transcript flexible with at least 420px comfortable reading width; customer context approximately 300–340px when space permits. At narrower desktop widths collapse context into a drawer before compressing the transcript. Each pane has intentional scrolling; keep the reply composer visible without hiding the latest message. Avoid multiple accidental nested body scrollbars.

Responsive rules:

- At 1440–1920px, full navigation and three-pane support when widths permit.
- At 1024–1279px, collapsible navigation, two-pane support; customer context drawer.
- At 768–1023px, navigation drawer, simplified cards; queue/transcript split only if both remain readable.
- At 360–767px, single-column cards and one support pane at a time with Back navigation; full-width composer and safe-area padding. No horizontal page scrolling; wide data tables get a labeled contained scroll region or alternate row cards.
- At 200% zoom, preserve complete controls and meaningful reading order. Navigation, filters and action menus remain reachable by keyboard.

## Screen inventory and interactions

| Screen | Main job | Required interactions/states |
| --- | --- | --- |
| Overview | Understand outcomes and urgent work | Dates, comparison, source/coverage help, drill-down, stale/partial/error states |
| Users | Find and understand a customer | Search/filter/sort/cursors; scoped 360 view; safe grant/ban/export/deletion dialogs |
| Analytics | Understand activation, conversion and retention | Cohort maturity, numerator/denominator, source separation, segment filters, comparison, table export |
| Subscriptions | Reconcile paid state and take supported actions | Provider/currency/status filters; transaction history; action preview, pending reconciliation and receipt |
| Support inbox | Resolve a conversation without losing context | Assignment/takeover, reply vs internal note, macros, attachments, handoff, queue/offline/reconnect/search |
| AI and jobs | Find failures, cost and stuck work | Request/job details, cost coverage, safe retry/cancel, budget/circuit breaker status |
| Feedback | Turn evidence into improvements | Tags, sanitized theme counts, linked issue and owner/status; distinguish report from inference |
| Audit | Explain who changed what and why | Actor/target/action/outcome/date filters, immutable detail, authorized export |
| Settings | Operate support and integrations securely | Team/MFA, support hours, routing, knowledge review, flags, health, validated settings history |

Every screen must have intentional loading, true-empty, no-results, unauthorized, stale, partial-failure, offline/retry and populated states. Mutation dialogs show target, current value, requested change, reason, consequences, validation, submitting, confirmed and uncertain/pending outcomes. Browser `prompt` and `confirm` are not the final UX.

## Accessibility and interaction acceptance

- Target WCAG 2.2 AA: normal text contrast at least 4.5:1, large text 3:1, meaningful controls/focus/graphics at least 3:1 where required; validate both themes and statuses.
- Semantic landmarks, one primary heading, labeled inputs, actual buttons/links, table headers and screen-reader names for icon actions. No color-only warning, trend or unread state.
- Keyboard-operable navigation, theme selector, filters, charts' table alternatives, dialogs, drawers and chat. Trap focus only in modal dialogs; restore it to the opener. Escape handling must not silently discard a draft.
- Support transcript uses a considerate live region for new incoming content; do not announce the entire history repeatedly. Show sender identity, AI/human status and timestamps in accessible text.
- Minimum comfortable pointer/touch targets, reduced-motion support, no flashing, no essential hover-only controls, tooltip alternatives on touch/focus.
- Use safely rendered message text/Markdown. Sanitize links, attachments and URLs; no raw HTML from users or AI.
- Test light/dark/system switching while an action dialog is open, an AI response is pending and a support draft exists. The theme must not change the business state.

Verify against the current [WCAG 2.2 standard](https://www.w3.org/TR/WCAG22/) during UI QA; an attractive raster concept is not accessibility evidence.
