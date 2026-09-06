export const viteBranch = import.meta.env.DEV ? 'MODE_PROBE_DEV' : 'MODE_PROBE_PROD';
export const nodeBranch = process.env.NODE_ENV === 'production' ? 'NODE_PROBE_PROD' : 'NODE_PROBE_DEV';
globalThis.__productionModeProbe = { viteBranch, nodeBranch };
