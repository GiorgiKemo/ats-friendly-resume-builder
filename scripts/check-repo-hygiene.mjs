import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenEnvFiles = trackedFiles.filter((file) => (
  /^\.env($|\.)/.test(file) &&
  file !== '.env.example'
));

if (forbiddenEnvFiles.length) {
  console.error(`Tracked env files are not allowed: ${forbiddenEnvFiles.join(', ')}`);
  process.exit(1);
}

const forbiddenSupabaseSnapshot = trackedFiles.find((file) => file === 'supabase/schema.sql' && existsSync(file));
if (forbiddenSupabaseSnapshot) {
  console.error('supabase/schema.sql is not allowed; deploy from migrations instead.');
  process.exit(1);
}

const nestedSupabaseConfig = trackedFiles.find((file) => file.startsWith('supabase/supabase/') && existsSync(file));
if (nestedSupabaseConfig) {
  console.error('Nested supabase/supabase files are not allowed.');
  process.exit(1);
}
