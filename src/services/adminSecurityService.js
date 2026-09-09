import { supabase } from './supabase';

export const getAdminMfaState = async () => {
  const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (assuranceError || factorsError) throw new Error('MFA status could not be loaded.');
  return {
    currentLevel: assurance?.currentLevel || 'aal1',
    nextLevel: assurance?.nextLevel || 'aal1',
    factors: [
      ...(Array.isArray(factors?.totp) ? factors.totp : []),
      ...(Array.isArray(factors?.phone) ? factors.phone : []),
    ],
  };
};

export const enrollAdminTotp = async () => {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ResumeATS admin authenticator' });
  if (error || !data?.id) throw new Error('Authenticator setup could not be started.');
  return data;
};

export const verifyAdminTotp = async (factorId, code) => {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge?.id) throw new Error('Authenticator challenge could not be created.');
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: `${code || ''}`.trim() });
  if (error) throw new Error('That authenticator code was not accepted.');
  return getAdminMfaState();
};
