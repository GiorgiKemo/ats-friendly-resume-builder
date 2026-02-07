import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { saveResume, getUserResumes, getResumeById as getResumeByIdFromSupabase, deleteResume as deleteResumeFromSupabase } from '../services/supabaseService.js';
import { logError } from '../services/monitoringService.js';
import { useSubscription } from './SubscriptionContext.jsx';
import { safeSetTimeout } from '../utils/security.js';
import { AtsIssue, ResumeDataForATS, AtsRuleTier, AtsSeverity } from '../types/atsTypes.js'; // Added AtsSeverity
import { checkResumeWithAts, calculateAtsScore } from '../services/atsRulesEngine.js';
import { supabase } from '../services/supabase.js'; // Import supabase client


declare global {
  interface Window { autosaveTimer?: number; }
}

interface SaveResumeResponse {
  resume_id: string;
}

interface RawWorkExperienceItem {
  id?: string;
  jobTitle?: string;
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
}

export interface Resume {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  createdAt?: string;
  updatedAt?: string;
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    linkedin: string;
    location: string;
  };
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
  personalInfo: {
    fullName: '',
    email: '',
    phone: '',
    linkedin: '',
    location: '',
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
  loading: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
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
  loading: false,
  error: null,
  fetchUserResumes: async () => { },
  createResume: async () => initialResumeState,
  getResumeById: async () => initialResumeState,
  updateResume: async () => initialResumeState,
  deleteResume: async () => { },
  updateCurrentResume: () => { },
  hasUnsavedChanges: false,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isCreatingNewForAutosave, setIsCreatingNewForAutosave] = useState(false);

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

  const getDraftKey = useCallback((resumeId?: string) => {
    if (resumeId) return `resume_draft_${resumeId}`;
    const userId = user?.id || 'guest';
    return `resume_draft_new_${userId}`;
  }, [user?.id]);

  const saveDraftToLocal = useCallback((resume: Resume, resumeId?: string) => {
    if (typeof window === 'undefined') return;
    try {
      const key = getDraftKey(resumeId || resume.id);
      const payload = {
        resume,
        updatedAt: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save local resume draft:', error);
    }
  }, [getDraftKey]);

  const loadDraftFromLocal = useCallback((resumeId?: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const key = getDraftKey(resumeId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as { resume: Resume; updatedAt: number };
    } catch (error) {
      console.warn('Failed to load local resume draft:', error);
      return null;
    }
  }, [getDraftKey]);

  const clearDraftFromLocal = useCallback((resumeId?: string) => {
    if (typeof window === 'undefined') return;
    try {
      const key = getDraftKey(resumeId);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to clear local resume draft:', error);
    }
  }, [getDraftKey]);


  const fetchUserResumes = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const fetched = user ? await getUserResumes() : [];
      const list: Resume[] = fetched.map((r: any) => ({
        id: r.id,
        title: r.title || initialResumeState.title,
        description: r.description || initialResumeState.description,
        isPublic: r.is_public || initialResumeState.isPublic,
        personalInfo: {
          fullName: r.personal_info?.fullName || initialResumeState.personalInfo.fullName,
          email: r.personal_info?.email || initialResumeState.personalInfo.email,
          phone: r.personal_info?.phone || initialResumeState.personalInfo.phone,
          linkedin: r.personal_info?.linkedin || initialResumeState.personalInfo.linkedin,
          location: r.personal_info?.location || initialResumeState.personalInfo.location,
        },
        workExperience: initialResumeState.workExperience,
        education: initialResumeState.education,
        skills: initialResumeState.skills,
        certifications: initialResumeState.certifications,
        projects: initialResumeState.projects,
        additionalSections: initialResumeState.additionalSections,
        selectedTemplate: r.selected_template || initialResumeState.selectedTemplate,
        selectedFont: initialResumeState.selectedFont,
      }));
      setResumes(list);
    } catch (e) {
      await logError(e as Error, 'resume.fetchUserResumes');
      setError('Failed to load your resumes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, loadDraftFromLocal, clearDraftFromLocal]);

  useEffect(() => {
    if (user) {
      fetchUserResumes();
    } else {
      setResumes([]);
    }
  }, [user, fetchUserResumes]);

  const createResume = useCallback(async (data: Resume = initialResumeState): Promise<Resume> => {
    try {
      setLoading(true);
      setError(null);
      if (!isPremium && resumes.length >= 3) throw new Error('Free plan limit reached');
      const payload = { ...data };
      if (!payload.title || payload.title.trim() === '') {
        payload.title = 'Untitled Resume';
      }
      setHasUnsavedChanges(false);
      const savedResumeObject = await saveResume(payload) as SaveResumeResponse;
      if (!savedResumeObject || !savedResumeObject.resume_id) {
        throw new Error('Failed to create resume: No valid ID returned.');
      }
      const newResumeData: Resume = { ...payload, id: savedResumeObject.resume_id };
      setCurrentResume(newResumeData);
      clearDraftFromLocal();
      const newResumeSummary: Resume = {
        ...initialResumeState, // Ensure all fields are present
        id: newResumeData.id,
        title: newResumeData.title,
        description: newResumeData.description || '',
        isPublic: newResumeData.isPublic || false,
        personalInfo: {
          fullName: newResumeData.personalInfo?.fullName || '',
          email: '',
          phone: '',
          linkedin: '',
          location: newResumeData.personalInfo?.location || '',
        },
        selectedTemplate: newResumeData.selectedTemplate || initialResumeState.selectedTemplate,
      };
      setResumes(prevResumes => [newResumeSummary, ...prevResumes.filter(r => r.id !== newResumeSummary.id)]);
      fetchUserResumes().catch(fetchError => console.error("Error fetching resumes after create:", fetchError));
      return newResumeData;
    } catch (e) {
      await logError(e as Error, 'resume.create', { userId: user?.id, resumeData: data });
      setError((e as Error).message);
      setHasUnsavedChanges(true);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user, isPremium, resumes.length, fetchUserResumes, clearDraftFromLocal]);

  const getResumeById = useCallback(async (resumeId: string): Promise<Resume> => {
    try {
      setLoading(true);
      setError(null);
      setHasUnsavedChanges(false);
      const result = await getResumeByIdFromSupabase(resumeId);
      if (!result) throw new Error('Resume not found or empty data returned');

      const defaultEmptyPersonalInfo = { fullName: '', email: '', phone: '', linkedin: '', location: '' };
      const defaultEmptyArray = [] as Record<string, unknown>[];

      const resumeData: Resume = {
        id: result.id || '',
        title: result.title || 'Untitled Resume',
        description: result.description || '',
        isPublic: result.is_public || false,
        createdAt: result.created_at || undefined,
        updatedAt: result.updated_at || undefined,
        personalInfo: {
          ...(initialResumeState?.personalInfo || defaultEmptyPersonalInfo),
          ...(result.personal_info || {})
        },
        workExperience: Array.isArray(result.work_experience) ? result.work_experience.map((item: RawWorkExperienceItem) => ({
          id: item.id || crypto.randomUUID(), jobTitle: item.jobTitle || '', company: item.company || '', location: item.location || '', startDate: item.startDate || '', endDate: item.endDate || '', current: item.current || false, description: item.description || ''
        })) : defaultEmptyArray,
        education: Array.isArray(result.education) ? result.education.map((item: RawEducationItem) => ({
          id: item.id || crypto.randomUUID(), institution: item.institution || '', degree: item.degree || '', fieldOfStudy: item.fieldOfStudy || '', location: item.location || '', startDate: item.startDate || '', endDate: item.endDate || '', description: item.description || ''
        })) : defaultEmptyArray,
        skills: Array.isArray(result.skills) ? result.skills.map((item: string | RawSkillItem) => typeof item === 'string' ? item : item.name || '') : defaultEmptyArray,
        certifications: Array.isArray(result.certifications) ? result.certifications.map((item: RawCertificationItem) => ({
          id: item.id || crypto.randomUUID(), name: item.name || '', issuer: item.issuer || '', date: item.date || '', description: item.description || ''
        })) : defaultEmptyArray,
        projects: Array.isArray(result.projects) ? result.projects.map((item: RawProjectItem) => ({
          id: item.id || crypto.randomUUID(), title: item.title || '', description: item.description || '', startDate: item.startDate || '', endDate: item.endDate || '', current: item.current || false, url: item.url || ''
        })) : defaultEmptyArray,
        additionalSections: Array.isArray(result.additional_sections) ? result.additional_sections : defaultEmptyArray,
        selectedTemplate: result.selected_template || 'basic',
        selectedFont: result.selected_font || 'Arial',
      };
      const serverUpdatedAt = result.updated_at ? new Date(result.updated_at).getTime() : 0;
      const draft = loadDraftFromLocal(resumeId);
      if (draft && draft.resume) {
        if (!serverUpdatedAt || draft.updatedAt > serverUpdatedAt) {
          const mergedResume: Resume = {
            ...resumeData,
            ...draft.resume,
            id: resumeData.id,
            personalInfo: {
              ...(resumeData.personalInfo || {}),
              ...(draft.resume.personalInfo || {}),
            },
          };
          setCurrentResume(mergedResume);
          return mergedResume;
        }
        clearDraftFromLocal(resumeId);
      }

      setCurrentResume(resumeData);
      return resumeData;
    } catch (e) {
      await logError(e as Error, 'resume.getResumeById', { userId: user?.id, resumeId });
      setError('Failed to load resume.');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateResume = useCallback(async (resumeId: string, updates: Partial<Resume>): Promise<Resume> => {
    try {
      setLoading(true);
      setError(null);
      await saveResume(updates, resumeId);
      setHasUnsavedChanges(false);
      const updatedResume = await getResumeById(resumeId);
      setHasUnsavedChanges(false);
      await fetchUserResumes();
      return updatedResume;
    } catch (e) {
      await logError(e as Error, 'resume.update', { userId: user?.id, resumeId });
      setError('Failed to update resume.');
      setHasUnsavedChanges(true);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user, getResumeById, fetchUserResumes]);

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
    setCurrentResume(prevCurrentResume => {
      const shouldAutosave = typeof autoSave === 'boolean'
        ? autoSave
        : getAutosavePreference(prevCurrentResume?.id);
      const allowAutoCreate = autoSave === true;
      // Use the explicit forceReset flag instead of reference equality
      if (forceReset) {
        const newState = JSON.parse(JSON.stringify(initialResumeState)); // Ensure deep copy for reset
        if (allowAutoCreate && user && !newState.id && !isCreatingNewForAutosave) {
          setIsCreatingNewForAutosave(true);
          createResume({ ...newState, title: newState.title || 'Untitled Resume' })
            .then(() => setHasUnsavedChanges(false))
            .catch(e => {
              console.error('Error during implicit resume creation on reset:', e);
              setHasUnsavedChanges(true);
            })
            .finally(() => setIsCreatingNewForAutosave(false));
        }
        return newState;
      }

      // For partial updates:
      const getSafePrev = (): Resume => {
        const defaultPersonalInfo = { fullName: '', email: '', phone: '', linkedin: '', location: '' };
        const hardcodedInitialFallback: Resume = {
          id: '', title: '', description: '', isPublic: false,
          personalInfo: { ...defaultPersonalInfo },
          workExperience: [], education: [], skills: [], certifications: [], projects: [], additionalSections: [],
          selectedTemplate: 'basic', selectedFont: 'Arial'
        };

        let effectiveInitialState: Resume;
        try {
          effectiveInitialState = initialResumeState && typeof initialResumeState === 'object'
            ? JSON.parse(JSON.stringify(initialResumeState))
            : JSON.parse(JSON.stringify(hardcodedInitialFallback));
          if (typeof effectiveInitialState.personalInfo !== 'object' || effectiveInitialState.personalInfo === null) {
            effectiveInitialState.personalInfo = { ...defaultPersonalInfo };
          }
        } catch (e) {
          console.error("Error initializing effectiveInitialState in getSafePrev:", e);
          effectiveInitialState = JSON.parse(JSON.stringify(hardcodedInitialFallback));
          // Ensure personalInfo is an object even in this catch block
          if (typeof effectiveInitialState.personalInfo !== 'object' || effectiveInitialState.personalInfo === null) {
            effectiveInitialState.personalInfo = { ...defaultPersonalInfo };
          }
        }

        if (prevCurrentResume && typeof prevCurrentResume === 'object' && prevCurrentResume.id !== undefined) {
          try {
            const prevCopy = JSON.parse(JSON.stringify(prevCurrentResume));
            const result = { ...effectiveInitialState, ...prevCopy };

            result.personalInfo = {
              ...defaultPersonalInfo,
              ...(effectiveInitialState.personalInfo || {}),
              ...(prevCopy.personalInfo && typeof prevCopy.personalInfo === 'object' ? prevCopy.personalInfo : {}),
            };
            return result;
          } catch (e) {
            console.error("Error processing prevCurrentResume in getSafePrev:", e);
            // Ensure personalInfo is valid on the fallback
            if (typeof effectiveInitialState.personalInfo !== 'object' || effectiveInitialState.personalInfo === null) {
              effectiveInitialState.personalInfo = { ...defaultPersonalInfo };
            }
            return effectiveInitialState;
          }
        }
        // Ensure personalInfo is valid on the fallback
        if (typeof effectiveInitialState.personalInfo !== 'object' || effectiveInitialState.personalInfo === null) {
          effectiveInitialState.personalInfo = { ...defaultPersonalInfo };
        }
        return effectiveInitialState;
      };
      const safePrev = getSafePrev() || JSON.parse(JSON.stringify(initialResumeState)); // Ultimate fallback for safePrev

      // Start with safePrev, then layer updates for all properties.
      const updatedStateIntermediate = {
        ...safePrev, // safePrev is now guaranteed to be an object
        ...updates,
      };

      // Now, specifically construct personalInfo, ensuring it's always an object.
      const mergedPersonalInfo = {
        ...(initialResumeState.personalInfo || {}), // Base with initial state's personal info
        ...(safePrev.personalInfo || {}),           // Overlay with safePrev's personal info
        ...((updates || {}).personalInfo || {}),            // Finally, overlay with updates' personal info
      };

      const updatedState: Resume = {
        ...updatedStateIntermediate,
        personalInfo: mergedPersonalInfo, // Ensure personalInfo is the fully merged object
      };

      if (shouldAutosave) {
        saveDraftToLocal(updatedState, prevCurrentResume?.id || updatedState.id);
      }

      if (shouldAutosave && user) {
        const effectivePrevId = prevCurrentResume?.id; // Use optional chaining for safety
        if (!effectivePrevId && allowAutoCreate && !isCreatingNewForAutosave) {
          setIsCreatingNewForAutosave(true);
          createResume({ ...updatedState, title: updatedState.title || 'Untitled Resume' })
            .then(newResumeWithId => {
              if (newResumeWithId && newResumeWithId.id) {
                setHasUnsavedChanges(false);
              } else {
                setHasUnsavedChanges(true);
              }
            })
            .catch(e => {
              console.error('Error during implicit resume creation:', e);
              setHasUnsavedChanges(true);
            })
            .finally(() => setIsCreatingNewForAutosave(false));
        } else if (effectivePrevId) {
          clearTimeout(window.autosaveTimer);
          window.autosaveTimer = safeSetTimeout(() => {
            updateResume(effectivePrevId, updatedState as Partial<Resume>)
              .then(() => setHasUnsavedChanges(false))
              .catch(e => {
                console.error("Autosave update for existing resume failed:", e);
                setHasUnsavedChanges(true);
              });
          }, 2000);
        }
      }
      return updatedState;
    });
    setHasUnsavedChanges(true);
  }, [user, createResume, updateResume, isCreatingNewForAutosave, setIsCreatingNewForAutosave, setHasUnsavedChanges, getAutosavePreference, saveDraftToLocal]);

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
        experience: currentResume.workExperience?.map((exp: any) => ({ // Use 'any' for exp if type is Record<string, unknown>
          jobTitle: exp.jobTitle,
          company: exp.company,
          description: exp.description,
          // Map other fields like startDate, endDate if needed by rules
        })),
        education: currentResume.education?.map((edu: any) => ({
          degree: edu.degree,
          institution: edu.institution,
          description: edu.description,
          // Map other fields
        })),
        skills: {
          items: currentResume.skills?.map((skill: any) => (typeof skill === 'string' ? { name: skill } : { name: skill.name }))
        },
        summary: { text: currentResume.description }, // Assuming top-level description is summary
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
          ...(currentResume.additionalSections?.map((sec: any) => sec.title) || [])
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
          // Add an issue to inform the user about the keyword analysis failure
          issues.push({
            ruleId: 'KO_JD_ANALYSIS_FAILED',
            description: 'Keyword analysis against job description could not be completed.',
            severity: AtsSeverity.Medium,
            suggestion: 'There was an issue analyzing keywords against the job description. Basic ATS checks were still performed. You can try again or proceed without keyword analysis.',
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
    loading,
    error,
    hasUnsavedChanges,
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
