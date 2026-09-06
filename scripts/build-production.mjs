import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Vite must see this before resolving config/env files. A config callback runs
// too late to override a local .env that intentionally enables development.
export const buildProduction = async (options = {}) => {
  process.env.NODE_ENV = 'production';
  const { build } = await import('vite');
  return build(options);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildProduction();
}
