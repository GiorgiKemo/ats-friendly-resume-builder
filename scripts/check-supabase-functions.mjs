import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const functionsDir = path.join(process.cwd(), 'supabase', 'functions');
const functionEntryPoints = readdirSync(functionsDir)
  .map((name) => path.join(name, 'index.ts'))
  .filter((entry) => {
    try {
      return statSync(path.join(functionsDir, entry)).isFile();
    } catch {
      return false;
    }
  });

if (functionEntryPoints.length === 0) {
  console.error('No Supabase Edge Function entrypoints found.');
  process.exit(1);
}

const result = spawnSync('deno', ['check', '--config', 'deno.json', 'types.d.ts', ...functionEntryPoints], {
  cwd: functionsDir,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
