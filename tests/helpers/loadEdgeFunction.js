import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));

// Run the real handler with injected services. Unmocked outbound requests and
// remote imports throw, so these regression tests never touch production.
export function loadEdgeFunction(relativePath, { env = {}, imports = {}, fetch, resolveDns, expose = [], globals = {} } = {}) {
  let handler;
  const cache = new Map();
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    // CommonJS VM execution has no native import.meta. Preserve the module's
    // file URL for static assets while keeping the isolated harness strict.
    const source = readFileSync(filename, 'utf8').replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(filename).href));
    const { outputText } = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const require = (specifier) => {
      if (Object.hasOwn(imports, specifier)) return imports[specifier];
      if (/^(https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts|std\/http\/server\.ts)$/.test(specifier)) {
        return { serve: (value) => { handler = value; } };
      }
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), specifier));
      throw new Error(`Unmocked Edge Function import: ${specifier}`);
    };
    const testExports = filename === path.resolve(root, relativePath) && expose.length
      ? `\nObject.assign(exports, { ${expose.join(', ')} });` : '';
    vm.runInNewContext(`${outputText}${testExports}`, {
      module, exports: module.exports, require,
      Deno: { env: { get: (name) => env[name] }, resolveDns },
      Request, Response, Headers, URL, URLSearchParams, AbortController, AbortSignal,
      TextEncoder, TextDecoder, crypto, btoa, atob, setTimeout, clearTimeout,
      fetch: fetch || (() => { throw new Error('Unexpected outbound request in Edge Function test'); }),
      console: { log() {}, warn() {}, error() {} },
      ...globals,
    }, { filename });
    return module.exports;
  };
  const exports = load(path.resolve(root, relativePath));
  return { handler, exports };
}

export function queryResult(result, calls = []) {
  const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'gte', 'order', 'limit']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.single = query.maybeSingle = () => Promise.resolve(result);
  return query;
}
