# Design prompts and provenance

Created 9 September 2026 using the built-in image-generation tool (not the CLI/API fallback). Final assets were copied into this folder; original generated files were preserved. All people, figures and operational states in the images are fictional examples.

The first concept used a dark sidebar and was superseded at the user's request. The selected default is the light-sidebar design, with a complete optional dark-mode companion. No theme code was deployed by generating these images.

## Initial layout prompt (superseded styling)

```text
Use case: ui-mockup.
Create a polished high-fidelity desktop admin dashboard design concept for ResumeATS, an ATS resume builder at resumeats.cv. Produce one wide 2400x1600 design board containing two large clean app screens stacked vertically: an overview screen above, and a support-inbox screen below. Flat front-on UI, no device frames, no perspective, no ornamental background.
Both screens have a narrow dark navy sidebar, warm off-white canvas, crisp white panels with subtle borders, cobalt blue primary actions, restrained emerald/amber status accents. Highly legible Inter-like typography, generous spacing, coherent alignment, professional operational software.
Top label "ResumeATS / Admin design concept" and clear small label "Illustrative data • Not live".
Sidebar navigation: Overview, Users, Analytics, Subscriptions, Support, AI & Jobs, Feedback, Audit log, Settings. Overview screen: title "Business overview", date selector "Last 30 days", timestamp "Updated 2 min ago". Hero cards "Active users 1,248", "Paid subscriptions 86", "Monthly recurring revenue $859", "Needs human reply 7". Large labeled signup-to-export funnel with bars: Visited 3,200; Signed up 480; Created resume 312; Exported 224; Paid 43. Beside it concise panel "Needs attention": Payment retry needed, AI queue delayed, Support response due. Bottom preview table "Recent activity" with fictional names Alex Morgan and Sam Taylor, small actions Resume exported, Plan renewed. Keep this screen clean not cramped.
Support screen: heading "Support inbox" and status "2 agents available". Three-pane layout under header: narrow conversation list with badges Waiting for human, AI assisting, Resolved; roomy conversation transcript; customer context panel. Selected fictional customer Alex Morgan asks "Can someone help me export my resume?" AI reply labeled "ResumeATS AI": "I can guide you through exporting. You can also request a person at any time." System message "Human requested • AI replies paused". Human agent reply "Hi Alex, I am here to help." Prominent "Assign to me" and "Resolve" buttons. Composer with distinct tabs "Reply" and "Internal note", reply placeholder, Send button. Customer context shows Premium monthly, Stripe, next renewal date, Recent activity, and secondary button "Grant Premium" labelled reason required. Include tiny corner widget preview titled "ResumeATS support", "AI assistant", and button "Talk to a person".
Do not imply real user records. No logos beyond simple ResumeATS wordmark. No excessive small text, no gradients, no 3D illustration. This is a design reference, not a real screenshot.
```

## Light-mode edit — selected default

Input: the initial generated Overview/Support layout. Output: `admin-light-concept.png`.

```text
Use case: precise-object-edit, high-fidelity UI mockup.
Input image 1 is the edit target: ResumeATS admin dashboard design board with Overview and Support inbox screens stacked.
Primary request: Change both dark navy sidebars to LIGHT MODE: white or very pale cool gray #F8FAFC, slate-black readable labels and icons, subtle gray right border, pale blue selected navigation background with saturated blue icon and label. User explicitly dislikes a dark sidebar in light mode.
Preserve the two-screen composition, main white content surfaces, KPI cards, data, support inbox structure, typography, sizes, spacing and branding. Do not add features or change metrics. This is a mockup, not a live dashboard.
Add a small neatly aligned three-option theme selector "Light  Dark  System" near the bottom of each sidebar, with Light visibly selected. Header note must clearly read "Light mode • Illustrative data • Not live". Keep "ResumeATS / Admin design concept".
Ensure all navigation text has strong contrast on the white sidebar. Keep soft blue active item not dark navy, fine light gray divider lines, no dark sidebar areas anywhere. No gradients. Clean polished flat UI screenshot, all panels within frame, crisp readable text.
```

## Optional dark-mode companion

Input: `admin-light-concept.png`. Output: `admin-dark-concept.png`.

```text
Use case: precise-object-edit, high-fidelity UI mockup.
Input image 1 is the edit target: LIGHT MODE ResumeATS admin dashboard board, Overview and Support inbox stacked.
Generate its DARK MODE companion for the SAME application, not a replacement for the preferred light design.
Change only theme styling: deep charcoal-blue page #0F172A, sidebar and cards #111C2E/#172235, slate borders #334155, light primary text #F1F5F9 and readable muted text #CBD5E1, pale blue accent labels, coherent accessible chart colors. All cards, tables, dropdowns, inbox panes, chat bubbles, composer and support widget must be dark themed consistently. No white cards left behind. Use dark blue active nav surface with light-blue icon and label, not neon.
Preserve precisely the layout, information architecture, data, branding, labels, sizes, typography, spacing, two stacked screens and support conversation. Change sidebar theme selectors to show "Dark" selected among "Light  Dark  System". Top right note must say "Dark mode • Illustrative data • Not live".
No gradients, no perspective, no new panels or new information. This is an optional dark-mode design example with fictional data, not live software.
```

## Visual review

Both images were inspected in the generated output. The revised default has light sidebars with dark labels, pale-blue selected navigation and a Light/Dark/System selector. The companion applies dark surfaces across overview, inbox, composer and widget, with Dark selected. Both retain the Overview/Support composition and an illustrative-data label. These images are not pixel/contrast-tested implementation assets; follow DESIGN.md and the metric/permission contracts during implementation.
