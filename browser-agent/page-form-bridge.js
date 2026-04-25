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

  const pickProfileValue = (...values) => values
    .map((value) => cleanText(value ?? ''))
    .find(Boolean) || '';

  const splitFullName = (fullName = '') => {
    const parts = cleanText(fullName).split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' '),
    };
  };
  const COUNTRY_CALLING_CODES = [
    '+1', '+7', '+20', '+27', '+30', '+31', '+32', '+33', '+34', '+36', '+39', '+40', '+41', '+43', '+44', '+45', '+46', '+47', '+48', '+49',
    '+51', '+52', '+53', '+54', '+55', '+56', '+57', '+58', '+60', '+61', '+62', '+63', '+64', '+65', '+66', '+81', '+82', '+84', '+86',
    '+90', '+91', '+92', '+93', '+94', '+95', '+98', '+212', '+213', '+216', '+218', '+220', '+221', '+222', '+223', '+224', '+225', '+226',
    '+227', '+228', '+229', '+230', '+231', '+232', '+233', '+234', '+235', '+236', '+237', '+238', '+239', '+240', '+241', '+242', '+243',
    '+244', '+245', '+246', '+248', '+249', '+250', '+251', '+252', '+253', '+254', '+255', '+256', '+257', '+258', '+260', '+261', '+262',
    '+263', '+264', '+265', '+266', '+267', '+268', '+269', '+290', '+291', '+297', '+298', '+299', '+350', '+351', '+352', '+353', '+354',
    '+355', '+356', '+357', '+358', '+359', '+370', '+371', '+372', '+373', '+374', '+375', '+376', '+377', '+378', '+380', '+381', '+382',
    '+383', '+385', '+386', '+387', '+389', '+420', '+421', '+423', '+500', '+501', '+502', '+503', '+504', '+505', '+506', '+507', '+508',
    '+509', '+590', '+591', '+592', '+593', '+594', '+595', '+596', '+597', '+598', '+599', '+670', '+672', '+673', '+674', '+675', '+676',
    '+677', '+678', '+679', '+680', '+681', '+682', '+683', '+685', '+686', '+687', '+688', '+689', '+690', '+691', '+692', '+850', '+852',
    '+853', '+855', '+856', '+880', '+886', '+960', '+961', '+962', '+963', '+964', '+965', '+966', '+967', '+968', '+970', '+971', '+972',
    '+973', '+974', '+975', '+976', '+977', '+992', '+993', '+994', '+995', '+996', '+998',
  ].sort((left, right) => right.length - left.length);
  const extractPhoneCountryCode = (value = '') => {
    const compact = cleanText(value).replace(/[^\d+]/g, '');
    if (!compact.startsWith('+')) return '';
    return COUNTRY_CALLING_CODES.find((code) => compact.startsWith(code)) || compact.match(/^\+\d{1,3}/)?.[0] || '';
  };
  const resolvePhoneCountryCode = (answers = {}, candidate = {}) => (
    extractPhoneCountryCode(answers.phoneCountryCode || answers.countryCallingCode)
    || extractPhoneCountryCode(candidate.phone || answers.phone)
  );
  const DEMOGRAPHIC_ALIASES = [
    { match: /^(male|man|men|m)$/i, aliases: ['male', 'man', 'men', 'm'] },
    { match: /^(female|woman|women|f)$/i, aliases: ['female', 'woman', 'women', 'f'] },
    { match: /^(non[-\s]?binary|nonbinary|gender non[-\s]?conforming)$/i, aliases: ['non binary', 'nonbinary', 'gender non conforming'] },
    { match: /prefer not|decline|choose not|do not wish|not disclose|rather not/i, aliases: ['prefer not', 'decline', 'choose not', 'do not wish', 'not disclose', 'rather not'] },
    { match: /^(white|caucasian)$/i, aliases: ['white', 'caucasian'] },
    { match: /black|african american/i, aliases: ['black', 'african american'] },
    { match: /^asian$/i, aliases: ['asian'] },
    { match: /american indian|alaska native|native american/i, aliases: ['american indian', 'alaska native', 'native american'] },
    { match: /native hawaiian|pacific islander/i, aliases: ['native hawaiian', 'pacific islander'] },
    { match: /two or more|multiple races|multiracial/i, aliases: ['two or more', 'multiple races', 'multiracial'] },
    { match: /hispanic|latino|latina|latinx/i, aliases: ['hispanic', 'latino', 'latina', 'latinx'] },
  ];
  const scoreAliasMatch = (option, desired) => {
    const desiredAlias = DEMOGRAPHIC_ALIASES.find((entry) => entry.match.test(desired));
    if (!desiredAlias) return 0;
    const optionTokens = new Set(option.split(/[^a-z0-9]+/).filter(Boolean));
    return desiredAlias.aliases.some((alias) => {
      const normalizedAlias = normalize(alias);
      return normalizedAlias.includes(' ')
        ? option.includes(normalizedAlias)
        : optionTokens.has(normalizedAlias);
    }) ? 91 : 0;
  };

  const buildNormalizedCandidate = (profile = {}) => {
    const candidate = profile?.candidate || {};
    const personal = profile?.personal || profile?.personalInfo || {};
    const nestedPersonal = profile?.profile?.personal || profile?.profile?.personalInfo || {};
    const resumePersonal = profile?.resume?.personalInfo || {};
    const answers = profile?.answers || {};
    const professionalLinks = personal.professionalLinks || nestedPersonal.professionalLinks || {};
    const locationFromAnswers = [
      answers.city,
      answers.stateProvince || answers.state,
      answers.country,
    ].filter(Boolean).join(', ');
    const fullName = pickProfileValue(
      candidate.fullName,
      candidate.name,
      candidate.full_name,
      personal.fullName,
      personal.name,
      nestedPersonal.fullName,
      resumePersonal.fullName,
      answers.fullName
    );
    const split = splitFullName(fullName);
    const firstName = pickProfileValue(
      candidate.firstName,
      candidate.givenName,
      personal.firstName,
      nestedPersonal.firstName,
      resumePersonal.firstName,
      answers.firstName,
      split.firstName
    );
    const lastName = pickProfileValue(
      candidate.lastName,
      candidate.familyName,
      candidate.surname,
      personal.lastName,
      nestedPersonal.lastName,
      resumePersonal.lastName,
      answers.lastName,
      split.lastName
    );

    return {
      ...candidate,
      fullName: fullName || [firstName, lastName].filter(Boolean).join(' '),
      firstName,
      lastName,
      email: pickProfileValue(candidate.email, personal.email, nestedPersonal.email, resumePersonal.email, answers.email),
      phone: pickProfileValue(candidate.phone, candidate.phoneNumber, personal.phone, personal.phoneNumber, nestedPersonal.phone, resumePersonal.phone, answers.phone),
      location: pickProfileValue(candidate.location, personal.location, nestedPersonal.location, resumePersonal.location, answers.location, locationFromAnswers),
      linkedin: pickProfileValue(candidate.linkedin, professionalLinks.linkedin, personal.linkedin, nestedPersonal.linkedin, resumePersonal.linkedin, answers.linkedinUrl),
      github: pickProfileValue(candidate.github, professionalLinks.github, personal.github, nestedPersonal.github, resumePersonal.github, answers.githubUrl),
      portfolio: pickProfileValue(candidate.portfolio, professionalLinks.portfolio, professionalLinks.other, personal.portfolio, nestedPersonal.portfolio, resumePersonal.portfolio, answers.portfolioUrl),
      website: pickProfileValue(candidate.website, professionalLinks.website, professionalLinks.portfolio, personal.website, nestedPersonal.website, resumePersonal.website, answers.websiteUrl),
      currentTitle: pickProfileValue(candidate.currentTitle, candidate.jobTitle, answers.currentTitle),
      currentCompany: pickProfileValue(candidate.currentCompany, answers.currentCompany),
    };
  };

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

  const GENERIC_FIELD_LABEL_PATTERN = /^(select|select\.{3}|choose|choose\.{3}|search|loading|optional|required)$/i;

  const cleanFieldLabelCandidate = (value = '', field = null) => {
    let text = cleanText(value)
      .replace(/\b(?:select|choose|search)(?:\s*\.\.\.)?\b/gi, ' ')
      .replace(/\b(optional|required)\b/gi, ' ');

    const fieldValue = cleanText(field?.value || field?.textContent || '');
    if (fieldValue && fieldValue.length <= 80) {
      text = text.split(fieldValue).join(' ');
    }

    return cleanText(text).replace(/\s{2,}/g, ' ');
  };

  const isUsableFieldLabelCandidate = (value = '') => {
    const text = cleanText(value);
    const normalized = normalize(text);
    return Boolean(normalized)
      && normalized.length > 1
      && text.length <= 260
      && !GENERIC_FIELD_LABEL_PATTERN.test(normalized);
  };

  const getNearbyQuestionText = (field) => {
    const fieldRect = field?.getBoundingClientRect?.();
    if (!fieldRect || !fieldRect.width && !fieldRect.height) return '';

    const root = field.getRootNode?.() || field.ownerDocument || document;
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (element, scoreBias = 0) => {
      if (!element || element === field || seen.has(element)) return;
      seen.add(element);
      if (element.contains?.(field)) return;
      if (!element.getClientRects?.().length) return;

      const controlCount = element.querySelectorAll?.('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button')?.length || 0;
      if (controlCount > 0) return;

      const rect = element.getBoundingClientRect?.();
      if (!rect || !rect.width && !rect.height) return;

      const text = cleanFieldLabelCandidate(
        element.getAttribute?.('aria-label')
          || element.getAttribute?.('title')
          || element.textContent
          || '',
        field
      );
      if (!isUsableFieldLabelCandidate(text)) return;

      const verticalDistance = fieldRect.top - rect.bottom;
      const sameLineDistance = Math.abs(fieldRect.top - rect.top);
      const horizontalGap = Math.max(0, Math.max(rect.left - fieldRect.right, fieldRect.left - rect.right));
      const overlapsHorizontally = rect.right >= fieldRect.left - 48 && rect.left <= fieldRect.right + 48;
      const sameRowLabel = sameLineDistance <= 24 && rect.right <= fieldRect.left + 12 && horizontalGap <= 260;
      const aboveLabel = verticalDistance >= -6 && verticalDistance <= 170 && (overlapsHorizontally || horizontalGap <= 90);
      if (!sameRowLabel && !aboveLabel) return;

      const questionBonus = /[?*]$/.test(text) || /^(why|how|what|when|where|are|will|do|does|can|please|briefly)\b/i.test(text)
        ? -45
        : 0;
      const shortBonus = text.length <= 120 ? -10 : 0;
      const score = Math.max(0, verticalDistance) + horizontalGap * 0.25 + scoreBias + questionBonus + shortBonus;
      candidates.push({ text, score });
    };

    let cursor = field;
    for (let depth = 0; depth < 4 && cursor; depth += 1) {
      let sibling = cursor.previousElementSibling;
      for (let index = 0; index < 4 && sibling; index += 1) {
        pushCandidate(sibling, depth * 30 + index * 10);
        sibling = sibling.previousElementSibling;
      }
      cursor = cursor.parentElement;
    }

    if (root?.querySelectorAll) {
      const selectors = 'label, legend, p, span, div, h1, h2, h3, h4, [data-testid], [data-test], [data-cy], [aria-label]';
      for (const element of root.querySelectorAll(selectors)) {
        pushCandidate(element, 80);
      }
    }

    return candidates.sort((left, right) => left.score - right.score)[0]?.text || '';
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

    const scopedContainer = field.closest('[data-testid], [data-test], [data-cy], .field, .form-field, .application-field, .posting-requirement, fieldset, [class*="marginY--"], [class*="fieldWrapper"]');
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

    parts.push(getNearbyQuestionText(field));

    return normalize(
      parts
        .map((part) => cleanFieldLabelCandidate(part, field))
        .filter(isUsableFieldLabelCandidate)
        .join(' ')
    );
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

  const dispatchInputEvents = (field) => {
    const EventCtor = field?.ownerDocument?.defaultView?.Event || Event;
    ['input', 'change'].forEach((eventName) => {
      field.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
    });
  };

  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const isCustomChoiceControl = (field) => {
    if (!field) return false;
    const role = normalize(field.getAttribute?.('role') || '');
    const ariaHasPopup = normalize(field.getAttribute?.('aria-haspopup') || '');
    const className = normalize(field.className || '');
    const tag = field.tagName?.toLowerCase?.() || '';
    return role === 'combobox'
      || role === 'listbox'
      || ariaHasPopup === 'listbox'
      || className.includes('select__input')
      || className.includes('select-input')
      || (tag === 'button' && /select|choose|dropdown|combobox/.test(className));
  };

  const getFieldIdentity = (field) => normalize([
    field?.name,
    field?.id,
    field?.getAttribute?.('aria-label'),
    field?.getAttribute?.('autocomplete'),
    field?.getAttribute?.('placeholder'),
    field?.getAttribute?.('title'),
    field?.className,
  ].filter(Boolean).join(' '));

  const getHiresomeFieldHint = (field) => {
    const identity = getFieldIdentity(field);
    if (/react-select-hs-ls-a-input/.test(identity)) return 'country';
    if (/react-select-hs-ls-b-input/.test(identity)) return 'state region province';
    if (/react-select-hs-ls-c-input/.test(identity)) return 'city town';
    if (/react-select-2-input/.test(identity)) return 'current salary currency';
    if (/react-select-3-input/.test(identity)) return 'expected salary currency';
    return '';
  };

  const isPhoneCountrySelector = (field) => {
    if (!field) return false;
    const identity = getFieldIdentity(field);
    const className = normalize(field.className || '');
    if (className.includes('react-international-phone-country-selector')) return true;
    if (!/country selector|calling code|phone country|country code/.test(identity)) return false;
    const nearbyRoot = field.closest?.('.react-international-phone-input-container')
      || field.parentElement?.parentElement
      || field.parentElement;
    return Boolean(nearbyRoot?.querySelector?.('input[type="tel"], input[name*="phone"], input[class*="phone"]'));
  };

  const resolveSalaryCurrency = (answers = {}) => {
    const explicit = cleanText(answers.salaryCurrency || answers.compensationCurrency || answers.expectedSalaryCurrency || '');
    if (explicit) return explicit;
    const salaryText = cleanText(answers.salaryExpectation || answers.expectedSalary || answers.currentSalary || '');
    if (/\bpln\b|zloty|z\u0142|\bz\u0142\b/i.test(salaryText)) return 'PLN';
    if (/\beur\b|€|euro/i.test(salaryText)) return 'EUR';
    if (/\bgbp\b|£|pound/i.test(salaryText)) return 'GBP';
    if (/\binr\b|₹|rupee/i.test(salaryText)) return 'INR';
    return 'USD';
  };

  const scoreOptionMatch = (optionText, desiredValue) => {
    const option = normalize(optionText);
    const desired = normalize(desiredValue);
    if (!option || !desired) return 0;
    const optionPhoneCode = extractPhoneCountryCode(optionText);
    const desiredPhoneCode = extractPhoneCountryCode(desiredValue);
    if (desiredPhoneCode && optionPhoneCode && desiredPhoneCode === optionPhoneCode) return 98;
    if (option === desired) return 100;
    if (option.startsWith(desired) || desired.startsWith(option)) return 92;
    const aliasScore = scoreAliasMatch(option, desired);
    if (aliasScore > 0) return aliasScore;
    const sensitiveShortAnswer = /^(male|man|men|m|female|woman|women|f)$/i.test(cleanText(desiredValue));
    if (!sensitiveShortAnswer && (option.includes(desired) || desired.includes(option))) return 84;
    const disclosureOptOut = /prefer not|decline|choose not|do not wish|don't wish|not disclose|rather not/;
    if (disclosureOptOut.test(desired) && disclosureOptOut.test(option)) return 90;
    if (/^(true|yes|y|1)$/i.test(`${desiredValue}`) && /\byes\b|authorized|eligible|agree/.test(option)) return 88;
    if (/^(false|no|n|0)$/i.test(`${desiredValue}`) && /\bno\b|not authorized|do not|decline|not (?:a )?protected veteran|don't have a disability|do not have a disability/.test(option)) return 88;

    const desiredTokens = new Set(desired.split(/[^a-z0-9]+/).filter((token) => token.length > 1));
    const optionTokens = option.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
    const overlap = optionTokens.filter((token) => desiredTokens.has(token)).length;
    return overlap > 0 ? Math.round((overlap / Math.max(desiredTokens.size, optionTokens.length)) * 72) : 0;
  };

  const optionLooksSelectable = (element) => {
    if (!element || !isVisible(element) || element.getAttribute('aria-disabled') === 'true') return false;
    const nestedOptionCount = element.querySelectorAll?.('[role="option"], [role="menuitem"], [cmdk-item], [data-radix-collection-item], [data-select-item], li[aria-selected]')?.length || 0;
    if (nestedOptionCount > 1) return false;
    const text = cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
    return Boolean(text) && text.length <= 180 && !/^(select|choose|loading|no options|no results)$/i.test(text);
  };

  const collectCustomChoiceOptions = (field) => {
    const controlsId = cleanText(field.getAttribute?.('aria-controls') || field.getAttribute?.('aria-owns') || '');
    const selectors = [
      controlsId ? `#${CSS.escape(controlsId)} [role="option"]` : '',
      controlsId ? `#${CSS.escape(controlsId)} li` : '',
      controlsId ? `#${CSS.escape(controlsId)} [cmdk-item]` : '',
      controlsId ? `#${CSS.escape(controlsId)} [data-value]` : '',
      '[role="option"]',
      '[role="menu"] [role="menuitem"]',
      '[cmdk-item]',
      '[data-radix-collection-item]',
      '[data-select-item]',
      '[data-value]',
      '.select__option',
      '.Select-option',
      '[class*="option"]',
      '[data-testid*="option"]',
      'li[aria-selected]',
    ].filter(Boolean);
    const seen = new Set();
    const options = [];

    for (const root of getFieldSearchRoots(field)) {
      if (!root?.querySelectorAll) continue;
      for (const selector of selectors) {
        let matches = [];
        try {
          matches = Array.from(root.querySelectorAll(selector));
        } catch {
          matches = [];
        }
        for (const element of matches) {
          if (seen.has(element) || !optionLooksSelectable(element)) continue;
          seen.add(element);
          options.push({
            element,
            text: cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('data-value') || element.getAttribute('value') || ''),
          });
        }
      }
    }

    return options.filter((option, index, all) => (
      all.findIndex((entry) => normalize(entry.text) === normalize(option.text)) === index
    ));
  };

  const openCustomChoiceControl = async (field, searchValue = '') => {
    field.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    field.focus?.();
    field.click?.();
    await delay(140);
    if (field.tagName?.toLowerCase?.() === 'input' && searchValue) {
      setNativeValue(field, 'value', '');
      dispatchInputEvents(field);
      setNativeValue(field, 'value', searchValue);
      dispatchInputEvents(field);
      await delay(400);
    }
    const deadline = Date.now() + (searchValue ? 1600 : 900);
    let options = collectCustomChoiceOptions(field);
    while (options.length === 0 && Date.now() < deadline) {
      await delay(180);
      options = collectCustomChoiceOptions(field);
    }
    return options;
  };

  const setCustomChoiceValue = async (field, value) => {
    if (!isCustomChoiceControl(field)) return false;
    let options = await openCustomChoiceControl(field);
    if (options.length === 0) {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
    }
    let best = options
      .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
      .sort((left, right) => right.score - left.score)[0];
    if ((!best || best.score < 45) && field.tagName?.toLowerCase?.() === 'input') {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
      best = options
        .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
        .sort((left, right) => right.score - left.score)[0];
    }
    if (!best || best.score < 45) return false;

    best.element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const view = best.element.ownerDocument?.defaultView || window;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
      const EventCtor = eventName.startsWith('pointer') ? view.PointerEvent || view.MouseEvent : view.MouseEvent;
      best.element.dispatchEvent(new EventCtor(eventName, { bubbles: true, cancelable: true, view }));
    });
    await delay(160);
    field.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    field.blur?.();
    dispatchFieldEvents(field);
    return true;
  };

  const buildCandidatePitch = (profile = {}) => {
    const candidate = buildNormalizedCandidate(profile);
    const topSkills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).slice(0, 4) : [];
    const intro = [
      candidate.currentTitle ? `I am a ${candidate.currentTitle}` : 'I am a candidate',
      candidate.currentCompany ? `currently working at ${candidate.currentCompany}` : '',
      candidate.location ? `based in ${candidate.location}` : '',
    ].filter(Boolean).join(' ');
    const skills = topSkills.length > 0 ? `My strongest areas include ${topSkills.join(', ')}.` : '';

    return cleanText([intro, skills].filter(Boolean).join(' ')).slice(0, 900);
  };

  const US_STATE_ABBREVIATIONS = {
    alabama: 'AL',
    alaska: 'AK',
    arizona: 'AZ',
    arkansas: 'AR',
    california: 'CA',
    colorado: 'CO',
    connecticut: 'CT',
    delaware: 'DE',
    'district of columbia': 'DC',
    florida: 'FL',
    georgia: 'GA',
    hawaii: 'HI',
    idaho: 'ID',
    illinois: 'IL',
    indiana: 'IN',
    iowa: 'IA',
    kansas: 'KS',
    kentucky: 'KY',
    louisiana: 'LA',
    maine: 'ME',
    maryland: 'MD',
    massachusetts: 'MA',
    michigan: 'MI',
    minnesota: 'MN',
    mississippi: 'MS',
    missouri: 'MO',
    montana: 'MT',
    nebraska: 'NE',
    nevada: 'NV',
    'new hampshire': 'NH',
    'new jersey': 'NJ',
    'new mexico': 'NM',
    'new york': 'NY',
    'north carolina': 'NC',
    'north dakota': 'ND',
    ohio: 'OH',
    oklahoma: 'OK',
    oregon: 'OR',
    pennsylvania: 'PA',
    'rhode island': 'RI',
    'south carolina': 'SC',
    'south dakota': 'SD',
    tennessee: 'TN',
    texas: 'TX',
    utah: 'UT',
    vermont: 'VT',
    virginia: 'VA',
    washington: 'WA',
    'west virginia': 'WV',
    wisconsin: 'WI',
    wyoming: 'WY',
  };

  const normalizeUsStateAnswer = (value = '') => {
    const text = cleanText(value);
    if (/^[a-z]{2}$/i.test(text)) return text.toUpperCase();
    return US_STATE_ABBREVIATIONS[normalize(text).replace(/\./g, '')] || text;
  };

  const resolveFieldValue = (meta, profile = {}, field = null) => {
    const candidate = buildNormalizedCandidate(profile);
    const answers = profile?.answers || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const candidatePitch = buildCandidatePitch(profile);
    const phoneCountryCode = resolvePhoneCountryCode(answers, candidate);
    const fieldIdentity = getFieldIdentity(field);
    const fieldMeta = normalize([meta, fieldIdentity, getHiresomeFieldHint(field)].filter(Boolean).join(' '));
    const preferredLocation = Array.isArray(answers.preferredLocations) && answers.preferredLocations.length > 0
      ? cleanText(answers.preferredLocations[0])
      : cleanText(answers.preferredLocation || answers.preferredWorkLocation || '');

    if (/first name|given name/.test(fieldMeta)) return candidate.firstName;
    if (/last name|surname|family name/.test(fieldMeta)) return candidate.lastName;
    if (/full name|your name|applicant name/.test(fieldMeta)) return candidate.fullName;
    if (/^name(?:\s|$)|\bnameid\b|applicant name/.test(fieldMeta) && !/company|employer|referral|referred/.test(fieldMeta)) return candidate.fullName;
    if (/email|e-mail|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/.test(fieldMeta)) return candidate.email;
    if (isPhoneCountrySelector(field) || /phone.*(?:country|calling).*code|(?:country|calling).*code.*phone/.test(fieldIdentity)) return phoneCountryCode;
    if (/\bgender\b|\bsex\b/.test(fieldIdentity)) return answers.gender || 'Prefer not to answer';
    if (/\brace\b|ethnicity/.test(fieldIdentity)) return answers.raceEthnicity || 'Prefer not to answer';
    if (/hispanic|latino|latina|latinx/.test(fieldIdentity)) return answers.hispanicLatino || 'Prefer not to answer';
    if ((isCustomChoiceControl(field) || field?.tagName?.toLowerCase?.() === 'select') && phoneFieldPattern.test(fieldMeta)) return phoneCountryCode;
    if (phoneFieldPattern.test(fieldMeta)) return candidate.phone;
    if (/work authorization|authorized to work|legally authorized/.test(fieldMeta)) return answers.workAuthorization;
    if (/sponsor|sponsorship|visa|h[- ]?1b|work permit/.test(fieldMeta)) return answers.requiresSponsorship;
    if (/preferred location|preferredlocation|bevorzugter standort/.test(fieldMeta)) return preferredLocation || answers.preferredWorkSetup || candidate.location;
    if (/salary currency/.test(fieldMeta)) return resolveSalaryCurrency(answers);
    if (/current salary|current ctc|annualsalary|aktuelles gehalt/.test(fieldMeta)) return answers.currentSalary || answers.salaryCurrent;
    if (/expected.*salary|salary.*expect|expectedctc|erwartetes gehalt|compensation|expected pay|pay expectation/.test(fieldMeta)) return answers.salaryExpectation;
    if (/years.*experience|experience.*years|totalexperience|gesamte arbeitserfahrung/.test(fieldMeta)) return answers.yearsOfExperience;
    if (/highest degree|highest qualification|highestdegree|h\u00f6chste qualifikation|hoechste qualifikation/.test(fieldMeta)) return answers.highestEducation;
    if (/available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/.test(fieldMeta)) return answers.noticePeriod || 'Two weeks notice';
    if (/current company|current employer|present employer|employer name|currentcompany|aktuelles unternehmen/.test(fieldMeta)) return answers.currentCompany || candidate.currentCompany;
    if (/current title|job title|current role|current designation|currentdesignation|aktuelle funktion/.test(fieldMeta)) return answers.currentTitle || candidate.currentTitle;
    if (/city|town/.test(fieldMeta)) return answers.city || locationParts[0] || candidate.location;
    if (/\bstate\b|\bprovince\b|state region/.test(fieldMeta)) return normalizeUsStateAnswer(answers.stateProvince || answers.state);
    if (/\bcountry\b/.test(fieldMeta)) return answers.country || locationParts.at(-1) || candidate.location;
    if (/\bregion\b/.test(fieldMeta)) return answers.stateProvince || answers.state || answers.country || locationParts.at(-1) || candidate.location;
    if (/location|standort|address/.test(fieldMeta)) return candidate.location;
    if (/linkedin/.test(fieldMeta)) return candidate.linkedin || answers.linkedinUrl;
    if (/github/.test(fieldMeta)) return candidate.github || answers.githubUrl;
    if (/portfolio/.test(fieldMeta)) return candidate.portfolio || answers.portfolioUrl;
    if (/website|personal site/.test(fieldMeta)) return candidate.website || answers.websiteUrl;
    if (/current company|current employer|present employer|employer name|aktuelles unternehmen/.test(fieldMeta)) return answers.currentCompany || candidate.currentCompany;
    if (/current title|job title|current role|current designation|currentdesignation|aktuelle funktion/.test(fieldMeta)) return answers.currentTitle || candidate.currentTitle;
    if (/18 years|age or older|over 18|at least 18/.test(fieldMeta)) return answers.isAdult || answers.ageOver18 || 'Yes';
    if (/years.*experience|experience.*years|totalexperience|gesamte arbeitserfahrung/.test(fieldMeta)) return answers.yearsOfExperience;
    if (/current salary|annualsalary|aktuelles gehalt/.test(fieldMeta)) return answers.currentSalary || answers.salaryCurrent;
    if (/expected.*salary|salary.*expect|expectedctc|erwartetes gehalt|compensation|expected pay|pay expectation/.test(fieldMeta)) return answers.salaryExpectation;
    if (/salary currency/.test(fieldMeta)) return resolveSalaryCurrency(answers);
    if (/work setup|work model|remote|hybrid|on-site|onsite/.test(fieldMeta)) return answers.preferredWorkSetup;
    if (/school|university|college/.test(fieldMeta)) return answers.school;
    if (/highest degree|highest qualification|highestdegree|h\u00f6chste qualifikation|hoechste qualifikation/.test(fieldMeta)) return answers.highestEducation;
    if (/degree.*pursu|pursuing.*degree/.test(fieldMeta)) return answers.degreePursuing || answers.highestEducation;
    if (/degree/.test(fieldMeta)) return answers.highestEducation;
    if (/course|class|certification/.test(fieldMeta)) return answers.relevantCourses;
    if (/hear about|heard about|source|how did you find|how did you learn/.test(fieldMeta)) return answers.heardAbout;
    if (/referred|referral/.test(fieldMeta) && /name|who/.test(fieldMeta)) return answers.referralName;
    if (/referred|referral/.test(fieldMeta)) return answers.referredByEmployee;
    if (/current.*employee|team member/.test(fieldMeta)) return answers.currentEmployee;
    if (/previous.*employee|ever.*employed|formerly.*employed/.test(fieldMeta)) return answers.previousEmployee;
    if (/previous.*company|previous.*employ|dates.*employ/.test(fieldMeta)) return answers.previousEmploymentDetails;
    if (/background.*check/.test(fieldMeta)) return answers.backgroundCheckConsent;
    if (/privacy|data retention|data processing|recruiting.*consent|consent/.test(fieldMeta)) return answers.privacyConsent;
    if (/accommodation/.test(fieldMeta)) return answers.accommodationRequest || 'No';
    if (/pronoun/.test(fieldMeta)) return answers.pronouns || 'Prefer not to answer';
    if (/gender/.test(fieldMeta)) return answers.gender || 'Prefer not to answer';
    if (/race|ethnicity/.test(fieldMeta)) return answers.raceEthnicity || 'Prefer not to answer';
    if (/hispanic|latino/.test(fieldMeta)) return answers.hispanicLatino || 'Prefer not to answer';
    if (/veteran/.test(fieldMeta)) return answers.veteranStatus || 'Prefer not to answer';
    if (/disability|disabled/.test(fieldMeta)) return answers.disabilityStatus || 'Prefer not to answer';
    if (/cover letter|message to the hiring team|about you|tell us about yourself|about your background|changing your career|learning software development|why (?:are you interested|this role|do you want)/.test(fieldMeta)) return candidatePitch;
    if (/summary|professional summary|candidate summary/.test(fieldMeta)) return candidatePitch;
    if (/available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/.test(fieldMeta)) return answers.noticePeriod || 'Two weeks notice';

    return null;
  };

  const setFieldValue = async (field, value) => {
    if (!field || value === undefined || value === null || value === '' || !isVisible(field)) return false;
    const tag = field.tagName.toLowerCase();

    if (isCustomChoiceControl(field)) {
      return setCustomChoiceValue(field, value);
    }

    if (tag === 'select') {
      const option = Array.from(field.options)
        .map((entry) => ({
          entry,
          score: scoreOptionMatch(`${entry.textContent || ''} ${entry.value || ''}`, value),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (!option || option.score < 45) return false;
      setNativeValue(field, 'value', option.entry.value);
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'checkbox') {
      setNativeValue(field, 'checked', /^(true|yes|1)$/i.test(`${value}`));
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'radio') {
      const candidates = queryFieldRoots(field, `input[type="radio"][name="${CSS.escape(field.name || '')}"]`);
      const target = candidates
        .map((entry) => ({
          entry,
          score: scoreOptionMatch(`${entry.value || ''} ${getLabelText(entry)}`, value),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (!target || target.score < 45) return false;
      candidates.forEach((entry) => setNativeValue(entry, 'checked', entry === target.entry));
      dispatchFieldEvents(target.entry);
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
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(fileUrl, { signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Timed out downloading the signed resume PDF');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
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
    const fields = Array.from(new Set(queryAll('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button[class*="select"], button[class*="dropdown"]')));
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
    const fields = Array.from(new Set(queryAll('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button[class*="select"], button[class*="dropdown"]')))
      .filter((field) => field && field.type !== 'hidden' && isVisible(field));
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

      const value = resolveFieldValue(meta, profile, field);
      if (value !== null && value !== undefined && value !== '') mappableFieldCount += 1;
      if (value && await setFieldValue(field, value)) filledCount += 1;
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
