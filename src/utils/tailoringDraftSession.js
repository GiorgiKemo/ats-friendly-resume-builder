// Pending tailoring is deliberately memory-only: route changes preserve it, logout does not.
export function createTailoringDraftSession(ownerId) {
  let active = true;
  const records = new Map();
  const listeners = new Set();
  const valid = (flow, userId) => active && Boolean(ownerId) && userId === ownerId && ['enhanced', 'quick'].includes(flow);
  const emit = () => listeners.forEach((listener) => listener());
  return {
    activate() { active = true; },
    deactivate() { active = false; records.clear(); listeners.clear(); },
    read(flow, userId) { return valid(flow, userId) ? records.get(flow) || null : null; },
    write(flow, userId, record, expectedRunId = null) {
      if (!valid(flow, userId) || record?.userId !== ownerId || !record?.runId) return false;
      if (expectedRunId && records.get(flow)?.runId !== expectedRunId) return false;
      records.set(flow, record);
      emit();
      return true;
    },
    clear(flow, userId, expectedRunId) {
      if (!valid(flow, userId) || records.get(flow)?.runId !== expectedRunId) return false;
      records.delete(flow);
      emit();
      return true;
    },
    subscribe(listener) { if (!active) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    hasPending() { return active && records.size > 0; },
  };
}
