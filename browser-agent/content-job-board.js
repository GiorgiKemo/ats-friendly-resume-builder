/* global chrome */

(() => {
  const APP_HOST_PATTERNS = [
    /(^|\.)resumeats\.cv$/i,
    /^localhost$/i,
    /^127\.0\.0\.1$/i,
  ];

  if (APP_HOST_PATTERNS.some((pattern) => pattern.test(window.location.hostname))) {
    return;
  }

  const PROVIDERS = [
    { id: 'greenhouse', test: (url) => /greenhouse\.io/i.test(url) },
    { id: 'lever', test: (url) => /lever\.co/i.test(url) },
    { id: 'workday', test: (url) => /myworkdayjobs\.com|workday\.com/i.test(url) },
    { id: 'ashby', test: (url) => /ashbyhq\.com/i.test(url) },
    { id: 'icims', test: (url) => /icims\.com/i.test(url) },
    { id: 'smartrecruiters', test: (url) => /smartrecruiters\.com/i.test(url) },
    { id: 'workable', test: (url) => /workable\.com/i.test(url) },
    { id: 'bamboohr', test: (url) => /bamboohr\.com/i.test(url) },
    { id: 'jobvite', test: (url) => /jobvite\.com/i.test(url) },
    { id: 'linkedin', test: (url) => /linkedin\.com/i.test(url) },
    { id: 'indeed', test: (url) => /indeed\.com/i.test(url) },
    { id: 'google', test: (url) => /google\.[^/]+/i.test(url) },
  ];

  const provider = PROVIDERS.find((entry) => entry.test(window.location.href))?.id || 'generic';
  const normalize = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const getLabelText = (field) => {
    const parts = [];

    if (field.id) {
      try {
        const linkedLabel = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (linkedLabel?.textContent) parts.push(linkedLabel.textContent);
      } catch {
        // Ignore invalid CSS escape cases.
      }
    }

    const wrappingLabel = field.closest('label');
    if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);

    const parentLabel = field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);

    if (field.getAttribute('aria-label')) parts.push(field.getAttribute('aria-label'));
    if (field.getAttribute('placeholder')) parts.push(field.getAttribute('placeholder'));
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);

    return normalize(parts.join(' '));
  };

  const isVisible = (field) => {
    if (field.type === 'file') return true;
    return !!(field.offsetWidth || field.offsetHeight || field.getClientRects().length);
  };

  const isEnabled = (element) => Boolean(element && !element.disabled && element.getAttribute('aria-disabled') !== 'true');

  const getElementText = (element) => normalize(
    element?.textContent
    || element?.value
    || element?.getAttribute?.('aria-label')
    || element?.getAttribute?.('title')
    || ''
  );

  const dispatchFieldEvents = (field) => {
    ['input', 'change', 'blur'].forEach((eventName) => {
      field.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  };

  const setFieldValue = (field, value) => {
    if (!field || value === undefined || value === null || value === '') return false;
    if (!isVisible(field)) return false;

    const tag = field.tagName.toLowerCase();

    if (tag === 'select') {
      const wanted = normalize(value);
      const option = Array.from(field.options).find((entry) => (
        normalize(entry.textContent || '').includes(wanted)
        || normalize(entry.value || '').includes(wanted)
        || wanted.includes(normalize(entry.textContent || ''))
      ));

      if (!option) return false;

      field.value = option.value;
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'checkbox') {
      const shouldCheck = /^(true|yes|1)$/i.test(`${value}`);
      field.checked = shouldCheck;
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'radio') {
      const candidates = Array.from(document.querySelectorAll(`input[type="radio"][name="${field.name}"]`));
      const target = candidates.find((entry) => {
        const label = getLabelText(entry);
        return label.includes(normalize(value)) || normalize(entry.value || '').includes(normalize(value));
      });

      if (!target) return false;
      target.checked = true;
      dispatchFieldEvents(target);
      return true;
    }

    field.focus();
    field.value = value;
    dispatchFieldEvents(field);
    return true;
  };

  const uploadResumeFile = async (input, profile) => {
    const fileUrl = profile?.documents?.resumePdfUrl;
    if (!fileUrl || !input) return false;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Could not download the signed resume PDF');

    const blob = await response.blob();
    const file = new File(
      [blob],
      profile?.documents?.resumeFilename || 'ResumeATS_Resume.pdf',
      { type: 'application/pdf' }
    );

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    dispatchFieldEvents(input);
    return true;
  };

  const resolveFieldValue = (meta, profile) => {
    const candidate = profile?.candidate || {};
    const answers = profile?.answers || {};
    const education = profile?.education?.[0] || {};

    if (/first name|given name/.test(meta)) return candidate.firstName;
    if (/last name|surname|family name/.test(meta)) return candidate.lastName;
    if (/full name|your name|applicant name/.test(meta)) return candidate.fullName;
    if (/email/.test(meta)) return candidate.email;
    if (/phone|mobile|cell/.test(meta)) return candidate.phone;
    if (/location|city|address/.test(meta)) return candidate.location;
    if (/linkedin/.test(meta)) return candidate.linkedin || answers.linkedinUrl;
    if (/github/.test(meta)) return candidate.github || answers.githubUrl;
    if (/portfolio/.test(meta)) return candidate.portfolio || answers.portfolioUrl;
    if (/website|personal site/.test(meta)) return candidate.website || answers.websiteUrl;
    if (/current company|employer/.test(meta)) return answers.currentCompany;
    if (/current title|job title|current role/.test(meta)) return answers.currentTitle;
    if (/work authorization|authorized to work|legally authorized/.test(meta)) return answers.workAuthorization;
    if (/sponsor|sponsorship/.test(meta)) return answers.requiresSponsorship;
    if (/years.*experience|experience.*years/.test(meta)) return answers.yearsOfExperience;
    if (/school|university|college/.test(meta)) return education.institution;
    if (/degree/.test(meta)) return education.degree;

    return null;
  };

  const findResumeInput = () => (
    Array.from(document.querySelectorAll('input[type="file"]')).find((input) => {
      const meta = getLabelText(input);
      return /resume|cv/.test(meta);
    }) || null
  );

  const getVisibleFormFields = () => (
    Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((field) => field && !field.disabled && isVisible(field))
  );

  const looksLikeApplicationForm = () => {
    const fields = getVisibleFormFields();
    const informativeFields = fields.filter((field) => {
      if (field.type === 'hidden') return false;
      if (field.type === 'search') return false;
      const meta = getLabelText(field);
      return /name|email|phone|linkedin|portfolio|website|resume|cv|cover letter|school|degree|experience|authorization|sponsorship/.test(meta);
    });

    return informativeFields.length >= 2 || Boolean(findResumeInput());
  };

  const findPrimaryAction = (patterns, exclusions = []) => {
    const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
    return candidates.find((entry) => {
      const text = getElementText(entry);
      if (!text || !isEnabled(entry)) return false;
      if (exclusions.some((pattern) => pattern.test(text))) return false;
      return patterns.some((pattern) => pattern.test(text));
    }) || null;
  };

  const findSubmitButton = () => findPrimaryAction(
    [/submit application/, /^submit$/, /^apply$/, /apply now/, /continue to submit/, /finish application/, /complete application/, /review and submit/],
    [/save/, /cancel/, /back/, /filter/, /coupon/]
  );

  const findApplyEntryButton = () => findPrimaryAction(
    [/apply now/, /^apply$/, /start application/, /continue application/, /easy apply/, /apply on company site/, /view application/, /continue/],
    [/applied/, /save/, /filter/, /coupon/, /sign in with/, /log in/]
  );

  const findConfirmation = () => {
    const text = normalize(document.body?.innerText || '');
    return /application submitted|thanks for applying|thank you for applying|your application has been submitted|application received/.test(text);
  };

  const navigateToApplyTarget = async () => {
    const applyEntry = findApplyEntryButton();
    if (!applyEntry) return false;

    const href = applyEntry.getAttribute('href')
      || applyEntry.dataset?.href
      || applyEntry.closest('a')?.getAttribute('href')
      || '';

    if (href && !/^javascript:/i.test(href) && !href.startsWith('#')) {
      const absoluteUrl = new URL(href, window.location.href).toString();
      window.location.href = absoluteUrl;
      return true;
    }

    applyEntry.click();
    return true;
  };

  const autofillVisibleFields = async (profile) => {
    const fields = getVisibleFormFields();
    let filledCount = 0;

    for (const field of fields) {
      const meta = getLabelText(field);
      if (!meta || field.type === 'file') continue;

      const value = resolveFieldValue(meta, profile);
      if (value === null || value === undefined || value === '') continue;

      if (setFieldValue(field, value)) {
        filledCount += 1;
      }
    }

    const resumeInput = findResumeInput();
    if (resumeInput && !resumeInput.files?.length) {
      const uploaded = await uploadResumeFile(resumeInput, profile);
      if (uploaded) filledCount += 1;
    }

    return filledCount;
  };

  const autofillApplication = async ({ profile, autoSubmit }) => {
    if (!looksLikeApplicationForm()) {
      const navigated = await navigateToApplyTarget();

      if (navigated) {
        return {
          ok: true,
          pendingNavigation: true,
          submitted: false,
          provider,
          filledCount: 0,
        };
      }
    }

    let filledCount = 0;

    try {
      filledCount = await autofillVisibleFields(profile);
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Resume upload failed',
        provider,
        filledCount,
      };
    }

    if (!autoSubmit) {
      return {
        ok: true,
        submitted: false,
        provider,
        filledCount,
      };
    }

    if (findConfirmation()) {
      return {
        ok: true,
        submitted: true,
        provider,
        filledCount,
      };
    }

    const submitButton = findSubmitButton();
    if (!submitButton) {
      const navigated = await navigateToApplyTarget();
      if (navigated) {
        return {
          ok: true,
          pendingNavigation: true,
          submitted: false,
          provider,
          filledCount,
        };
      }

      return {
        ok: false,
        error: 'Could not find an Apply or Submit action on this page',
        provider,
        filledCount,
      };
    }

    submitButton.click();
    await delay(1500);

    return {
      ok: true,
      submitted: findConfirmation() || true,
      provider,
      filledCount,
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'AUTOFILL_APPLICATION') return undefined;

    autofillApplication(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || 'Unknown autofill error',
        provider,
      }));

    return true;
  });

  chrome.runtime.sendMessage({
    type: 'JOB_PAGE_READY',
    payload: {
      provider,
      url: window.location.href,
    },
  });
})();
