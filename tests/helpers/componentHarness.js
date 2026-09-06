import { loadEdgeFunction } from './loadEdgeFunction.js';

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
export const visit = (node, predicate) => {
  if (Array.isArray(node)) return node.flatMap((child) => visit(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...visit(node.props?.children, predicate)];
};
export const find = (tree, predicate) => visit(tree, predicate)[0];
export const textContent = (node) => {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'string') return node;
  return node && typeof node === 'object' ? textContent(node.props?.children) : '';
};

// Execute actual component callbacks with persistent React-like hook state.
// This is not a browser/layout renderer; services and browser APIs stay isolated.
export function componentHarness(path, { imports = {}, globals = {}, props = {}, exportName = 'default' } = {}) {
  let cursor = 0;
  let dirty = false;
  let pendingEffects = [];
  let tree;
  const hooks = [];
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]));
  const react = {
    createContext: (defaultValue) => ({ Provider: 'ContextProvider', defaultValue }),
    useContext: (context) => context.defaultValue,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { state: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].state, (update) => {
        const next = typeof update === 'function' ? update(hooks[index].state) : update;
        if (!Object.is(next, hooks[index].state)) { hooks[index].state = next; dirty = true; }
      }];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo: (callback, deps) => {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) hooks[index] = { value: callback(), deps };
      return hooks[index].value;
    },
    useEffect: (callback, deps) => {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) {
        const cleanup = hooks[index]?.cleanup;
        hooks[index] = { deps };
        pendingEffects.push(() => { cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  react.useCallback = (callback, deps) => react.useMemo(() => callback, deps);
  react.useId = () => react.useRef(`qa-id-${cursor}`).current;
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, nodeProps) => ({ type, props: nodeProps });
  const { exports } = loadEdgeFunction(path, {
    globals, imports: { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, ...imports },
  });
  const Component = exports[exportName];
  const render = () => {
    let count = 0;
    do {
      if (++count > 30) throw new Error('Unexpected render loop');
      dirty = false;
      cursor = 0;
      tree = Component(props);
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach((effect) => effect());
    } while (dirty);
    return tree;
  };
  return {
    render,
    flush: async () => { await new Promise((resolve) => setImmediate(resolve)); return render(); },
    setProps: (next) => { props = next; return render(); },
    unmount: () => hooks.forEach((hook) => hook?.cleanup?.()),
  };
}
