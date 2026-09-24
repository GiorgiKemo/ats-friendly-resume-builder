import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function localSupabaseEnvironment(projectRoot = process.cwd()) {
  const configPath = path.join(projectRoot, 'supabase', 'config.toml');
  const config = readFileSync(configPath, 'utf8');
  const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
  const apiBlock = config.split(/^\[api\]\s*$/m)[1]?.split(/^\[.*\]\s*$/m)[0] || '';
  const apiPort = Number(apiBlock.match(/^port\s*=\s*(\d+)/m)?.[1]);
  if (!projectId || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('Local Supabase project/API configuration is incomplete.');
  }

  const envPath = path.join(
    projectRoot,
    'supabase',
    '.temp',
    'start-secrets',
    `supabase_edge_runtime_${projectId}`,
    'env',
    'docker.env',
  );
  const needed = new Set(['SUPABASE_ANON_KEY', 'SUPABASE_INTERNAL_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  const values = new Map();
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator);
    if (!needed.has(name)) continue;
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    values.set(name, value);
  }

  const anonKey = values.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = values.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey || !serviceRoleKey) throw new Error('Local Supabase credentials are unavailable.');

  return {
    API_URL: `http://127.0.0.1:${apiPort}`,
    ANON_KEY: anonKey,
    PUBLISHABLE_KEY: values.get('SUPABASE_INTERNAL_PUBLISHABLE_KEY') || anonKey,
    SERVICE_ROLE_KEY: serviceRoleKey,
  };
}
