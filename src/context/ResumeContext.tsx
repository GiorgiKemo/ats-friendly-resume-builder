import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { saveResume, getUserResumes, getResumeById as getResumeByIdFromSupabase, deleteResume as deleteResumeFromSupabase } from '../services/supabaseService.js';
import { logError } from '../services/monitoringService.js';
import { useSubscription } from './SubscriptionContext.jsx';
import { safeSetTimeout } from '../utils/security.js';
import { AtsIssue, ResumeDataForATS, AtsRuleTier, AtsSeverity } from '../types/atsTypes.js'; // Added AtsSeverity
import { checkResumeWithAts, calculateAtsScore } from '../services/atsRulesEngine.js';
import { supabase } from '../services/supabase.js'; // Import supabase client
import { deriveResumeTitle } from '../utils/resumeTitle.js';
import { mapResumeData } from '../utils/resumeDataMapper.js';
import { createResumeDraftStore } from '../utils/resumeDraftStore.js';


interface SaveResumeResponse {
  resume_id: string;
  revision: number;
  updated_at: string;
}

interface ResumeDraft {
  key: string;
  ownerId: string;
  resumeId: string;
  baseRevision: number | null;
  resume: Resume;
  editedAt: number;
}

interface SaveConflict {
  resumeId: string;
  kind: 'remote' | 'recovery';
  serverRevision: number | null;
}

interface ResumeBranch {
  resumeId: string;
  revision: number | null;
  serverRevision: number | null;
  blocked: boolean;
}

interface RawWorkExperienceItem {
  id?: string;
  jobTitle?: string;
  title?: string;
  position?: string;
  role?: string;
  responsibilities?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
}

interface RawEducationItem {
  id?: string;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  current?: boolean;
}

interface RawSkillItem {
  name?: string;
}

interface RawCertificationItem {
  id?: string;
  name?: string;
  issuer?: string;
  date?: string;
  description?: string;
}

interface RawProjectItem {
  id?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  url?: string;
  technologies?: string | string[];
}

interface ResumeProfessionalLinks {
  linkedin: string;
  github: string;
  portfolio: string;
  other: string;
}

interface ResumePersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  website: string;
  portfolio: string;
  github: string;
  other: string;
  location: string;
  jobTitle: string;
  summary: string;
  professionalLinks: ResumeProfessionalLinks;
}

type ResumePersonalInfoInput = Partial<ResumePersonalInfo> & {
  full_name?: string;
  professionalSummary?: string;
  otherLink?: string;
  professionalLinks?: Partial<ResumeProfessionalLinks>;
};

const initialProfessionalLinks: ResumeProfessionalLinks = {
  linkedin: '',
  github: '',
  portfolio: '',
  other: '',
};

const initialPersonalInfo: ResumePersonalInfo = {
  fullName: '',
  email: '',
  phone: '',
  linkedin: '',
  website: '',
  portfolio: '',
  github: '',
  other: '',
  location: '',
  jobTitle: '',
  summary: '',
  professionalLinks: { ...initialProfessionalLinks },
};

const normalizeResumePersonalInfo = (personalInfo: ResumePersonalInfoInput = {}): ResumePersonalInfo => {
  const professionalLinks: Partial<ResumeProfessionalLinks> = personalInfo.professionalLinks || {};
  const linkedin = personalInfo.linkedin || professionalLinks.linkedin || '';
  const website = personalInfo.website || personalInfo.portfolio || professionalLinks.portfolio || '';
  const portfolio = personalInfo.portfolio || personalInfo.website || professionalLinks.portfolio || '';
  const github = personalInfo.github || professionalLinks.github || '';
  const other = personalInfo.other || personalInfo.otherLink || professionalLinks.other || '';

  return {
    fullName: personalInfo.fullName || personalInfo.full_name || '',
    email: personalInfo.email || '',
    phone: personalInfo.phone || '',
    linkedin,
    website,
    portfolio,
    github,
    other,
    location: personalInfo.location || '',
    jobTitle: personalInfo.jobTitle || '',
    summary: personalInfo.summary || personalInfo.professionalSummary || '',
    professionalLinks: {
      ...initialProfessionalLinks,
      ...professionalLinks,
      linkedin,
      github,
      portfolio,
      other,
    },
  };
};

export interface Resume {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  createdAt?: string;
  updatedAt?: string;
  revision?: number | null;
  personalInfo: ResumePersonalInfo;
  workExperience: Record<string, unknown>[];
  education: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  additionalSections: Record<string, unknown>[];
  selectedTemplate: string;
  selectedFont: string;
}

export const initialResumeState: Resume = {
  id: '',
  title: '',
  description: '',
  isPublic: false,
  revision: null,
  personalInfo: {
    ...initialPersonalInfo,
    professionalLinks: { ...initialProfessionalLinks },
  },
  workExperience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  additionalSections: [],
  selectedTemplate: 'basic',
  selectedFont: 'Arial',
};

interface ResumeContextType {
  resumes: Resume[];
  currentResume: Resume;
  initialResumeState: Resume;
  loading: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
  saveConflict: SaveConflict | null;
  recoveryDrafts: ResumeDraft[];
  draftBackupAvailable: boolean;
  recoverDraft: (key: string) => boolean;
  discardRecoveryDraft: (key: string) => void;
  restoreNewResumeDraft: () => boolean;
  reloadSavedResume: () => Promise<Resume>;
  fetchUserResumes: () => Promise<void>;
  createResume: (resumeData?: Resume) => Promise<Resume>;
  getResumeById: (resumeId: string) => Promise<Resume>;
  updateResume: (resumeId: string, updates: Partial<Resume>) => Promise<Resume>;
  deleteResume: (resumeId: string) => Promise<void>;
  updateCurrentResume: (updates: Partial<Resume>, autoSave?: boolean, forceReset?: boolean) => void;
  // ATS Checker State
  atsIssues: AtsIssue[];
  atsScore: number | null;
  atsLoading: boolean;
  runAtsCheck: (jobDescriptionText?: string) => Promise<void>;
}

const defaultContextValue: ResumeContextType = {
  resumes: [],
  currentResume: initialResumeState,
  initialResumeState,
  loading: false,
  error: null,
  fetchUserResumes: async () => { },
  createResume: async () => initialResumeState,
  getResumeById: async () => initialResumeState,
  updateResume: async () => initialResumeState,
  deleteResume: async () => { },
  updateCurrentResume: () => { },
  hasUnsavedChanges: false,
  saveConflict: null,
  recoveryDrafts: [],
  draftBackupAvailable: true,
  recoverDraft: () => false,
  discardRecoveryDraft: () => {},
  restoreNewResumeDraft: () => false,
  reloadSavedResume: async () => initialResumeState,
  // ATS Checker Defaults
  atsIssues: [],
  atsScore: null,
  atsLoading: false,
  runAtsCheck: async () => { },
};

const ResumeContext = createContext<ResumeContextType>(defaultContextValue);

export const ResumeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [currentResume, setCurrentResume] = useState<Resume>(initialResumeState);
  const currentResumeRef = useRef(currentResume);
  currentResumeRef.current = currentResume;
  const editVersionRef = useRef(0);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const loadRequestRef = useRef(0);
  const fetchRequestRef = useRef(0);
  const activeUserIdRef = useRef(user?.id);
  const renderedUserIdRef = useRef(user?.id);
  renderedUserIdRef.current = user?.id;
  const mountedRef = useRef(true);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const branchRef = useRef<ResumeBranch>({ resumeId: '', revision: null, serverRevision: null, blocked: false });
  const draftStoreRef = useRef<ReturnType<typeof createResumeDraftStore> | null>(null);
  const draftOwnerRef = useRef(user?.id);
  if (!draftStoreRef.current || draftOwnerRef.current !== user?.id) {
    draftOwnerRef.current = user?.id;
    draftStoreRef.current = createResumeDraftStore({ ownerId: user?.id });
  }
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<ResumeDraft[]>([]);
  const [draftBackupAvailable, setDraftBackupAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [_isCreatingNewForAutosave, setIsCreatingNewForAutosave] = useState(false);
  const isCreatingRef = useRef(false);

  // ATS State
  const [atsIssues, setAtsIssues] = useState<AtsIssue[]>([]);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);

  const getAutosavePreference = useCallback((resumeId?: string) => {
    if (typeof window === 'undefined') return false;
    try {
      if (resumeId) {
        const stored = localStorage.getItem(`autosave_${resumeId}`);
        if (stored !== null) return stored === 'true';
      }
      const globalPreference = localStorage.getItem('autosave_global');
      if (globalPreference !== null) return globalPreference === 'true';
    } catch (error) {
      console.warn('Failed to read autosave preference:', error);
    }
    return true;
  }, []);

  const saveDraftToLocal = useCallback((resume: Resume) => {
    if (!mountedRef.current || renderedUserIdRef.current !== user?.id) return;
    setDraftBackupAvailable(Boolean(draftStoreRef.current?.save(resume)));
  }, [user?.id]);

  const isCurrentAccount = useCallback(() => mountedRef.current && renderedUserIdRef.current === user?.id, [user?.id]);


  const fetchUserResumes = useCallback(async (): Promise<void> => {
    const requestId = ++fetchRequestRef.current;
    const requestedUserId = user?.id;
    const isCurrentFetch = () => mountedRef.current
      && requestId === fetchRequestRef.current
      && renderedUserIdRef.current === requestedUserId
      && activeUserIdRef.current === requestedUserId;
    try {
      setLoading(true);
      setError(null);
      const fetched = user ? await getUserResumes() : [];
      if (!isCurrentFetch()) return;
      const list: Resume[] = fetched.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: deriveResumeTitle(r),
        description: (r.description as string) || initialResumeState.description,
        isPublic: Boolean(r.is_public ?? initialResumeState.isPublic),
        createdAt: (r.created_at as string) || undefined,
        updatedAt: (r.updated_at as string) || undefined,
        revision: r.revision as number,
        personalInfo: normalizeResumePersonalInfo((r.personal_info || {}) as ResumePersonalInfoInput),
        workExperience: initialResumeState.workExperience,
        education: initialResumeState.education,
        skills: initialResumeState.skills,
        certifications: initialResumeState.certifications,
        projects: initialResumeState.projects,
        additionalSections: initialResumeState.additionalSections,
        selectedTemplate: (r.selected_template as string) || initialResumeState.selectedTemplate,
        selectedFont: initialResumeState.selectedFont,
      }));
      setResumes(list);
    } catch (e) {
      if (isCurrentFetch()) {
        await logError(e as Error, 'resume.fetchUserResumes');
        if (isCurrentFetch()) setError('Failed to load your resumes. Please try again.');
      }
    } finally {
      if (isCurrentFetch()) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeUserIdRef.current !== user?.id) {
      activeUserIdRef.current = user?.id;
      setResumes([]);
      setCurrentResume(initialResumeState);
      currentResumeRef.current = initialResumeState;
      editVersionRef.current += 1;
      loadRequestRef.current += 1;
      branchRef.current = { resumeId: '', revision: null, serverRevision: null, blocked: false };
      clearTimeout(autosaveTimerRef.current);
      setSaveConflict(null);
      setRecoveryDrafts([]);
      setDraftBackupAvailable(true);
      setHasUnsavedChanges(false);
      setLoading(false);
      setError(null);
      setAtsScore(null);
      setAtsIssues([]);
    }
    if (user) fetchUserResumes();
    else setResumes([]);
  }, [user, fetchUserResumes]);

  // Clean up autosave timer on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    };
  }, []);

  const createResume = useCallback(async (data: Resume = initialResumeState): Promise<Resume> => {
    const version = editVersionRef.current;
    const previousId = currentResumeRef.current.id;
    const branch = branchRef.current;
    const draftStore = draftStoreRef.current;
    try {
      setLoading(true);
      setError(null);
      if (!isPremium && resumes.length >= 3) throw new Error('Free plan limit reached');
      if (!user?.id || activeUserIdRef.current !== user.id) throw new Error('Sign in again before saving a resume.');
      const payload = { ...data };
      payload.title = deriveResumeTitle(payload);
      const savedResumeObject = await saveResume(payload, null, user.id) as SaveResumeResponse;
      if (!savedResumeObject || !savedResumeObject.resume_id) {
        throw new Error('Failed to create resume: No valid ID returned.');
      }
      const newResumeData: Resume = {
        ...payload,
        id: savedResumeObject.resume_id,
        revision: savedResumeObject.revision,
        updatedAt: savedResumeObject.updated_at,
        personalInfo: normalizeResumePersonalInfo(payload.personalInfo),
      };
      if (isCurrentAccount() && branchRef.current === branch && currentResumeRef.current.id === previousId) {
        const hasNewerEdits = editVersionRef.current !== version;
        const currentWithId = hasNewerEdits
          ? { ...currentResumeRef.current, id: newResumeData.id, revision: newResumeData.revision, updatedAt: newResumeData.updatedAt }
          : newResumeData;
        branchRef.current = { resumeId: newResumeData.id, revision: savedResumeObject.revision, serverRevision: savedResumeObject.revision, blocked: false };
        setSaveConflict(null);
        setCurrentResume(currentWithId);
        currentResumeRef.current = currentWithId;
        setHasUnsavedChanges(hasNewerEdits);
        if (hasNewerEdits) saveDraftToLocal(currentWithId);
        // A copy must not discard the original resume's unsaved recovery point.
        if (!previousId) draftStore?.clear('');
        setRecoveryDrafts(draftStore?.list(newResumeData.id) || []);
      }
      const newResumeSummary: Resume = {
        ...initialResumeState, // Ensure all fields are present
        id: newResumeData.id,
        revision: newResumeData.revision,
        updatedAt: newResumeData.updatedAt,
        title: newResumeData.title,
        description: newResumeData.description || '',
        isPublic: newResumeData.isPublic || false,
        personalInfo: normalizeResumePersonalInfo(newResumeData.personalInfo),
        selectedTemplate: newResumeData.selectedTemplate || initialResumeState.selectedTemplate,
      };
      if (isCurrentAccount()) {
        setResumes(prevResumes => [newResumeSummary, ...prevResumes.filter(r => r.id !== newResumeSummary.id)]);
        fetchUserResumes().catch(fetchError => console.error("Error fetching resumes after create:", fetchError));
      }
      return newResumeData;
    } catch (e) {
      // Do not send the candidate's resume payload to telemetry. Resume data can
      // contain contact details, employment history, and other sensitive content;
      // the error context only needs the account and operation metadata.
      await logError(e as Error, 'resume.create', { userId: user?.id, resumeId: 'new' });
      if (isCurrentAccount() && branchRef.current === branch) {
        setError((e as Error).message);
        setHasUnsavedChanges(true);
      }
      throw e;
    } finally {
      if (isCurrentAccount()) setLoading(false);
    }
  }, [user, isPremium, resumes.length, fetchUserResumes, saveDraftToLocal, isCurrentAccount]);

  const loadResume = useCallback(async (resumeId: string, ignoreDraft = false): Promise<Resume> => {
    const requestId = ++loadRequestRef.current;
    const version = ++editVersionRef.current;
    const previousBranch = branchRef.current;
    const branch: ResumeBranch = { resumeId,
      revision: previousBranch.resumeId === resumeId ? previousBranch.revision : null,
      serverRevision: previousBranch.resumeId === resumeId ? previousBranch.serverRevision : null,
      blocked: true };
    branchRef.current = branch;
    const draftStore = draftStoreRef.current;
    clearTimeout(autosaveTimerRef.current);
    try {
      setLoading(true);
      setError(null);
      const result = await getResumeByIdFromSupabase(resumeId);
      if (!result) throw new Error('Resume not found or empty data returned');

      const defaultEmptyArray = [] as Record<string, unknown>[];

      const resumeData: Resume = {
        id: result.id || '',
        title: deriveResumeTitle(result),
        description: result.description || '',
        isPublic: result.is_public || false,
        createdAt: result.created_at || undefined,
        updatedAt: result.updated_at || undefined,
        revision: result.revision,
        personalInfo: normalizeResumePersonalInfo((result.personal_info || {}) as ResumePersonalInfoInput),
        workExperience: Array.isArray(result.work_experience) ? result.work_experience.map((item: RawWorkExperienceItem) => ({
          ...item, id: item.id || crypto.randomUUID(), jobTitle: item.jobTitle || item.title || item.position || item.role || '', company: item.company || '', location: item.location || '', startDate: item.startDate || '', endDate: item.endDate || '', current: item.current || false, description: item.description || item.responsibilities || ''
        })) : defaultEmptyArray,
        education: Array.isArray(result.education) ? result.education.map((item: RawEducationItem) => ({
          ...item, id: item.id || crypto.randomUUID(), institution: item.institution || '', degree: item.degree || '', fieldOfStudy: item.fieldOfStudy || '', location: item.location || '', startDate: item.startDate || '', endDate: item.endDate || '', current: item.current || false, description: item.description || ''
        })) : defaultEmptyArray,
        skills: Array.isArray(result.skills) ? result.skills.map((item: string | RawSkillItem) => typeof item === 'string' ? item : item.name || '') : defaultEmptyArray,
        certifications: Array.isArray(result.certifications) ? result.certifications.map((item: RawCertificationItem) => ({
          ...item, id: item.id || crypto.randomUUID(), name: item.name || '', issuer: item.issuer || '', date: item.date || '', description: item.description || ''
        })) : defaultEmptyArray,
        projects: Array.isArray(result.projects) ? result.projects.map((item: RawProjectItem) => ({
          ...item, id: item.id || crypto.randomUUID(), title: item.title || '', description: item.description || '', startDate: item.startDate || '', endDate: item.endDate || '', current: item.current || false, url: item.url || '', technologies: item.technologies || ''
        })) : defaultEmptyArray,
        additionalSections: Array.isArray(result.additional_sections) ? result.additional_sections : defaultEmptyArray,
        selectedTemplate: result.selected_template || 'basic',
        selectedFont: result.selected_font || 'Arial',
      };
      if (!isCurrentAccount() || requestId !== loadRequestRef.current || branchRef.current !== branch) return resumeData;
      if (ignoreDraft && editVersionRef.current !== version) {
        branchRef.current = previousBranch;
        setHasUnsavedChanges(true);
        throw Object.assign(new Error('You edited this resume while the saved version was loading. Your edits are preserved; reload again when ready.'), { code: 'RESUME_RELOAD_EDITED' });
      }
      branch.revision = result.revision;
      branch.serverRevision = result.revision;
      branch.blocked = false;
      if (ignoreDraft) draftStore?.clear(resumeId);
      const draft = ignoreDraft ? null : draftStore?.load(resumeId) as ResumeDraft | null;
      let loadedResume = resumeData;
      if (draft) {
        loadedResume = { ...resumeData, ...mapResumeData(draft.resume), id: resumeId, revision: draft.baseRevision,
          personalInfo: normalizeResumePersonalInfo(draft.resume.personalInfo) } as Resume;
        branch.revision = draft.baseRevision;
        branch.blocked = draft.baseRevision !== result.revision;
      }
      setSaveConflict(branch.blocked ? { resumeId, kind: 'recovery', serverRevision: result.revision } : null);
      setRecoveryDrafts(draftStore?.list(resumeId) || []);
      setHasUnsavedChanges(Boolean(draft));
      currentResumeRef.current = loadedResume;
      setCurrentResume(loadedResume);
      return loadedResume;
    } catch (e) {
      // An unsuccessful read did not establish a new editing branch. Keep the
      // previous branch usable (or conflicted) without inventing a revision.
      if (isCurrentAccount() && requestId === loadRequestRef.current && branchRef.current === branch) {
        branchRef.current = previousBranch;
      }
      await logError(e as Error, 'resume.getResumeById', { userId: user?.id, resumeId });
      if (isCurrentAccount() && requestId === loadRequestRef.current) {
        setError((e as { code?: string }).code === 'RESUME_RELOAD_EDITED' ? (e as Error).message : 'Failed to load resume.');
      }
      throw e;
    } finally {
      if (isCurrentAccount() && requestId === loadRequestRef.current) setLoading(false);
    }
  }, [user, isCurrentAccount]);

  const getResumeById = useCallback((resumeId: string) => loadResume(resumeId), [loadResume]);
  const reloadSavedResume = useCallback(() => loadResume(currentResumeRef.current.id, true), [loadResume]);

  const recoverDraft = useCallback((key: string): boolean => {
    const branch = branchRef.current;
    const draft = draftStoreRef.current?.list(branch.resumeId).find((record: ResumeDraft) => record.key === key) as ResumeDraft | undefined;
    if (!isCurrentAccount() || !draft) return false;
    clearTimeout(autosaveTimerRef.current);
    loadRequestRef.current += 1;
    editVersionRef.current += 1;
    const recovered = { ...initialResumeState, ...mapResumeData(draft.resume), id: branch.resumeId, revision: draft.baseRevision,
      personalInfo: normalizeResumePersonalInfo(draft.resume.personalInfo) } as Resume;
    branchRef.current = { ...branch, revision: draft.baseRevision, blocked: Boolean(branch.resumeId) };
    setSaveConflict(branch.resumeId ? { resumeId: branch.resumeId, kind: 'recovery', serverRevision: branch.serverRevision } : null);
    currentResumeRef.current = recovered;
    setCurrentResume(recovered);
    saveDraftToLocal(recovered);
    setHasUnsavedChanges(true);
    setError(null);
    return true;
  }, [isCurrentAccount, saveDraftToLocal]);

  const discardRecoveryDraft = useCallback((key: string) => {
    const resumeId = branchRef.current.resumeId;
    if (!isCurrentAccount()) return;
    draftStoreRef.current?.removeRecovery(key, resumeId);
    setRecoveryDrafts(draftStoreRef.current?.list(resumeId) || []);
  }, [isCurrentAccount]);

  const restoreNewResumeDraft = useCallback((): boolean => {
    if (!isCurrentAccount()) return false;
    clearTimeout(autosaveTimerRef.current);
    loadRequestRef.current += 1;
    editVersionRef.current += 1;
    branchRef.current = { resumeId: '', revision: null, serverRevision: null, blocked: false };
    const draft = draftStoreRef.current?.load('') as ResumeDraft | null;
    setRecoveryDrafts(draftStoreRef.current?.list('') || []);
    setSaveConflict(null);
    if (!draft) {
      setHasUnsavedChanges(false);
      return false;
    }
    const recovered = { ...initialResumeState, ...mapResumeData(draft.resume), id: '', revision: null,
      personalInfo: normalizeResumePersonalInfo(draft.resume.personalInfo) } as Resume;
    currentResumeRef.current = recovered;
    setCurrentResume(recovered);
    setHasUnsavedChanges(true);
    return true;
  }, [isCurrentAccount]);

  const updateResume = useCallback(async (resumeId: string, updates: Partial<Resume>): Promise<Resume> => {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = undefined;
    const version = editVersionRef.current;
    const snapshot = currentResumeRef.current;
    const branch = branchRef.current;
    const draftStore = draftStoreRef.current;
    const payload = { ...(snapshot.id === resumeId ? snapshot : initialResumeState), ...updates, id: resumeId };
    try {
      setLoading(true);
      setError(null);
      // A queued edit inherits only acknowledgments from its own loaded branch.
      // Never fetch the latest revision and attach it to an older local snapshot.
      const save = saveQueueRef.current.catch(() => undefined).then(async () => {
        if (!isCurrentAccount()) throw new Error('Account changed before the resume could be saved.');
        if (branchRef.current !== branch || branch.resumeId !== resumeId) throw new Error('Resume changed before it could be saved.');
        if (branch.blocked) throw Object.assign(new Error('Resolve the saved-version conflict before saving.'), { code: 'RESUME_CONFLICT' });
        let saved: SaveResumeResponse;
        try {
          saved = await saveResume(payload, resumeId, user?.id, branch.revision ?? undefined) as SaveResumeResponse;
        } catch (failure) {
          if (isCurrentAccount() && branchRef.current === branch && (failure as { code?: string }).code === 'RESUME_CONFLICT') {
            branch.blocked = true;
            clearTimeout(autosaveTimerRef.current);
            setSaveConflict({ resumeId, kind: 'remote', serverRevision: null });
          }
          throw failure;
        }
        const updatedResume = { ...payload, revision: saved.revision, updatedAt: saved.updated_at };
        if (isCurrentAccount() && branchRef.current === branch) {
          // Advance before the next queued request starts, including when the
          // user has typed more text while this snapshot was in flight.
          branch.revision = saved.revision;
          branch.serverRevision = saved.revision;
          const hasNewerEdits = editVersionRef.current !== version;
          const visibleResume = hasNewerEdits
            ? { ...currentResumeRef.current, revision: saved.revision, updatedAt: saved.updated_at }
            : updatedResume;
          currentResumeRef.current = visibleResume;
          setCurrentResume(visibleResume);
          setHasUnsavedChanges(hasNewerEdits);
          if (hasNewerEdits) saveDraftToLocal(visibleResume);
          else draftStore?.clear(resumeId);
          setResumes((previous) => previous.map((resume) => resume.id === resumeId ? updatedResume : resume));
        }
        return updatedResume;
      });
      saveQueueRef.current = save;
      return await save;
    } catch (e) {
      await logError(e as Error, 'resume.update', { userId: user?.id, resumeId });
      if (isCurrentAccount() && branchRef.current === branch) {
        setError((e as { code?: string }).code === 'RESUME_CONFLICT'
          ? 'A different saved version exists. Your edits are preserved; reload it or save your edits as a copy.'
          : 'Failed to update resume.');
        setHasUnsavedChanges(true);
      }
      throw e;
    } finally {
      if (isCurrentAccount() && branchRef.current === branch) setLoading(false);
    }
  }, [user, isCurrentAccount, saveDraftToLocal]);

  const deleteResume = useCallback(async (resumeId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await deleteResumeFromSupabase(resumeId);
      await fetchUserResumes();
    } catch (e) {
      await logError(e as Error, 'resume.delete', { userId: user?.id, resumeId });
      setError('Failed to delete resume.');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user, fetchUserResumes]);

  const updateCurrentResume = useCallback(async (updates: Partial<Resume>, autoSave?: boolean, forceReset = false) => {
    // Every edit supersedes the pending snapshot, including edits made after
    // autosave is disabled. Only this edit may schedule the next timer.
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = undefined;
    editVersionRef.current += 1;
    setCurrentResume(prevCurrentResume => {
      const shouldAutosave = typeof autoSave === 'boolean'
        ? autoSave
        : getAutosavePreference(prevCurrentResume?.id);
      const allowAutoCreate = autoSave === true;
      // Use the explicit forceReset flag instead of reference equality
      if (forceReset) {
        clearTimeout(autosaveTimerRef.current);
        loadRequestRef.current += 1;
        branchRef.current = { resumeId: '', revision: null, serverRevision: null, blocked: false };
        setSaveConflict(null);
        setRecoveryDrafts([]);
        const newState = JSON.parse(JSON.stringify(initialResumeState)); // Ensure deep copy for reset
        if (allowAutoCreate && user && !newState.id && !isCreatingRef.current) {
          isCreatingRef.current = true;
          setIsCreatingNewForAutosave(true);
          createResume({ ...newState, title: deriveResumeTitle(newState) })
            .catch(e => {
              console.error('Error during implicit resume creation on reset:', e);
              setHasUnsavedChanges(true);
            })
            .finally(() => { isCreatingRef.current = false; setIsCreatingNewForAutosave(false); });
        }
        currentResumeRef.current = newState;
        return newState;
      }

      // For partial updates:
      const getSafePrev = (): Resume => {
        const hardcodedInitialFallback: Resume = {
          id: '', title: '', description: '', isPublic: false,
          personalInfo: normalizeResumePersonalInfo(),
          workExperience: [], education: [], skills: [], certifications: [], projects: [], additionalSections: [],
          selectedTemplate: 'basic', selectedFont: 'Arial'
        };

        let effectiveInitialState: Resume;
        try {
          effectiveInitialState = initialResumeState && typeof initialResumeState === 'object'
            ? JSON.parse(JSON.stringify(initialResumeState))
            : JSON.parse(JSON.stringify(hardcodedInitialFallback));
          effectiveInitialState.personalInfo = normalizeResumePersonalInfo(effectiveInitialState.personalInfo);
        } catch (e) {
          console.error("Error initializing effectiveInitialState in getSafePrev:", e);
          effectiveInitialState = JSON.parse(JSON.stringify(hardcodedInitialFallback));
          effectiveInitialState.personalInfo = normalizeResumePersonalInfo(effectiveInitialState.personalInfo);
        }

        if (prevCurrentResume && typeof prevCurrentResume === 'object' && prevCurrentResume.id !== undefined) {
          try {
            const prevCopy = JSON.parse(JSON.stringify(prevCurrentResume));
            const result = { ...effectiveInitialState, ...prevCopy };

            result.personalInfo = normalizeResumePersonalInfo({
              ...(effectiveInitialState.personalInfo || {}),
              ...(prevCopy.personalInfo && typeof prevCopy.personalInfo === 'object' ? prevCopy.personalInfo : {}),
              professionalLinks: {
                ...(effectiveInitialState.personalInfo?.professionalLinks || {}),
                ...(prevCopy.personalInfo?.professionalLinks || {}),
              },
            });
            return result;
          } catch (e) {
            console.error("Error processing prevCurrentResume in getSafePrev:", e);
            effectiveInitialState.personalInfo = normalizeResumePersonalInfo(effectiveInitialState.personalInfo);
            return effectiveInitialState;
          }
        }
        effectiveInitialState.personalInfo = normalizeResumePersonalInfo(effectiveInitialState.personalInfo);
        return effectiveInitialState;
      };
      const safePrev = getSafePrev() || JSON.parse(JSON.stringify(initialResumeState)); // Ultimate fallback for safePrev

      // Start with safePrev, then layer updates for all properties.
      const updatedStateIntermediate = {
        ...safePrev, // safePrev is now guaranteed to be an object
        ...updates,
      };

      // Now, specifically construct personalInfo, ensuring it's always an object.
      const mergedPersonalInfo = ((updates || {}).personalInfo || {}) as ResumePersonalInfoInput;

      const updatedState: Resume = {
        ...(mapResumeData(updatedStateIntermediate) as Resume),
        // Form updates cannot silently rebase a stale draft onto a new version.
        revision: branchRef.current.revision,
        personalInfo: normalizeResumePersonalInfo({
          ...(safePrev.personalInfo || {}),
          ...mergedPersonalInfo,
          professionalLinks: {
            ...(safePrev.personalInfo?.professionalLinks || {}),
            ...(mergedPersonalInfo.professionalLinks || {}),
          },
        }),
      };

      if (updatedState.id !== branchRef.current.resumeId) {
        branchRef.current = { resumeId: updatedState.id, revision: null, serverRevision: null, blocked: Boolean(updatedState.id) };
        updatedState.revision = null;
        setSaveConflict(updatedState.id ? { resumeId: updatedState.id, kind: 'recovery', serverRevision: null } : null);
      }
      saveDraftToLocal(updatedState);

      if (shouldAutosave && user && !branchRef.current.blocked) {
        const effectivePrevId = prevCurrentResume?.id; // Use optional chaining for safety
        if (!effectivePrevId && allowAutoCreate && !isCreatingRef.current) {
          isCreatingRef.current = true;
          setIsCreatingNewForAutosave(true);
          createResume({ ...updatedState, title: deriveResumeTitle(updatedState) })
            .then(newResumeWithId => {
              if (newResumeWithId?.id && currentResumeRef.current.id === newResumeWithId.id
                && currentResumeRef.current !== newResumeWithId) {
                return updateResume(newResumeWithId.id, currentResumeRef.current);
              }
              return undefined;
            })
            .catch(e => {
              console.error('Error during implicit resume creation:', e);
              setHasUnsavedChanges(true);
            })
            .finally(() => { isCreatingRef.current = false; setIsCreatingNewForAutosave(false); });
        } else if (effectivePrevId) {
          clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = safeSetTimeout(() => {
            autosaveTimerRef.current = undefined;
            if (!getAutosavePreference(effectivePrevId)) return;
            updateResume(effectivePrevId, updatedState as Partial<Resume>)
              .catch(e => {
                console.error("Autosave update for existing resume failed:", e);
                setHasUnsavedChanges(true);
              });
          }, 2000);
        }
      }
      currentResumeRef.current = updatedState;
      return updatedState;
    });
    setHasUnsavedChanges(true);
  }, [user, createResume, updateResume, setIsCreatingNewForAutosave, setHasUnsavedChanges, getAutosavePreference, saveDraftToLocal]);

  const runAtsCheck = useCallback(async (jobDescriptionText?: string) => {
    setAtsLoading(true);
    setError(null); // Clear previous general errors
    try {
      // 1. Transform currentResume to ResumeDataForATS
      // This is a simplified transformation. More complex logic might be needed for
      // parsedStructure and formattingMetadata based on selectedTemplate, etc.
      const resumeToAnalyze: ResumeDataForATS = {
        fileType: 'in-platform', // Since it's from the builder
        rawText: [ // Concatenate relevant text fields for basic rawText analysis
          currentResume.personalInfo.fullName,
          currentResume.personalInfo.email,
          currentResume.personalInfo.phone,
          currentResume.personalInfo.linkedin,
          currentResume.personalInfo.location,
          currentResume.personalInfo.jobTitle,
          currentResume.personalInfo.summary,
          ...(currentResume.workExperience?.map(exp => `${exp.jobTitle} ${exp.company} ${exp.description}`) || []),
          ...(currentResume.education?.map(edu => `${edu.degree} ${edu.institution} ${edu.description}`) || []),
          ...(currentResume.skills?.map(skill => typeof skill === 'string' ? skill : (skill as { name: string }).name) || []),
          ...(currentResume.projects?.map(proj => `${proj.title} ${proj.description}`) || []),
          ...(currentResume.certifications?.map(cert => `${cert.name} ${cert.issuer}`) || []),
          currentResume.description, // Overall resume description/summary
        ].filter(Boolean).join(' '),
        contactInfo: {
          name: currentResume.personalInfo.fullName,
          phone: currentResume.personalInfo.phone,
          email: currentResume.personalInfo.email,
          // linkedin, github, portfolio, address can be added if available in currentResume.personalInfo
        },
        experience: currentResume.workExperience?.map((exp: RawWorkExperienceItem) => ({
          jobTitle: exp.jobTitle,
          company: exp.company,
          description: exp.description,
          // Map other fields like startDate, endDate if needed by rules
        })),
        education: currentResume.education?.map((edu: RawEducationItem) => ({
          degree: edu.degree,
          institution: edu.institution,
          description: edu.description,
          // Map other fields
        })),
        skills: {
          items: currentResume.skills
            ?.map((skill: string | RawSkillItem) => (typeof skill === 'string' ? { name: skill } : { name: skill.name || '' }))
            .filter((skill): skill is { name: string } => Boolean(skill.name))
        },
        summary: { text: currentResume.personalInfo.summary },
        // sections: currentResume.additionalSections, // This needs careful mapping
        parsedStructure: { // These would ideally be dynamically determined
          isSingleColumnLayout: !['modern', 'creative_columns'].includes(currentResume.selectedTemplate), // Example
          // usesTablesForLayout: currentResume.selectedTemplate === 'classic_table' // Example
          // contactInfoLocation: 'body-top' // Default assumption
        },
        formattingMetadata: {
          fontsUsed: [currentResume.selectedFont || 'Arial'],
          // bodyTextFontSizes: [11], // Example, would need to come from template or settings
        },
        sectionHeadings: [
          "Contact Information", "Work Experience", "Education", "Skills",
          ...(currentResume.projects?.length ? ["Projects"] : []),
          ...(currentResume.certifications?.length ? ["Certifications"] : []),
          ...(currentResume.additionalSections?.map((sec: { title?: string }) => sec.title) || [])
        ].filter(Boolean) as string[],
      };

      const currentTier = isPremium ? AtsRuleTier.Premium : AtsRuleTier.Basic;
      const issues = checkResumeWithAts(resumeToAnalyze, currentTier, jobDescriptionText);

      // If premium and job description is provided, call the keyword analysis function
      if (isPremium && jobDescriptionText && jobDescriptionText.trim() !== '') {
        try {
          const { data: keywordAnalysis, error: keywordError } = await supabase.functions.invoke('analyze-keywords', {
            body: {
              resumeText: resumeToAnalyze.rawText || '',
              jobDescriptionText: jobDescriptionText,
            },
          });

          if (keywordError) {
            throw new Error(`Keyword analysis failed: ${keywordError.message}`);
          }

          if (keywordAnalysis?.error) {
            throw new Error(keywordAnalysis.error);
          }

          if (keywordAnalysis) {
            // Integrate keyword analysis results into issues
            // Example: Add issues for missing keywords
            if (keywordAnalysis.missingKeywords && keywordAnalysis.missingKeywords.length > 0) {
              keywordAnalysis.missingKeywords.forEach((kw: string) => {
                issues.push({
                  ruleId: `KO_JD_MISSING_${kw.replace(/\s+/g, '_').toUpperCase()}`,
                  description: `Keyword from job description missing: "${kw}"`,
                  severity: AtsSeverity.Medium, // Or High, depending on importance
                  suggestion: `Consider adding the keyword "${kw}" to your resume if relevant to your experience. For example, incorporate it into your skills section or work experience descriptions.`,
                  impactExplanation: `The keyword "${kw}" was found in the job description but seems to be missing or underrepresented in your resume. ATS may filter out resumes lacking key terms.`,
                  category: 'Keyword Optimization (Premium)',
                  tier: AtsRuleTier.Premium,
                });
              });
            }
            // Add more issues based on keywordAnalysis.matchedKeywords (e.g., density) if needed
            // For example, if a keyword is in JD but has low frequency in resume:
            if (keywordAnalysis.matchedKeywords) {
              keywordAnalysis.matchedKeywords.forEach((match: { keyword: string; resumeFrequency: number; jdFrequency: number }) => {
                if (match.jdFrequency > 1 && match.resumeFrequency < match.jdFrequency / 2 && match.resumeFrequency < 2) { // Arbitrary threshold
                  issues.push({
                    ruleId: `KO_JD_LOW_FREQ_${match.keyword.replace(/\s+/g, '_').toUpperCase()}`,
                    description: `Keyword "${match.keyword}" may be underrepresented.`,
                    severity: AtsSeverity.Low,
                    suggestion: `The keyword "${match.keyword}" appears ${match.jdFrequency} times in the job description but only ${match.resumeFrequency} time(s) in your resume. If this is a key skill, consider elaborating on it.`,
                    impactExplanation: `While present, the keyword "${match.keyword}" appears less frequently in your resume than in the job description. Ensure its prominence matches its importance.`,
                    category: 'Keyword Optimization (Premium)',
                    tier: AtsRuleTier.Premium,
                  });
                }
              });
            }
          }
        } catch (nlpError) {
          console.error("Error during keyword analysis:", nlpError);
          const errorMessage = nlpError instanceof Error ? nlpError.message : '';
          const isAiUnavailable = errorMessage.toLowerCase().includes('temporarily unavailable');
          // Add an issue to inform the user about the keyword analysis failure
          issues.push({
            ruleId: 'KO_JD_ANALYSIS_FAILED',
            description: isAiUnavailable
              ? 'AI keyword analysis is temporarily unavailable.'
              : 'Keyword analysis against job description could not be completed.',
            severity: AtsSeverity.Medium,
            suggestion: isAiUnavailable
              ? 'AI keyword analysis is currently down and we are working on a fix. Basic ATS checks were still performed.'
              : 'There was an issue analyzing keywords against the job description. Basic ATS checks were still performed. You can try again or proceed without keyword analysis.',
            impactExplanation: 'The premium keyword analysis feature encountered an error. This does not affect other ATS checks.',
            category: 'Keyword Optimization (Premium)',
            tier: AtsRuleTier.Premium,
          });
          // Optionally, log this error more formally
          await logError(nlpError as Error, 'resume.runAtsCheck.keywordAnalysis', { userId: user?.id, resumeId: currentResume.id });
        }
      }

      const score = calculateAtsScore(issues);

      setAtsIssues(issues);
      setAtsScore(score);
    } catch (e) {
      await logError(e as Error, 'resume.runAtsCheck', { userId: user?.id, resumeId: currentResume.id });
      setError('Failed to run ATS check. Please try again.'); // Set specific ATS error
      setAtsIssues([]); // Clear issues on general error
      setAtsScore(null); // Clear score on general error
    } finally {
      setAtsLoading(false);
    }
  }, [currentResume, user, isPremium]);


  const value: ResumeContextType = {
    resumes,
    currentResume,
    initialResumeState,
    loading,
    error,
    hasUnsavedChanges,
    saveConflict,
    recoveryDrafts,
    draftBackupAvailable,
    recoverDraft,
    discardRecoveryDraft,
    restoreNewResumeDraft,
    reloadSavedResume,
    fetchUserResumes,
    createResume,
    getResumeById,
    updateResume,
    deleteResume,
    updateCurrentResume,
    // ATS Values
    atsIssues,
    atsScore,
    atsLoading,
    runAtsCheck,
  };

  return React.createElement(ResumeContext.Provider, { value }, children);
};

export function useResume(): ResumeContextType {
  const context = useContext(ResumeContext);
  if (!context) {
    throw new Error('useResume must be used within a ResumeProvider');
  }
  return context;
}
