import { spawn } from 'node:child_process';

export const runPsql = (binary, args, sql) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  let error = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { error += chunk; });
  child.on('error', reject);
  // exit can precede the final stdout/stderr chunks. Resolve only after both
  // streams close, otherwise a real conflict can be misclassified in CI.
  child.on('close', (code, signal) => code === 0 ? resolve(output.trim()) : reject(new Error(
    `${error.trim() || 'psql exited without stderr'} (code=${code}, signal=${signal || 'none'})`,
  )));
  child.stdin.on('error', reject);
  child.stdin.end(sql);
});
