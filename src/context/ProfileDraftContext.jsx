import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';
import { createProfileDraftSession } from '../utils/profileDraftSession';

const ProfileDraftContext = createContext(null);

export const ProfileDraftProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || null;
  const drafts = useMemo(() => createProfileDraftSession(userId), [userId]);
  useLayoutEffect(() => {
    drafts.activate();
    const warnBeforeUnload = (event) => {
      if (!drafts.read(userId)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      drafts.deactivate();
    };
  }, [drafts, userId]);
  return <ProfileDraftContext.Provider value={drafts}>{children}</ProfileDraftContext.Provider>;
};

ProfileDraftProvider.propTypes = { children: PropTypes.node.isRequired };
export const useProfileDraft = () => useContext(ProfileDraftContext);
