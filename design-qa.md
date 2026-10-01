# Homepage hero design QA

Source visual truth: `C:/Users/Administrator/.codex/generated_images/01a06c66-0731-7901-8a0f-790b8b04e292/exec-732036d3-bd25-4084-a16b-dee0f75282a6.png` (selected second option, folded-paper companion).

Implementation: `http://127.0.0.1:5175/`, existing production application. Scope: hero and homepage navbar only.

Viewport: 1440 × 900 CSS px. Source 1586 × 992 pixels normalized to 1440 × 900; implementation 1440 × 900, density 1. Light theme, anonymous, analytics declined, resting pose.

## Comparison history

### Pass 1 — blocked

Full-view combined evidence: `output/playwright/hero-comparison-v1.png`.
Implementation capture: `output/playwright/hero-desktop-v1.png`.

- [P1] CV scale: source CV fills nearly the whole right column; implementation leaves too much empty space above/below. Increase scene height and framing scale, move CV slightly upward, retain the larger CV / smaller mascot relationship.
- [P2] Paper lighting: overexposed white material hides the folded corner and character volume. Use filmic tone mapping, a slight three-quarter character orientation, and soft variance shadows.
- [P2] Typography and controls: heading, wordmark and CTAs are lighter/smaller than the selected direction; secondary CTA loses the brand blue. Increase heading weight/size, CTA height and blue outline; retain the existing source logo.

Fixes applied after pass 1: taller illustration frame; adjusted orthographic camera and object positions; filmic lighting, soft shadows; stronger heading, larger CTA targets, blue secondary CTA, larger homepage wordmark.

## Fidelity surfaces

### Pass 2 — blocked

Combined evidence: `output/playwright/hero-comparison-v2.png`; focused CV/character evidence: `output/playwright/hero-art-comparison-v2.png`.

- [P1] Desktop heading wraps ATS-friendly across two lines after increasing weight. Remove the unnecessary 24px copy inset so the selected three-line heading fits, without shrinking the typography.
- [P2] Taller scene increases the hero beyond the 900px viewport, pushing the character's feet into the support launcher. Remove redundant desktop container padding, preserve header clearance, move CV slightly upward.
- [P2] CV silhouette is too square and the projected floor shadow looks harsh. Use a genuinely rounded extruded paper mesh and matching UV-mapped print surface; stop casting the CV's large floor shadow, retaining ambient blue glow and the character's contact shadow.

Fixes applied after pass 2: removed extra copy inset and desktop vertical padding; moved CV upward; rounded paper surface geometry; character-only floor shadow; reduced lighting intensity for saturated brand blue.

### Pass 3 — blocked

Combined evidence: `output/playwright/hero-comparison-v3.png`; focused evidence: `output/playwright/hero-art-comparison-v3.png` and `output/playwright/hero-type-comparison-v3.png`.

The three-line headline, first-screen fit, rounded CV and paper geometry are corrected. [P2] CTA/eyebrow sizes still drift from the chosen target: increase desktop controls to 66px/19px and eyebrow to 15px; retain 56px mobile touch targets. The source's raster paper character is intentionally replaced by the original animatable Blender model with the same paper/blue-glove/boot design. Existing source logo and system font remain brand constraints.

Responsive follow-up: [P2] mobile gesture leaves too little clearance for the right hand, and the support launcher obscures the right-aligned animation hint. Move the companion inward and left-align the hint beneath the CV. Reduced-motion QA also exposed stale pose data between scene remount and first render; render the neutral scene before signaling readiness.

- Fonts/typography: native system sans-serif consistent with the existing brand, stronger display weight and same three-line desktop headline; final wrapping check pending.
- Spacing/layout: same split hero and centered navigation; larger artwork correction awaiting comparison.
- Colors/tokens: blue `#2563eb`, slate `#0f172a`, white/pale blue; preserve existing dark theme.
- Image quality: generated readable CV texture and transparent fallback; original Blender model with named animated parts rather than CSS/SVG mascot. True 3D is an intentional response to the user's explicit animation requirement, not a screenshot pasted into the page.
- Copy/content: selected heading, condensed supporting copy, native signup/resume-tip links; scene uses an example resume and does not promise interviews or fabricate a personal ATS score.

## Handoff — October 1, 2026

The user requested stopping design work and publishing the current implementation for another developer to finish. This report remains blocked on visual approval: the character and hand animation are not accepted by the user. Publication does not mean the design is perfected.

Functional checks completed during implementation: pointer tracking, click/keyboard reactions, mobile tap, live reduced-motion changes, WebGL/asset fallback, context-loss fallback, navigation cleanup, and zero idle/offscreen draw calls. Responsive checks covered 320–1920px widths without horizontal overflow. The zoom check was a 720×450 CSS viewport equivalent, not a real browser zoom test. Hero/header accessibility checks reported no axe WCAG A/AA violations.

Current model: `public/characters/paper-pal.glb`, built by `scripts/build-paper-pal.py`. Browser pose/interaction code: `src/components/brand/paperPalScene.js`; motion math: `src/utils/heroMotion.js`. The Blender rig has named shoulder/elbow/wrist pivots and Grip/Point glove morphs. Visual redesign and animator-authored poses remain unfinished; no further design iteration was performed after the stop request.

final result: blocked
