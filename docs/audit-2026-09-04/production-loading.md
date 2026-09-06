# Production loading audit — 4 September 2026

The initial JavaScript dependency graph fell from **1,103,963 to 670,057 raw
bytes**, and from **333,690 to 199,434 gzip bytes**: reductions of **39.30%** and
**40.23%**. The release build now demonstrably contains production React and
production environment branches. Export dependencies remain available on demand.

These are local artifact measurements, not load-time, Core Web Vitals, network,
CPU, or real-device measurements. No production deployment or browser CLI was run.

## Confirmed defects and bounded changes

1. A local development setting could make `vite build` emit development React,
   React DOM and scheduler code, with development-only application branches.
   Setting `NODE_ENV` in the Vite config callback was too late: Vite records the
   environment state before that callback and subsequently loads env files.
   `scripts/build-production.mjs` now sets production before importing/building
   with Vite. The config rejects a build resolved as non-production. Ordinary
   development is unchanged, and the user's env files were not edited.
2. The catch-all `vendors` chunk grouped eager dependencies with PDF transitive
   packages. UI, animation and backend chunks imported it, so lazy top-level PDF
   imports did not prevent early loading of canvg, DOMPurify, compression/image
   libraries and core-js. Removing only the catch-all rule lets Rollup keep those
   dependencies on the lazy side of the graph. Named core chunks remain.
3. A custom preload filter removed PDF and Word dependencies from lazy-import
   preloads. Restoring Vite's default dependency calculation retains their lazy
   boundary while allowing parallel dependency requests when an export is invoked.
4. Removed a hardcoded production-backend preconnect from HTML. It bypassed
   configured custom/fixture origins before application code ran. The build test
   rejects restoration of this unconditional external connection hint.

The behavior aligns with Vite's distinction between [mode and NODE_ENV](https://vite.dev/guide/env-and-mode)
and its [dynamic-import dependency preloading](https://vite.dev/config/build-options#build-modulepreload).
The installed Vite **7.3.6** implementation and actual emitted output were used
for verification; this is not a migration to a newer Vite major.

## Measurement method and immutable evidence

- [Baseline graph](production-loading-baseline.json): exact on-disk files from
  the preceding 548-test pass, captured before rebuilding. That pass verified
  build mechanics but did **not** establish production-mode compilation.
- [Current graph](production-loading-current.json): final Rollup output after
  Vite's output hooks, independently checked for matching raw and gzip sizes
  against every corresponding file from the final `npm run build`.
- Raw sizes are UTF-8 file bytes. Gzip uses Node's default `gzipSync` independently
  for each file; totals sum compressed file sizes. Hosting compression, headers,
  cache state and transfer timings are not simulated.
- Initial JS means the HTML entry and its recursive **static** imports. Dynamic
  routes, export imports, CSS, fonts and images are excluded and reported separately.
- The final endpoint also contains the bounded parser/consumer fixes from this
  pass. Controlled intermediate builds isolated the loading effects: production
  mode with the original vendor rule was **918,561 / 281,733** raw/gzip bytes;
  removing that rule was **669,249 / 199,086** before restoring preload metadata
  and finishing parser changes. Do not attribute every endpoint byte to one edit.

## Entry and shared chunks

All sizes below are exact bytes, shown as **raw / gzip**.

| Chunk or graph | Before | After |
| --- | ---: | ---: |
| Initial JS, all static dependencies | 1,103,963 / 333,690 (8 chunks) | 670,057 / 199,434 (7 chunks) |
| Application entry alone | 148,545 / 44,250 | 151,493 / 45,574 |
| React / React DOM / scheduler | 311,959 / 92,459 | 139,782 / 45,037 |
| Catch-all vendors | 365,169 / 119,163 | Removed; dependencies assigned by use |
| Backend client and its dependencies | 195,262 / 48,450 | 201,242 / 49,836 |
| Animation and its dependencies | 33,105 / 11,236 | 125,475 / 39,767 |
| UI and its dependencies | 9,753 / 3,598 | 11,895 / 4,685 |
| Router | 38,362 / 13,629 | 38,362 / 13,630 |
| Vite runtime | 1,808 / 905 | 1,808 / 905 |
| Stylesheet, separate from JS | 99,446 / 16,231 | 99,476 / 16,238 |

The larger named animation/backend chunks are dependency reassignment from the
removed vendor chunk, not equivalent increases in total initial loading.

## Route and export costs after the change

"Additional static JS" includes each route/service's recursive static imports,
excluding files already in the initial graph. It does not imply every route
downloads that amount after visiting other routes with shared cached chunks.

| Route or export | Own chunk raw / gzip | Additional static JS raw / gzip |
| --- | ---: | ---: |
| Dashboard | 15,215 / 4,797 | 37,207 / 11,393 |
| Profile | 67,460 / 14,387 | 91,205 / 23,364 |
| Resume Builder | 112,669 / 26,558 | 263,471 / 71,718 |
| Resume Preview | 10,915 / 3,644 | 38,974 / 8,524 |
| Quick Resume | 37,807 / 9,826 | 134,081 / 39,155 |
| PDF service | 3,073 / 1,544 | 588,296 / 171,726 |
| Word service | 9,251 / 2,984 | 350,143 / 98,934 |

The PDF library chunk is **580,389 / 167,962**, versus **534,061 / 152,924** before;
some dependencies previously paid on initial load are now correctly paid on export.
Word's library chunk is **337,781 / 94,754**. Additional optional PDF paths retain
canvg (**155,858 / 50,836**) and DOMPurify (**28,552 / 10,644**) as dynamic chunks.
The existing Unicode font is **757,076 / 386,451**, fetched for PDF generation and
not in initial HTML preload. Gzip font size is illustrative; server encoding can differ.

## Regression and release checks

`node --test tests/productionBuild.test.js` adds three actual-build/config tests:

- Development remains development with the isolated hostile fixture env file.
- Direct wrong-mode release config fails closed for both inherited development
  and a development setting loaded from the env file.
- The normal wrapper compiles the probe's DEV and NODE_ENV branches as production,
  renders production React DOM and no development React modules, and keeps PDF/
  Word transitive modules outside the app's static closure. Every static/dynamic
  emitted dependency resolves. Builder, Preview and Quick Resume retain lazy
  export imports with their actual library preloads; initial HTML excludes them.

The fixture does not change local managed env files, run application requests,
or use browser automation. The check adds approximately ten seconds to this
machine's test run; timings are not a performance benchmark.

Final frozen-source verification: **615/615 Node tests**, global lint,
`tsc --noEmit`, `npm run build` plus public-route prerender (**1,201 modules**, local
Vite build **9.69 seconds** after the final HTML hint removal), repository hygiene, diff check, and Chrome/Firefox
extension builds passed. The build reports the existing empty Stripe chunk;
Git reports line-ending normalization notices but no whitespace failures.
All **60 JS chunks and 2 CSS/font assets** matched the current evidence snapshot.
Removing the HTML hint did not alter any recorded JS, CSS or font hash/size.
The local browser-evidence directory is excluded from lint, matching its existing
Git ignore; generated preview bundles are not treated as application source.

A separate ignored production preview is available to the main audit on
`http://127.0.0.1:5188/`: production compilation with env-file loading disabled,
only synthetic loopback configuration, and a CSP restricting connections to
that origin and the fixture backend. Its output does not overwrite release
`dist`. The main audit's CUA production-runtime smoke passed synthetic sign-in,
dashboard, the saved Minimalist resume editor and generator metadata. The posting
with required 3–5 years and preferred 8+ displayed Software Engineer, Cedar Labs,
and 3–5 years (mid). Accepted captures:
[home](58-production-home-smoke.png), [editor](59-production-editor-smoke.png),
and [metadata](60-production-metadata-smoke.png). This was loopback-fixture-only:
no generation, export, provider or employer action was performed. It establishes
basic compiled-runtime navigation, not real ATS compatibility or Core Web Vitals.

The factual-tailoring diagnostic remains separately **19 passes / 11 failures**,
with expected exit 1: review gates do not verify prose truth. Source-only output
retained zero of the 23 unsupported probes and all seven faithful suggestions
remain available for explicit review. Dependency audit, 18 Edge checks, three
native Deno tests and the isolated 35-migration proof are prior unchanged evidence,
not newly rerun or broadened coverage in this loading pass.

## Saved-resume handoff follow-up

The subsequent handoff implementation has its own
[after-handoff asset snapshot](production-loading-after-handoff.json); the original
baseline and 615-test current snapshot above are unchanged. A fresh production
build transformed **1,203 modules**. A separate write-disabled build verified all
**60 JavaScript chunks and 2 CSS/font assets byte-for-byte** against release `dist`.

The initial static JavaScript closure remains seven chunks: **670,178 raw bytes /
199,486 gzip bytes**, up only **121 / 52 bytes** from the 615-test snapshot. Against
the original pre-fix baseline this is **39.29% raw / 40.22% gzip** smaller; the earlier
40.23% figure describes the earlier snapshot, not this build. The lazy extension
service chunk is **19,856 / 7,536 bytes**, and the lazy app bridge is **9,954 / 4,018**.
The service's PDF renderer remains a dynamic import, not part of initial loading.

Final follow-up verification passes **724/724 Node tests**, with zero skipped,
global lint, TypeScript, production build/prerender, repository/diff checks, and
Chrome/Firefox extension builds. The last two tests and final package rebuild cover
background selection-error normalization; no app source changed after the measured
production build. Existing empty-Stripe-chunk and line-ending notices do not indicate
test failures. The separate strict factual-tailoring diagnostic was rerun and still
returns the expected exit 1 with **19 passes / 11 unsafe-proposal failures**.

Handoff browser evidence and the still-unverified installed-extension journey are
documented in [the selection implementation report](extension-selection-implementation.md).
No Playwright CLI/MCP run, employer action, provider invocation or new production
runtime performance measurement was performed for this follow-up. The compiled
loopback smoke above remains evidence for its earlier isolated preview, not proof
of the newly packaged extension's complete browser round trip.

## Candidate-evidence follow-up

The later quantity/career-evidence and bounded-worker pass has a separate
[asset snapshot](production-loading-after-candidate-evidence.json). Its initial
static JavaScript closure is still seven chunks, now **675,283 raw / 202,021 gzip
bytes**. This is **5,105 / 2,535 bytes** above the handoff snapshot (approximately
0.76% raw / 1.27% gzip). Compared with the original pre-fix baseline, the current
reduction is **38.83% raw / 39.46% gzip**; earlier percentages remain historical.
The write-disabled measurement matched all **60 JavaScript chunks and 2 CSS/font
assets** byte-for-byte with the final release build. Export libraries remain off
initial loading, as verified by the actual production-graph regression.

The frozen-source gate passes **843/843 Node tests**, zero skipped, global lint,
TypeScript, production build/prerender (**1,204 modules**), repository/diff checks
and Chrome/Firefox extension builds. The ordinary build still reports the empty
Stripe chunk. A separate unchanged-corpus strict diagnostic now reports **23 passes /
7 failures** with expected exit 1; four quantity probes are genuinely corrected,
all seven faithful controls remain available, and source-only retention stays at
zero unsupported probes. Its new [semantic snapshot](factual-tailoring-post-quantity.json)
and [candidate-evidence report](candidate-evidence-pass.md) preserve the distinction
between literal checking and factual truth. All prior snapshots remain unchanged.

No new production browser smoke, Core Web Vitals measurement, Playwright CLI/MCP
run, provider call, employer action, migration or deployment was performed during
this follow-up. The earlier isolated-preview browser captures do not certify this
new build's full browser journey. The worker fix has deterministic message-count
and cleanup evidence, not a measured browser CPU or battery claim.

## Target-headline and shared-requirements follow-up

The 927-test headline/requirements checkpoint has a separate
[asset snapshot](production-loading-after-headline-requirements.json). Initial
static JavaScript remains seven chunks, now **676,428 raw / 202,382 gzip bytes**:
**1,145 / 361 bytes** above the 843-test candidate-evidence snapshot. That is about
0.17% raw / 0.18% gzip growth, and **38.73% raw / 39.35% gzip** below the original
pre-fix baseline. All **60 JavaScript chunks and 2 CSS/font assets** were compared
byte-for-byte with that checkpoint's production build. Earlier snapshots are unchanged.

That checkpoint passes **927/927 Node tests**, zero skipped, global lint, TypeScript,
production build/prerender (**1,205 modules**), repository/diff checks, and both
Chrome/Firefox package builds. The actual production graph test now also proves
the shared vacancy parser has nonzero rendered code; a separate minified-module
test executes that parser, while package tests verify identical helper bytes and
load order in both extension targets. Export dependencies remain off initial
loading. The empty Stripe chunk remains the only ordinary build warning.

The unchanged 30-case strict diagnostic still exits 1 with **23 passes / 7 unsafe
proposals**, all seven faithful controls available, and zero unsupported probes
in source-only materialization. Its complete parsed result equals the existing
[post-quantity snapshot](factual-tailoring-post-quantity.json), so no duplicate
semantic snapshot was created. Independent headline tests cover all five actual
templates, shared export text, native DOCX XML, and saved-artifact snapshots; the
separate [rendered export check](headline-export-verification.md) records its own
visual scope and limits.

These are local code, package, and byte-count results, not new Core Web Vitals or
production runtime measurements. No Playwright CLI/MCP, live provider, employer,
database, deployment, or installed-extension browser action was performed for
these checks. Root's separately recorded in-app browser checks do not imply a
complete packaged-extension employer round trip.

## Fullscreen-preview follow-up

The final local source gate after native-modal accessibility, modal-local export
feedback, and the dashboard headline correction passes **960/960 Node tests**,
zero skipped, global lint, TypeScript, build/prerender (**1,207 modules**),
repository/diff checks, and Chrome/Firefox packaging. The intermediate 927-test
snapshot above remains unchanged; the later 950-test gate was a checkpoint before
the export-feedback correction.

The new [fullscreen-preview asset snapshot](production-loading-after-fullscreen-preview.json)
again matches all **60 JavaScript chunks and 2 CSS/font assets** in the production
build. Initial loading remains seven chunks at **676,463 raw / 202,404 gzip bytes**,
up **35 / 22 bytes** from the 927-test checkpoint. It is **38.72% raw / 39.34% gzip**
smaller than the original pre-fix baseline. The Builder route chunk is now
**114,551 raw / 27,268 gzip bytes**; this is the route file, not a promised total
incremental transfer size. No export library moved into initial loading.

The strict 30-case diagnostic was rerun and remains identical to the immutable
post-quantity JSON: **23 passes / 7 unsafe proposals**, expected exit 1, all seven
faithful controls available, and zero unsupported probes in source-only output.
No new provider, installed-extension, deployment, or runtime-speed claim follows
from this gate. Native-modal browser behavior and visible export feedback are
separate in-app browser checks; the unit tests explicitly use DOM boundary doubles
and do not claim to emulate the browser top layer or native focus trapping.

## Remaining opportunities, not implemented

- Public pages still load the backend/auth client and animation stack. Reducing
  those costs would need a deliberate public/authenticated shell boundary or a
  measured animation-loading change, with auth/recovery and motion regressions.
- Builder statically imports its AI UI. That subtree is **109,926 / 36,464** beyond
  the initial graph, but includes shared helpers, so this is not a promised saving.
  Lazy-load the tab only after checking route, draft and review recovery behavior.
- The PDF service statically combines structured text export and html2canvas.
  Separating the screenshot fallback may reduce first-export work. Retain the
  reviewed Unicode/text fidelity tests; do not strip the font simply to shrink bytes.
- Validate actual mobile navigation, export download and Core Web Vitals against
  this production output in a permitted local/staging browser run before making
  latency or user-experience performance claims.

## Legacy-PDF containment follow-up

The 978-test Stage A gate has a separate
[asset snapshot](production-loading-after-legacy-pdf-containment.json). All **60
JavaScript chunks and 2 CSS/font assets** were compared byte-for-byte with the
same production build written to `dist`. Initial loading remains seven chunks at
**676,463 raw / 202,400 gzip bytes**: unchanged in raw bytes and 4 gzip bytes below
the 960-test fullscreen-preview checkpoint. It remains **38.72% raw / 39.34%
gzip** below the original pre-fix initial-loading baseline.

Removing the obsolete mutable-PDF profile path reduced the lazy
`browserAgentService` chunk by **1,913 raw / 596 gzip bytes** and the lazy
`pdfService` chunk by **583 raw / 259 gzip bytes**. Across all emitted JavaScript,
the graph is **2,503,950 raw / 735,095 gzip bytes**, down **2,679 raw / 952 gzip
bytes** from the fullscreen-preview checkpoint. These lazy-chunk reductions do
not imply a first-load saving, and no export dependency moved into initial
loading.

The frozen-source gate passes **978/978 Node tests**, zero skipped, global lint,
TypeScript, production build/prerender (**1,207 modules**), repository/diff
checks, and Chrome/Firefox package builds. The strict 30-case diagnostic still
exits 1 by design and exactly matches the immutable post-quantity JSON: **23
passes / 7 unsafe proposals**, all seven faithful controls available, and zero
unsupported probes in source-only materialization. The ordinary build still
reports the existing empty Stripe chunk.

These are local static-graph and deterministic-test results, not Core Web Vitals
or installed-extension certification. No Playwright CLI/MCP, provider, employer,
remote Storage, database, deployment, or production action was performed for
this follow-up. Root's separate loopback in-app browser export checks verify UI
feedback and that the fixture observed no Storage/save write, but do not verify
browser filesystem delivery or a packaged-extension employer round trip.

## Version-bound email-renderer follow-up

The Stage B renderer/attachment boundary has a separate [asset snapshot](production-loading-after-version-bound-email.json),
captured by the reproducible `scripts/capture-production-assets.mjs` script.
The output contains all **61 JavaScript chunks and 2 CSS/font assets** from the
same production build. After the high-risk review gate and URL-safety boundary
were added, initial loading is seven chunks at **681,529 raw / 204,216 gzip bytes**,
	up **5,066 / 1,816 bytes**
from the Stage A legacy-PDF snapshot;
this is a static graph measurement, not a device-speed claim. The complete emitted
	JavaScript graph is **2,515,395 raw / 739,499 gzip bytes**. PDF and DOCX remain
lazy; the PDF chunk is **580,389 / 167,960** and the DOCX chunk is **337,781 /
	94,754**. The browser-agent service remains lazy at **18,052 / 7,001** and its
PDF renderer remains a dynamic import.

The local source gate passes **1042/1042 Node tests**, zero skipped, global ESLint,
TypeScript, all Supabase Edge entrypoint typechecks, production build/prerender
(**1,212 modules**), repository/diff checks, and Chrome/Firefox extension builds.
The new handler checks prove no Storage reader or one-page fallback remains and
that typed missing-resume errors are non-2xx. The app's dynamic PDF module still
contains the shared core only when an export is explicitly invoked. Docker is not
available on this host, so Supabase's actual packaged-runtime/static-file gate
remains open; no deployment or managed/provider request was made.

## Factual-risk confirmation follow-up

The subsequent review-boundary pass adds no production bundle cost beyond the
review UI already represented in the source graph. The unchanged 30-case
synthetic corpus now passes **30/30 by default resolution**: all 23 unsupported
probes fall back to captured source wording unless one of seven high-risk
proposals is explicitly confirmed. All seven faithful controls remain available.
The immutable summary is [factual-tailoring-post-risk-gate.json](factual-tailoring-post-risk-gate.json).

The complete local suite after this follow-up passes **1032/1032 Node tests** with
zero skipped or cancelled. Lint and TypeScript remain green; the risk gate is
covered by focused resolver/UI regressions rather than a live-model claim.

This is a deterministic fail-closed claim-risk heuristic, not a model-quality,
Core Web Vitals or hiring-outcome measurement. A live-model evaluation, preview
parity check, browser filesystem delivery check and managed/provider staging gate
remain separate.
