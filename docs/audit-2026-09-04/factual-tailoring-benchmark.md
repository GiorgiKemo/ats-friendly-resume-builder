# Offline factual-tailoring benchmark

The later [review-boundary evaluation](./factual-tailoring-review-boundary.md)
separates source-only materialization from proposed wording. A high-risk claim
gate now keeps all seven previously retained semantic probes out of the default
resolver path while preserving an explicit, user-confirmed override. The
historical JSON snapshots below are unchanged; a checkbox is an acknowledgement,
not a factuality proof.

## Post-risk-gate result

The unchanged 30-case corpus now has **30 default-resolution passes and zero
failures**. All 7 supported controls remain available, and none of the 23
unsupported probes is retained unless its flagged suggestion is explicitly
confirmed. The immutable summary is in
[factual-tailoring-post-risk-gate.json](./factual-tailoring-post-risk-gate.json).

The resolver's fail-closed behavior applies to both the browser review component
and direct callers: a risky suggested or edited passage without `confirmRisk: true`
materializes the captured original. The UI explains the signal(s) and disables
completion until the checkbox is checked or the original is selected. This is a
bounded claim-risk heuristic, not a general language-understanding or model
evaluation system.

## Post-guard result before the review boundary

The historical post-guard corpus had **19 passes and 11 failures**. All 7 supported
controls were retained; **11 of 23 unsupported claims survived** before the
high-risk gate. Its per-case output remains in `factual-tailoring-current.json`;
the original baseline below is unchanged.

The bounded change in `resumeAuthenticity.js` closes four observed cases:

- Repeated job titles/employers require a unique matching record ID or unambiguous
  supplied dates; conflicting or ambiguous identities retain the original prose.
- Structured dates, IDs, titles, employers, and technology fields no longer supply
  digits for achievements. Only actual prose fields supply numeric evidence.
- Blank work/education/project/certification descriptions cannot acquire invented
  prose. Summary synthesis from documented career evidence remains available.
- `25 percent`, `25 per cent`, and `25%` have equivalent literal percent units.

Fourteen additional runtime regression tests cover these boundaries, including
reordering, duplicate IDs, conflicting dates, blank descriptions, metadata digits,
malformed non-prose objects, and preservation of supported rewrites. The remaining
semantic proposals were later handled by the review risk gate: seniority, metric
reassignment, prose skills/affiliations/proficiency, negation reversal and invented
clearance are flagged and require confirmation. These changes do not establish
general semantic truth or certify the output.

## Result before remediation

The complete generation pipeline retained **14 of 23 deliberately unsupported
claims** in this hand-labeled synthetic corpus. It retained 6 of 7 supported
controls and rejected one valid quantity-format rewrite. The strict benchmark
therefore has **15 failures in 30 cases** and exits with status 1.
The captured per-case pre-remediation output is `factual-tailoring-baseline.json`.

This is an adversarial diagnostic, **not** a representative model-quality score,
hallucination rate, hiring-outcome claim, or factuality guarantee. No model or
provider was contacted, no credits were spent, and no user profile was used.

## Reproduce

```powershell
node tests/benchmarks/factual-tailoring.mjs --assert-safe
node --test tests/factualTailoringBenchmark.test.js
```

The first command now runs every labeled case and prints source reasoning,
source-only materialization, the default fail-closed resolution, and a separate
diagnostic resolution after explicit risk confirmation. It exits 0 for the default
path; that green result must **not** be presented as a model factuality score.
The command remains separate from `npm test` so the synthetic risk corpus is
visible as its own release signal.

The runner executes `enforceAuthenticResumeSections`, then
`hardenGeneratedResumeForAts`, then independently the bundled actual
`generateEnhancedResume` with the candidate rewrite supplied as a stubbed provider
response. Each service case invokes that stub once; unmocked external fetch throws.
There are five requested cohorts—junior, senior, career change, multilingual, and
technical—plus a repeated-tenure fixture. Labels and source evidence live in
`tests/fixtures/factual-tailoring-corpus.mjs`.

## Confirmed baseline findings

| Priority | Gap | Source → retained unsupported output | Cases |
| --- | --- | --- | --- |
| P1 | Free prose is not checked against source facts | Short web internship → executive hiring/budget ownership; library work → Kubernetes/AWS infrastructure; explicitly “did not supervise” → supervised staff and approved budgets | `junior-invented-seniority`, `careerchange-added-prose-skill`, `careerchange-negation-reversal` |
| P1 | A quantity can change meaning while reusing its digits | 25% fewer tickets → 25% revenue growth; 50 accounts/30 minutes → 50 engineers/30 million-dollar budget; HTTP 2/Node.js 20 → 2 million customers/20 engineers; start year 2020 → recruited 2020 customers | `senior-metric-reassignment`, `senior-unit-reassignment`, `technical-version-as-scale`, `senior-year-as-achievement` |
| P1 | Spelled quantities and proficiency claims bypass digit checks | Internship → twelve professional years; 2022–2024 translation work → Japanese “ten years”; Intermediate Japanese → native Japanese | `junior-spelled-years`, `multilingual-spelled-years`, `multilingual-proficiency-invention` |
| P1 | Correct structured identity does not constrain identity claims in prose | No honors → summa cum laude/prize; community learning → Stanford/NASA affiliation; networking course → licensed auditor/government clearance | `junior-added-honors`, `careerchange-summary-affiliation`, `technical-certification-prose` |
| P2 | Matching repeated jobs ignores tenure | The same title/employer in 2018–2019 and 2023–2024 receives the latter assignment’s payroll bullet on both records | `repeated-role-wrong-tenure` |
| P2 | Literal unit matching rejects a faithful rewrite | “25%” → “25 percent” falls back to the original text even though the metric, value, and direction are unchanged | `senior-equivalent-percent-word` |

The retained unsupported outputs receive ATS-format scores of 75–100 and no ATS
warnings in this corpus. That score currently measures formatting/coverage checks,
not factual support. It must not be interpreted or described as verification of
the candidate’s claims.

## Baseline controls that worked

Nine unsupported structured-field/novel-number probes were blocked: direct name
replacement, invented employer/role, a new numeric achievement, changed structured
dates, new skill-list items, new certifications, novel fullwidth numeric values,
changed project URLs, and invented additional sections. C/C#/C++ and Japanese
source text remain available. Generated `fromProfile` flags do not authorize new
additional sections in the full pipeline, although the initial authenticity
function alone passes that field through before the hardening stage removes it.

## Cause and bounded repair direction

At baseline, `src/utils/resumeAuthenticity.js` considered a rewrite supported
whenever every numeric token appeared somewhere in its evidence, including
structured dates and technology fields. It matched work only by title/employer.
The bounded repairs above remove that metadata evidence and ambiguous work matching.
Numbers appearing within source prose can still change meaning in generated prose;
predicates, semantic units, skill names, affiliations, negation, and written-out
quantities are not validated. The generation service executes both guards, so the
remaining failures are guard limitations rather than a missed call.

Prefer source-bound rewriting with explicit source-entry/sentence references and
a conservative fallback for claims whose support cannot be established. A digit
match or an additional prompt instruction cannot establish semantic entailment.
Keep structured fields source-owned; preserve entry identity across duplicate
tenures; distinguish a supported formatting rewrite from an unverified new claim.
If free paraphrasing remains, communicate the need for factual review explicitly
instead of presenting the ATS-format score as an authenticity assessment. The
new resolver gate adds a second, explicit acknowledgement for claim classes that
are especially likely to change meaning; it does not replace user review.

The standalone `generateEnhancedWorkExperienceBullets` and
`generateEnhancedProfessionalSummary` exports return raw provider text. No current
`src` caller was found for either export, so this is a dormant API risk—not a
confirmed active UI path. They should not be wired into an editor without the same
post-generation checks and review behavior.

No production logic was changed while collecting the original baseline. The
subsequent bounded repairs changed only `resumeAuthenticity.js` and related tests.
Further repairs should be tested against the full corpus without weakening its
evidence labels; retain the known-good controls to track unnecessarily rejected
faithful rewrites as well.
