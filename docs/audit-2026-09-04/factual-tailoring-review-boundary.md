# Factual tailoring: review boundary with a high-risk confirmation gate

The review boundary keeps every unsupported probe out of the source-only resume,
and the follow-up claim-risk gate keeps the seven known high-risk proposals out of
the default resolution path. It still does **not** make AI proposals factually
reliable: a user who verifies a flagged claim can explicitly confirm it.

## Independent observed results

The original 30 cases and their labels are unchanged. The runner executes the
actual generation service, authenticity guard, formatter, review constructor and
review resolver with a stubbed provider. Unexpected external fetches throw.

| Measurement | Result | Meaning |
| --- | ---: | --- |
| Unsupported probes in source-only materialization | 0 / 23 | The source-only choice did not promote these generated claims into their targeted fields. |
| Faithful candidates available after explicit review | 7 / 7 | Supported paraphrases and unchanged source-retention controls remain usable. |
| Unsupported candidates retained by default resolution without risk confirmation | 0 / 23 | Flagged suggested/edited wording falls back to the captured source until the user confirms its accuracy. |
| Flagged unsupported candidates retained after explicit risk confirmation | 7 / 23 | The user can still choose a claim after checking it; the checkbox is an acknowledgement, not proof. |
| Default-resolution semantic diagnostic | 30 pass, 0 fail | The deterministic gate closes the seven known semantic cases without rejecting the seven faithful controls. |

Full observations, source evidence, proposal text and per-field source-only values
are in [the post-review JSON](./factual-tailoring-post-review.json).
The [pre-fix baseline](./factual-tailoring-baseline.json) and
[post-guard, pre-review snapshot](./factual-tailoring-current.json) are preserved
unchanged. Their old `serviceRetained` measurement described the then-direct
service output. The new report instead names
`candidateRetainedAfterExplicitAcceptance` and `sourceOnlyRetained` separately.

The seven flagged cases include invented seniority, reassigned numbers and units,
unsupported tools and affiliations, reversed negation, invented language
proficiency, and unsupported certification claims. The four written-out/scale
quantity probes remain source-only through the earlier literal guard. This small
hand-labeled adversarial corpus is not a real-model benchmark, estimated error
rate, complete claim inventory, or proof that all future outputs are safe.

## Additional boundary regressions

The tests execute real helper functions and shared review component callbacks.
They verify:

- No preselected AI wording and no unresolved review accepted as a committed resume.
- Original, suggested and exact edited text choices; retaining originals for
  remaining items does not discard deliberate earlier choices.
- Decisions bind to the unique review identity, so an old decision map cannot
  approve a different proposal using the same field ID.
- Duplicate-tenure/index mismatches do not create a proposal for the wrong source record.
- Model root `summary`, publication flags, ownership, revision and forged review
  metadata cannot enter the source-only base through the former alias fallback.
- Empty edited descriptions stay empty through legacy aliases and actual DOCX/PDF
  text materialization; old formatting checklists are discarded after resolution.
- Duplicate completion is single-flight; failed completion retains choices; stale
  callbacks and replacement reviews cannot reuse old local choices.
- Real SSR includes labelled edit controls, fieldsets, a live status and an
  explicitly unverified suggestion label. SSR is not a mobile-browser layout test.
- High-risk suggestions expose the reason(s) they were flagged and an accessible
  accuracy checkbox. Completion remains disabled until the user either keeps the
  original or confirms the flagged wording; direct resolver callers also fail
  closed to the captured original when confirmation is absent.

The signed-number export regression also checks actual PDF text operations,
actual DOCX XML and the rendered template: `-20%` remains negative, while
whitespace-delimited list markers are removed once. PDF extraction and a rendered
page were inspected locally. Inequality and approximation symbols and candidate
caveats are retained. Struck-through wording remains visible for manual cleanup;
it is not silently converted into an unqualified claim.

## Reproduce without provider calls

```sh
node --test tests/factualTailoringBenchmark.test.js tests/factualTailoringReview.test.js tests/resumeTailoringReviewIntegrity.test.js tests/resumeTailoringReviewUi.test.js tests/resumeExportMeaning.test.js
node tests/benchmarks/factual-tailoring.mjs --assert-safe
```

The first command passed the focused review suite. The second now exits 0: it
tests the default resolver path after the high-risk gate, not model factuality.
The explicit-risk-confirmation counter and the seven flagged case IDs are in
[the immutable snapshot](./factual-tailoring-post-risk-gate.json). No paid AI
call, browser CLI run, deployment or employer submission was performed for this
evidence.

## Combined local release-check snapshot

Historical note: the subsequent [production-loading audit](production-loading.md)
found that this earlier build passed compilation mechanics while containing
development React. That guarantee was not covered by the checks below. The
corrected production wrapper, dependency graph and three actual-build regressions
now pass with the later **615-test** suite; the earlier count remains historical.

After the review flow and its account-scoped memory recovery were integrated,
the frozen-source verification passed:

- `npm test`: **548 passed**, zero failed, skipped or cancelled.
- Global ESLint, `tsc --noEmit`, repository hygiene, function configuration and
  `git diff --check`.
- `npm audit`: **zero vulnerabilities**.
- Production Vite build and public-route prerender: **1,208 modules**, 16.82 seconds
  for the Vite build. Its only warning was an empty Stripe chunk.
- Chrome and Firefox production extension builds.
- All **18 Edge entrypoint** Deno typechecks and **3 native Deno runtime tests**.

The strict semantic benchmark was rerun separately and still exited 1 with the
same **19 passes / 11 failures**; the new JSON evidence matched the rerun exactly.
The final source checks include the save-receipt, generator-copy, source-privacy,
contact-field and premium-expiry output-access regression follow-ups. Already
authorized work stays accessible while new generation remains blocked after
entitlement expires. Dependencies, extension sources and
Edge code were unchanged after their passing checks listed above.
The earlier isolated **35-migration** PostgreSQL proof remains separate evidence;
no database work or SQL rerun occurred in this verification. Browser CLI/MCP
automation was not run, and no production or provider actions were performed.
