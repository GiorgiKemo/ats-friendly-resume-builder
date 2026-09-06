import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { isResumeTailoringReview, resolveResumeTailoringReview } from '../../utils/resumeTailoringReview';

const decisionLabel = { original: 'Keeping original', suggested: 'Using suggestion', edited: 'Using your edit' };

const ResumeTailoringReview = ({ review, onComplete, disabled = false, actionLabel = 'Use reviewed resume', decisions, onDecisionsChange }) => {
  const [localDecisions, setLocalDecisions] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const headingId = useId();
  const headingRef = useRef(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const requestRef = useRef(null);
  const choices = onDecisionsChange ? (decisions || {}) : localDecisions;
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const valid = isResumeTailoringReview(review);
  const choiceFor = (id) => choices[id]?.reviewId === review?.reviewId ? choices[id] : undefined;
  const pending = valid ? review.suggestions.filter(({ id }) => !choiceFor(id)?.choice).length : 0;
  const riskPending = valid ? review.suggestions.filter(({ id, risk }) => risk?.confirmationRequired
    && choiceFor(id)?.choice !== 'original' && choiceFor(id)?.confirmRisk !== true).length : 0;
  const busy = disabled || submitting;

  useEffect(() => {
    setLocalDecisions({});
    setError('');
    setSubmitting(false);
    requestRef.current = null;
    headingRef.current?.focus();
    return () => { requestRef.current = null; };
  }, [review]);

  const updateChoices = (next) => {
    if (busy || reviewRef.current !== review) return;
    choicesRef.current = next;
    if (onDecisionsChange) onDecisionsChange(next);
    else setLocalDecisions(next);
    setError('');
  };
  const choose = (id, choice, value) => {
    const previous = choicesRef.current[id];
    const suggestion = review.suggestions.find((item) => item.id === id);
    updateChoices({ ...choicesRef.current, [id]: {
      choice, reviewId: review.reviewId,
      ...(choice === 'edited' ? { text: value } : {}),
      ...(suggestion?.risk?.confirmationRequired && previous?.confirmRisk === true ? { confirmRisk: true } : {}),
    } });
  };
  const confirmRisk = (id, confirmed) => updateChoices({
    ...choicesRef.current,
    [id]: { ...(choicesRef.current[id] || { choice: 'original' }), reviewId: review.reviewId, confirmRisk: confirmed },
  });
  const complete = async () => {
    if (busy || requestRef.current || reviewRef.current !== review) return;
    const request = {};
    requestRef.current = request;
    try {
      const resume = resolveResumeTailoringReview(review, choicesRef.current);
      setSubmitting(true);
      setError('');
      await onComplete(resume);
    } catch (failure) {
      if (requestRef.current === request) setError(failure.message || 'Your choices were kept. Please try again.');
    } finally {
      if (requestRef.current === request) { requestRef.current = null; setSubmitting(false); }
    }
  };

  if (!valid) return <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">The wording review is unavailable. Generate the draft again before saving or exporting.</p>;

  return (
    <section aria-labelledby={headingId} className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
      <div>
        <p className="mb-2 text-sm font-medium text-blue-700 dark:text-blue-300">Your facts. Your wording choices.</p>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-gray-900 outline-none dark:text-slate-100 sm:text-2xl">Review AI wording{review.targetJobTitle ? ` for ${review.targetJobTitle}` : ''}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">Compare each suggestion with your original details. Check responsibilities, tools, seniority, numbers and what each number measures. AI can add incorrect claims; choosing wording here does not verify its truth.</p>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Only your chosen wording goes into the resume. These are the source details captured for this draft, not a live view of later profile edits.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-900/60">
        <p role="status" className="text-sm font-medium text-gray-700 dark:text-slate-200">{pending ? `${pending} of ${review.suggestions.length} changes need a choice` : review.suggestions.length ? 'Every wording change has a choice' : 'No changed wording to review. Your original details are retained.'}{riskPending > 0 && ` · ${riskPending} flagged suggestion${riskPending === 1 ? '' : 's'} need an accuracy confirmation`}</p>
        {pending > 0 && <Button variant="outline" size="sm" disabled={busy} onClick={() => updateChoices({ ...choicesRef.current, ...Object.fromEntries(review.suggestions.filter(({ id }) => choicesRef.current[id]?.reviewId !== review.reviewId || !choicesRef.current[id]?.choice).map(({ id }) => [id, { choice: 'original', reviewId: review.reviewId }])) })}>Keep originals for remaining changes</Button>}
      </div>

      {review.suggestions.map((suggestion, index) => (
        <fieldset key={suggestion.id} className="min-w-0 rounded-xl border border-gray-200 p-4 dark:border-slate-600" disabled={busy}>
          <legend className="max-w-full break-words px-2 text-base font-semibold text-gray-900 dark:text-slate-100">{index + 1}. {suggestion.label}</legend>
          <p className="mb-3 text-sm font-medium text-blue-700 dark:text-blue-300">{decisionLabel[choiceFor(suggestion.id)?.choice] || 'Unreviewed — nothing selected'}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-lg bg-gray-50 p-3 dark:bg-slate-900/60">
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-200">Original wording</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-slate-300">{suggestion.original || 'No original wording in this section.'}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-950/20">
              <h3 className="mb-2 text-sm font-semibold text-blue-800 dark:text-blue-200">AI suggestion — not fact-checked</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-slate-200">{suggestion.proposed}</p>
            </div>
          </div>
          {suggestion.risk?.confirmationRequired && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Potential factual-risk claim — verify before using.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {suggestion.risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-amber-500 text-blue-600 focus:ring-blue-500" checked={choiceFor(suggestion.id)?.confirmRisk === true} disabled={busy} onChange={(event) => confirmRisk(suggestion.id, event.target.checked)} />
              <span>I confirm that this proposed wording is accurate for me.</span>
            </label>
          </div>}
          {suggestion.evidence.length > 0 && <details className="mt-3 rounded-lg border border-gray-200 px-3 dark:border-slate-700">
            <summary className="cursor-pointer py-3 text-sm font-medium text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-200">Compare with captured profile details</summary>
            <dl className="space-y-3 pb-3 text-sm text-gray-600 dark:text-slate-300">
              {suggestion.evidence.map((entry, evidenceIndex) => <div key={evidenceIndex}><dt className="break-words font-medium">{entry.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{entry.text || 'No additional description supplied.'}</dd></div>)}
            </dl>
          </details>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={choiceFor(suggestion.id)?.choice === 'original' ? 'primary' : 'outline'} size="sm" aria-pressed={choiceFor(suggestion.id)?.choice === 'original'} onClick={() => choose(suggestion.id, 'original')}>Keep original</Button>
            <Button variant={choiceFor(suggestion.id)?.choice === 'suggested' ? 'primary' : 'outline'} size="sm" aria-pressed={choiceFor(suggestion.id)?.choice === 'suggested'} onClick={() => choose(suggestion.id, 'suggested')}>Use suggestion</Button>
            <Button variant={choiceFor(suggestion.id)?.choice === 'edited' ? 'primary' : 'outline'} size="sm" aria-pressed={choiceFor(suggestion.id)?.choice === 'edited'} onClick={() => choose(suggestion.id, 'edited', choiceFor(suggestion.id)?.text ?? suggestion.proposed)}>Edit wording</Button>
          </div>
          {choiceFor(suggestion.id)?.choice === 'edited' && <div className="mt-4"><Textarea label={`Your wording — ${suggestion.label}`} id={`${headingId}-${suggestion.id}`} value={choiceFor(suggestion.id).text} onChange={(event) => choose(suggestion.id, 'edited', event.target.value)} rows={5} className="mb-0" /></div>}
        </fieldset>
      ))}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5 dark:border-slate-700">
        <Button onClick={complete} disabled={busy || pending > 0 || riskPending > 0}>{busy ? 'Working…' : actionLabel}</Button>
        <p className="text-sm text-gray-500 dark:text-slate-400">{pending ? 'Make a choice for every change to continue.' : riskPending ? 'Confirm each flagged suggestion or keep its original wording.' : 'Review the final resume again before sending it to an employer.'}</p>
      </div>
    </section>
  );
};

ResumeTailoringReview.propTypes = {
  review: PropTypes.object.isRequired, onComplete: PropTypes.func.isRequired,
  disabled: PropTypes.bool, actionLabel: PropTypes.string,
  decisions: PropTypes.object, onDecisionsChange: PropTypes.func,
};

export default ResumeTailoringReview;
