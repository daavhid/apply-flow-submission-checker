/**
 * Universal ATS & Job Form Extractor & Intelligent Form Restoration
 * Extracts visible form fields, job metadata, candidate identity, resume, salary, and custom Q&A.
 * Provides automated form state restoration and autofill across page refreshes and multi-step ATS wizards.
 */

window.JobFormExtractor = (function () {
  'use strict';

  // Helper to clean and trim whitespace
  function clean(str) {
    if (!str) return '';
    let s = String(str);
    // Remove script / style tags if raw HTML was somehow obtained
    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Detect if text is JS code or DOM widget script noise
  function isCodeOrJunk(str) {
    if (!str) return true;
    if (str.length > 800) return true;
    if (/function\s*\(|var\s+[a-zA-Z0-9_$]+\s*=|let\s+[a-zA-Z0-9_$]+\s*=|const\s+[a-zA-Z0-9_$]+\s*=|window\.add|document\.get|parsedJSON|angular\.element|\/\*|\*\/|=>/i.test(str)) {
      return true;
    }
    return false;
  }

  // Clean instructional noise or file limits from labels while preserving full question prompt
  function cleanLabelText(str) {
    if (!str) return '';
    let txt = clean(str);
    if (/we've received your resume|attach resume as \.pdf|limit \d+mb|paste your resume here/i.test(txt)) {
      if (/^resume/i.test(txt)) return 'Resume / CV';
    }
    return txt;
  }

  // Detect instructional disclaimer noise or EEO legal boilerplate
  function isDisclaimerOrInstruction(str) {
    if (!str) return false;
    const s = String(str).trim();
    if (s.length > 220 && !s.includes('?')) return true;
    if (
      /This information is collected in compliance/i.test(s) ||
      /Why Are You Being Asked to Complete This Form/i.test(s) ||
      /This employer is a Government contractor/i.test(s) ||
      /statistical purposes\.? It is not viewed/i.test(s) ||
      /VEVRAA|affirmative action to employ/i.test(s) ||
      /EEOC|Equal Employment Opportunity Commission/i.test(s) ||
      /Please read the following carefully/i.test(s) ||
      /^Equal Employment Opportunity$/i.test(s) ||
      /^Voluntary Self-Identification/i.test(s) ||
      /privacy policy|terms of service|all rights reserved/i.test(s)
    ) {
      return true;
    }
    return false;
  }

  // Extract clean inner text from a DOM node excluding scripts, styles, buttons, inputs, dropdown popups, accessibility noise
  function getCleanNodeText(node) {
    if (!node) return '';
    try {
      const clone = node.cloneNode(true);
      // Remove interactive input/form tags, buttons, options, popup listboxes, and live status announcement regions
      clone.querySelectorAll(
        'script, style, noscript, svg, template, iframe, button, input, select, textarea, option, optgroup, datalist, ' +
        '[role="listbox"], [role="option"], [role="menu"], [role="menuitem"], .k-list-container, .k-popup, .k-animation-container, ' +
        '.select2-dropdown, .dropdown-menu, .bootstrap-select .dropdown-menu, .mat-select-panel, .ant-select-dropdown, ' +
        '[aria-live], .sr-only, .visually-hidden, [class*="screen-reader"], [class*="sr-only"], .k-status, .k-status-text, ' +
        '[class*="autocomplete-results"], [class*="search-results"], .k-select, .k-icon, [class*="caret"], [class*="arrow"]'
      ).forEach(n => n.remove());
      const txt = clean(clone.innerText || clone.textContent || '');
      if (isCodeOrJunk(txt)) return '';
      return cleanFieldLabel(cleanLabelText(txt));
    } catch (_) {
      const raw = clean(node.innerText || node.textContent || '');
      return isCodeOrJunk(raw) ? '' : cleanFieldLabel(cleanLabelText(raw));
    }
  }

  // Find the specific choice option label for a single radio button
  function getRadioOptionLabel(radio) {
    if (!radio) return '';

    // 1. Explicit <label for="id">
    if (radio.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (label) {
          const txt = getCleanNodeText(label);
          if (txt && !isDisclaimerOrInstruction(txt)) return txt;
        }
      } catch (_) {}
    }

    // 2. Parent / ancestor <label>
    const parentLabel = radio.closest('label');
    if (parentLabel) {
      const txt = getCleanNodeText(parentLabel);
      if (txt && !isDisclaimerOrInstruction(txt)) return txt;
    }

    // 3. Direct next sibling (e.g. <input type="radio"> Yes)
    let next = radio.nextSibling;
    while (next) {
      if (next.nodeType === Node.TEXT_NODE && clean(next.nodeValue)) {
        return clean(next.nodeValue);
      }
      if (next.nodeType === Node.ELEMENT_NODE && ['SPAN', 'LABEL', 'DIV', 'B', 'STRONG'].includes(next.tagName)) {
        const txt = getCleanNodeText(next);
        if (txt && !isDisclaimerOrInstruction(txt)) return txt;
      }
      next = next.nextSibling;
    }

    // 4. ARIA label or value fallback
    const aria = radio.getAttribute('aria-label');
    if (aria) return clean(aria);

    return clean(radio.value || '');
  }

  // Find the overarching Question Header / Prompt for an entire radio group
  function getRadioGroupQuestion(radiosInGroup) {
    if (!radiosInGroup || radiosInGroup.length === 0) return 'Screening Question';

    const firstRadio = radiosInGroup[0];
    const optionLabels = new Set(
      radiosInGroup.map(r => getRadioOptionLabel(r).toLowerCase()).filter(Boolean)
    );

    // 1. Fieldset + Legend
    const fieldset = firstRadio.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) {
        const legendTxt = cleanFieldLabel(getCleanNodeText(legend));
        if (legendTxt && !optionLabels.has(legendTxt.toLowerCase()) && !isCodeOrJunk(legendTxt) && !isDisclaimerOrInstruction(legendTxt)) {
          return legendTxt;
        }
      }
    }

    // 2. ARIA labeledby on container / radio
    for (const r of radiosInGroup) {
      const labeledBy = r.getAttribute('aria-labelledby') || r.closest('[aria-labelledby]')?.getAttribute('aria-labelledby');
      if (labeledBy) {
        try {
          const target = document.getElementById(labeledBy);
          if (target) {
            const txt = cleanFieldLabel(getCleanNodeText(target));
            if (txt && !optionLabels.has(txt.toLowerCase()) && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return txt;
          }
        } catch (_) {}
      }
    }

    // 3. Walk ancestor hierarchy (up to 7 levels)
    let curr = firstRadio;
    let depth = 0;
    while (curr && curr !== document.body && curr !== document.documentElement && depth < 7) {
      depth++;

      // Check candidate headers inside current ancestor first
      const candidateHeaders = curr.querySelectorAll(
        '.jv-form-field-label, .jv-label, .control-label, [data-automation-id*="label"], [data-automation-id*="question"], ' +
        '[class*="label"], [class*="title"], [class*="header"], [class*="question"], [class*="prompt"], ' +
        'legend, h1, h2, h3, h4, h5, h6, strong, b'
      );

      for (const h of candidateHeaders) {
        if (radiosInGroup.some(r => r.closest('label') === h || r === h)) continue;
        const txt = cleanFieldLabel(getCleanNodeText(h));
        if (txt && !optionLabels.has(txt.toLowerCase()) && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) {
          return txt;
        }
      }

      // Check preceding siblings
      let prev = curr.previousElementSibling;
      while (prev) {
        if (['LABEL', 'LEGEND', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'STRONG', 'B'].includes(prev.tagName)) {
          const headEl = prev.matches('label, legend, h1, h2, h3, h4, h5, h6, strong, b')
            ? prev
            : prev.querySelector('label, legend, h1, h2, h3, h4, h5, h6, [class*="label"], [class*="title"], [class*="prompt"], [class*="question"], [data-automation-id*="label"], [data-automation-id*="question"], strong, b');
          const targetNode = headEl || prev;
          const txt = cleanFieldLabel(getCleanNodeText(targetNode));
          if (txt && !optionLabels.has(txt.toLowerCase()) && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) {
            return txt;
          }
        }
        prev = prev.previousElementSibling;
      }

      curr = curr.parentElement;
    }

    // 4. Group Name fallback formatted nicely
    const rawName = firstRadio.name || firstRadio.getAttribute('data-automation-id') || '';
    if (rawName) {
      const formatted = rawName
        .replace(/^[a-zA-Z0-9_-]+\[([a-zA-Z0-9_-]+)\]$/, '$1')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
      if (formatted && formatted.length > 2) return cleanFieldLabel(formatted);
    }

    return 'Screening Question';
  }

  // Check if a dropdown or field value is an empty placeholder
  function isUnansweredPlaceholder(text) {
    if (!text) return true;
    const s = String(text).trim().toLowerCase();
    if (['', 'unanswered', 'no file chosen', 'unselected', '(empty)', '(blank)', 'null', 'undefined', 'no answer', '-- no answer --', '- no answer -', 'not specified', '-- not specified --', 'please select', '-- select --', '- select -', 'select one', '-- select one --', 'select an option', '-- select an option --', 'select...', 'choose...', 'choose an option', 'select a gender...', 'select a race...', 'select state', 'select country', '--', '---', 'required', '(required)', '[required]', 'optional', '(optional)', '[optional]', 'required field', '*required', '*req', '*'].includes(s)) {
      return true;
    }
    if (/^(--|-)?\s*(select|choose|please select|select one|select an option|no answer|not specified|required|optional)\s*(--|-)?$/i.test(s)) {
      return true;
    }
    return false;
  }

  // Detect if a form field / question is required / mandatory
  function isFieldRequired(el, labelText) {
    if (el) {
      if (el.hasAttribute('required') || el.required === true) return true;
      if (el.getAttribute('aria-required') === 'true') return true;
      if (el.getAttribute('data-required') === 'true' || el.getAttribute('data-required') === 'required') return true;
      if (el.classList && (el.classList.contains('required') || el.classList.contains('is-required') || el.classList.contains('mandatory') || el.classList.contains('jv-required'))) return true;
    }

    const txt = String(labelText || '');
    if (txt.includes('*') || /\(\s*required\s*\)/i.test(txt) || /\[\s*required\s*\]/i.test(txt) || (/\brequired\b/i.test(txt) && !/\boptional\b/i.test(txt))) {
      if (!/\(\s*optional\s*\)/i.test(txt) && !/\[\s*optional\s*\]/i.test(txt)) {
        if (txt.includes('*') || /\(\s*required\s*\)/i.test(txt) || /\[\s*required\s*\]/i.test(txt)) {
          return true;
        }
      }
    }

    if (el) {
      let labelEl = null;
      if (el.id) {
        try {
          labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        } catch (_) {}
      }
      if (!labelEl) {
        labelEl = el.closest('label');
      }

      if (labelEl) {
        if (labelEl.classList.contains('required') || labelEl.classList.contains('is-required') || labelEl.classList.contains('jv-required') || labelEl.classList.contains('mandatory')) return true;
        const starEl = labelEl.querySelector('.required, .asterisk, .star, .req, abbr[title*="required"], [data-required="true"]');
        if (starEl) return true;
        if (labelEl.innerText && labelEl.innerText.includes('*')) return true;
      }

      const container = el.closest('.jv-form-field, .form-group, .field, .form-row, .application-question, [data-automation-id*="formField"], [class*="question"], [class*="formField"], [class*="form-item"], .form-item, fieldset, tr');
      if (container) {
        if (container.classList.contains('required') || container.classList.contains('is-required') || container.classList.contains('jv-required') || container.classList.contains('mandatory') || container.getAttribute('data-required') === 'true') {
          return true;
        }
        const hasReqMarker = container.querySelector('.required, .asterisk, .star, .req, abbr[title*="required"], [data-required="true"], .mandatory');
        if (hasReqMarker) return true;
        const legendOrHeader = container.querySelector('legend, .jv-form-field-label, .control-label, [class*="label"], [class*="title"]');
        if (legendOrHeader && legendOrHeader.innerText && legendOrHeader.innerText.includes('*')) {
          return true;
        }
      }
    }

    return false;
  }

  // Clean concatenated placeholder suffixes, live autocomplete announcements, and options echoes from field labels
  function cleanFieldLabel(str) {
    if (!str) return '';
    let txt = clean(str);

    // 1. Remove live autocomplete announcements (e.g. "6 results are available.3780 NW 22nd Ave...")
    txt = txt.replace(/\b\d+\s+results?\s+(?:are\s+)?available\.?.*$/i, '');
    txt = txt.replace(/\b\d+\s+results?\s+(?:are\s+)?available\.?/i, '');

    // 2. Remove selection confirmations (e.g. "3780 Northwest 22nd Avenue selected.")
    txt = txt.replace(/\s*[A-Za-z0-9\s,#.-]+selected\.?$/i, '');

    // 3. Remove trailing/concatenated "Required" / "Optional" markers: e.g. "Email Required", "Please ExplainRequired", "(Required)"
    txt = txt.replace(/\s*\(\s*(?:required|optional|req)\s*\)\s*$/i, '');
    txt = txt.replace(/\s*\[\s*(?:required|optional|req)\s*\]\s*$/i, '');
    txt = txt.replace(/\s*\b(?:Required|Optional|Req)\b\s*$/i, '');
    txt = txt.replace(/([a-z0-9])(?:Required|Optional|Req)\b/i, '$1');

    // 4. Remove trailing concatenated Yes/No/Options on question headers: e.g. "(required)YesNo", "?YesNo", "?--", "(optional)--"
    txt = txt.replace(/(\(\s*required\s*\)|\(\s*optional\s*\)|\?)\s*(?:Yes\s*No|No\s*Yes|Yes\*?\s*No|--\s*Yes\s*No|--|Yes|No)$/i, '$1');
    txt = txt.replace(/(\?)\s*(?:Yes|No|--|Prefer not to say|Hourly|Yearly)+$/i, '$1');

    // 5. Remove dropdown option list cascades (e.g. "----YesNo", "No--YesNo", "----HourlyYearly", "Yearly--HourlyYearly", "Male--MaleFemale...")
    txt = txt.replace(/^(?:--+|[A-Za-z0-9*]+\s*--+)\s*(?:Yes\*?|No|Hourly|Yearly|Male|Female|Prefer|Unspecified|Specialized|Other|High School|College|University|Graduate).*$/i, '');
    txt = txt.replace(/^(?:--+|----)[A-Za-z0-9\s,*_-]+$/i, '');

    // 6. Remove concatenated dropdown placeholders & selected option suffixes:
    // e.g. "CountrySelect a country", "CountryUnited States", "StateSelect a state", "StateFL"
    txt = txt.replace(/^(Country)\s*(?:Select\s+(?:a\s+)?country|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|United States|Federated States.*)$/i, '$1');
    txt = txt.replace(/^(State)\s*(?:Select\s+(?:a\s+)?state|[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    txt = txt.replace(/^(County)\s*(?:Select\s+(?:a\s+)?county|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    txt = txt.replace(/^(City)\s*(?:Select\s+(?:a\s+)?city|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    
    // Remove embedded "Select a/an..."
    txt = txt.replace(/([a-zA-Z])\s*Select\s+(?:a|an|one|from|item|apt)?\s*[a-zA-Z.]*/gi, '$1');
    txt = txt.replace(/\b(Select\s+(?:a|an|one|from|item|apt)\s+[a-zA-Z.]+)\b/gi, '').trim();

    // 7. Remove trailing option values attached to optional/custom questions:
    txt = txt.replace(/(\(\s*optional\s*\))\s*[A-Za-z0-9\s/_-]+$/i, '$1');

    // 8. Strip leading/trailing junk symbols like '--', ':', '*'
    txt = txt.replace(/^[-–—:\s*#]+|[-–—:\s*#]+$/g, '').trim();

    return clean(txt) || clean(str);
  }

  // Detect junk or phantom fields that shouldn't pollute the screening payload
  function isJunkOrPhantomField(label, el) {
    if (!label) return true;
    const l = label.trim().toLowerCase();
    if (l.length < 2) return true;
    if (['--', 'pre', 'select an item', 'checkbox label', '6 results are available.', 'performance cookies', 'required', 'optional'].includes(l)) return true;
    if (/^(--|----)/.test(l)) return true;
    if (/^\d+\s+results?\s+are\s+available/i.test(l)) return true;
    return false;
  }

  // Extract custom dropdown / combobox selected values from DOM widgets
  function extractCustomSelectValue(input) {
    if (!input) return '';

    // Only search combobox/listbox/custom select containers, never generic form-groups of standard text inputs
    const container = input.closest(
      '[role="combobox"], [role="listbox"], [data-automation-id*="select"], [data-automation-id*="dropdown"], ' +
      '.k-dropdown, [data-role="dropdownlist"], [class*="k-widget"], .select2-container, .bootstrap-select, mat-select'
    );

    if (container) {
      // 1. Check standard single-value / selected elements
      const selectedEl = container.querySelector(
        '.k-input, [class*="k-input"], [class*="singleValue"], [class*="single-value"], [class*="selectedItem"], ' +
        '[class*="selected-value"], [class*="selection__rendered"], [data-automation-id*="selectedItem"], ' +
        '.select2-selection__rendered, [aria-selected="true"], .current-value, .select-value, ' +
        '.filter-option-inner-inner, .filter-option-inner, .filter-option, .selected-option, .mat-select-value-text, ' +
        '.ant-select-selection-item, .p-dropdown-label, .ng-value-label'
      );
      if (selectedEl) {
        const txt = clean(selectedEl.innerText || selectedEl.textContent);
        if (txt && !isUnansweredPlaceholder(txt) && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return txt;
      }

      // 2. Check button.dropdown-toggle title or aria-label attribute
      const btn = container.querySelector('button.dropdown-toggle, [data-toggle="dropdown"], button[role="combobox"]');
      if (btn) {
        const titleVal = clean(btn.getAttribute('title') || btn.getAttribute('aria-label') || '');
        if (titleVal && !isUnansweredPlaceholder(titleVal) && !isCodeOrJunk(titleVal)) return titleVal;
        const btnTxt = clean(btn.innerText || btn.textContent);
        if (btnTxt && !isUnansweredPlaceholder(btnTxt) && !isCodeOrJunk(btnTxt)) return btnTxt;
      }
    }

    return '';
  }

  // Find the text label for any standard form element
  function getElementLabel(el) {
    if (!el) return '';

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) {
          const txt = getCleanNodeText(label);
          if (txt && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return cleanFieldLabel(txt);
        }
      } catch (_) {}
    }

    // 2. Parent / ancestor <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const txt = getCleanNodeText(parentLabel);
      if (txt && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return cleanFieldLabel(txt);
    }

    // 3. ARIA attributes
    if (el.getAttribute('aria-label')) {
      const aria = cleanFieldLabel(clean(el.getAttribute('aria-label')));
      if (aria && !isCodeOrJunk(aria) && !isDisclaimerOrInstruction(aria)) return aria;
    }
    if (el.getAttribute('aria-labelledby')) {
      try {
        const target = document.getElementById(el.getAttribute('aria-labelledby'));
        if (target) {
          const txt = getCleanNodeText(target);
          if (txt && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return cleanFieldLabel(txt);
        }
      } catch (_) {}
    }

    // 4. Ancestor Tree Walk (Up to 7 levels)
    let curr = el;
    let depth = 0;
    while (curr && curr !== document.body && curr !== document.documentElement && depth < 7) {
      depth++;

      if (curr !== el) {
        const candidateHeaders = curr.querySelectorAll(
          'label, legend, .control-label, [data-automation-id*="label"], [data-automation-id*="question"], [data-automation-id*="prompt"], ' +
          '[class*="label"], [class*="title"], [class*="header"], [class*="prompt"], [class*="question"], ' +
          'h1, h2, h3, h4, h5, h6, strong, b'
        );

        for (const h of candidateHeaders) {
          if (h.contains(el) && h.tagName !== 'LABEL') continue;
          if (h === el) continue;
          const txt = cleanFieldLabel(getCleanNodeText(h));
          if (txt && txt.length >= 2 && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) {
            return txt;
          }
        }
      }

      let prev = curr.previousElementSibling;
      while (prev) {
        if (['LABEL', 'LEGEND', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV', 'STRONG', 'B'].includes(prev.tagName)) {
          const headEl = prev.matches('label, legend, h1, h2, h3, h4, h5, h6, strong, b')
            ? prev
            : prev.querySelector('label, legend, h1, h2, h3, h4, h5, h6, [class*="label"], [class*="title"], [class*="prompt"], [class*="question"], [data-automation-id*="label"], [data-automation-id*="question"], strong, b');
          
          const targetNode = headEl || prev;
          const txt = cleanFieldLabel(getCleanNodeText(targetNode));
          if (txt && txt.length >= 2 && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) {
            if (!prev.querySelector('input, textarea, select') || headEl) {
              return txt;
            }
          }
        }
        prev = prev.previousElementSibling;
      }

      curr = curr.parentElement;
    }

    // 5. Placeholder, title, name, autocomplete fallback
    const fallback = clean(el.placeholder || el.title || el.name || el.getAttribute('data-automation-id') || el.id || '');
    if (fallback && !isCodeOrJunk(fallback)) {
      const formatted = fallback
        .replace(/^[a-zA-Z0-9_-]+\[([a-zA-Z0-9_-]+)\]$/, '$1')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
      const cleaned = cleanFieldLabel(formatted);
      if (cleaned.length > 1 && !isDisclaimerOrInstruction(cleaned)) return cleaned;
    }

    if (el.type === 'tel' || el.autocomplete === 'tel') return 'Phone';
    if (el.type === 'email' || el.autocomplete === 'email') return 'Email';
    if (el.type === 'file') return 'Resume / CV';

    return '';
  }

  // Detect ATS platform
  function detectAtsPlatform() {
    const host = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();

    if (host.includes('myworkdayjobs.com') || host.includes('workday.com') || document.querySelector('[data-automation-id*="workday"]')) return 'workday';
    if (host.includes('greenhouse.io') || document.querySelector('#grnhse_app, #greenhouse')) return 'greenhouse';
    if (host.includes('lever.co') || document.querySelector('.lever-form, .application-page')) return 'lever';
    if (host.includes('paylocity.com') || url.includes('paylocity')) return 'paylocity';
    if (host.includes('bamboohr.com') || url.includes('bamboohr')) return 'bamboohr';
    if (host.includes('adp.com') || url.includes('adp')) return 'adp';
    if (host.includes('jazzhr.com') || host.includes('applytojob.com')) return 'jazzhr';
    if (host.includes('workable.com') || url.includes('workable')) return 'workable';
    if (host.includes('ultipro.com') || host.includes('ukg.com')) return 'ukg';
    if (host.includes('icims.com')) return 'icims';
    if (host.includes('taleo.net')) return 'taleo';
    if (host.includes('ashbyhq.com') || host.includes('ashby.io')) return 'ashby';
    if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (host.includes('jobvite.com')) return 'jobvite';
    if (host.includes('rippling.com')) return 'rippling';
    if (url.includes('workday') || document.querySelector('[data-automation-id]')) return 'workday';
    return 'generic';
  }

  // Detect honeypots, bot traps, and password inputs
  function isHoneypotOrLoginField(el, labelText) {
    if (!el) return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'password') return true;

    const txt = String(labelText || '').toLowerCase();
    if (
      txt.includes('robots only') || 
      txt.includes('for robots') || 
      txt.includes('do not enter') || 
      txt.includes('do not fill') || 
      txt.includes('leave this field blank') || 
      txt.includes('honeypot') || 
      txt.includes('bot trap') ||
      txt.includes('bot-trap')
    ) {
      return true;
    }

    const name = (el.name || el.id || el.getAttribute('data-automation-id') || '').toLowerCase();
    if (name.includes('honeypot') || name.includes('bot_trap') || name.includes('nobot') || name.includes('botcheck')) {
      return true;
    }

    try {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0' || 
        style.height === '0px' || 
        parseFloat(style.width) === 0 ||
        (style.position === 'absolute' && (parseFloat(style.left) < -500 || parseFloat(style.top) < -500))
      ) {
        return true;
      }
    } catch (_) {}

    return false;
  }

  // Detect if the job application is already submitted or already applied
  function detectAlreadyApplied() {
    // 1. Direct platform status badges / buttons / links
    const statusElements = document.querySelectorAll(
      'button, [role="button"], a, .btn, .applied-badge, .application-status, [data-automation-id*="applied"], [data-testid*="applied"], [class*="applied"], [class*="status"]'
    );
    for (const b of statusElements) {
      if (b.closest && b.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      const txt = clean(b.innerText || b.textContent || '');
      if (/^(applied|applied\s*✓|already\s*applied|submitted|already\s*submitted)$/i.test(txt)) {
        return { is_already_applied: true, message: `Portal button shows: "${txt}"` };
      }
    }

    const selectors = [
      '[data-automation-id*="alreadyApplied"]',
      '[data-automation-id*="applicationStatus"]',
      '.already-applied',
      '.application-status-applied',
      '.job-applied-banner',
      '.applied-badge'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = getCleanNodeText(el);
        if (txt && /applied|submitted/i.test(txt)) {
          return { is_already_applied: true, message: txt };
        }
      }
    }

    const appliedPatterns = [
      /application (?:was |is )?already (?:submitted|received|on file)/i,
      /you(?:'ve| have) already (?:applied|submitted)/i,
      /received your previous application/i,
      /already applied (?:for|to) this (?:job|position|role|posting)/i,
      /you applied on [a-zA-Z0-9,\s/-]+/i,
      /previous application on [a-zA-Z0-9,\s/-]+/i,
      /welcome to (?:submit|apply) (?:again|a new application) (?:after|\d+ (?:months|days|weeks))/i,
      /application (?:is )?currently on file/i,
      /^you've already applied for this job\./i,
      /^already applied$/i,
      /already submitted/i
    ];

    const elements = document.querySelectorAll('h1, h2, h3, h4, h5, .alert, .banner, .notification, .status-message, .flash-message, [class*="alert"], [class*="banner"], [class*="notice"], p, div');
    for (const el of elements) {
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      if (el.children.length > 6 && el.innerText.length > 400) continue;

      const txt = clean(el.innerText || '');
      if (!txt || txt.length > 300) continue;

      for (const pattern of appliedPatterns) {
        if (pattern.test(txt)) {
          return { is_already_applied: true, message: txt };
        }
      }
    }

    return { is_already_applied: false, message: '' };
  }

  // Detect if the job application was just successfully submitted / confirmed (Quick Apply or Standard ATS)
  function detectSubmissionSuccess() {
    // 1. Direct platform status badges/buttons
    const appliedButtons = document.querySelectorAll(
      'button, [role="button"], .applied-badge, .application-status, [data-automation-id*="applied"], [data-testid*="applied"], [class*="applied"]'
    );
    for (const b of appliedButtons) {
      if (b.closest && b.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      const txt = clean(b.innerText || b.textContent || '');
      if (/^(applied|applied\s*✓|application\s*submitted|application\s*sent|already\s*applied)$/i.test(txt)) {
        return { is_success: true, message: txt };
      }
    }

    // 2. Headings, alerts, and banners indicating submission completion
    const successPatterns = [
      /application\s+(?:has been|was|is)\s+(?:successfully\s+)?(?:submitted|sent|received)/i,
      /your\s+application\s+(?:for\s+.+\s+)?(?:was|has been)\s+(?:sent|submitted|received)/i,
      /thank\s*you\s+for\s+applying/i,
      /thanks\s+for\s+applying/i,
      /we(?:'ve| have)\s+received\s+your\s+application/i,
      /your\s+application\s+has\s+been\s+received/i,
      /congratulations!?(?:\s+your\s+application\s+was\s+sent)?/i,
      /^application\s+submitted!?$/i,
      /^application\s+sent!?$/i,
      /^applied\s+on\s+ziprecruiter!?/i,
      /^applied\s+with\s+indeed!?/i,
      /you\s+applied\s+to\s+this\s+job/i,
      /your\s+application\s+is\s+on\s+its\s+way/i
    ];

    const elements = document.querySelectorAll(
      'h1, h2, h3, h4, .alert, .banner, .notification, .modal-body, .modal-title, .status-message, [class*="success"], [class*="confirmation"], [class*="applied"], p, div'
    );
    for (const el of elements) {
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      if (el.children.length > 5 && el.innerText.length > 300) continue;

      const txt = clean(el.innerText || '');
      if (!txt || txt.length > 250) continue;

      for (const pattern of successPatterns) {
        if (pattern.test(txt)) {
          return { is_success: true, message: txt };
        }
      }
    }

    return { is_success: false, message: '' };
  }

  // Detect CAPTCHA or Human Verification challenges on the page
  function detectCaptcha() {
    const captchaSelectors = [
      '.g-recaptcha',
      '.h-captcha',
      '.cf-turnstile',
      '[data-sitekey]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="turnstile"]',
      'iframe[src*="captcha"]',
      'iframe[title*="reCAPTCHA" i]',
      'iframe[title*="hCaptcha" i]',
      'iframe[title*="Cloudflare" i]',
      '[id*="recaptcha" i]',
      '[id*="hcaptcha" i]',
      '[id*="cf-turnstile" i]',
      '[class*="captcha-container" i]',
      '[class*="captcha_box" i]'
    ];

    let foundEl = null;
    let captchaType = 'General Verification';

    for (const sel of captchaSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.top < window.innerHeight + 500 && rect.bottom > -500)) {
            foundEl = el;
            const html = (el.outerHTML || '').toLowerCase();
            const src = (el.getAttribute('src') || '').toLowerCase();
            if (html.includes('recaptcha') || src.includes('recaptcha')) captchaType = 'Google reCAPTCHA';
            else if (html.includes('hcaptcha') || src.includes('hcaptcha')) captchaType = 'hCaptcha';
            else if (html.includes('turnstile') || src.includes('turnstile')) captchaType = 'Cloudflare Turnstile';
            else if (html.includes('arkoselabs') || src.includes('arkose')) captchaType = 'Arkose Labs Challenge';
            break;
          }
        }
      } catch (_) {}
      if (foundEl) break;
    }

    if (!foundEl) {
      try {
        const textNodes = Array.from(document.querySelectorAll('label, p, span, div, h3, h4'));
        for (const node of textNodes) {
          if (node.closest && node.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
          if (node.children.length > 3) continue;
          const txt = (node.innerText || '').trim();
          if (/I(?:'| a)m not a robot|verify that you are human|complete the security check|security verification|puzzle challenge/i.test(txt)) {
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              foundEl = node;
              captchaType = 'Human Check Prompt';
              break;
            }
          }
        }
      } catch (_) {}
    }

    return {
      has_captcha: Boolean(foundEl),
      type: foundEl ? captchaType : null,
      element: foundEl,
      message: foundEl ? `${captchaType} detected: Form pre-filling automated. Please solve this check manually.` : null
    };
  }

  // 1. URL Extraction (Reading Apply-Flow Job & Profile IDs from Query, Hash, Session, or Persisted Background Storage)
  function extractApplyFlowParams() {
    let searchParams, hashParams;
    try {
      const url = new URL(window.location.href);
      searchParams = url.searchParams;
      const rawHash = (url.hash || '').replace(/^#/, '');
      const hashQuery = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : rawHash;
      hashParams = new URLSearchParams(hashQuery);
    } catch (_) {
      searchParams = new URLSearchParams(window.location.search);
      const rawHash = (window.location.hash || '').replace(/^#/, '');
      const hashQuery = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : rawHash;
      hashParams = new URLSearchParams(hashQuery);
    }
    const getParam = (key) => searchParams.get(key) || hashParams.get(key) || '';

    const params = {
      jobId: getParam('job_id') || getParam('sqc_job_id') || getParam('portal_job_id') || getParam('jobId') || getParam('job_portal_id') || getParam('app_id') || '',
      profileId: getParam('profile_id') || getParam('candidate_id') || getParam('candidateId') || getParam('sqc_candidate_id') || '',
      profileName: getParam('profile_name') || getParam('candidate_name') || getParam('candidateName') || '',
      applierId: getParam('applier_id') || getParam('user_id') || getParam('userId') || ''
    };

    // Multi-Step ATS Wizard Persistence in sessionStorage
    try {
      if (params.jobId) sessionStorage.setItem('applyflow_job_id', params.jobId);
      if (params.profileId) sessionStorage.setItem('applyflow_profile_id', params.profileId);
      if (params.profileName) sessionStorage.setItem('applyflow_profile_name', params.profileName);
      if (params.applierId) sessionStorage.setItem('applyflow_applier_id', params.applierId);

      // Fallback from sessionStorage if empty in current sub-page URL
      if (!params.jobId) params.jobId = sessionStorage.getItem('applyflow_job_id') || '';
      if (!params.profileId) params.profileId = sessionStorage.getItem('applyflow_profile_id') || '';
      if (!params.profileName) params.profileName = sessionStorage.getItem('applyflow_profile_name') || '';
      if (!params.applierId) params.applierId = sessionStorage.getItem('applyflow_applier_id') || '';

      // Fallback from injected background persisted session
      if (window.__SQC_PERSISTED_AF_SESSION) {
        if (!params.jobId && window.__SQC_PERSISTED_AF_SESSION.jobId) {
          params.jobId = window.__SQC_PERSISTED_AF_SESSION.jobId;
        }
        if (!params.profileId && window.__SQC_PERSISTED_AF_SESSION.profileId) {
          params.profileId = window.__SQC_PERSISTED_AF_SESSION.profileId;
        }
        if (!params.profileName && window.__SQC_PERSISTED_AF_SESSION.profileName) {
          params.profileName = window.__SQC_PERSISTED_AF_SESSION.profileName;
        }
        if (!params.applierId && window.__SQC_PERSISTED_AF_SESSION.applierId) {
          params.applierId = window.__SQC_PERSISTED_AF_SESSION.applierId;
        }
      }
    } catch (_) {}

    return params;
  }

  // Helper to parse numerical amount from strings like "$140,000", "140k", "$75/hr"
  function parseSalaryValue(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    let isK = s.endsWith('k');
    s = s.replace(/[^0-9.]/g, '');
    let num = parseFloat(s);
    if (isNaN(num)) return null;
    if (isK && num < 1000) num = num * 1000;
    return num;
  }

  // Detect compensation / salary range mentioned in Job Description (JD) or Apply-Flow context
  function detectJdSalaryRange() {
    let rawText = '';
    let minVal = null;
    let maxVal = null;
    let isHourly = false;

    // 1. Check Apply-Flow Context first
    if (window.__SQC_APPLYFLOW_CONTEXT) {
      const af = window.__SQC_APPLYFLOW_CONTEXT;
      const targetSal = af.targetSalary || af.salary || af.salaryRange || '';
      if (targetSal) {
        rawText = String(targetSal);
      }
    }

    // 2. Scan DOM for salary/compensation keywords and containers
    if (!rawText) {
      const salaryContainers = document.querySelectorAll(
        '[data-automation-id*="salary" i], [data-automation-id*="compensation" i], ' +
        '.salary, .compensation, .pay-range, .job-salary, .job-compensation, ' +
        '[class*="salary-range" i], [class*="compensation-range" i], ' +
        '[data-qa="salary"], [data-qa="compensation"], ' +
        '.job-description, #job-description, .posting-description, [data-automation-id="jobPostingDescription"]'
      );

      const regexPatterns = [
        // $140,000 - $180,000 or $140k - $180k (yearly/hourly)
        /(?:\$|USD\s*)([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]{2,3}k)\s*(?:-|–|—|to)\s*(?:\$|USD\s*)?([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]{2,3}k)(?:\s*(?:\/|\s*per\s*)(?:year|yr|annum|hr|hour))?/i,
        // $70 - $95 / hr or / hour
        /(?:\$|USD\s*)([0-9]{2,3}(?:\.[0-9]{2})?)\s*(?:-|–|—|to)\s*(?:\$|USD\s*)?([0-9]{2,3}(?:\.[0-9]{2})?)\s*(?:\/|\s*per\s*)(?:hr|hour)/i,
        // Salary: $150,000 / year or up to $180,000
        /(?:salary|compensation|pay\s*range|base\s*pay)\s*(?:is|:|\s)\s*(?:\$|USD\s*)([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]{2,3}k)(?:\s*(?:\/|\s*per\s*)(?:year|yr|annum))?/i,
        // Up to $170,000
        /(?:up\s*to|max(?:imum)?)\s*(?:\$|USD\s*)([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]{2,3}k)/i
      ];

      for (const el of salaryContainers) {
        if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
        const txt = (el.innerText || '').trim();
        if (!txt) continue;

        for (const re of regexPatterns) {
          const match = txt.match(re);
          if (match) {
            rawText = match[0];
            break;
          }
        }
        if (rawText) break;
      }

      // If still not found, check entire body text using targeted regex
      if (!rawText && document.body) {
        const bodyTxt = document.body.innerText || '';
        for (const re of regexPatterns) {
          const match = bodyTxt.match(re);
          if (match) {
            rawText = match[0];
            break;
          }
        }
      }
    }

    if (rawText) {
      isHourly = /hr|hour/i.test(rawText);
      const rangeMatch = rawText.match(/(?:\$|USD\s*)?([0-9.,kK]+)\s*(?:-|–|—|to)\s*(?:\$|USD\s*)?([0-9.,kK]+)/i);
      if (rangeMatch) {
        minVal = parseSalaryValue(rangeMatch[1]);
        maxVal = parseSalaryValue(rangeMatch[2]);
      } else {
        const singleMatch = rawText.match(/(?:\$|USD\s*)?([0-9.,kK]+)/i);
        if (singleMatch) {
          const val = parseSalaryValue(singleMatch[1]);
          minVal = val;
          maxVal = val;
        }
      }
    }

    return {
      has_jd_salary: Boolean(minVal || maxVal),
      raw: rawText,
      min: minVal,
      max: maxVal,
      isHourly: isHourly
    };
  }

  // Compute optimal salary target based on candidate profile base floor and JD budget
  function computeOptimalSalary(profile, jdSalary, fieldPrompt = '') {
    const p = profile || {};
    const comp = p.compensation || {};
    const profileBase = Number(comp.salaryFloor || p.salaryFloor || 120000);
    const profileDesired = Number(comp.desiredSalary || 130000);

    const prompt = String(fieldPrompt || '').toLowerCase();
    const isHourlyField = /hour|hr|hourly|rate/i.test(prompt) && !/year|annual|yr/i.test(prompt);

    let targetVal = profileDesired;
    let rangeMin = profileBase;
    let rangeMax = profileDesired + 15000;
    let strategy = 'Default Profile Desired (No JD salary listed)';

    const jd = jdSalary || {};
    if (jd.has_jd_salary && (jd.min || jd.max)) {
      let jMin = jd.min || jd.max;
      let jMax = jd.max || jd.min;

      // Convert hourly to yearly if comparing with yearly profileBase
      let jMinYearly = jd.isHourly ? Math.round(jMin * 2080) : jMin;
      let jMaxYearly = jd.isHourly ? Math.round(jMax * 2080) : jMax;

      if (jMaxYearly > profileBase) {
        if (jMinYearly >= profileBase) {
          // Company range is comfortably above profile base floor
          // Target upper-mid of the posted range (~70%)
          const span = jMaxYearly - jMinYearly;
          const optimalYearly = span > 0 ? Math.round(jMinYearly + span * 0.70) : jMaxYearly;
          targetVal = Math.round(optimalYearly / 1000) * 1000;
          rangeMin = Math.round(Math.max(jMinYearly, profileBase) / 1000) * 1000;
          rangeMax = Math.round(jMaxYearly / 1000) * 1000;
          strategy = `Optimized Upper-Mid Range (JD: $${jMinYearly.toLocaleString()} - $${jMaxYearly.toLocaleString()})`;
        } else {
          // Company range starts below base floor but max is above
          // Target between profileBase and jMax (~60% of gap)
          const span = jMaxYearly - profileBase;
          const optimalYearly = Math.round(profileBase + span * 0.60);
          targetVal = Math.round(optimalYearly / 1000) * 1000;
          rangeMin = profileBase;
          rangeMax = Math.round(jMaxYearly / 1000) * 1000;
          strategy = `Mid-High Range above Profile Floor (JD Max: $${jMaxYearly.toLocaleString()})`;
        }
      } else {
        // JD max is below candidate base floor
        targetVal = profileDesired;
        rangeMin = profileBase;
        rangeMax = profileDesired + 10000;
        strategy = `Profile Base Floor (JD Max $${jMaxYearly.toLocaleString()} below Floor $${profileBase.toLocaleString()})`;
      }

      // If hourly field requested specifically
      if (isHourlyField) {
        if (jd.isHourly) {
          const hSpan = jMax - jMin;
          targetVal = hSpan > 0 ? Math.round((jMin + hSpan * 0.70) * 100) / 100 : jMax;
          rangeMin = jMin;
          rangeMax = jMax;
        } else {
          targetVal = Math.round((targetVal / 2080) * 100) / 100;
          rangeMin = Math.round((rangeMin / 2080) * 100) / 100;
          rangeMax = Math.round((rangeMax / 2080) * 100) / 100;
        }
      }
    } else {
      if (isHourlyField) {
        targetVal = Math.round((profileDesired / 2080) * 100) / 100;
        rangeMin = Math.round((profileBase / 2080) * 100) / 100;
        rangeMax = Math.round(((profileDesired + 15000) / 2080) * 100) / 100;
        strategy = 'Default Hourly Equivalent';
      }
    }

    return {
      target: String(targetVal),
      targetNumeric: targetVal,
      rangeMin: String(rangeMin),
      rangeMax: String(rangeMax),
      formatted: `$${targetVal.toLocaleString()}`,
      formattedRange: `$${rangeMin.toLocaleString()} - $${rangeMax.toLocaleString()}`,
      strategy,
      jdSalary: jd
    };
  }

  // Detect Job Information (Job Title, Company, Requisition ID, URL)
  function detectJobContext() {
    let jobTitle = '';
    let company = '';
    let reqId = '';
    const ats = detectAtsPlatform();
    const applyFlow = extractApplyFlowParams();

    const titleCandidates = [
      document.querySelector('[data-automation-id="jobPostingHeader"]'),
      document.querySelector('[data-automation-id="headerTitle"]'),
      document.querySelector('.app-title'),
      document.querySelector('.job-title'),
      document.querySelector('.posting-headline h2'),
      document.querySelector('h1.heading'),
      document.querySelector('h1'),
      document.querySelector('h2')
    ];

    for (const el of titleCandidates) {
      if (el) {
        const txt = getCleanNodeText(el);
        if (txt) {
          if (/^careers at /i.test(txt) || /^jobs at /i.test(txt)) {
            if (!company) company = txt.replace(/^careers at |^jobs at /i, '').trim();
            continue;
          }
          jobTitle = txt;
          break;
        }
      }
    }

    if (!jobTitle && document.title) {
      const parts = document.title.split(/[-–—|•]/);
      jobTitle = clean(parts[0]);
      if (parts.length > 1) company = clean(parts[1]);
    }

    const compCandidates = [
      document.querySelector('[data-automation-id="companyName"]'),
      document.querySelector('.company-name'),
      document.querySelector('.posting-headline .company'),
      document.querySelector('meta[property="og:site_name"]'),
      document.querySelector('meta[name="company"]')
    ];

    for (const el of compCandidates) {
      if (el) {
        const val = clean(el.innerText || el.getAttribute('content') || el.getAttribute('alt'));
        if (val && !isCodeOrJunk(val)) {
          company = val;
          break;
        }
      }
    }

    if (!company) {
      const host = window.location.hostname.replace(/^(www|boards|jobs|careers)\./, '').split('.')[0];
      if (host && !['localhost', 'workday', 'greenhouse', 'lever'].includes(host)) {
        company = host.charAt(0).toUpperCase() + host.slice(1);
      }
    }

    const reqCandidates = [
      document.querySelector('[data-automation-id="jobPostingId"]'),
      document.querySelector('[data-automation-id="requisitionId"]'),
      document.querySelector('.requisition-id'),
      document.querySelector('[data-qa="req-id"]')
    ];

    for (const el of reqCandidates) {
      if (el) {
        const txt = getCleanNodeText(el);
        if (txt) {
          reqId = txt.replace(/req(uisition)?\s*(id|#)?\s*:?/i, '').trim();
          break;
        }
      }
    }

    if (!reqId) {
      const params = new URLSearchParams(window.location.search);
      reqId = params.get('gh_jid') || params.get('job_id') || params.get('req_id') || params.get('requisitionId') || '';
      if (!reqId) {
        const match = window.location.pathname.match(/(?:jobs|requisitions|posting|req|apply|details)[/-]([a-zA-Z0-9_-]{4,20})/i);
        if (match) reqId = match[1];
      }
    }

    const jdSalary = detectJdSalaryRange();

    return {
      job_title: jobTitle || 'Application Role',
      company: company || 'Employer',
      req_id: reqId || '',
      portal_job_id: applyFlow.jobId || '',
      target_candidate_id: applyFlow.profileId || '',
      profile_name: applyFlow.profileName || '',
      applier_id: applyFlow.applierId || '',
      ats_domain: ats,
      job_url: window.location.href,
      jd_salary: jdSalary
    };
  }

  // Canonicalize label keys to prevent minor DOM mutations from creating duplicate entries
  function getCanonicalLabelKey(label) {
    if (!label) return '';
    return label.toLowerCase()
      .replace(/\(\s*required\s*\)|\(\s*optional\s*\)/g, '')
      .replace(/[*:\s_/-]+/g, ' ')
      .trim();
  }

  // Master Form State Extraction
  function extractAllFields() {
    const job = detectJobContext();
    const alreadyAppliedInfo = detectAlreadyApplied();

    let firstName = '';
    let lastName = '';
    let fullName = '';
    let email = '';
    let phone = '';
    let salary = '';
    let salaryNumeric = null;
    let resumeFilename = '';
    let resumeSize = null;

    const allFormEntries = [];
    const processedElements = new Set();

    const elementRefs = {
      names: {},
      email: null,
      phone: null,
      salary: null,
      resume: null,
      questions: []
    };

    // Helper to mark element and its enclosing custom widget elements as processed
    function markWidgetProcessed(el) {
      if (!el) return;
      processedElements.add(el);
      const widget = el.closest('.k-dropdown, [role="combobox"], .bootstrap-select, .select2-container, mat-select, .form-group');
      if (widget) {
        processedElements.add(widget);
        widget.querySelectorAll('input, select, textarea, button, span').forEach(child => processedElements.add(child));
      }
    }

    // 1. SCAN ALL INPUTS (Text, Email, Tel, Number, Radio, Checkbox, File)
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])');
    inputs.forEach(input => {
      if (input.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      if (processedElements.has(input)) return;

      const type = (input.type || 'text').toLowerCase();
      const rawLabel = getElementLabel(input);

      if (isHoneypotOrLoginField(input, rawLabel) || isJunkOrPhantomField(rawLabel, input)) {
        processedElements.add(input);
        return;
      }

      // --- A. RESUME / FILE INPUT ---
      if (type === 'file') {
        markWidgetProcessed(input);
        elementRefs.resume = input;
        if (input.files && input.files.length > 0) {
          resumeFilename = input.files[0].name;
          resumeSize = input.files[0].size;
        }

        if (!resumeFilename) {
          const parent = input.closest('.jv-form-field, .file-upload, .dropzone, fieldset, div, form');
          if (parent) {
            const uploadedText = parent.querySelector('.uploaded-file-name, .file-name, [class*="filename"], [class*="fileName"], .file-preview-chip, .file-item, .attachment-name');
            if (uploadedText && clean(uploadedText.innerText)) {
              const txt = clean(uploadedText.innerText);
              if (/\.(pdf|docx?|doc|rtf|txt|odt)/i.test(txt)) {
                resumeFilename = txt;
              } else if (/success|uploaded|attached|complete/i.test(txt)) {
                resumeFilename = 'Resume Attached (Verified)';
              } else {
                resumeFilename = txt;
              }
            }
          }
        }

        const fileLabel = 'Resume / Attachment';
        const isReq = isFieldRequired(input, fileLabel);
        allFormEntries.push({ label: fileLabel, type: 'file', value: resumeFilename || 'No file chosen', required: isReq, is_required: isReq, element: input });
        return;
      }

      // --- B. RADIO BUTTONS ---
      if (type === 'radio') {
        const radiosInGroup = input.name 
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(input.name)}"]`))
          : [input];

        radiosInGroup.forEach(r => {
          processedElements.add(r);
          const parentGroup = r.closest('[role="radiogroup"], fieldset');
          if (parentGroup) processedElements.add(parentGroup);
        });

        const selected = radiosInGroup.find(r => r.checked);
        const selectedValue = selected ? (getRadioOptionLabel(selected) || selected.value) : '';
        const groupQuestion = getRadioGroupQuestion(radiosInGroup);
        const isReq = isFieldRequired(selected || input, groupQuestion);

        const options = radiosInGroup.map(r => clean(getRadioOptionLabel(r) || r.value)).filter(Boolean);
        allFormEntries.push({ label: groupQuestion, type: 'radio', value: clean(selectedValue), required: isReq, is_required: isReq, element: selected || input, options });
        elementRefs.questions.push({ label: groupQuestion, type: 'radio', value: clean(selectedValue), required: isReq, is_required: isReq, element: selected || input, options });
        return;
      }

      // --- C. CHECKBOXES ---
      if (type === 'checkbox') {
        const label = getElementLabel(input);

        if (!label || isCodeOrJunk(label) || isJunkOrPhantomField(label, input)) {
          const isVisible = input.offsetParent !== null || Boolean(input.closest('label'));
          if (!isVisible && !input.checked) return;
        }

        processedElements.add(input);
        const val = input.checked ? 'Checked (Yes)' : 'Unchecked (No)';
        const displayLabel = (label && !isCodeOrJunk(label)) ? label : (input.name || 'Confirmation / Checkbox');
        const isReq = isFieldRequired(input, displayLabel);
        
        allFormEntries.push({ label: displayLabel, type: 'checkbox', value: val, required: isReq, is_required: isReq, element: input, options: ['Yes / Checked', 'No / Unchecked'] });
        elementRefs.questions.push({ label: displayLabel, type: 'checkbox', value: val, required: isReq, is_required: isReq, element: input, options: ['Yes / Checked', 'No / Unchecked'] });
        return;
      }

      // --- D. TEXTUAL INPUTS & CUSTOM COMBOBOXES ---
      markWidgetProcessed(input);
      const label = cleanFieldLabel(rawLabel);
      if (isJunkOrPhantomField(label, input)) return;

      const labelLower = label.toLowerCase();
      const nameLower = (input.name || '').toLowerCase();
      const idLower = (input.id || '').toLowerCase();
      const autoId = (input.getAttribute('data-automation-id') || '').toLowerCase();
      
      let val = clean(input.value);
      if (isUnansweredPlaceholder(val)) val = '';
      
      const isComboboxWidget = input.getAttribute('role') === 'combobox' || input.getAttribute('role') === 'listbox' || input.hasAttribute('data-role') || input.classList.contains('select') || input.classList.contains('dropdown');
      if (isComboboxWidget && !val) {
        const customVal = extractCustomSelectValue(input);
        if (customVal && !isUnansweredPlaceholder(customVal)) {
          val = customVal;
        }
      }

      const labelNorm = labelLower.replace(/[*:\s_]+/g, ' ').trim();
      const isFirst = (nameLower.includes('first') || idLower.includes('first') || labelNorm.includes('first name') || labelNorm === 'first' || autoId.includes('firstname') || input.autocomplete === 'given-name');
      const isLast = (nameLower.includes('last') || idLower.includes('last') || labelNorm.includes('last name') || labelNorm === 'last' || autoId.includes('lastname') || input.autocomplete === 'family-name');
      const isFull = !isFirst && !isLast && (nameLower === 'name' || idLower === 'name' || labelNorm.includes('full name') || labelNorm === 'name' || autoId.includes('fullname') || input.autocomplete === 'name');
      const isEmail = (type === 'email' || nameLower.includes('email') || idLower.includes('email') || labelNorm.includes('email') || autoId.includes('email') || input.autocomplete === 'email');
      const isPhone = (type === 'tel' || nameLower.includes('phone') || idLower.includes('phone') || labelNorm.includes('phone') || labelNorm.includes('mobile') || autoId.includes('phone') || input.autocomplete === 'tel');
      const isSalary = (nameLower.includes('salary') || idLower.includes('salary') || labelNorm.includes('salary') || labelNorm.includes('compensation') || labelNorm.includes('rate') || labelNorm.includes('pay') || autoId.includes('salary'));

      const fallbackLabel = isFirst ? 'First Name' : (isLast ? 'Last Name' : (isFull ? 'Full Name' : (isEmail ? 'Email' : (isPhone ? 'Phone' : (isSalary ? 'Salary' : 'Input')))));
      const displayLabel = label || input.name || fallbackLabel;
      const isReq = isFieldRequired(input, displayLabel);

      if (isFirst) {
        firstName = val;
        elementRefs.names.first = input;
      } else if (isLast) {
        lastName = val;
        elementRefs.names.last = input;
      } else if (isFull) {
        fullName = val;
        elementRefs.names.full = input;
      } else if (isEmail) {
        email = val;
        elementRefs.email = input;
      } else if (isPhone) {
        phone = val;
        elementRefs.phone = input;
      } else if (isSalary) {
        salary = val;
        salaryNumeric = val ? parseFloat(val.replace(/[^0-9.]/g, '')) : null;
        elementRefs.salary = input;
      } else {
        const qLabel = displayLabel || 'Screening Question';
        elementRefs.questions.push({ label: qLabel, type: 'text', value: val, required: isReq, is_required: isReq, element: input });
      }

      allFormEntries.push({ label: displayLabel, type, value: val, required: isReq, is_required: isReq, element: input });
    });

    // 2. SCAN ALL TEXTAREAS
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(ta => {
      if (ta.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      if (processedElements.has(ta)) return;

      const name = (ta.name || ta.id || '').toLowerCase();
      if (name.includes('recaptcha') || name.includes('turnstile') || name.includes('h-captcha')) return;

      const label = cleanFieldLabel(getElementLabel(ta) || 'Screening Prompt');
      if (isJunkOrPhantomField(label, ta)) return;

      const labelLower = label.toLowerCase();
      const val = clean(ta.value);
      const isReq = isFieldRequired(ta, label);

      const isPasteResume = /paste.*resume|paste.*cv|plain text resume/i.test(labelLower) || name.includes('pasteresume');
      if (isPasteResume) {
        processedElements.add(ta);
        if (val && !resumeFilename) {
          resumeFilename = 'Pasted Resume Content';
        }
        if (resumeFilename && !val) return;
        allFormEntries.push({ label: 'Paste Resume Text', type: 'textarea', value: val || 'No resume pasted', required: isReq, is_required: isReq, element: ta });
        return;
      }

      const isSalary = labelLower.includes('salary') || labelLower.includes('compensation') || labelLower.includes('pay') || labelLower.includes('rate') || name.includes('salary') || name.includes('compensation');
      if (isSalary) {
        processedElements.add(ta);
        if (val && !salary) {
          salary = val;
          salaryNumeric = parseFloat(val.replace(/[^0-9.]/g, ''));
          elementRefs.salary = ta;
        }
        allFormEntries.push({ label, type: 'textarea', value: val, required: isReq, is_required: isReq, element: ta });
        elementRefs.questions.push({ label, type: 'textarea', value: val, required: isReq, is_required: isReq, element: ta, length: val.length });
        return;
      }

      processedElements.add(ta);
      elementRefs.questions.push({ label, type: 'textarea', value: val, required: isReq, is_required: isReq, element: ta, length: val.length });
      allFormEntries.push({ label, type: 'textarea', value: val, required: isReq, is_required: isReq, element: ta });
    });

    // 3. SCAN ALL SELECTS / DROPDOWNS & CUSTOM WIDGETS
    const selects = document.querySelectorAll(
      'select, [role="combobox"]:not(input):not(textarea), .k-dropdown, [data-role="dropdownlist"], mat-select'
    );
    selects.forEach(sel => {
      if (sel.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      if (processedElements.has(sel)) return;
      markWidgetProcessed(sel);

      const rawLabel = getElementLabel(sel) || 'Dropdown';
      const label = cleanFieldLabel(rawLabel);
      if (isJunkOrPhantomField(label, sel)) return;

      const isReq = isFieldRequired(sel, label);
      let val = '';
      let options = [];

      if (sel.tagName === 'SELECT') {
        if (sel.options) {
          options = Array.from(sel.options).map(o => clean(o.text || o.value)).filter(o => o && !isUnansweredPlaceholder(o));
        }
        if (sel.selectedIndex >= 0 && sel.options && sel.options.length > sel.selectedIndex) {
          const opt = sel.options[sel.selectedIndex];
          if (opt && !opt.disabled) {
            const optText = clean(opt.text || opt.value || opt.innerText);
            if (!isUnansweredPlaceholder(optText)) {
              val = optText;
            }
          }
        }
        if (!val || isUnansweredPlaceholder(val)) {
          const customVal = extractCustomSelectValue(sel);
          if (customVal && !isUnansweredPlaceholder(customVal)) {
            val = customVal;
          }
        }
      } else {
        val = extractCustomSelectValue(sel);
      }

      elementRefs.questions.push({ label, type: 'select', value: val, required: isReq, is_required: isReq, element: sel, options });
      allFormEntries.push({ label, type: 'select', value: val, required: isReq, is_required: isReq, element: sel, options });
    });

    // 4. CHECK FOR RESUME DOM CHIPS / UPLOADED BADGES
    if (!resumeFilename) {
      const chipSelectors = [
        '[data-automation-id="file-upload-item"]',
        '[data-automation-id*="uploadedFile"]',
        '.uploaded-file-name',
        '.file-name',
        '[class*="file-name"]',
        '[class*="fileName"]',
        '.attachment-name',
        '.file-item',
        '.file-preview-chip',
        '.resume-upload-success'
      ];
      for (const sel of chipSelectors) {
        const chip = document.querySelector(sel);
        if (chip) {
          const txt = getCleanNodeText(chip);
          if (txt) {
            if (/\.(pdf|docx?|doc|rtf|txt|odt)/i.test(txt)) {
              resumeFilename = txt;
              break;
            } else if (/success|uploaded|attached|complete/i.test(txt)) {
              resumeFilename = 'Resume Attached (Verified)';
            } else if (!resumeFilename) {
              resumeFilename = txt;
            }
          }
        }
      }
    }

    if (!fullName && (firstName || lastName)) {
      fullName = `${firstName} ${lastName}`.trim();
    } else if (fullName && !firstName && !lastName) {
      const parts = fullName.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    // Load & merge cumulative state using Canonical Label Keys
    const sessionKey = `sqc_app_${window.location.hostname}_${job.req_id || 'active'}`;
    let savedState = {};
    try {
      savedState = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    } catch (_) {}

    const mergedFirstName = firstName || savedState.candidate_first_name || '';
    const mergedLastName = lastName || savedState.candidate_last_name || '';
    const mergedFullName = fullName || savedState.candidate_name || `${mergedFirstName} ${mergedLastName}`.trim();
    const mergedEmail = email || savedState.email_entered || '';
    const mergedPhone = phone || savedState.phone_entered || '';
    const mergedSalary = salary || savedState.salary_expected || '';
    const mergedSalaryNum = (salaryNumeric !== null) ? salaryNumeric : (savedState.salary_numeric !== undefined ? savedState.salary_numeric : null);
    const tailoredResumeActive = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('sqc_tailored_resume'));
    let mergedResume = resumeFilename || savedState.resume_uploaded || '';
    if (!mergedResume && tailoredResumeActive) {
      mergedResume = 'Tailored Resume Loaded (Verified)';
    }
    const mergedResumeSize = resumeSize || savedState.resume_size || null;

    // Canonical key-based map for deduplication
    const entryMap = new Map();
    const existingEntries = savedState.all_entries || [];

    existingEntries.forEach(e => {
      if (e && e.label) {
        const cleanedLbl = cleanFieldLabel(e.label);
        if (!isJunkOrPhantomField(cleanedLbl)) {
          const canonKey = getCanonicalLabelKey(cleanedLbl);
          entryMap.set(canonKey, { ...e, label: cleanedLbl });
        }
      }
    });

    allFormEntries.forEach(e => {
      if (e && e.label) {
        const cleanedLbl = cleanFieldLabel(e.label);
        if (!isJunkOrPhantomField(cleanedLbl, e.element)) {
          const canonKey = getCanonicalLabelKey(cleanedLbl);
          const existing = entryMap.get(canonKey);
          const val = e.value || (existing ? existing.value : '') || '';
          const req = e.required !== undefined ? e.required : (existing ? existing.required : false);
          entryMap.set(canonKey, {
            label: cleanedLbl,
            type: e.type,
            value: val,
            required: req,
            is_required: req,
            unanswered: isUnansweredPlaceholder(val)
          });
        }
      }
    });

    const mergedAllEntries = Array.from(entryMap.values());
    const totalFields = mergedAllEntries.length;
    const requiredFields = mergedAllEntries.filter(e => e.required || e.is_required).length;
    const unansweredRequired = mergedAllEntries.filter(e => (e.required || e.is_required) && isUnansweredPlaceholder(e.value)).length;

    const screeningAnswersDict = mergedAllEntries.reduce((acc, e) => {
      if (e && e.label) {
        acc[e.label] = e.value || (e.type === 'checkbox' ? 'Unchecked (No)' : (e.type === 'file' ? 'No file chosen' : 'Unanswered'));
      }
      return acc;
    }, {});

    const cumulativeSnapshot = {
      job_title: job.job_title || savedState.job_title,
      company: job.company || savedState.company,
      req_id: job.req_id || savedState.req_id,
      portal_job_id: job.portal_job_id || savedState.portal_job_id || '',
      target_candidate_id: job.target_candidate_id || savedState.target_candidate_id || '',
      ats_domain: job.ats_domain || savedState.ats_domain,
      job_url: job.job_url || window.location.href,
      jd_salary: job.jd_salary || savedState.jd_salary || null,

      candidate_first_name: mergedFirstName,
      candidate_last_name: mergedLastName,
      candidate_name: mergedFullName,
      email_entered: mergedEmail,
      phone_entered: mergedPhone,
      salary_expected: mergedSalary,
      salary_numeric: mergedSalaryNum,
      resume_uploaded: mergedResume,
      resume_size: mergedResumeSize,

      total_fields_count: totalFields,
      required_fields_count: requiredFields,
      optional_fields_count: totalFields - requiredFields,
      required_unanswered_count: unansweredRequired,

      is_already_applied: alreadyAppliedInfo.is_already_applied,
      already_applied_message: alreadyAppliedInfo.message,

      captcha_detected: detectCaptcha(),

      screening_answers: screeningAnswersDict,
      screening_qa: mergedAllEntries.map(e => ({
        type: e.type,
        q: e.label,
        a: e.value ? e.value : (e.type === 'checkbox' ? 'Unchecked (No)' : (e.type === 'file' ? 'No file chosen' : 'Unanswered')),
        required: Boolean(e.required || e.is_required),
        is_required: Boolean(e.required || e.is_required)
      })),
      all_entries: mergedAllEntries,

      _elements: elementRefs
    };

    // Save pruned clean snapshot to sessionStorage
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        candidate_first_name: mergedFirstName,
        candidate_last_name: mergedLastName,
        candidate_name: mergedFullName,
        email_entered: mergedEmail,
        phone_entered: mergedPhone,
        salary_expected: mergedSalary,
        salary_numeric: mergedSalaryNum,
        resume_uploaded: mergedResume,
        resume_size: mergedResumeSize,
        total_fields_count: totalFields,
        required_fields_count: requiredFields,
        optional_fields_count: totalFields - requiredFields,
        required_unanswered_count: unansweredRequired,
        is_already_applied: alreadyAppliedInfo.is_already_applied,
        already_applied_message: alreadyAppliedInfo.message,
        all_entries: mergedAllEntries,
        screening_answers: cumulativeSnapshot.screening_answers,
        job_title: cumulativeSnapshot.job_title,
        company: cumulativeSnapshot.company,
        req_id: cumulativeSnapshot.req_id,
        portal_job_id: cumulativeSnapshot.portal_job_id,
        target_candidate_id: cumulativeSnapshot.target_candidate_id,
        ats_domain: cumulativeSnapshot.ats_domain
      }));
    } catch (_) {}

    return cumulativeSnapshot;
  }

  // =========================================================================
  // AUTOMATED FORM RESTORATION & AUTOFILL ENGINE
  // =========================================================================

  function setNativeInputValue(input, val) {
    if (!input || val === undefined || val === null) return false;
    const sVal = String(val);
    if (input.value === sVal && sVal !== '') return false;

    try {
      const proto = Object.getPrototypeOf(input);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(input, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, sVal);
      } else {
        input.value = sVal;
      }
    } catch (_) {
      input.value = sVal;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function setNativeTextareaValue(ta, val) {
    if (!ta || val === undefined || val === null) return false;
    const sVal = String(val);
    if (ta.value === sVal && sVal !== '') return false;

    try {
      const proto = Object.getPrototypeOf(ta);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(ta, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(ta, sVal);
      } else {
        ta.value = sVal;
      }
    } catch (_) {
      ta.value = sVal;
    }

    // Auto-resize textarea height so the user can easily view the full open-ended answer
    try {
      ta.style.height = 'auto';
      const newHeight = Math.max(ta.scrollHeight + 12, 90);
      ta.style.height = `${Math.min(newHeight, 500)}px`;
    } catch (_) {}

    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.dispatchEvent(new Event('keyup', { bubbles: true }));
    ta.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function setNativeSelectValue(sel, targetVal) {
    if (!sel || !targetVal || isUnansweredPlaceholder(targetVal)) return false;
    const targetNorm = clean(targetVal).toLowerCase();
    let matchedIndex = -1;

    if (sel.tagName === 'SELECT' && sel.options && sel.options.length) {
      // 1. Exact match on text or value
      for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        const optTxt = clean(opt.text || opt.value || '').toLowerCase();
        const optVal = clean(opt.value || '').toLowerCase();
        if (optTxt === targetNorm || optVal === targetNorm) {
          matchedIndex = i;
          break;
        }
      }

      // 2. Substring match
      if (matchedIndex === -1 && targetNorm.length > 2) {
        for (let i = 0; i < sel.options.length; i++) {
          const opt = sel.options[i];
          const optTxt = clean(opt.text || opt.value || '').toLowerCase();
          const optVal = clean(opt.value || '').toLowerCase();
          if (optTxt.includes(targetNorm) || targetNorm.includes(optTxt) || (optVal && targetNorm.includes(optVal))) {
            matchedIndex = i;
            break;
          }
        }
      }

      // 3. Domain-specific synonym matching
      if (matchedIndex === -1) {
        // Education / Degree synonyms (Bachelor's)
        if (targetNorm.includes('bachelor') || targetNorm.includes('undergraduate') || targetNorm.includes('college')) {
          for (let i = 0; i < sel.options.length; i++) {
            const optTxt = clean(sel.options[i].text || sel.options[i].value || '').toLowerCase();
            if (/(bachelor|undergraduate|4.?year|college degree|ba\b|bs\b|b\.a|b\.s)/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
        }
        // Referral / How heard synonyms (LinkedIn)
        else if (targetNorm.includes('linkedin') || targetNorm.includes('job board') || targetNorm.includes('source')) {
          for (let i = 0; i < sel.options.length; i++) {
            const optTxt = clean(sel.options[i].text || sel.options[i].value || '').toLowerCase();
            if (/linkedin/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
          if (matchedIndex === -1) {
            for (let i = 0; i < sel.options.length; i++) {
              const optTxt = clean(sel.options[i].text || sel.options[i].value || '').toLowerCase();
              if (/(job board|indeed|glassdoor|online|internet|company website|career site|social media|other)/i.test(optTxt)) {
                matchedIndex = i;
                break;
              }
            }
          }
        }
        // Negative answers (No / None / False / Decline / Not Applicable)
        else if (targetNorm === 'no' || targetNorm === 'none' || targetNorm === 'false') {
          for (let i = 0; i < sel.options.length; i++) {
            const optTxt = clean(sel.options[i].text || sel.options[i].value || '').toLowerCase();
            if (/^no\b|^none\b|^false\b|^not applicable|^never|^i do not/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
        }
        // Positive answers (Yes / True)
        else if (targetNorm === 'yes' || targetNorm === 'true') {
          for (let i = 0; i < sel.options.length; i++) {
            const optTxt = clean(sel.options[i].text || sel.options[i].value || '').toLowerCase();
            if (/^yes\b|^true\b|^i am\b|^i have\b/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
        }
      }

      if (matchedIndex !== -1) {
        sel.selectedIndex = matchedIndex;
        sel.value = sel.options[matchedIndex].value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    const container = sel.closest('.k-dropdown, [role="combobox"], .bootstrap-select, .select2-container, div');
    if (container) {
      const displaySpan = container.querySelector('.k-input, .filter-option-inner-inner, .filter-option, .select2-selection__rendered, [class*="singleValue"]');
      if (displaySpan) {
        displaySpan.innerText = (matchedIndex !== -1 && sel.options ? sel.options[matchedIndex].text : targetVal);
      }
    }

    return matchedIndex !== -1;
  }

  function setNativeRadioValue(radioGroup, targetVal) {
    if (!radioGroup || !radioGroup.length || !targetVal) return false;
    const targetNorm = clean(targetVal).toLowerCase();
    
    for (const r of radioGroup) {
      const optionLabel = getRadioOptionLabel(r).toLowerCase();
      const val = clean(r.value).toLowerCase();

      if (optionLabel === targetNorm || val === targetNorm || 
          (targetNorm === 'yes' && (/^yes\b|^true\b|^agree\b/i.test(optionLabel) || /^yes\b|^true\b/i.test(val))) ||
          (targetNorm === 'no' && (/^no\b|^false\b|^disagree\b|^none\b/i.test(optionLabel) || /^no\b|^false\b/i.test(val)))) {
        if (!r.checked) {
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          r.dispatchEvent(new Event('click', { bubbles: true }));
          return true;
        }
        return true;
      }
    }
    return false;
  }

  function setNativeCheckboxValue(cb, shouldCheck) {
    if (!cb) return false;
    const target = Boolean(shouldCheck);
    if (cb.checked !== target) {
      cb.checked = target;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      cb.dispatchEvent(new Event('click', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Restore form fields on the page from sessionStorage and active candidate profile
  function restoreSavedForm(profile, settings = {}) {
    const job = detectJobContext();
    const sessionKey = `sqc_app_${window.location.hostname}_${job.req_id || 'active'}`;
    let savedState = {};
    try {
      savedState = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
    } catch (_) {}

    const p = profile || {};
    const cfg = settings || {};
    const allowSalary = cfg.autoFillCompensation !== false;
    const allowCustomQa = cfg.autoFillCustomQuestions !== false;

    const savedAnswers = savedState.screening_answers || {};
    let restoredCount = 0;

    const findSavedValue = (label) => {
      if (!label) return '';
      if (savedAnswers[label] && !isUnansweredPlaceholder(savedAnswers[label])) {
        return savedAnswers[label];
      }
      const canonTarget = getCanonicalLabelKey(label);

      // 1. Check profile customFields (dynamic user-configured Q&A)
      if (allowCustomQa && Array.isArray(p.customFields)) {
        for (const cf of p.customFields) {
          if (!cf || !cf.label || isUnansweredPlaceholder(cf.value)) continue;
          const cfCanon = getCanonicalLabelKey(cf.label);
          if (cfCanon === canonTarget || canonTarget.includes(cfCanon) || cfCanon.includes(canonTarget)) {
            return cf.value;
          }
        }
      }

      // 2. Check savedAnswers in session
      for (const [k, v] of Object.entries(savedAnswers)) {
        if (getCanonicalLabelKey(k) === canonTarget && !isUnansweredPlaceholder(v)) {
          return v;
        }
      }
      return '';
    };

    // 1. Restore Text, Email, Tel, Number Inputs
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])');
    const processedRadioGroups = new Set();

    inputs.forEach(input => {
      if (input.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      const type = (input.type || 'text').toLowerCase();
      const rawLabel = getElementLabel(input);
      const label = cleanFieldLabel(rawLabel);
      const labelNorm = getCanonicalLabelKey(label);
      const nameLower = (input.name || '').toLowerCase();
      const idLower = (input.id || '').toLowerCase();
      const autoId = (input.getAttribute('data-automation-id') || '').toLowerCase();

      // Radio Groups
      if (type === 'radio') {
        const groupKey = input.name || labelNorm;
        if (processedRadioGroups.has(groupKey)) return;
        processedRadioGroups.add(groupKey);

        const radios = input.name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(input.name)}"]`))
          : [input];

        const savedVal = findSavedValue(label);
        let targetRadioVal = savedVal;

        if (!targetRadioVal) {
          if (labelNorm.includes('veteran') || labelNorm.includes('military')) {
            targetRadioVal = p.eeoc?.identifyAsMilitaryVeteran || 'No';
          } else if (labelNorm.includes('clearance') || labelNorm.includes('security')) {
            targetRadioVal = p.credentials?.securityClearance || 'No';
          } else if (labelNorm.includes('authorized') || labelNorm.includes('lawfully') || labelNorm.includes('legally authorized')) {
            targetRadioVal = p.workAuth?.authorizedInUS || 'Yes';
          } else if (labelNorm.includes('sponsor') || labelNorm.includes('visa') || labelNorm.includes('h-1b') || labelNorm.includes('h1-b')) {
            targetRadioVal = p.workAuth?.requiresSponsorship || 'No';
          } else if (labelNorm.includes('18 or older') || labelNorm.includes('age') || labelNorm.includes('legal age')) {
            targetRadioVal = p.eligibility?.age18OrOlder || 'Yes';
          } else if (
            labelNorm.includes('current or former employee') || labelNorm.includes('former employee') ||
            labelNorm.includes('previous employee') || labelNorm.includes('affiliated company') ||
            labelNorm.includes('affiliate') || labelNorm.includes('worked for') ||
            labelNorm.includes('worked here') || labelNorm.includes('worked before') ||
            labelNorm.includes('are you a member') || labelNorm.includes('member of') ||
            labelNorm.includes('relative') || labelNorm.includes('family member') ||
            labelNorm.includes('relationship with') || labelNorm.includes('conflict of interest')
          ) {
            targetRadioVal = 'No';
          } else if (
            labelNorm.includes('terminated') || labelNorm.includes('misconduct') ||
            labelNorm.includes('disciplinary') || labelNorm.includes('suspended') ||
            labelNorm.includes('non-compete') || labelNorm.includes('restrictive covenant') ||
            labelNorm.includes('nda') || labelNorm.includes('confidentiality') ||
            labelNorm.includes('convicted') || labelNorm.includes('felony') ||
            labelNorm.includes('crime') || labelNorm.includes('government employee') ||
            labelNorm.includes('finra')
          ) {
            targetRadioVal = 'No';
          } else if (
            labelNorm.includes('travel') || labelNorm.includes('onsite') ||
            labelNorm.includes('overtime') || labelNorm.includes('hybrid') ||
            labelNorm.includes('essential functions') || labelNorm.includes('minimum qualifications') ||
            labelNorm.includes('driver license') || labelNorm.includes('drivers license')
          ) {
            targetRadioVal = 'Yes';
          }
        }

        if (targetRadioVal && setNativeRadioValue(radios, targetRadioVal)) {
          restoredCount++;
        }
        return;
      }

      // Checkboxes
      if (type === 'checkbox') {
        const savedVal = findSavedValue(label);
        let shouldCheck = false;
        if (savedVal) {
          shouldCheck = savedVal.toLowerCase().includes('check') || savedVal.toLowerCase().includes('yes');
        } else if (labelNorm.includes('acknowledgement') || labelNorm.includes('agree') || labelNorm.includes('consent') || labelNorm.includes('terms') || labelNorm.includes('sms')) {
          shouldCheck = true;
        }

        if (shouldCheck && setNativeCheckboxValue(input, true)) {
          restoredCount++;
        }
        return;
      }

      // Skip file inputs from auto string assignment
      if (type === 'file') return;

      // Textual Inputs
      let valueToFill = findSavedValue(label);

      if (!valueToFill || isUnansweredPlaceholder(valueToFill)) {
        if (nameLower.includes('first') || idLower.includes('first') || labelNorm.includes('first name') || labelNorm === 'first' || autoId.includes('firstname') || input.autocomplete === 'given-name') {
          valueToFill = savedState.candidate_first_name || p.firstName || (p.fullName ? p.fullName.split(' ')[0] : '');
        } else if (nameLower.includes('last') || idLower.includes('last') || labelNorm.includes('last name') || labelNorm === 'last' || autoId.includes('lastname') || input.autocomplete === 'family-name') {
          valueToFill = savedState.candidate_last_name || p.lastName || (p.fullName ? p.fullName.split(' ').slice(1).join(' ') : '');
        } else if (labelNorm.includes('middle') || nameLower.includes('middle')) {
          valueToFill = p.middleName || p.firstName || '';
        } else if (labelNorm.includes('preferred') || nameLower.includes('preferred')) {
          valueToFill = p.preferredName || p.firstName || '';
        } else if (nameLower === 'name' || idLower === 'name' || labelNorm.includes('full name') || labelNorm === 'name' || autoId.includes('fullname') || input.autocomplete === 'name') {
          valueToFill = savedState.candidate_name || p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
        } else if (type === 'email' || nameLower.includes('email') || idLower.includes('email') || labelNorm.includes('email') || autoId.includes('email') || input.autocomplete === 'email') {
          valueToFill = savedState.email_entered || p.primaryEmail || '';
        } else if (type === 'tel' || nameLower.includes('phone') || idLower.includes('phone') || labelNorm.includes('phone') || labelNorm.includes('mobile') || autoId.includes('phone') || input.autocomplete === 'tel') {
          valueToFill = savedState.phone_entered || p.formattedPhone || p.phone || '';
        } else if (labelNorm.includes('address line 1') || labelNorm === 'address' || labelNorm === 'street address' || nameLower.includes('address1')) {
          valueToFill = p.address || '';
        } else if (labelNorm.includes('address line 2') || nameLower.includes('address2')) {
          valueToFill = p.addressLine2 || '';
        } else if (labelNorm === 'city' || nameLower.includes('city')) {
          valueToFill = p.city || '';
        } else if (labelNorm === 'county' || nameLower.includes('county')) {
          valueToFill = p.county || 'Miami-Dade';
        } else if (labelNorm === 'state' || nameLower.includes('state')) {
          valueToFill = p.state || p.location?.resideState || 'FL';
        } else if (labelNorm.includes('zip') || labelNorm.includes('postal') || nameLower.includes('zip')) {
          valueToFill = p.zip || '';
        } else if (labelNorm.includes('country') || nameLower.includes('country')) {
          valueToFill = p.country || 'United States';
        } else if (labelNorm.includes('salary') || labelNorm.includes('compensation') || labelNorm.includes('pay') || nameLower.includes('salary') || nameLower.includes('compensation')) {
          if (allowSalary) {
            const promptSal = computeOptimalSalary(p, job.jd_salary, labelNorm);
            valueToFill = savedState.salary_expected || promptSal.target;
          }
        } else if (labelNorm === 'to' || (labelNorm.includes('range') && (labelNorm.includes('max') || labelNorm.includes('to') || labelNorm.includes('end'))) || (nameLower.includes('range') && (nameLower.includes('max') || nameLower.includes('to')))) {
          if (allowSalary) {
            const promptSal = computeOptimalSalary(p, job.jd_salary, 'max');
            valueToFill = promptSal.rangeMax;
          }
        } else if (labelNorm === 'from' || (labelNorm.includes('range') && (labelNorm.includes('min') || labelNorm.includes('from') || labelNorm.includes('start'))) || (nameLower.includes('range') && (nameLower.includes('min') || nameLower.includes('from')))) {
          if (allowSalary) {
            const promptSal = computeOptimalSalary(p, job.jd_salary, 'min');
            valueToFill = promptSal.rangeMin;
          }
        } else if (labelNorm.includes('available to start') || labelNorm.includes('start date')) {
          valueToFill = new Date().toISOString().split('T')[0];
        } else if (labelNorm.includes('linkedin') || nameLower.includes('linkedin')) {
          valueToFill = p.linkedin || '';
        } else if (labelNorm.includes('school') || labelNorm.includes('university') || labelNorm.includes('college') || labelNorm.includes('institution') || nameLower.includes('school') || nameLower.includes('university')) {
          valueToFill = p.backgroundAndEducation?.schoolsAttended || p.school || 'Texas Tech University';
        } else if (labelNorm.includes('degree') || labelNorm.includes('major') || labelNorm.includes('field of study')) {
          valueToFill = p.backgroundAndEducation?.education || p.degree || "Bachelor's Degree in Computer Science";
        } else if (labelNorm.includes('highest level of education') || labelNorm.includes('education level') || labelNorm.includes('degree level')) {
          valueToFill = p.degreeLevel || p.backgroundAndEducation?.degreeLevel || "Bachelor's Degree";
        } else if (labelNorm.includes('how did you hear') || labelNorm.includes('referral source') || labelNorm.includes('how heard') || labelNorm.includes('source') || nameLower.includes('source')) {
          valueToFill = p.howHeard?.howHeard || p.howHeard || 'LinkedIn';
        }
      }

      if (valueToFill && (!input.value || isUnansweredPlaceholder(input.value))) {
        if (setNativeInputValue(input, valueToFill)) {
          restoredCount++;
        }
      }
    });

    // 2. Restore Textareas
    const tailoredResumeText = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || p.resumeText || p.baseResumeText || '';
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(ta => {
      if (ta.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      const label = cleanFieldLabel(getElementLabel(ta) || '');
      const labelNorm = getCanonicalLabelKey(label);
      let val = findSavedValue(label);

      if (!val || isUnansweredPlaceholder(val)) {
        if (
          labelNorm.includes('paste resume') || labelNorm.includes('resume text') ||
          labelNorm === 'resume' || labelNorm === 'resume / cv' || labelNorm === 'resume/cv' ||
          labelNorm.includes('paste your resume') || labelNorm.includes('copy and paste resume')
        ) {
          val = tailoredResumeText || val;
        } else if (labelNorm.includes('salary') || labelNorm.includes('compensation')) {
          val = savedState.salary_expected || String(p.compensation?.desiredSalary || p.salaryFloor || '120000');
        } else if (labelNorm.includes('responsibilities') || labelNorm.includes('experience summary') || labelNorm.includes('summary')) {
          val = p.technicalExperience?.summary || p.architectureScalability?.scaledSystemDescription || '';
        }
      }

      if (val && (!ta.value || isUnansweredPlaceholder(ta.value))) {
        if (setNativeTextareaValue(ta, val)) {
          restoredCount++;
        }
      }
    });

    // 3. Restore Dropdowns / Selects
    const selects = document.querySelectorAll('select, [role="combobox"]:not(input):not(textarea), .k-dropdown, mat-select');
    selects.forEach(sel => {
      if (sel.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      const label = cleanFieldLabel(getElementLabel(sel) || '');
      const labelNorm = getCanonicalLabelKey(label);
      let val = findSavedValue(label);

      if (!val || isUnansweredPlaceholder(val)) {
        if (labelNorm.includes('country')) {
          val = p.country || 'United States';
        } else if (labelNorm.includes('state')) {
          val = p.state || p.location?.resideState || 'FL';
        } else if (labelNorm.includes('gender')) {
          val = p.eeoc?.gender || 'Male';
        } else if (labelNorm.includes('race') || labelNorm.includes('ethnic')) {
          val = p.eeoc?.raceEthnicity || 'Two or More Races';
        } else if (labelNorm.includes('veteran')) {
          val = p.eeoc?.veteranStatus || 'I am not a protected veteran';
        } else if (labelNorm.includes('disability')) {
          val = p.eeoc?.disability || 'No, I do not have a disability and have not had one in the past';
        } else if (labelNorm.includes('salary type')) {
          val = 'Yearly';
        } else if (
          labelNorm.includes('worked with us') || labelNorm.includes('previous employee') ||
          labelNorm.includes('current or former employee') || labelNorm.includes('affiliated') ||
          labelNorm.includes('worked before') || labelNorm.includes('member') ||
          labelNorm.includes('are you a member') || labelNorm.includes('relative') ||
          labelNorm.includes('non-compete') || labelNorm.includes('misconduct') ||
          labelNorm.includes('conflict of interest')
        ) {
          val = 'No';
        } else if (labelNorm.includes('sms') || labelNorm.includes('text')) {
          val = 'Yes*';
        } else if (labelNorm.includes('authorized') || labelNorm.includes('work lawfully') || labelNorm.includes('legally authorized')) {
          val = 'Yes';
        } else if (labelNorm.includes('sponsor') || labelNorm.includes('visa')) {
          val = 'No';
        } else if (labelNorm.includes('education') || labelNorm.includes('degree') || labelNorm.includes('highest level')) {
          val = p.degreeLevel || p.backgroundAndEducation?.degreeLevel || "Bachelor's degree";
        } else if (labelNorm.includes('how did you hear') || labelNorm.includes('referral') || labelNorm.includes('how heard') || labelNorm.includes('source')) {
          val = p.howHeard?.howHeard || p.howHeard || 'LinkedIn';
        } else if (labelNorm.includes('school') || labelNorm.includes('university') || labelNorm.includes('college') || labelNorm.includes('institution')) {
          val = p.backgroundAndEducation?.schoolsAttended || p.school || 'Texas Tech University';
        } else if (labelNorm.includes('graduate')) {
          val = 'Yes';
        }
      }

      if (val && setNativeSelectValue(sel, val)) {
        restoredCount++;
      }
    });

    return { count: restoredCount, sessionKey };
  }

  // =========================================================================
  // CHATGPT PROMPT GENERATOR & AI ANSWER APPLIER
  // =========================================================================

  // Extract full Job Description text from ATS DOM
  function extractJdFullText() {
    if (window.__SQC_APPLYFLOW_CONTEXT) {
      const af = window.__SQC_APPLYFLOW_CONTEXT;
      if (af.jobDescription || af.description || af.jobDetails?.description) {
        return clean(af.jobDescription || af.description || af.jobDetails?.description);
      }
    }

    const jdSelectors = [
      '[data-automation-id="jobPostingDescription"]',
      '.job-description',
      '#job-description',
      '.posting-description',
      '.job-details',
      '.job-summary',
      '[class*="job-description" i]',
      '[class*="jobDescription" i]',
      '[id*="job-description" i]',
      '[id*="jobDescription" i]',
      '#content .section',
      '.content .section',
      'article',
      'main'
    ];

    for (const sel of jdSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, button, input, form, #sqc-hud-container, #sqc-modal-overlay').forEach(n => n.remove());
          const txt = (clone.innerText || clone.textContent || '').trim();
          if (txt.length > 150) {
            return txt.slice(0, 4000);
          }
        }
      } catch (_) {}
    }

    return '';
  }

  // Check if a form entry represents an open-ended narrative question (textareas, long prompts, qualitative questions)
  function isOpenEndedQuestion(e) {
    if (!e || !e.label) return false;
    const type = (e.type || '').toLowerCase();
    const rawLabel = String(e.label || '').trim();
    const canon = getCanonicalLabelKey(rawLabel);

    // 1. Explicitly exclude standard autofillable candidate identity & profile fields
    if (
      canon.includes('first name') || canon.includes('last name') || canon.includes('middle name') ||
      canon.includes('full name') || canon.includes('preferred name') ||
      canon.includes('email') || canon.includes('phone') || canon.includes('mobile') ||
      canon.includes('street') || canon.includes('address') || canon.includes('city') ||
      canon.includes('state') || canon.includes('zip') || canon.includes('postal') ||
      canon.includes('country') || canon.includes('linkedin') || canon.includes('github') ||
      canon.includes('website') || canon.includes('portfolio') || canon.includes('resume') ||
      canon.includes('cv') || canon.includes('salary') || canon.includes('compensation') ||
      canon.includes('desired pay') || canon.includes('gender') || canon.includes('race') ||
      canon.includes('ethnicity') || canon.includes('veteran') || canon.includes('disability') ||
      canon.includes('authorized to work') || canon.includes('require sponsorship') ||
      canon.includes('visa') || canon.includes('security clearance') || canon.includes('date available') ||
      canon.includes('start date') || canon.includes('notice period') || canon.includes('18 or older') ||
      canon.includes('age') || canon.includes('password')
    ) {
      if (type !== 'textarea') return false;
    }

    // 2. Definitive Open-Ended Elements: Textareas
    if (type === 'textarea') return true;

    // 3. Question phrasing that indicates a qualitative, open-ended response
    if (
      /(describe|explain|why|how|tell us|experience with|walk us through|approach to|what interests|what motivates|what challenges|what project|summary|cover letter|statement of purpose|additional information|comments|tell me about|in your words)/i.test(rawLabel)
    ) {
      return type !== 'checkbox' && type !== 'radio' && type !== 'file';
    }

    // 4. Long question prompts that are not standard binary/choice controls
    if (rawLabel.length > 40 && type !== 'checkbox' && type !== 'radio' && type !== 'file' && type !== 'select') {
      return true;
    }

    return false;
  }

  // Generate a complete, context-aware prompt bundle for ChatGPT
  function generateChatGptPrompt(profile, jobContext = null, customQuestions = null) {
    const p = profile || {};
    const job = jobContext || detectJobContext();
    const jdText = extractJdFullText();
    const all = extractAllFields();

    let targetQuestions = customQuestions;
    if (!targetQuestions || !targetQuestions.length) {
      targetQuestions = (all.all_entries || []).filter(e => {
        if (!e || !e.label) return false;
        const canon = getCanonicalLabelKey(e.label);
        // Exclude standard basic identity fields that are already populated and not open-ended
        if (
          (canon.includes('first name') || canon.includes('last name') || canon.includes('full name') ||
           canon.includes('email') || canon.includes('phone') || canon.includes('resume attachment') ||
           canon.includes('password')) && !isUnansweredPlaceholder(e.value) && e.type !== 'textarea'
        ) {
          return false;
        }
        return true;
      });
    }

    if (!targetQuestions.length) {
      targetQuestions = all.all_entries || [];
    }

    const techStack = p.targetStack || p.activeStackKey || 'Full Stack Software Engineer';
    const tailoredResume = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume') : null) || p.resumeText || p.baseResumeText || '';
    const expSummary = p.technicalExperience?.summary || p.architectureScalability?.scaledSystemDescription || '';
    const projects = Array.isArray(p.technicalExperience?.keyProjects) ? p.technicalExperience.keyProjects.join('\n- ') : '';
    const skills = Array.isArray(p.technicalExperience?.primarySkills) ? p.technicalExperience.primarySkills.join(', ') : '';

    const candidateProfileContext = `
CANDIDATE RESUME & PROFILE CONTEXT:
- Candidate Name: ${p.fullName || p.legalName || 'Candidate'}
- Target Stack / Title: ${p.targetStack || techStack}
- Location: ${p.city ? `${p.city}, ${p.state}, ${p.country}` : 'United States'}
- Work Authorization: ${p.workAuth?.workAuthType || 'US Citizen'} (Requires Sponsorship: ${p.workAuth?.requiresSponsorship || 'No'})
- Compensation Base Floor / Desired: $${(p.compensation?.desiredSalary || p.salaryFloor || 130000).toLocaleString()}/year
${tailoredResume ? `- Active Resume Content (Tailored / Profile Base):\n${tailoredResume.slice(0, 3000)}` : `- Technical Experience Summary: ${expSummary || 'Experienced software engineer specialized in building high-scale distributed backend systems, REST/GraphQL APIs, cloud infrastructure, and modern web applications.'}`}
${skills ? `- Core Skills: ${skills}` : ''}
${projects ? `- Key Accomplishments / Projects:\n- ${projects}` : ''}
    `.trim();

    const jobDescriptionContext = `
TARGET JOB DETAILS:
- Job Title: ${job.job_title || 'Software Engineer'}
- Company: ${job.company || 'Employer'}
- ATS Platform: ${job.ats_domain || 'Application Portal'}
${job.jd_salary?.has_jd_salary ? `- Posted Salary Budget: ${job.jd_salary.raw}` : ''}
${jdText ? `\nJOB DESCRIPTION (EXCERPT):\n${jdText.slice(0, 2500)}` : ''}
    `.trim();

    const questionsList = targetQuestions.map((q, idx) => {
      let constraintInfo = '';
      if (q.element) {
        const maxLen = q.element.getAttribute('maxlength');
        const minLen = q.element.getAttribute('minlength');
        if (maxLen) constraintInfo += ` [Max Characters: ${maxLen}]`;
        if (minLen) constraintInfo += ` [Min Characters: ${minLen}]`;
      }
      const labelText = String(q.label || '');
      const wordMatch = labelText.match(/(?:max|maximum|limit|within|up to)\s*(?:of\s*)?(\d+)\s*(?:words?|characters?|chars?)/i);
      if (wordMatch) {
        constraintInfo += ` [Constraint: "${wordMatch[0]}"]`;
      }

      let choicesInfo = '';
      if (Array.isArray(q.options) && q.options.length > 0) {
        choicesInfo = `\n[Available Choices: ${q.options.map(o => JSON.stringify(o)).join(', ')}]`;
      }

      const isOpenEnded = q.type === 'textarea' || labelText.length > 40;
      const typeLabel = isOpenEnded ? 'Open-Ended / Long-Form' : (q.type || 'text');

      return `${idx + 1}. [Question ID: q_${idx + 1}] [Type: ${typeLabel}]${constraintInfo} [Required: ${q.required || q.is_required ? 'Yes' : 'No'}]
Prompt: "${q.label}"${choicesInfo}
Current Value: "${q.value || 'Unanswered'}"`;
    }).join('\n\n');

    const promptTemplate = `
You are an elite technical career coach, senior staff engineer, and resume strategist assisting an experienced candidate with job application questions.

Below is the candidate's profile context, the target job description they are applying for, and the list of application questions that require tailored, accurate, and high-impact answers.

==================================================
${candidateProfileContext}
==================================================

==================================================
${jobDescriptionContext}
==================================================

==================================================
APPLICATION QUESTIONS TO ANSWER:
${questionsList}
==================================================

GUIDELINES:
1. **Open-Ended / Screening Prompts**:
   - Write in an authentic, first-person voice ("I designed...", "In my recent role, I led...").
   - Use the STAR framework (Situation, Task, Action, Result) for technical/behavioral challenges with concrete trade-offs and metrics (latency, scale, throughput).
   - Align answers with the candidate's profile context and the target job description.
   - Keep answers professional, concise, and impactful (~100–200 words per open-ended question unless a limit is specified).
   - Avoid robotic filler phrases ("I am thrilled to apply...", "As a passionate engineer...").
2. **Choice / Dropdown / Radio Questions**:
   - If [Available Choices] are listed, pick the exact matching choice (e.g. "Yes", "No", "US Citizen", "Hybrid", etc.) based on candidate profile.
3. **Short Text / Number Fields**:
   - Return clean, direct values (e.g., years of experience, desired salary number, URLs).

4. **Output Format**: Return your final output strictly as a valid JSON object matching the schema below:

\`\`\`json
{
  "answers": [
${targetQuestions.map((q, idx) => `    {
      "id": "q_${idx + 1}",
      "question": ${JSON.stringify(q.label)},
      "answer": "Your answer here..."
    }`).join(',\n')}
  ]
}
\`\`\`
    `.trim();

    return {
      prompt: promptTemplate,
      questionCount: targetQuestions.length,
      questions: targetQuestions,
      jobTitle: job.job_title,
      company: job.company
    };
  }

  // Apply parsed answers from ChatGPT output directly to page form inputs
  function applyParsedAnswers(input) {
    if (!input) return { success: false, count: 0, error: "Empty input" };

    let answersList = [];

    if (typeof input === 'string') {
      let str = input.trim();
      const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        str = jsonMatch[1].trim();
      }

      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          answersList = parsed;
        } else if (Array.isArray(parsed.answers)) {
          answersList = parsed.answers;
        } else if (typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            answersList.push({ question: k, answer: v });
          }
        }
      } catch (_) {
        // Line-by-line fallback
        const lines = str.split('\n');
        let currentQ = '';
        let currentA = '';
        for (const line of lines) {
          const match = line.match(/^(?:(?:\d+\.|\*|-)\s*)?(?:Question|Q)?\s*["']?([^:"'\n]+)["']?\s*:\s*(.+)$/i);
          if (match) {
            if (currentQ && currentA) {
              answersList.push({ question: currentQ, answer: currentA.trim() });
            }
            currentQ = match[1].trim();
            currentA = match[2].trim();
          } else if (currentQ) {
            currentA += '\n' + line;
          }
        }
        if (currentQ && currentA) {
          answersList.push({ question: currentQ, answer: currentA.trim() });
        }
      }
    } else if (Array.isArray(input)) {
      answersList = input;
    } else if (typeof input === 'object' && Array.isArray(input.answers)) {
      answersList = input.answers;
    }

    if (!answersList.length) {
      return { success: false, count: 0, error: "Could not parse any answers from input" };
    }

    let filledCount = 0;
    const all = extractAllFields();
    const targetFormEntries = (all.all_entries || []).filter(e => e && e.element);
    const elementsToFill = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="combobox"]'));

    // Helper to populate an element with an answer value
    function populateElement(el, ansVal) {
      if (!el || ansVal === undefined || ansVal === null) return false;
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      const sVal = String(ansVal).trim();

      if (tag === 'textarea') {
        return setNativeTextareaValue(el, sVal);
      } else if (tag === 'select' || el.getAttribute('role') === 'combobox') {
        // Match closest select option
        if (setNativeSelectValue(el, sVal)) return true;
        if (el.options && el.options.length) {
          const sValLower = sVal.toLowerCase();
          for (let i = 0; i < el.options.length; i++) {
            const opt = el.options[i];
            const optTxt = clean(opt.text || opt.value).toLowerCase();
            if (optTxt && (optTxt.includes(sValLower) || sValLower.includes(optTxt))) {
              el.selectedIndex = i;
              el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
          }
        }
        return false;
      } else if (type === 'checkbox') {
        const shouldCheck = /yes|true|check|agree|accept|1/i.test(sVal);
        return setNativeCheckboxValue(el, shouldCheck);
      } else if (type === 'radio') {
        const radios = el.name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)) : [el];
        if (setNativeRadioValue(radios, sVal)) return true;
        const sValLower = sVal.toLowerCase();
        for (const r of radios) {
          const rLabel = getRadioOptionLabel(r).toLowerCase();
          const rVal = clean(r.value).toLowerCase();
          if (rLabel.includes(sValLower) || sValLower.includes(rLabel) || rVal.includes(sValLower)) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            r.dispatchEvent(new Event('click', { bubbles: true }));
            return true;
          }
        }
        return false;
      } else {
        return setNativeInputValue(el, sVal);
      }
    }

    const filledElements = new Set();

    answersList.forEach((item, itemIdx) => {
      const qText = item.question || item.q || item.label || '';
      const ansVal = item.answer !== undefined ? item.answer : (item.a !== undefined ? item.a : item.value);
      const qId = String(item.id || '');
      if (ansVal === undefined || ansVal === null) return;

      const qCanon = getCanonicalLabelKey(qText);
      let matched = false;

      // 1. Match by Question ID (e.g. q_1 -> targetFormEntries[0])
      const idMatch = qId.match(/q_?(\d+)/i);
      if (idMatch) {
        const qIndex = parseInt(idMatch[1], 10) - 1;
        if (qIndex >= 0 && qIndex < targetFormEntries.length) {
          const entry = targetFormEntries[qIndex];
          if (entry && entry.element && !filledElements.has(entry.element)) {
            if (populateElement(entry.element, ansVal)) {
              filledElements.add(entry.element);
              filledCount++;
              matched = true;
            }
          }
        }
      }

      if (matched) return;

      // 2. Match by Canonical Label / Substring
      for (const el of elementsToFill) {
        if (el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-ai-modal-overlay')) continue;
        if (filledElements.has(el)) continue;

        const elLabel = cleanFieldLabel(getElementLabel(el) || '');
        const elCanon = getCanonicalLabelKey(elLabel);

        if (
          elCanon === qCanon ||
          (elCanon.length > 4 && qCanon.includes(elCanon)) ||
          (qCanon.length > 4 && elCanon.includes(qCanon))
        ) {
          if (populateElement(el, ansVal)) {
            filledElements.add(el);
            filledCount++;
            matched = true;
            break;
          }
        }
      }

      if (matched) return;

      // 3. Fallback: Sequential Order Match
      if (itemIdx < targetFormEntries.length) {
        const entry = targetFormEntries[itemIdx];
        if (entry && entry.element && !filledElements.has(entry.element)) {
          if (populateElement(entry.element, ansVal)) {
            filledElements.add(entry.element);
            filledCount++;
          }
        }
      }
    });

    // Automatically update session state
    try {
      const job = detectJobContext();
      const sessionKey = `sqc_app_${window.location.hostname}_${job.req_id || 'active'}`;
      let saved = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
      saved.screening_answers = saved.screening_answers || {};
      for (const item of answersList) {
        const q = item.question || item.q || '';
        const a = item.answer || item.a || '';
        if (q && a) saved.screening_answers[q] = a;
      }
      sessionStorage.setItem(sessionKey, JSON.stringify(saved));
    } catch (_) {}

    return { success: filledCount > 0, count: filledCount, totalAnswers: answersList.length };
  }

  return {
    detectAtsPlatform,
    detectJobContext,
    detectAlreadyApplied,
    detectSubmissionSuccess,
    detectCaptcha,
    detectJdSalaryRange,
    computeOptimalSalary,
    extractJdFullText,
    generateChatGptPrompt,
    applyParsedAnswers,
    extractApplyFlowParams,
    extractAllFields,
    restoreSavedForm
  };
})();
