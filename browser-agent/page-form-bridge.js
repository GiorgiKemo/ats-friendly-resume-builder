(() => {
  if (window.__resumeatsPageWorldFormBridgeReady) return;
  window.__resumeatsPageWorldFormBridgeReady = true;

  const SOURCE = 'resumeats-browser-agent-page';
  const TARGET = 'resumeats-browser-agent-page';
  const RESPONSE_TARGET = 'resumeats-browser-agent-content';
  const phoneFieldPattern = /phone|mobile|cell|telephone|tel\b|contact number|contact no|whatsapp|numer telefonu|telefon|telefone|telefono|num(?:e|\u00e9)ro/i;
  const resumeUploadPattern = /resume|cv|curriculum|attachment|upload|select the attachment|zalacznik|za\u0142\u0105cznik|plik|dodaj plik/i;
  const capturedShadowRoots = window.__resumeatsCapturedShadowRoots || new Set();
  window.__resumeatsCapturedShadowRoots = capturedShadowRoots;

  if (!window.__resumeatsAttachShadowPatched) {
    const nativeAttachShadow = window.Element?.prototype?.attachShadow;
    if (typeof nativeAttachShadow === 'function') {
      window.__resumeatsAttachShadowPatched = true;
      window.Element.prototype.attachShadow = function attachShadowWithResumeAtsTracking(init) {
        const shadowRoot = nativeAttachShadow.call(this, init);
        capturedShadowRoots.add(shadowRoot);
        return shadowRoot;
      };
    }
  }

  const cleanText = (value = '') => `${value}`
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const normalize = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();

  const isVisible = (field) => field?.type === 'file'
    ? true
    : !!(field && (field.offsetWidth || field.offsetHeight || field.getClientRects().length));

  const collectRoots = () => {
    const roots = [];
    const visited = new Set();

    const visit = (root) => {
      if (!root || visited.has(root) || !root.querySelectorAll) return;
      visited.add(root);
      roots.push(root);

      for (const node of root.querySelectorAll('*')) {
        if (node?.shadowRoot) {
          visit(node.shadowRoot);
        }
      }
    };

    visit(document);
    capturedShadowRoots.forEach((root) => visit(root));
    return roots;
  };

  const queryAll = (selector) => collectRoots().flatMap((root) => Array.from(root.querySelectorAll(selector)));

  const getFieldSearchRoots = (field) => {
    const roots = [];
    const seen = new Set();
    const push = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    };

    push(field?.getRootNode?.());
    push(field?.ownerDocument);
    return roots;
  };

  const queryFieldRoots = (field, selector) => {
    const results = [];
    const seen = new Set();

    for (const root of getFieldSearchRoots(field)) {
      if (!root?.querySelectorAll) continue;
      for (const match of root.querySelectorAll(selector)) {
        if (seen.has(match)) continue;
        seen.add(match);
        results.push(match);
      }
    }

    return results;
  };

  const getLabelText = (field) => {
    const parts = [];

    if (field.id) {
      try {
        for (const linkedLabel of queryFieldRoots(field, `label[for="${CSS.escape(field.id)}"]`)) {
          if (linkedLabel?.textContent) parts.push(linkedLabel.textContent);
        }
      } catch {
        // Ignore invalid selectors from page-generated ids.
      }
    }

    const wrappingLabel = field.closest('label');
    if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);

    const scopedContainer = field.closest('[data-testid], [data-test], [data-cy], .field, .form-field, .application-field, .posting-requirement, fieldset');
    if (scopedContainer?.textContent) parts.push(scopedContainer.textContent);

    const labelledBy = cleanText(field.getAttribute('aria-labelledby') || '');
    if (labelledBy) {
      const labelledText = labelledBy
        .split(/\s+/)
        .map((id) => queryFieldRoots(field, `#${CSS.escape(id)}`)[0]?.textContent || '')
        .filter(Boolean)
        .join(' ');
      if (labelledText) parts.push(labelledText);
    }

    if (field.getAttribute('aria-label')) parts.push(field.getAttribute('aria-label'));
    if (field.getAttribute('placeholder')) parts.push(field.getAttribute('placeholder'));
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);

    return normalize(parts.join(' '));
  };

  const setNativeValue = (field, property, value) => {
    const view = field?.ownerDocument?.defaultView || window;
    const prototypes = [];

    if (field?.tagName === 'INPUT') prototypes.push(view.HTMLInputElement?.prototype);
    else if (field?.tagName === 'TEXTAREA') prototypes.push(view.HTMLTextAreaElement?.prototype);
    else if (field?.tagName === 'SELECT') prototypes.push(view.HTMLSelectElement?.prototype);

    prototypes.push(Object.getPrototypeOf(field));

    for (const proto of prototypes) {
      if (!proto) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, property);
      if (descriptor?.set) {
        descriptor.set.call(field, value);
        return;
      }
    }

    field[property] = value;
  };

  const dispatchFieldEvents = (field) => {
    const EventCtor = field?.ownerDocument?.defaultView?.Event || Event;
    ['input', 'change', 'blur'].forEach((eventName) => {
      field.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
    });
  };

  const buildCandidatePitch = (profile = {}) => {
    const candidate = profile?.candidate || {};
    const topSkills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).slice(0, 4) : [];
    const intro = [
      candidate.currentTitle ? `I am a ${candidate.currentTitle}` : 'I am a candidate',
      candidate.currentCompany ? `currently working at ${candidate.currentCompany}` : '',
      candidate.location ? `based in ${candidate.location}` : '',
    ].filter(Boolean).join(' ');
    const skills = topSkills.length > 0 ? `My strongest areas include ${topSkills.join(', ')}.` : '';

    return cleanText([intro, skills].filter(Boolean).join(' ')).slice(0, 900);
  };

  const resolveFieldValue = (meta, profile = {}) => {
    const candidate = profile?.candidate || {};
    const answers = profile?.answers || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const candidatePitch = buildCandidatePitch(profile);

    if (/first name|given name/.test(meta)) return candidate.firstName;
    if (/last name|surname|family name/.test(meta)) return candidate.lastName;
    if (/full name|your name|applicant name/.test(meta)) return candidate.fullName;
    if (/email|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/.test(meta)) return candidate.email;
    if (phoneFieldPattern.test(meta)) return candidate.phone;
    if (/city/.test(meta)) return locationParts[0] || candidate.location;
    if (/country|region/.test(meta)) return locationParts.at(-1) || candidate.location;
    if (/location|address/.test(meta)) return candidate.location;
    if (/linkedin/.test(meta)) return candidate.linkedin || answers.linkedinUrl;
    if (/github/.test(meta)) return candidate.github || answers.githubUrl;
    if (/portfolio/.test(meta)) return candidate.portfolio || answers.portfolioUrl;
    if (/website|personal site/.test(meta)) return candidate.website || answers.websiteUrl;
    if (/current company|employer/.test(meta)) return answers.currentCompany;
    if (/current title|job title|current role/.test(meta)) return answers.currentTitle;
    if (/work authorization|authorized to work|legally authorized/.test(meta)) return answers.workAuthorization;
    if (/sponsor|sponsorship/.test(meta)) return answers.requiresSponsorship;
    if (/years.*experience|experience.*years/.test(meta)) return answers.yearsOfExperience;
    if (/salary|compensation|expected pay|pay expectation/.test(meta)) return answers.salaryExpectation;
    if (/work setup|work model|remote|hybrid|on-site|onsite/.test(meta)) return answers.preferredWorkSetup;
    if (/cover letter|message to the hiring team|about you|tell us about yourself|why (?:are you interested|this role|do you want)/.test(meta)) return candidatePitch;
    if (/summary|professional summary|candidate summary/.test(meta)) return candidatePitch;
    if (/available|start date|notice period/.test(meta)) return answers.noticePeriod || 'Two weeks notice';

    return null;
  };

  const setFieldValue = (field, value) => {
    if (!field || value === undefined || value === null || value === '' || !isVisible(field)) return false;
    const tag = field.tagName.toLowerCase();

    if (tag === 'select') {
      const wanted = normalize(value);
      const option = Array.from(field.options).find((entry) => (
        normalize(entry.textContent || '').includes(wanted)
        || normalize(entry.value || '').includes(wanted)
        || wanted.includes(normalize(entry.textContent || ''))
      ));
      if (!option) return false;
      setNativeValue(field, 'value', option.value);
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'checkbox') {
      setNativeValue(field, 'checked', /^(true|yes|1)$/i.test(`${value}`));
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'radio') {
      const wanted = normalize(value);
      const candidates = queryFieldRoots(field, `input[type="radio"][name="${CSS.escape(field.name || '')}"]`);
      const target = candidates.find((entry) => normalize(entry.value || '') === wanted)
        || candidates.find((entry) => getLabelText(entry).includes(wanted));
      if (!target) return false;
      candidates.forEach((entry) => setNativeValue(entry, 'checked', entry === target));
      dispatchFieldEvents(target);
      return true;
    }

    field.focus?.();
    setNativeValue(field, 'value', value);
    dispatchFieldEvents(field);
    return true;
  };

  const findResumeInput = () => {
    const fileInputs = queryAll('input[type="file"]');
    if (fileInputs.length === 1) return fileInputs[0];

    return fileInputs.find((input) => {
      const meta = cleanText([
        getLabelText(input),
        input.closest('[data-testid], [data-test], [data-cy], .field, .application-field, .form-field, .posting-requirement, fieldset, form')?.textContent || '',
        input.parentElement?.textContent || '',
        input.nextElementSibling?.textContent || '',
        input.previousElementSibling?.textContent || '',
      ].join(' '));

      return resumeUploadPattern.test(meta);
    }) || null;
  };

  const uploadResumeFile = async (input, profile = {}) => {
    const fileUrl = profile?.documents?.resumePdfUrl;
    if (!fileUrl || !input) return false;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Could not download the signed resume PDF');

    const blob = await response.blob();
    const file = new File([blob], profile?.documents?.resumeFilename || 'ResumeATS_Resume.pdf', { type: 'application/pdf' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    dispatchFieldEvents(input);
    return true;
  };

  const discoverForm = () => {
    const fields = queryAll('input, textarea, select');
    const visibleFields = fields.filter((field) => field && field.type !== 'hidden' && isVisible(field));

    return {
      ok: true,
      usedPageBridge: true,
      accessibleFieldCount: visibleFields.length,
      formCount: queryAll('form').length,
      resumeInputPresent: Boolean(findResumeInput()),
      fields: visibleFields.slice(0, 10).map((field) => ({
        tag: field.tagName,
        type: field.type || field.tagName.toLowerCase(),
        label: getLabelText(field),
        placeholder: field.getAttribute('placeholder') || '',
      })),
    };
  };

  const autofill = async (profile = {}) => {
    const fields = queryAll('input, textarea, select').filter((field) => field && field.type !== 'hidden' && isVisible(field));
    let filledCount = 0;
    let labeledFieldCount = 0;
    let mappableFieldCount = 0;
    const processedRadioNames = new Set();

    for (const field of fields) {
      const meta = getLabelText(field);
      if (meta) labeledFieldCount += 1;
      if (!meta || field.type === 'file') continue;
      if (field.type === 'radio' && processedRadioNames.has(field.name || '')) continue;
      if (field.type === 'radio' && field.name) processedRadioNames.add(field.name);

      const value = resolveFieldValue(meta, profile);
      if (value !== null && value !== undefined && value !== '') mappableFieldCount += 1;
      if (value && setFieldValue(field, value)) filledCount += 1;
    }

    const resumeInput = findResumeInput();
    if (resumeInput && !resumeInput.files?.length) {
      const uploaded = await uploadResumeFile(resumeInput, profile);
      if (uploaded) filledCount += 1;
    }

    return {
      ok: true,
      usedPageBridge: true,
      filledCount,
      accessibleFieldCount: fields.length,
      labeledFieldCount,
      mappableFieldCount,
      resumeInputPresent: Boolean(resumeInput),
    };
  };

  window.addEventListener('message', async (event) => {
    const message = event.data;
    if (event.source !== window || !message || message.source !== 'resumeats-browser-agent-content' || message.target !== TARGET) {
      return;
    }

    let payload = null;
    let success = true;
    let error = '';

    try {
      if (message.type === 'RESUMEATS_PAGE_FORM_DISCOVERY') {
        payload = discoverForm();
      } else if (message.type === 'RESUMEATS_PAGE_AUTOFILL') {
        payload = await autofill(message.payload?.profile || {});
      } else {
        return;
      }
    } catch (err) {
      success = false;
      error = err?.message || String(err);
    }

    window.postMessage({
      source: SOURCE,
      target: RESPONSE_TARGET,
      requestId: message.requestId,
      success,
      error,
      payload,
    }, '*');
  });
})();
