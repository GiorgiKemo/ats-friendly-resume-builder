const snapshot = (value) => value == null ? null : JSON.parse(JSON.stringify(value));
const sameVersion = (left, right) => (left?.id || null) === (right?.id || null)
  && (left?.revision || null) === (right?.revision || null);

// Memory only: profile answers and third-party contact details must not be
// silently added to persistent browser storage. A store belongs to one account.
export const createProfileDraftSession = (ownerId) => {
  let draft = null;
  let receipt = null;
  let sequence = 0;
  let active = true;
  const listeners = new Set();
  const owns = (userId) => Boolean(active && ownerId && userId === ownerId);
  return {
    activate: () => { active = true; },
    deactivate: () => { active = false; draft = null; receipt = null; listeners.clear(); },
    sequence: (userId) => owns(userId) ? sequence : 0,
    reconcileLoad: (userId, loadedProfile, startedAtSequence) => {
      if (!owns(userId) || !receipt || receipt.sequence <= startedAtSequence) return loadedProfile;
      const sameRecord = loadedProfile?.id && loadedProfile.id === receipt.profile.id
        && loadedProfile.revision < receipt.profile.revision;
      const createdDuringLoad = !loadedProfile && !receipt.submittedProfile.id;
      return sameRecord || createdDuringLoad ? snapshot(receipt.profile) : loadedProfile;
    },
    subscribe: (userId, listener) => {
      if (!owns(userId)) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read: (userId) => owns(userId) ? snapshot(draft) : null,
    write: (userId, next) => {
      if (!owns(userId)) return false;
      draft = snapshot(next);
      return true;
    },
    clear: (userId) => { if (owns(userId)) draft = null; },
    acknowledge: (userId, submittedProfile, metadata) => {
      if (!owns(userId)) return;
      const acceptedProfile = { ...snapshot(submittedProfile), id: metadata.profile_id, revision: metadata.revision, updatedAt: metadata.updated_at };
      if (!receipt || receipt.profile.id !== acceptedProfile.id || receipt.profile.revision < acceptedProfile.revision) {
        receipt = { sequence: ++sequence, profile: acceptedProfile, submittedProfile: snapshot(submittedProfile) };
      }
      if (!draft || !sameVersion(draft.profileData, submittedProfile)) return;
      const hasNewerEdits = JSON.stringify(draft.profileData) !== JSON.stringify(submittedProfile)
        || Object.values(draft.entryDrafts || {}).some((entry) => entry?.pending);
      if (!hasNewerEdits) draft = null;
      else {
        draft.profileData = { ...draft.profileData, id: metadata.profile_id, revision: metadata.revision, updatedAt: metadata.updated_at };
        draft.hasUnsavedChanges = true;
      }
      for (const listener of listeners) listener({ submittedProfile: snapshot(submittedProfile), metadata: snapshot(metadata), hasNewerEdits });
    },
  };
};

export const hasSameProfileVersion = sameVersion;
