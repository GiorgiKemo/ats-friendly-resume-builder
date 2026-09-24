export const remoteMigrationVersions = (rows) => new Set(rows
  .map((row) => (typeof row === 'string' ? row : row?.remote ?? row?.version_id ?? row?.version))
  .filter((version) => typeof version === 'string' && /^\d{14}$/.test(version)));
