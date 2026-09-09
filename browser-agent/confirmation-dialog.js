(() => {
  const HOST_SELECTOR = 'resumeats-confirmation-host[data-resumeats-confirmation]';
  const DEFAULT_TITLE = 'Review data sharing before Autofill';
  const DEFAULT_CONFIRM_LABEL = 'Continue to Autofill';
  const DEFAULT_CANCEL_LABEL = 'Cancel';

  const getExistingRequest = () => document.querySelector(HOST_SELECTOR)?.__resumeatsPendingRequest || null;

  const requestConfirmation = ({
    title = DEFAULT_TITLE,
    message = '',
    confirmLabel = DEFAULT_CONFIRM_LABEL,
    cancelLabel = DEFAULT_CANCEL_LABEL,
  } = {}) => {
    if (typeof document === 'undefined') return Promise.resolve(false);

    const existingRequest = getExistingRequest();
    if (existingRequest) return existingRequest;

    const host = document.createElement('resumeats-confirmation-host');
    host.dataset.resumeatsConfirmation = 'true';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      dialog {
        box-sizing: border-box;
        width: min(32rem, calc(100vw - 2rem));
        margin: auto;
        padding: 0;
        border: 1px solid #cbd5e1;
        border-radius: 16px;
        background: #ffffff;
        color: #0f172a;
        box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      dialog::backdrop { background: rgba(15, 23, 42, .58); }
      .content { padding: 22px; }
      h2 { margin: 0; font-size: 18px; line-height: 1.35; font-weight: 700; }
      p { margin: 10px 0 0; color: #334155; font-size: 14px; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
      button { min-height: 42px; border-radius: 10px; padding: 0 14px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; cursor: pointer; font: inherit; font-size: 14px; font-weight: 650; }
      button:hover { background: #f8fafc; }
      button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
      button[data-confirm] { border-color: #2563eb; background: #2563eb; color: #ffffff; }
      button[data-confirm]:hover { background: #1d4ed8; }
      @media (prefers-color-scheme: dark) {
        dialog { border-color: #475569; background: #0f172a; color: #f8fafc; }
        p { color: #cbd5e1; }
        button { border-color: #475569; background: #1e293b; color: #f8fafc; }
        button:hover { background: #334155; }
      }
    `;

    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'resumeats-confirmation-title');
    dialog.setAttribute('aria-describedby', 'resumeats-confirmation-message');

    const content = document.createElement('div');
    content.className = 'content';
    const heading = document.createElement('h2');
    heading.id = 'resumeats-confirmation-title';
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.id = 'resumeats-confirmation-message';
    copy.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.cancel = 'true';
    cancel.textContent = cancelLabel;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.confirm = 'true';
    confirm.textContent = confirmLabel;

    actions.append(cancel, confirm);
    content.append(heading, copy, actions);
    dialog.append(content);
    shadow.append(style, dialog);

    const parent = document.body || document.documentElement;
    parent.append(host);
    host.style.pointerEvents = 'auto';

    let settled = false;
    let resolveRequest;
    const request = new Promise(resolve => { resolveRequest = resolve; });
    host.__resumeatsPendingRequest = request;

    const settle = accepted => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      host.remove();
      resolveRequest(accepted);
    };

    cancel.addEventListener('click', () => settle(false));
    confirm.addEventListener('click', () => settle(true));
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      settle(false);
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) settle(false);
    });

    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
    }

    window.requestAnimationFrame(() => cancel.focus());
    return request;
  };

  globalThis.resumeatsRequestConfirmation = requestConfirmation;
})();
