import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';
import { createTailoringDraftSession } from '../utils/tailoringDraftSession';

const TailoringDraftContext = createContext(null);

export const TailoringDraftProvider = ({ children }) => {
  const { user } = useAuth();
  const drafts = useMemo(() => createTailoringDraftSession(user?.id || null), [user?.id]);
  useLayoutEffect(() => {
    drafts.activate();
    const warnBeforeUnload = (event) => {
      if (!drafts.hasPending()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      drafts.deactivate();
    };
  }, [drafts]);
  return <TailoringDraftContext.Provider value={drafts}>{children}</TailoringDraftContext.Provider>;
};

TailoringDraftProvider.propTypes = { children: PropTypes.node.isRequired };
export const useTailoringDraft = () => useContext(TailoringDraftContext);
