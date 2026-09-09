import { useCallback, useEffect, useRef, useState } from 'react';
import { jsx as createElement } from 'react/jsx-runtime';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';

export const useConfirmDialog = () => {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const settle = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(result);
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = resolve;
    setRequest(options);
  }), []);

  useEffect(() => () => {
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  const dialog = createElement(ConfirmDialog, {
    request,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  });

  return { confirm, confirmDialog: dialog };
};
