(() => {
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').replace(/[?:*]+$/g, '').trim();
  const entries = value => Array.isArray(value) ? value.filter(entry => entry && typeof entry.question === 'string'
    && typeof entry.answer === 'string' && entry.question.trim() && entry.answer.trim()).slice(0, 100).map(entry => ({
    question: entry.question.trim().slice(0, 500), answer: entry.answer.trim().slice(0, 4000),
    hostname: typeof entry.hostname === 'string' ? entry.hostname.trim().toLowerCase().slice(0, 253) : '',
  })) : [];
  const resolve = (question, saved, hostname) => {
    const matches = entries(saved).filter(entry => normalize(entry.question) === normalize(question)
      && (!entry.hostname || entry.hostname === hostname.toLowerCase()));
    const scoped = matches.filter(entry => entry.hostname);
    const answers = [...new Set((scoped.length ? scoped : matches).map(entry => entry.answer))];
    return answers.length === 1 ? answers[0] : '';
  };
  globalThis.ResumeATSSavedAnswers = { normalize, entries, resolve };
})();
