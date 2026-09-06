import { useRef, useState } from 'react';

export const isProfileEntryDraftPending = (draft) => draft?.pending === true;

const hasValue = (value) => {
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some(hasValue);
  return value != null && value !== '';
};

// The page owns controlled drafts so a section can unmount without committing
// incomplete entries to the saved profile. Standalone section usage stays local.
export const useProfileEntryDraft = ({ initialItem, draft, onDraftChange }) => {
  const initialRef = useRef({ currentItem: { ...initialItem }, editIndex: null, formError: '', pending: false });
  const [localDraft, setLocalDraft] = useState(initialRef.current);
  const value = (onDraftChange ? draft : localDraft) || initialRef.current;
  const currentRef = useRef(value);
  currentRef.current = value;

  const write = (update) => {
    const next = { ...currentRef.current, ...update };
    next.pending = next.editIndex !== null || Object.entries(next.currentItem).some(([key, item]) =>
      hasValue(item) && JSON.stringify(item) !== JSON.stringify(initialRef.current.currentItem[key]));
    currentRef.current = next;
    if (onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
  };

  const resetForm = () => {
    currentRef.current = initialRef.current;
    if (onDraftChange) onDraftChange(null);
    else setLocalDraft(initialRef.current);
  };

  return {
    ...value,
    setCurrentItem: (update) => write({ currentItem: typeof update === 'function' ? update(currentRef.current.currentItem) : update }),
    setEditIndex: (editIndex) => write({ editIndex }),
    setFormError: (formError) => write({ formError }),
    resetForm,
  };
};
