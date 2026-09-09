# GA4 dashboard evidence — 2026-09-10

## Saved dashboard

- Property: ResumeATS (GA4 property `552904382`; account `386612499`).
- Dashboard: `ResumeATS Growth & Conversion`.
- Description: `ResumeATS acquisition, engagement, and conversion monitoring dashboard.`
- Save result: Google Analytics displayed `Dashboard saved`; the new report appeared in Library and reopened successfully at report id `15749841317`.
- Scope: the dashboard was saved for the current Analytics user and was not published to a shared collection.

## Included views

- User key event rate — GA4's current conversion-rate metric terminology.
- New users.
- Key events.
- Active users over time by Page path + query string.

The reopened dashboard showed the four configured cards and the configured last-28-days date range. The values visible at save time are an Analytics UI snapshot only; they are not used as proof of production reporting freshness or business conversion performance.

## Read-only provider check — 2026-09-10

- The authenticated GA4 property route is property `552904382`; the universal picker labels the property `ResumeATS`.
- Admin > Data streams shows the web stream `ResumeATS Website` at `https://resumeats.cv`, stream ID `15721806406`, and measurement ID `G-1M08TLZ4CB`.
- The stream detail panel confirms that data collection is active in the past 48 hours and that the stream is receiving traffic.
- The processed GA4 Home report loaded the last-seven-days cards with 127 active users, 943 events, 126 new users, and 0 key events. The visible event list contained the standard events `click`, `first_visit`, `form_start`, `page_view`, `scroll`, `session_start`, and `user_engagement`.
- The Events screen shows `purchase` configured as a key event, but no recent `purchase`, `sign_up`, or `begin_checkout` event appears in the current last-28-days event list. The saved dashboard therefore correctly shows a 0% user key-event rate for the observed period; no test purchase or account creation was made to manufacture data.
- Checked at approximately `2026-09-09T22:57:52Z` through the connected browser. This is provider UI evidence, not server-side GA Data API credential evidence.

## Boundary

This proves the dashboard artifact was created and persisted, the property and production stream mapping are visible, and processed GA4 reports are currently readable in the owner browser. It does not prove server-side Reporting API access, attribution correctness, or that every expected production event has been exercised in the current period.
