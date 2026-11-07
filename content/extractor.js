/**
 * Universal ATS & Job Form Extractor & Intelligent Form Restoration
 * Extracts visible form fields, job metadata, candidate identity, resume, salary, and custom Q&A.
 * Provides automated form state restoration and autofill across page refreshes and multi-step ATS wizards.
 */

window.JobFormExtractor = (function () {
  'use strict';

  const US_STATE_MAP = {
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california',
    'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia',
    'hi': 'hawaii', 'id': 'idaho', 'il': 'illinois', 'in': 'indiana', 'ia': 'iowa',
    'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi', 'mo': 'missouri',
    'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire', 'nj': 'new jersey',
    'nm': 'new mexico', 'ny': 'new york', 'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio',
    'ok': 'oklahoma', 'or': 'oregon', 'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
    'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah', 'vt': 'vermont',
    'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia', 'wi': 'wisconsin', 'wy': 'wyoming',
    'dc': 'district of columbia', 'pr': 'puerto rico', 'gu': 'guam', 'vi': 'virgin islands'
  };

  const US_STATE_CODE_MAP = Object.fromEntries(
    Object.entries(US_STATE_MAP).map(([code, name]) => [name, code])
  );

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

  // Deep DOM query traversing main document, open shadow roots, and accessible same-origin iframes
  function queryAllDeep(selector, root = document) {
    const results = [];
    const seen = new Set();

    function addElement(el) {
      if (!el || seen.has(el)) return;
      seen.add(el);
      results.push(el);
    }

    function searchContainer(container) {
      if (!container) return;
      try {
        if (container.querySelectorAll) {
          container.querySelectorAll(selector).forEach(addElement);
        }
      } catch (_) {}

      // Recursively traverse open shadow roots
      try {
        if (container.querySelectorAll) {
          container.querySelectorAll('*').forEach(el => {
            if (el && el.shadowRoot) {
              searchContainer(el.shadowRoot);
            }
          });
        }
      } catch (_) {}
    }

    searchContainer(root);

    // If searching top document root, also traverse any accessible same-origin child iframes
    if (root === document) {
      try {
        document.querySelectorAll('iframe').forEach(frame => {
          try {
            if (frame.contentDocument && frame.contentDocument.body) {
              searchContainer(frame.contentDocument);
            }
          } catch (_) {}
        });
      } catch (_) {}
    }

    return results;
  }

  // Find the specific choice option label for a single radio button or checkbox
  function getRadioOptionLabel(radio) {
    if (!radio) return '';

    // 1. Explicit <label for="id">
    if (radio.id) {
      try {
        const root = radio.getRootNode ? radio.getRootNode() : (radio.ownerDocument || document);
        const label = root.querySelector ? root.querySelector(`label[for="${CSS.escape(radio.id)}"]`) : null;
        if (label) {
          const txt = cleanFieldLabel(getCleanNodeText(label));
          if (txt && !isDisclaimerOrInstruction(txt) && txt.length < 80) return txt;
        }
      } catch (_) {}
    }

    // 2. Parent / ancestor <label>
    const parentLabel = radio.closest('label');
    if (parentLabel) {
      const txt = cleanFieldLabel(getCleanNodeText(parentLabel));
      if (txt && !isDisclaimerOrInstruction(txt) && txt.length < 80) return txt;
    }

    // 3. Direct next sibling (e.g. <input type="checkbox"> PostgreSQL)
    let next = radio.nextSibling;
    while (next) {
      if (next.nodeType === Node.TEXT_NODE && clean(next.nodeValue)) {
        const txt = cleanFieldLabel(clean(next.nodeValue));
        if (txt && !isDisclaimerOrInstruction(txt) && txt.length < 80) return txt;
      }
      if (next.nodeType === Node.ELEMENT_NODE && ['SPAN', 'LABEL', 'DIV', 'B', 'STRONG', 'P'].includes(next.tagName)) {
        const txt = cleanFieldLabel(getCleanNodeText(next));
        if (txt && !isDisclaimerOrInstruction(txt) && txt.length < 80) return txt;
      }
      next = next.nextSibling;
    }

    // 4. Immediate Option Container (Only if container wraps THIS specific input, not the whole group)
    const optContainer = radio.closest('.form-check, .checkbox, .radio, [class*="form-check"], [class*="checkbox"], [class*="radio"], [class*="choice"], [class*="option"], li');
    if (optContainer && optContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').length <= 1) {
      const innerLabel = optContainer.querySelector('label, span, p, b, strong');
      if (innerLabel) {
        const txt = cleanFieldLabel(getCleanNodeText(innerLabel));
        if (txt && !isDisclaimerOrInstruction(txt) && txt.length < 80) return txt;
      }
      const rawTxt = cleanFieldLabel(getCleanNodeText(optContainer));
      if (rawTxt && !isDisclaimerOrInstruction(rawTxt) && rawTxt.length < 80) return rawTxt;
    }

    // 5. ARIA label
    const aria = radio.getAttribute('aria-label') || radio.getAttribute('data-label');
    if (aria && aria.length < 80) return cleanFieldLabel(aria);

    // 6. Value attribute if informative (e.g. "PostgreSQL", not "on", "1", "true")
    const val = clean(radio.value || '');
    if (val && !/^(on|true|false|1|0|yes|no)$/i.test(val) && val.length < 80) {
      return cleanFieldLabel(val);
    }

    return '';
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
        // Skip containers that contain radio/checkbox inputs to prevent capturing concatenated options
        if (h.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0) continue;
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
          if (!targetNode.querySelector('input[type="radio"], input[type="checkbox"]')) {
            const txt = cleanFieldLabel(getCleanNodeText(targetNode));
            if (txt && !optionLabels.has(txt.toLowerCase()) && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) {
              return txt;
            }
          }
        }
        prev = prev.previousElementSibling;
      }

      curr = curr.parentElement;
    }

    // 4. Group Name fallback formatted nicely
    const rawName = firstRadio.name || firstRadio.getAttribute('data-automation-id') || '';
    if (rawName && !/^Multi\s*Question\s*Answer\d+/i.test(rawName) && !/^ctl\d+/i.test(rawName)) {
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
    if ([
      '', 'unanswered', 'no file chosen', 'unselected', '(empty)', '(blank)', 'null', 'undefined',
      'no answer', '-- no answer --', '- no answer -', 'not specified', '-- not specified --',
      'please select', '-- select --', '- select -', 'select one', '-- select one --',
      'select an option', '-- select an option --', 'select...', 'choose...', 'choose an option',
      'select a gender...', 'select a race...', 'select state', 'select country',
      '--', '---', 'required', '(required)', '[required]', 'optional', '(optional)', '[optional]',
      'required field', '*required', '*req', '*', 'formpost', 'please explain', 'please'
    ].includes(s)) {
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
        if (labelEl.innerText && (labelEl.innerText.includes('*') || /\(\s*required\s*\)/i.test(labelEl.innerText)) && !/\(\s*optional\s*\)/i.test(labelEl.innerText)) return true;
      }

      // Check single-field wrapper containers (preventing multi-input fieldsets/rows from falsely flagging all fields)
      const fieldWrappers = el.closest('.jv-form-field, .form-group, .field, .form-row, .application-question, [data-automation-id*="formField"], [class*="question"], [class*="formField"], [class*="form-item"], .form-item');
      if (fieldWrappers) {
        const inputCount = fieldWrappers.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
        if (inputCount <= 1) {
          if (fieldWrappers.classList.contains('required') || fieldWrappers.classList.contains('is-required') || fieldWrappers.classList.contains('jv-required') || fieldWrappers.classList.contains('mandatory') || fieldWrappers.getAttribute('data-required') === 'true') {
            return true;
          }
          const hasReqMarker = fieldWrappers.querySelector('.required, .asterisk, .star, .req, abbr[title*="required"], [data-required="true"], .mandatory');
          if (hasReqMarker) return true;
          const legendOrHeader = fieldWrappers.querySelector('legend, .jv-form-field-label, .control-label, [class*="label"], [class*="title"]');
          if (legendOrHeader && legendOrHeader.innerText && (legendOrHeader.innerText.includes('*') || /\(\s*required\s*\)/i.test(legendOrHeader.innerText)) && !/\(\s*optional\s*\)/i.test(legendOrHeader.innerText)) {
            return true;
          }
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
    txt = txt.replace(/\s*\(\s*(?:required|optional|req)\s*\)\s*/gi, ' ');
    txt = txt.replace(/\s*\[\s*(?:required|optional|req)\s*\]\s*/gi, ' ');
    txt = txt.replace(/\s*\b(?:Required|Optional|Req)\b\s*$/i, '');
    txt = txt.replace(/([a-z0-9])(?:Required|Optional|Req)\b/i, '$1');

    // 4. Truncate trailing concatenated option choices after '?'
    if (txt.includes('?')) {
      const qMatch = txt.match(/^([\s\S]*?\?)/);
      if (qMatch && qMatch[1].length >= 8) {
        txt = qMatch[1];
      }
    }

    // 5. Remove trailing concatenated Yes/No/Options on question headers: e.g. "(required)YesNo", "?YesNo", "?--", "(optional)--"
    txt = txt.replace(/(\?)\s*(?:Yes\s*No|No\s*Yes|Yes\*?\s*No|--\s*Yes\s*No|--|Yes|No)$/i, '$1');
    txt = txt.replace(/(\?)\s*(?:Yes|No|--|Prefer not to say|Hourly|Yearly)+$/i, '$1');

    // 6. Remove dropdown option list cascades (e.g. "----YesNo", "No--YesNo", "----HourlyYearly", "Yearly--HourlyYearly", "Male--MaleFemale...")
    txt = txt.replace(/^(?:--+|[A-Za-z0-9*]+\s*--+)\s*(?:Yes\*?|No|Hourly|Yearly|Male|Female|Prefer|Unspecified|Specialized|Other|High School|College|University|Graduate).*$/i, '');
    txt = txt.replace(/^(?:--+|----)[A-Za-z0-9\s,*_-]+$/i, '');

    // 7. Remove concatenated dropdown placeholders & selected option suffixes:
    // e.g. "CountrySelect a country", "CountryUnited States", "StateSelect a state", "StateFL"
    txt = txt.replace(/^(Country)\s*(?:Select\s+(?:a\s+)?country|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|United States|Federated States.*)$/i, '$1');
    txt = txt.replace(/^(State)\s*(?:Select\s+(?:a\s+)?state|[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    txt = txt.replace(/^(Administrative\s*Area)\s*(?:Select\s+(?:a\s+)?state(?:\/province)?|[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    txt = txt.replace(/^(Locality)\s*(?:Select\s+(?:a\s+)?city|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    txt = txt.replace(/^(County)\s*(?:Select\s+(?:a\s+)?county|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    txt = txt.replace(/^(City)\s*(?:Select\s+(?:a\s+)?city|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/i, '$1');
    
    // Remove embedded "Select a/an..."
    txt = txt.replace(/([a-zA-Z])\s*Select\s+(?:a|an|one|from|item|apt)?\s*[a-zA-Z.]*/gi, '$1');
    txt = txt.replace(/\b(Select\s+(?:a|an|one|from|item|apt)\s+[a-zA-Z.]+)\b/gi, '').trim();

    // 8. Strip leading/trailing junk symbols like '--', ':', '*'
    txt = txt.replace(/^[-–—:\s*#]+|[-–—:\s*#]+$/g, '').trim();

    return clean(txt) || clean(str);
  }

  // Detect junk or phantom fields that shouldn't pollute the screening payload
  function isJunkOrPhantomField(label, el) {
    if (!label) return true;
    const l = label.trim().toLowerCase();
    if (l.length < 3) return true;
    if (el && el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay, [id^="sqc-"], [class*="sqc-"]')) {
      return true;
    }
    if (l.includes('gatekeeper') || l.includes('apply-flow') || l.includes('active gate') || l.includes('subsidiary of apply-flow')) {
      return true;
    }
    if (['--', 'pre', 'please', 'select', 'choose', 'select an item', 'checkbox label', '6 results are available.', 'performance cookies', 'required', 'optional', 'formpost'].includes(l)) {
      return true;
    }
    if (/^(--|----)/.test(l)) return true;
    if (/^\d+\s+results?\s+are\s+available/i.test(l)) return true;
    return false;
  }

  // Extract custom dropdown / combobox selected values from DOM widgets
  function extractCustomSelectValue(input) {
    if (!input) return '';

    const container = (input.matches && input.matches('[role="combobox"], [role="listbox"], [data-automation-id*="select"], [data-automation-id*="dropdown"], .k-dropdown, [data-role="dropdownlist"], [class*="k-widget"], [class*="k-combobox"], .select2-container, .bootstrap-select, mat-select'))
      ? input
      : (input.closest && input.closest('[role="combobox"], [role="listbox"], [data-automation-id*="select"], [data-automation-id*="dropdown"], .k-dropdown, [data-role="dropdownlist"], [class*="k-widget"], [class*="k-combobox"], .select2-container, .bootstrap-select, mat-select')) || input;

    if (container) {
      // 1. Check standard single-value / selected elements or input values
      const selectedEl = container.querySelector(
        '.k-input, [class*="k-input"], [class*="singleValue"], [class*="single-value"], [class*="selectedItem"], ' +
        '[class*="selected-value"], [class*="selection__rendered"], [data-automation-id*="selectedItem"], ' +
        '.select2-selection__rendered, [aria-selected="true"], .current-value, .select-value, ' +
        '.filter-option-inner-inner, .filter-option-inner, .filter-option, .selected-option, .mat-select-value-text, ' +
        '.ant-select-selection-item, .p-dropdown-label, .ng-value-label'
      );
      if (selectedEl) {
        const txt = clean(selectedEl.value || selectedEl.innerText || selectedEl.textContent || selectedEl.getAttribute('value') || '');
        if (txt && !isUnansweredPlaceholder(txt) && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return txt;
      }

      // 2. Check all inputs inside container for value
      const containerInputs = container.querySelectorAll('input');
      for (const ci of containerInputs) {
        const val = clean(ci.value || ci.getAttribute('value') || '');
        if (val && !isUnansweredPlaceholder(val) && !isCodeOrJunk(val)) return val;
      }

      // 3. Check button.dropdown-toggle title or aria-label attribute
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
    const rootScope = el.getRootNode ? el.getRootNode() : (el.ownerDocument || document);

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        const label = rootScope.querySelector ? rootScope.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        if (label) {
          const txt = getCleanNodeText(label);
          if (txt && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return cleanFieldLabel(txt);
        }
      } catch (_) {}
    }

    // 2. Parent / ancestor <label>
    const parentLabel = el.closest ? el.closest('label') : null;
    if (parentLabel) {
      const txt = getCleanNodeText(parentLabel);
      if (txt && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return cleanFieldLabel(txt);
    }

    // 3. ARIA attributes
    if (el.getAttribute && el.getAttribute('aria-label')) {
      const aria = cleanFieldLabel(clean(el.getAttribute('aria-label')));
      if (aria && !isCodeOrJunk(aria) && !isDisclaimerOrInstruction(aria)) return aria;
    }
    if (el.getAttribute && el.getAttribute('aria-labelledby')) {
      try {
        const target = rootScope.getElementById ? rootScope.getElementById(el.getAttribute('aria-labelledby')) : rootScope.querySelector?.(`#${CSS.escape(el.getAttribute('aria-labelledby'))}`);
        if (target) {
          const txt = getCleanNodeText(target);
          if (txt && !isCodeOrJunk(txt) && !isDisclaimerOrInstruction(txt)) return cleanFieldLabel(txt);
        }
      } catch (_) {}
    }

    // 4. Ancestor Tree Walk (Up to 7 levels, piercing shadow roots)
    let curr = el;
    let depth = 0;
    while (curr && curr !== document.body && curr !== document.documentElement && depth < 7) {
      depth++;

      if (curr !== el) {
        const candidateHeaders = curr.querySelectorAll ? curr.querySelectorAll(
          'label, legend, .control-label, [data-automation-id*="label"], [data-automation-id*="question"], [data-automation-id*="prompt"], ' +
          '[class*="label"], [class*="title"], [class*="header"], [class*="prompt"], [class*="question"], ' +
          'h1, h2, h3, h4, h5, h6, strong, b'
        ) : [];

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

      curr = curr.parentElement || (curr.getRootNode ? curr.getRootNode().host : null);
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

  // Non-job web services, search engines, and communication tools that should never trigger the checker
  const NON_JOB_DOMAINS = [
    'chatgpt.com', 'openai.com',
    'google.com', 'youtube.com', 'github.com', 'gitlab.com',
    'reddit.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'mail.google.com', 'outlook.live.com', 'outlook.office.com',
    'wikipedia.org', 'stackoverflow.com', 'canva.com', 'figma.com',
    'netflix.com', 'amazon.com', 'ebay.com', 'apple.com'
  ];

  function isNonJobDomain(host) {
    const h = (host || window.location.hostname || '').toLowerCase();
    return NON_JOB_DOMAINS.some(d => h === d || h.endsWith('.' + d));
  }

  // Detect ATS platform
  function detectAtsPlatform() {
    const host = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();

    // 1. Direct Known ATS Platforms
    if (host.includes('ttcportals.com') || host.includes('ttcportals') || host.includes('talentbrew.com') || host.includes('radancy.com') || host.includes('tmp.com')) return 'ttcportals';
    if (host.includes('taleo.net') || host.includes('oraclecloud.com') || host.includes('tbe.taleo.net')) return 'taleo';
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
    if (host.includes('ashbyhq.com') || host.includes('ashby.io')) return 'ashby';
    if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (host.includes('jobvite.com')) return 'jobvite';
    if (host.includes('rippling.com')) return 'rippling';
    if (host.includes('dover.com')) return 'dover';
    if (host.includes('breezy.hr')) return 'breezy';
    if (host.includes('brassring.com')) return 'brassring';
    if (host.includes('cornerstoneondemand.com')) return 'cornerstone';
    if (host.includes('successfactors.com')) return 'successfactors';
    if (host.includes('indeed.com') && (url.includes('/viewjob') || url.includes('/apply') || url.includes('smartapply'))) return 'indeed';
    if (host.includes('linkedin.com') && (url.includes('/jobs/view') || url.includes('/jobs/apply') || url.includes('/jobs/collections'))) return 'linkedin';
    if (host.includes('ziprecruiter.com') && (url.includes('/candidate/') || url.includes('/jobs/'))) return 'ziprecruiter';
    if (url.includes('workday') || document.querySelector('[data-automation-id]')) return 'workday';

    // 2. Test Bench Simulator
    if (url.includes('test-bench') || (document.title && /ats simulator|test bench/i.test(document.title))) {
      return 'test-bench';
    }

    // 3. Explicit Apply-Flow job parameters attached to URL
    const hasExplicitJob = /[?&#](job_id|sqc_job_id|portal_job_id|jobId)=[^&#]+/i.test(window.location.href);
    if (hasExplicitJob) {
      return 'generic';
    }

    // 4. Hard block non-job services like ChatGPT, Google, GitHub from ever returning 'generic'
    if (isNonJobDomain(host)) {
      return null;
    }

    // 4b. Multi-Step ATS Wizard / Sub-Page Session Continuity
    // If this tab previously initialized an active Apply-Flow session for this application, retain generic portal
    // focus so Step 2, 3, 4 wizards don't lose the HUD when URL hash or query parameters are stripped
    try {
      const hasSessionJob = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('applyflow_job_id'));
      const hasPersistedJob = typeof window !== 'undefined' && Boolean(window.__SQC_PERSISTED_AF_SESSION?.jobId);
      if (hasSessionJob || hasPersistedJob) {
        return 'generic';
      }
    } catch (_) {}

    // 5. Standalone Company Job Portal Application Page
    // Must possess an actual job application structure:
    // (Resume file upload OR paste resume textarea) AND applicant email field AND job submission button
    try {
      const hasFileInput = Boolean(document.querySelector('input[type="file"], [data-qa*="resume"], [class*="resume-upload"], [id*="resume-upload"]'));
      const hasResumeText = Boolean(document.querySelector('textarea[name*="resume" i], textarea[id*="resume" i]'));
      const hasEmail = Boolean(document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]'));
      const hasSubmit = Boolean(document.querySelector('button[type="submit"], input[type="submit"], [role="button"][data-qa*="submit"], button:not([type="button"])'));
      
      const pageText = (document.body?.innerText || '').slice(0, 3000).toLowerCase();
      const hasApplyKeywords = pageText.includes('job application') || pageText.includes('apply for this') || pageText.includes('apply now') || pageText.includes('submit application') || pageText.includes('attach resume');

      if ((hasFileInput || hasResumeText) && hasEmail && (hasSubmit || hasApplyKeywords)) {
        return 'generic';
      }
    } catch (_) {}

    return null;
  }

  // Determine if current page is an eligible ATS or job application portal
  function isJobApplicationPortal() {
    const host = window.location.hostname.toLowerCase();

    // Do not run on localhost dashboard root
    if (host === 'localhost' && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
      return false;
    }

    // Child iframes embedded inside an ATS portal must ALWAYS be eligible so sub-wizards report fields
    if (window !== window.top) {
      return true;
    }

    const ats = detectAtsPlatform();
    return Boolean(ats);
  }

  // Purge any lingering session storage and remove HUD from non-job pages
  function cleanupNonJobSession() {
    try {
      const existing = document.getElementById('sqc-hud-container');
      if (existing) existing.remove();
      const existingModal = document.getElementById('sqc-modal-overlay');
      if (existingModal) existingModal.remove();

      document.querySelectorAll('.sqc-field-error, .sqc-field-warning').forEach(el => {
        el.classList.remove('sqc-field-error', 'sqc-field-warning');
        el.removeAttribute('data-sqc-error');
      });

      sessionStorage.removeItem('applyflow_job_id');
      sessionStorage.removeItem('applyflow_profile_id');
      sessionStorage.removeItem('applyflow_profile_name');
      sessionStorage.removeItem('applyflow_applier_id');
      sessionStorage.removeItem('applyflow_applier_name');
      sessionStorage.removeItem('applyflow_job_title');
      sessionStorage.removeItem('applyflow_company');
      sessionStorage.removeItem('applyflow_req_id');
      sessionStorage.removeItem('applyflow_original_job_url');
      sessionStorage.removeItem('applyflow_jd_salary');
      sessionStorage.removeItem('applyflow_jd_text');
      sessionStorage.removeItem('applyflow_locked_job_key');
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('sqc_app_')) {
          sessionStorage.removeItem(k);
        }
      }
    } catch (_) {}
  }

  // Detect honeypots, bot traps, and password inputs
  function isHoneypotOrLoginField(el, labelText) {
    if (!el) return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'password') return true;

    // Do not drop elements enclosed in custom comboboxes, custom selects, or Material/TalentBrew components
    if (el.closest && el.closest('.k-widget, [role="combobox"], [role="listbox"], .select2, mat-select, .mdc-text-field, .form-group, fieldset')) {
      return false;
    }

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
      const win = el.ownerDocument?.defaultView || window;
      const style = win.getComputedStyle(el);
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
    // 0. Active Apply Button Override:
    // If the active job view has an actionable "1-Click Apply" or "Apply" button visible and enabled,
    // the job is definitively NOT already applied (prevents feed/header false positives).
    const actionableApplyButtons = document.querySelectorAll(
      'button, [role="button"], a.btn, .btn, input[type="submit"], input[type="button"]'
    );
    let hasActionableApplyButton = false;
    for (const b of actionableApplyButtons) {
      if (b.closest && b.closest('#sqc-hud-container, #sqc-modal-overlay, nav, header, footer')) continue;
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const txt = clean(b.innerText || b.textContent || b.value || '');
      if (/^(1-click apply|apply with 1-click|one-click apply|easy apply|apply now|apply)$/i.test(txt)) {
        hasActionableApplyButton = true;
        break;
      }
    }

    if (hasActionableApplyButton) {
      return { is_already_applied: false, message: '' };
    }

    // 1. Direct platform status badges / buttons / links (excluding navigation and menus)
    const statusElements = document.querySelectorAll(
      'button, [role="button"], a, .btn, .applied-badge, .application-status, [data-automation-id*="applied"], [data-testid*="applied"], [class*="applied"], [class*="status"]'
    );
    for (const b of statusElements) {
      if (b.closest && b.closest('#sqc-hud-container, #sqc-modal-overlay, nav, header, footer, [role="navigation"], .header, .nav, .menu')) continue;
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
        if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay, nav, header, footer, [role="navigation"]')) continue;
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
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay, nav, header, footer, [role="navigation"], .header, .nav, .menu')) continue;
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

  // Detect if the user is on an intermediate step of a multi-step form wizard (e.g. "Step 3 of 8")
  function detectIntermediateWizardStep() {
    try {
      const bodyText = (document.body ? (document.body.innerText || '') : '').slice(0, 4000);

      // 1. Explicit Step X of Y or Step X / Y or Page X of Y regex
      const stepMatch = bodyText.match(/\b(?:step|page)\s+(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
      if (stepMatch) {
        const cur = parseInt(stepMatch[1], 10);
        const tot = parseInt(stepMatch[2], 10);
        if (tot > 1 && cur < tot) {
          return { isIntermediate: true, currentStep: cur, totalSteps: tot, label: `Step ${cur} of ${tot}` };
        }
      }

      // 2. Multi-step stepper / wizard DOM elements
      const activeStepper = document.querySelector(
        '.wizard-step.active, [aria-current="step"], [data-automation-id*="progressBarActiveStep"], .step-item.active, .stepper-item.active, [data-step-active="true"]'
      );
      if (activeStepper) {
        const parentList = activeStepper.closest('ol, ul, nav, [class*="wizard"], [class*="step"], [class*="progress"]');
        if (parentList) {
          const allSteps = Array.from(parentList.querySelectorAll('li, .step-item, .stepper-item, .wizard-step, [data-automation-id*="progressBarStep"]'));
          const activeIdx = allSteps.indexOf(activeStepper);
          if (allSteps.length > 1 && activeIdx >= 0 && activeIdx < allSteps.length - 1) {
            return { isIntermediate: true, currentStep: activeIdx + 1, totalSteps: allSteps.length, label: `Step ${activeIdx + 1} of ${allSteps.length}` };
          }
        }
      }

      // 3. Check for wizard buttons: presence of "Next", "Continue", "Save & Continue" without any final "Submit Application" button
      const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]'))
        .filter(b => !b.closest('#sqc-hud-container, #sqc-modal-overlay') && b.offsetParent !== null);

      const hasNextButton = allButtons.some(b => {
        const t = (b.innerText || b.textContent || b.value || '').trim();
        return /^(next|next step|continue|save & continue|save and continue|proceed)$/i.test(t);
      });

      const hasFinalSubmitButton = allButtons.some(b => {
        const t = (b.innerText || b.textContent || b.value || '').trim();
        return /^(submit application|submit|complete application|send application|finish and submit|confirm and submit)$/i.test(t);
      });

      if (hasNextButton && !hasFinalSubmitButton) {
        return { isIntermediate: true, label: 'Intermediate Wizard Step' };
      }

      return { isIntermediate: false };
    } catch (_) {
      return { isIntermediate: false };
    }
  }

  // Count active, interactive form fields visible on the page
  function countVisibleFormInputs() {
    try {
      const inputs = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
      )).filter(el => {
        if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-portal-lock-banner')) return false;
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 || rect.height > 0) && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
      });
      return inputs.length;
    } catch (_) {
      return 0;
    }
  }

  // Detect if the job application was just successfully submitted / confirmed (Quick Apply or Standard ATS)
  function detectSubmissionSuccess() {
    // Safeguard 1: Intermediate wizard steps (e.g. Step 3 of 8) are NEVER confirmation screens!
    const intermediateCheck = detectIntermediateWizardStep();
    if (intermediateCheck.isIntermediate) {
      return { is_success: false, message: '' };
    }

    // Safeguard 2: Pages with multiple active editable candidate fields are actively being filled, NOT confirmed
    if (countVisibleFormInputs() > 2) {
      return { is_success: false, message: '' };
    }

    // 0. Global body text search for unambiguous, definitive confirmation phrases
    const pageBodyText = clean(document.body ? (document.body.innerText || document.body.textContent || '') : '');
    const definitivePatterns = [
      /you(?:'ve| have)?\s+(?:successfully\s+)?applied\s+(?:for|to)\b/i,
      /you(?:'ve| have)\s+successfully\s+applied\b/i,
      /successfully\s+applied\s+(?:for|to)\b/i,
      /application\s+(?:has been|was|is)\s+(?:successfully\s+)?(?:submitted|sent|received)\b/i,
      /your\s+application\s+(?:for\s+.+\s+)?(?:was|has been)\s+(?:sent|submitted|received)\b/i,
      /(?:thank\s*you|thanks)\s+for\s+applying(?:\s+(?:to|for)|!|\.)/i,
      /we(?:'ve| have)\s+received\s+your\s+application\b/i,
      /your\s+application\s+has\s+been\s+received\b/i,
      /your\s+application\s+is\s+on\s+its\s+way\b/i,
      /you(?:'re| are)\s+all\s+set!?\s+your\s+application\b/i,
      /application\s+submitted\s+successfully\b/i
    ];

    for (const pat of definitivePatterns) {
      if (pat.test(pageBodyText)) {
        const match = pageBodyText.match(pat);
        const snippet = match ? match[0] : 'Application confirmed on page';
        return { is_success: true, message: snippet };
      }
    }

    // 1. Direct platform status badges/buttons
    const appliedButtons = document.querySelectorAll(
      'button, [role="button"], .applied-badge, .application-status, [data-automation-id*="applied"], [data-testid*="applied"], [class*="applied"]'
    );
    for (const b of appliedButtons) {
      if (b.closest && b.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      const txt = clean(b.innerText || b.textContent || '');
      if (/^(applied|applied\s*✓|application\s*submitted|application\s*sent)$/i.test(txt)) {
        return { is_success: true, message: txt };
      }
    }

    // 2. Headings, alerts, and banners indicating submission completion
    const successPatterns = [
      /you(?:'ve| have)?\s+(?:successfully\s+)?applied/i,
      /successfully\s+applied/i,
      /you\s+have\s+successfully\s+applied/i,
      /application\s+(?:has been|was|is)\s+(?:successfully\s+)?(?:submitted|sent|received)/i,
      /your\s+application\s+(?:for\s+.+\s+)?(?:was|has been)\s+(?:sent|submitted|received)/i,
      /thank\s*you\s+for\s+applying/i,
      /thanks\s+for\s+applying/i,
      /thank\s*you\s+for\s+(?:your\s+interest|submitting)/i,
      /we(?:'ve| have)\s+received\s+your\s+application/i,
      /your\s+application\s+has\s+been\s+received/i,
      /congratulations!?(?:\s+your\s+application\s+was\s+sent)?/i,
      /application\s+submitted/i,
      /application\s+sent/i,
      /applied\s+on\s+ziprecruiter/i,
      /applied\s+with\s+indeed/i,
      /you\s+applied\s+to\s+this\s+job/i,
      /your\s+application\s+is\s+on\s+its\s+way/i,
      /you're\s+all\s+set/i
    ];

    const elements = document.querySelectorAll(
      'h1, h2, h3, h4, h5, [role="heading"], .alert, .banner, .notification, .modal-body, .modal-title, .status-message, [class*="success"], [class*="confirmation"], [class*="applied"], p, span, strong, div, section, main'
    );
    for (const el of elements) {
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      if (el.children.length > 8 && el.innerText.length > 500) continue;

      const txt = clean(el.innerText || '');
      if (!txt || txt.length > 400) continue;

      for (const pattern of successPatterns) {
        if (pattern.test(txt)) {
          return { is_success: true, message: txt.slice(0, 100) };
        }
      }
    }

    // 3. Check page URL / document title indicators paired with confirmation headers
    const currentUrl = (window.location.href || '').toLowerCase();
    const pageTitle = (document.title || '').toLowerCase();
    const hasConfirmUrlOrTitle = /\/(confirmation|confirm|thank-you|thanks|submitted|success)\b/i.test(currentUrl) || /confirmation|application submitted|thank you for applying/i.test(pageTitle);

    // Also check for top-level headers/titles saying "Confirmation" (e.g. Rippling ATS top bar)
    const headerHasConfirmation = Array.from(document.querySelectorAll('h1, h2, h3, header, [role="banner"], [class*="header"], [class*="title"], div')).some(el => {
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) return false;
      const t = clean(el.innerText || '');
      return t === 'Confirmation' || /^confirmation\b/i.test(t);
    });

    if (hasConfirmUrlOrTitle || headerHasConfirmation) {
      if (/applied|submitted|received|confirmation|thank you/i.test(pageBodyText)) {
        return { is_success: true, message: 'Application confirmed on submission page' };
      }
    }

    return { is_success: false, message: '' };
  }

  // Detect if the job application encountered an error / submission failure on portal
  function detectSubmissionFailure() {
    const errorSelectors = [
      '.alert-danger',
      '.alert-error',
      '.error-banner',
      '#error_explanation',
      '[data-automation-id="errorMessage"]',
      '.wd-error',
      '[role="alert"]',
      '.form-error-summary',
      '.toast-error',
      '.status-error',
      '.submission-error'
    ];

    const failurePatterns = [
      /there (?:was|is) a problem (?:submitting|with your application)/i,
      /submission failed/i,
      /an error occurred while submitting/i,
      /unable to submit your application/i,
      /session (?:has )?expired/i,
      /your session timed out/i,
      /something went wrong(?:\. please try again)?/i,
      /application could not be submitted/i,
      /please fix the errors? below before submitting/i
    ];

    for (const sel of errorSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
        const txt = clean(el.innerText || '');
        if (!txt) continue;
        for (const pat of failurePatterns) {
          if (pat.test(txt)) {
            return { is_failed: true, message: txt.slice(0, 120) };
          }
        }
      }
    }

    const headingsAndAlerts = document.querySelectorAll('h1, h2, h3, h4, .alert, [role="alert"], [class*="error"], p');
    for (const el of headingsAndAlerts) {
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      if (el.children.length > 5 && el.innerText.length > 300) continue;
      const txt = clean(el.innerText || '');
      if (!txt || txt.length > 250) continue;
      for (const pat of failurePatterns) {
        if (pat.test(txt)) {
          return { is_failed: true, message: txt.slice(0, 120) };
        }
      }
    }

    return { is_failed: false, message: '' };
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

  // Helper: Compute canonical position path to distinguish jobs and persist sessions per job position
  const getCanonicalJobPath = (u) => {
    try {
      const parsed = new URL(u || window.location.href);
      let path = parsed.origin + parsed.pathname.toLowerCase();
      // Remove trailing sub-actions like /apply, /confirm, /submitted, etc.
      path = path.replace(/\/(?:apply|application|confirmation|confirm|submitted|success|thank[-_]?you|form|step\d+|wizard|view)(?:\/.*)?$/i, '');
      // Remove language/locale segments like /en-gb/ or /en-us/
      path = path.replace(/\/[a-z]{2}(?:-[a-zA-Z]{2})?\//i, '/');
      path = path.replace(/\/$/, '');
      // Differentiate position query parameters when the position is defined by query param (e.g. ?jobId=... or ?gh_jid=... or ?id=...)
      const positionSlug = parsed.searchParams.get('jobId') || parsed.searchParams.get('gh_jid') || parsed.searchParams.get('id') || '';
      if (positionSlug && !path.includes(positionSlug.toLowerCase())) {
        path += `?jobId=${positionSlug.toLowerCase()}`;
      }
      return path;
    } catch (_) {
      return (u || window.location.href).split('?')[0].split('#')[0].toLowerCase();
    }
  };

  // Helper: Extract ATS Position Slug (UUID or Requisition ID) from URL
  const getAtsPositionSlug = (u) => {
    try {
      const parsed = new URL(u || window.location.href);
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      for (const seg of pathSegments) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
          return seg.toLowerCase();
        }
        if (/^[a-z0-9_-]{12,}$/i.test(seg) && !/^(?:apply|jobs|job|careers|en-gb|en-us|view)$/i.test(seg)) {
          return seg.toLowerCase();
        }
      }
      const qId = parsed.searchParams.get('jobId') || parsed.searchParams.get('gh_jid') || parsed.searchParams.get('id') || '';
      if (qId && (/^[0-9a-f-]{8,}$/i.test(qId) || /^\d{5,}$/.test(qId))) {
        return qId.toLowerCase();
      }
    } catch (_) {}
    return '';
  };

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

    // Direct regex extraction from full URL string (handles complex hashes, unencoded chars, etc.)
    const getRegexParam = (keys, sourceStr) => {
      const src = sourceStr || window.location.href;
      for (const k of keys) {
        const reg = new RegExp(`[?&#]${k}=([^&#]+)`, 'i');
        const match = src.match(reg);
        if (match) return decodeURIComponent(match[1].replace(/\+/g, ' '));
      }
      return '';
    };

    const currentCanonicalPath = getCanonicalJobPath(window.location.href);
    const currentAtsSlug = getAtsPositionSlug(window.location.href);

    // ApplyFlow parameter resolver:
    // IMPORTANT: Hash parameters ALWAYS take priority over ATS search parameters!
    // Search query parameters often belong to the job board itself (e.g. Rippling's ?jobId=<uuid>).
    const getParam = (key, altKeys = []) => {
      // 1. Check hash params first (ApplyFlow attaches its context in the hash)
      let val = hashParams.get(key) || '';
      if (!val && altKeys && altKeys.length) {
        for (const k of altKeys) {
          val = hashParams.get(k) || '';
          if (val) break;
        }
      }

      // 2. Check explicit sqc_ prefixed query params
      if (!val) {
        const sqcKey = key.startsWith('sqc_') ? key : `sqc_${key}`;
        val = searchParams.get(sqcKey) || '';
      }

      // 3. Check regex on window.location.hash specifically
      if (!val) {
        val = getRegexParam([key, ...altKeys], window.location.hash || '') || '';
      }

      // 4. Check standard searchParams (only if not a conflicting ATS parameter)
      if (!val) {
        val = searchParams.get(key) || '';
        if (!val && altKeys && altKeys.length) {
          for (const k of altKeys) {
            // NEVER let generic 'jobId' or 'app_id' in searchParams overwrite ApplyFlow CUID
            if (['jobId', 'app_id', 'id'].includes(k)) continue;
            val = searchParams.get(k) || '';
            if (val) break;
          }
        }
      }

      if (typeof val === 'string') {
        try {
          val = decodeURIComponent(val.replace(/\+/g, ' ')).trim();
        } catch (_) {
          val = val.replace(/\+/g, ' ').trim();
        }
      }
      return val || '';
    };

    // Specific resolver for ApplyFlow job_id:
    // Must be either an explicit sqc_ parameter, hash parameter, or a genuine CUID.
    const getApplyFlowJobId = () => {
      // Priority 1: Hash parameters
      let jid = hashParams.get('sqc_job_id') || hashParams.get('job_id') || hashParams.get('portal_job_id') || '';
      if (jid) return jid;

      // Priority 2: Explicit sqc_ query parameter
      jid = searchParams.get('sqc_job_id') || searchParams.get('sqc_jobId') || '';
      if (jid) return jid;

      // Priority 3: Regex match in hash
      jid = getRegexParam(['sqc_job_id', 'job_id', 'portal_job_id'], window.location.hash || '');
      if (jid) return jid;

      // Priority 4: If in searchParams, verify it looks like an ApplyFlow ID (CUID cm... or cl...)
      const cand = searchParams.get('job_id') || searchParams.get('sqc_job_id') || '';
      if (cand && /^c[a-z0-9]{20,30}$/i.test(cand)) {
        return cand;
      }
      return '';
    };

    const params = {
      jobId: getApplyFlowJobId(),
      profileId: getParam('profile_id', ['sqc_profile_id', 'sqc_candidate_id', 'candidate_id', 'candidateId']),
      profileName: getParam('profile_name', ['sqc_profile_name', 'candidate_name', 'candidateName']),
      applierId: getParam('applier_id', ['sqc_applier_id', 'user_id', 'userId']),
      applierName: getParam('applier_name', ['sqc_applier_name', 'user_name', 'userName']),
      targetStack: getParam('target_stack', ['sqc_target_stack', 'sqc_tech_stack', 'sqc_stack', 'tech_stack', 'stack', 'stack_name', 'track']),
      techStackId: getParam('tech_stack_id', ['sqc_tech_stack_id', 'sqc_stack_id', 'stack_id']),
      apiUrl: getParam('sqc_api_url', ['api_url', 'sqc_server_url', 'server_url', 'sqc_backend_url', 'backend_url']),
      clientUrl: getParam('sqc_client_url', ['client_url', 'sqc_web_url', 'web_url']),
      env: getParam('sqc_env', ['env']),
      canonicalPath: currentCanonicalPath,
      atsSlug: currentAtsSlug
    };

    // Bound Session Storage & Restoration
    try {
      const isNonJob = isNonJobDomain(window.location.hostname);
      const rawBoundSession = sessionStorage.getItem('applyflow_bound_session');
      let boundSession = null;
      if (rawBoundSession) {
        try { boundSession = JSON.parse(rawBoundSession); } catch (_) {}
      }

      // If active ApplyFlow parameters are present in current URL (e.g. freshly opened link from ApplyFlow):
      if (params.jobId || params.profileId) {
        const newBound = {
          canonicalPath: currentCanonicalPath,
          jobId: params.jobId || boundSession?.jobId || '',
          profileId: params.profileId || boundSession?.profileId || '',
          profileName: params.profileName || boundSession?.profileName || '',
          applierId: params.applierId || boundSession?.applierId || '',
          applierName: params.applierName || boundSession?.applierName || '',
          targetStack: params.targetStack || boundSession?.targetStack || '',
          techStackId: params.techStackId || boundSession?.techStackId || '',
          apiUrl: params.apiUrl || boundSession?.apiUrl || '',
          clientUrl: params.clientUrl || boundSession?.clientUrl || '',
          env: params.env || boundSession?.env || '',
          status: boundSession?.canonicalPath === currentCanonicalPath ? boundSession?.status : undefined,
          appliedAt: boundSession?.canonicalPath === currentCanonicalPath ? boundSession?.appliedAt : undefined,
          savedAt: Date.now()
        };
        sessionStorage.setItem('applyflow_bound_session', JSON.stringify(newBound));
        if (newBound.jobId) sessionStorage.setItem('applyflow_job_id', newBound.jobId);
        if (newBound.profileId) sessionStorage.setItem('applyflow_profile_id', newBound.profileId);
        if (newBound.profileName) sessionStorage.setItem('applyflow_profile_name', newBound.profileName);
        if (newBound.applierId) sessionStorage.setItem('applyflow_applier_id', newBound.applierId);
        if (newBound.applierName) sessionStorage.setItem('applyflow_applier_name', newBound.applierName);
        if (newBound.targetStack) sessionStorage.setItem('applyflow_target_stack', newBound.targetStack);
        if (newBound.techStackId) sessionStorage.setItem('applyflow_tech_stack_id', newBound.techStackId);
        if (newBound.apiUrl) {
          sessionStorage.setItem('applyflow_api_url', newBound.apiUrl);
          try { chrome.storage?.local?.set({ applyflow_api_url: newBound.apiUrl }); } catch (_) {}
        }
        if (newBound.clientUrl) sessionStorage.setItem('applyflow_client_url', newBound.clientUrl);
        if (newBound.env) sessionStorage.setItem('applyflow_env', newBound.env);
      } else if (!isNonJob && boundSession) {
        // Hash context was cleared (e.g. user reloaded the page in the same tab):
        // Verify that the current page matches the canonical position of the bound session!
        const isMatchingPosition = Boolean(
          boundSession.canonicalPath && (
            boundSession.canonicalPath === currentCanonicalPath ||
            currentCanonicalPath.startsWith(boundSession.canonicalPath) ||
            boundSession.canonicalPath.startsWith(currentCanonicalPath)
          )
        );

        if (isMatchingPosition) {
          // Perfectly matches! Seamlessly restore ApplyFlow context across page reload
          if (!params.jobId && boundSession.jobId) params.jobId = boundSession.jobId;
          if (!params.profileId && boundSession.profileId) params.profileId = boundSession.profileId;
          if (!params.profileName && boundSession.profileName) params.profileName = boundSession.profileName;
          if (!params.applierId && boundSession.applierId) params.applierId = boundSession.applierId;
          if (!params.applierName && boundSession.applierName) params.applierName = boundSession.applierName;
          if (!params.targetStack && boundSession.targetStack) params.targetStack = boundSession.targetStack;
          if (!params.techStackId && boundSession.techStackId) params.techStackId = boundSession.techStackId;
          if (!params.apiUrl && boundSession.apiUrl) params.apiUrl = boundSession.apiUrl;
          if (!params.clientUrl && boundSession.clientUrl) params.clientUrl = boundSession.clientUrl;
          if (!params.env && boundSession.env) params.env = boundSession.env;

          // Re-sync sessionStorage
          if (params.jobId) sessionStorage.setItem('applyflow_job_id', params.jobId);
          if (params.profileId) sessionStorage.setItem('applyflow_profile_id', params.profileId);
          if (params.profileName) sessionStorage.setItem('applyflow_profile_name', params.profileName);
          if (params.applierId) sessionStorage.setItem('applyflow_applier_id', params.applierId);
          if (params.apiUrl) sessionStorage.setItem('applyflow_api_url', params.apiUrl);
        } else {
          // Different position or different job — completely purge stale bound session & IDs!
          sessionStorage.removeItem('applyflow_bound_session');
          sessionStorage.removeItem('applyflow_job_id');
          sessionStorage.removeItem('applyflow_profile_id');
          sessionStorage.removeItem('applyflow_profile_name');
          sessionStorage.removeItem('applyflow_applier_id');
          sessionStorage.removeItem('applyflow_applier_name');
          sessionStorage.removeItem('applyflow_target_stack');
          sessionStorage.removeItem('applyflow_tech_stack_id');
          sessionStorage.removeItem('applyflow_job_title');
          sessionStorage.removeItem('applyflow_company');
          sessionStorage.removeItem('applyflow_req_id');
          sessionStorage.removeItem('applyflow_original_job_url');
          sessionStorage.removeItem('applyflow_jd_salary');
          sessionStorage.removeItem('applyflow_jd_text');
        }
      }

      // Additional Fallback: From injected background persisted session
      if (!isNonJob && window.__SQC_PERSISTED_AF_SESSION) {
        const ps = window.__SQC_PERSISTED_AF_SESSION;
        const psCanonical = ps.sourceUrl ? getCanonicalJobPath(ps.sourceUrl) : '';
        const isPsMatch = Boolean(
          (psCanonical && (psCanonical === currentCanonicalPath || currentCanonicalPath.startsWith(psCanonical) || psCanonical.startsWith(currentCanonicalPath))) ||
          (ps.jobId && window.location.href.includes(ps.jobId))
        );
        if (isPsMatch) {
          if (!params.jobId && ps.jobId) params.jobId = ps.jobId;
          if (!params.profileId && ps.profileId) params.profileId = ps.profileId;
          if (!params.profileName && ps.profileName) params.profileName = ps.profileName;
          if (!params.applierId && ps.applierId) params.applierId = ps.applierId;
          if (!params.applierName && ps.applierName) params.applierName = ps.applierName;
          if (!params.targetStack && (ps.targetStack || ps.techStack)) params.targetStack = ps.targetStack || ps.techStack;
          if (!params.apiUrl && ps.apiUrl) params.apiUrl = ps.apiUrl;
        }
      }
    } catch (_) {}

    return params;
  }

  // Extract logged-in account identity on job platforms (ZipRecruiter, LinkedIn, Indeed, Workday, etc.)
  function extractLoggedInAccount() {
    let accountName = '';
    let accountEmail = '';
    let rawGreeting = '';
    let platform = '';

    const host = window.location.hostname.toLowerCase();
    if (host.includes('ziprecruiter')) platform = 'ZipRecruiter';
    else if (host.includes('linkedin')) platform = 'LinkedIn';
    else if (host.includes('indeed')) platform = 'Indeed';
    else if (host.includes('myworkdayjobs') || host.includes('workday')) platform = 'Workday';
    else platform = 'Job Portal';

    // 1. Direct Greetings: "Good Morning, ADAM", "Good Afternoon, <Name>", "Welcome back, <Name>", etc.
    const greetingRegex = /\b(?:good\s+(?:morning|afternoon|evening)|welcome(?:\s+back)?|hi|hello),\s+([a-zA-Z\u00C0-\u024F]+)(?:\s+([a-zA-Z\u00C0-\u024F]+))?/i;
    const headingCandidates = document.querySelectorAll('h1, h2, h3, .greeting, [class*="greeting"], header [class*="title"], [data-testid*="greeting"], header');
    for (const h of headingCandidates) {
      if (h.closest && h.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      const txt = (h.innerText || '').trim();
      if (!txt || txt.length > 80) continue;
      const match = txt.match(greetingRegex);
      if (match && match[1]) {
        rawGreeting = match[0];
        accountName = `${match[1]} ${match[2] || ''}`.trim();
        break;
      }
    }

    // 2. Platform-specific user menus and avatars
    if (!accountName) {
      if (platform === 'ZipRecruiter') {
        const zUserEl = document.querySelector('.user_name, [data-testid*="user-name"], [data-testid*="profile-name"], header [aria-label*="Account"], header .account_name');
        if (zUserEl) {
          const txt = (zUserEl.innerText || zUserEl.getAttribute('aria-label') || '').trim();
          const cleanName = txt.replace(/account menu for\s*/i, '').replace(/account\s*/i, '').trim();
          if (cleanName && cleanName.length < 40 && !/sign in|log in/i.test(cleanName)) {
            accountName = cleanName;
          }
        }
      } else if (platform === 'LinkedIn') {
        const meEl = document.querySelector('.global-nav__me .feed-identity-module__actor-meta, [data-control-name="identity_profile"]');
        if (meEl) {
          const txt = (meEl.innerText || '').trim();
          if (txt && txt.length < 40) accountName = txt;
        }
      } else if (platform === 'Indeed') {
        const inUserEl = document.querySelector('[data-gnav-element-name="user-menu"], button[aria-label*="account"]');
        if (inUserEl) {
          const txt = (inUserEl.getAttribute('aria-label') || inUserEl.innerText || '').trim();
          const m = txt.match(/account\s+for\s+([^,]+)/i);
          if (m && m[1]) accountName = m[1].trim();
        }
      }
    }

    // 3. "Signed in as <email>" / "Logged in as <email>"
    const signedInEls = document.querySelectorAll('span, div, p, [class*="auth"], [class*="user-email"]');
    for (const el of signedInEls) {
      if (el.closest && el.closest('#sqc-hud-container, #sqc-modal-overlay')) continue;
      if (el.children.length > 2) continue;
      const txt = (el.innerText || '').trim();
      const m = txt.match(/(?:signed\s*in\s*as|logged\s*in\s*as|current\s*user:?)\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i);
      if (m && m[1]) {
        accountEmail = m[1].trim();
        break;
      }
    }

    return {
      hasAccount: Boolean(accountName || accountEmail),
      accountName,
      accountEmail,
      rawGreeting,
      platform
    };
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

    const result = {
      has_jd_salary: Boolean(minVal || maxVal),
      raw: rawText,
      min: minVal,
      max: maxVal,
      isHourly: isHourly
    };

    try {
      if (result.has_jd_salary) {
        sessionStorage.setItem('applyflow_jd_salary', JSON.stringify(result));
      } else {
        const savedSalRaw = sessionStorage.getItem('applyflow_jd_salary');
        if (savedSalRaw) {
          const parsedSal = JSON.parse(savedSalRaw);
          if (parsedSal && parsedSal.has_jd_salary) {
            return parsedSal;
          }
        }
        if (window.__SQC_PERSISTED_AF_SESSION?.jdSalary?.has_jd_salary) {
          return window.__SQC_PERSISTED_AF_SESSION.jdSalary;
        }
      }
    } catch (_) {}

    return result;
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

  // Detect if a heading/title is a generic portal label, multi-step wizard header, auth prompt, or post-submit state banner
  function isGenericOrWizardStepTitle(str) {
    if (!str) return true;
    const s = clean(str);
    if (!s || s.length < 2 || s.length > 180) return true;
    if (/^(apply with resume|apply for this job|apply for job|apply now|application|apply|job application|careers|job details|welcome|candidate portal|standard application|online application|review and submit|review and apply|submit application|ready when you are\.|chatgpt|new chat|home|search jobs|job search|current openings|open positions)$/i.test(s)) {
      return true;
    }
    if (/^(step\s*\d+|page\s*\d+|part\s*\d+|section\s*\d+)\b/i.test(s)) return true;
    if (/^(my\s+information|personal\s+information|contact\s+information|basic\s+information|my\s+experience|work\s+experience|professional\s+experience|education|application\s+questions|screening\s+questions|additional\s+questions|preliminary\s+questions|employer\s+questions|questionnaire|voluntary\s+self[-\s]*identification|voluntary\s+disclosures?|equal\s+employment\s+opportunity|eeo\s+disclosures?|self[-\s]*identification|diversity\s+survey|veteran\s+status|disability\s+status|review|summary|documents|upload\s+resume|attach\s+resume|resume\s+upload|autofill\s+with\s+resume|additional\s+information|cover\s+letter|references|certifications|consent|acknowledgement|terms\s+and\s+conditions|electronic\s+signature)$/i.test(s)) {
      return true;
    }
    if (/^(thank\s*you|thanks\s+for\s+applying|application\s+submitted|application\s+received|application\s+sent|application\s+complete|submission\s+complete|submission\s+confirmed|you\s+have\s+applied|you've\s+applied|already\s+applied|you\s+already\s+applied|congratulations|confirmation|status|job\s+no\s+longer\s+available|position\s+closed|job\s+closed)$/i.test(s)) {
      return true;
    }
    if (/thank\s*you\s+for\s+(?:applying|your\s+application|your\s+interest)|application\s+(?:has\s+been|was)\s+(?:submitted|received|sent)|you(?:'ve|\s+have)\s+already\s+applied/i.test(s)) {
      return true;
    }
    if (/^(sign\s*in|log\s*in|login|candidate\s+login|create\s+account|create\s+an\s+account|register|reset\s+password|forgot\s+password|verify\s+email|account\s+activation|security\s+check|human\s+verification)$/i.test(s)) {
      return true;
    }
    return false;
  }

  // Detect if a URL path segment is a wizard step / action word rather than a requisition ID
  function isWizardStepSlug(slug) {
    if (!slug) return true;
    return /^(apply|jobs|job|posting|postings|details|view|index|default|step|step[-_]?\d+|page|page[-_]?\d+|questions|questionnaire|screening|review|submit|confirm|confirmation|thank[-_]?you|thanks|success|complete|completed|eeo|voluntary|disclosure|disclosures|experience|education|personal|personal[-_]?info|contact|info|information|documents|resume|upload|login|signin|sign[-_]?in|register|auth|account|profile|form|wizard|start|new|edit|status|applied|search|careers|openings|portal|candidate)$/i.test(String(slug).trim());
  }

  // Intelligently identify the required technical stack track of the current job opening
  function detectJobTechStack(jobTitle = '', jdText = '', applyFlow = {}) {
    // 1. Explicit track passed from Apply-Flow parameters/context
    const explicitTrack = (
      applyFlow?.targetStack ||
      applyFlow?.techStack ||
      applyFlow?.stack ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('applyflow_target_stack') : '') ||
      ''
    ).toLowerCase().trim();

    if (explicitTrack) {
      if (explicitTrack.includes('c#') || explicitTrack.includes('.net') || explicitTrack.includes('dotnet') || explicitTrack.includes('csharp')) {
        return { key: 'dotnet', title: 'Full Stack C# / .NET / Cloud', confidence: 'explicit', source: 'Apply-Flow' };
      }
      if (explicitTrack.includes('python')) {
        return { key: 'python', title: 'Full Stack Python / AI / Cloud', confidence: 'explicit', source: 'Apply-Flow' };
      }
      if (explicitTrack.includes('java') && !explicitTrack.includes('javascript')) {
        return { key: 'java', title: 'Full Stack Java / Spring / Cloud', confidence: 'explicit', source: 'Apply-Flow' };
      }
      if (explicitTrack.includes('php') || explicitTrack.includes('laravel')) {
        return { key: 'php', title: 'Full Stack PHP / Laravel / Cloud', confidence: 'explicit', source: 'Apply-Flow' };
      }
    }

    const tLower = (jobTitle || '').toLowerCase();
    const jLower = (jdText || '').toLowerCase();
    const combined = `${tLower}\n${jLower}`;

    if (!tLower && !jLower) {
      return { key: 'unknown', title: 'General Engineering', confidence: 'none' };
    }

    // 2. High-Confidence Job Title Clues
    if (/\b(c#|csharp|\.net|dotnet|asp\.net)\b/i.test(tLower)) {
      return { key: 'dotnet', title: 'Full Stack C# / .NET / Cloud', confidence: 'high', source: 'Job Title', matchedTokens: ['c#/.net'] };
    }
    if (/\b(python|django|fastapi|flask)\b/i.test(tLower)) {
      return { key: 'python', title: 'Full Stack Python / AI / Cloud', confidence: 'high', source: 'Job Title', matchedTokens: ['python'] };
    }
    if (/\b(java|spring\s*boot)\b/i.test(tLower) && !/\b(javascript)\b/i.test(tLower)) {
      return { key: 'java', title: 'Full Stack Java / Spring / Cloud', confidence: 'high', source: 'Job Title', matchedTokens: ['java'] };
    }
    if (/\b(php|laravel|symfony)\b/i.test(tLower)) {
      return { key: 'php', title: 'Full Stack PHP / Laravel / Cloud', confidence: 'high', source: 'Job Title', matchedTokens: ['php'] };
    }
    // High-confidence Domain Specific Titles:
    // Informatics, Cheminformatics, Bioinformatics, Machine Learning, Data Science, AI Engineer are 99% Python in biotech & tech
    if (/\b(informatics|bioinformatics|cheminformatics|machine learning|deep learning|data scientist|data science|ai engineer|ml engineer|mlops|computational biology|computational chemistry)\b/i.test(tLower)) {
      return { key: 'python', title: 'Full Stack Python / AI / Cloud', confidence: 'high', source: 'Domain (Informatics/AI)', matchedTokens: ['informatics/ai'] };
    }

    // 3. Keyword Scoring across JD Text
    const patterns = {
      dotnet: [
        /\bc#\b/gi, /\b\.net\b/gi, /\bdotnet\b/gi, /\basp\.net\b/gi, /\bentity\s*framework\b/gi,
        /\bef\s*core\b/gi, /\blinq\b/gi, /\bblazor\b/gi, /\bwpf\b/gi, /\bwcf\b/gi, /\bcsharp\b/gi
      ],
      python: [
        /\bpython\b/gi, /\bpython\s*3\b/gi, /\bdjango\b/gi, /\bfastapi\b/gi, /\bflask\b/gi,
        /\bpytorch\b/gi, /\btensorflow\b/gi, /\bpandas\b/gi, /\bnumpy\b/gi, /\bcelery\b/gi,
        /\bpydantic\b/gi, /\bcheminformatics\b/gi, /\bbioinformatics\b/gi, /\brdkit\b/gi,
        /\bjupyter\b/gi, /\bscikit-learn\b/gi, /\bcomputational chemistry\b/gi
      ],
      java: [
        /\bjava\b/gi, /\bspring\s*boot\b/gi, /\bhibernate\b/gi, /\bspring\s*framework\b/gi,
        /\bmaven\b/gi, /\bgradle\b/gi, /\bjvm\b/gi
      ],
      php: [
        /\bphp\b/gi, /\blaravel\b/gi, /\bsymfony\b/gi, /\bcomposer\b/gi, /\bwordpress\b/gi
      ]
    };

    const scores = { dotnet: 0, python: 0, java: 0, php: 0 };
    const matchedTokens = { dotnet: [], python: [], java: [], php: [] };

    for (const [stackKey, regexList] of Object.entries(patterns)) {
      for (const r of regexList) {
        const matches = combined.match(r);
        if (matches && matches.length > 0) {
          scores[stackKey] += matches.length;
          matchedTokens[stackKey].push(matches[0]);
        }
      }
    }

    // Find the highest scoring stack
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topKey, topScore] = sorted[0];

    if (topScore >= 2) {
      const titles = {
        dotnet: 'Full Stack C# / .NET / Cloud',
        python: 'Full Stack Python / AI / Cloud',
        java: 'Full Stack Java / Spring / Cloud',
        php: 'Full Stack PHP / Laravel / Cloud'
      };
      return {
        key: topKey,
        title: titles[topKey] || topKey,
        confidence: topScore >= 4 ? 'high' : 'medium',
        score: topScore,
        matchedTokens: Array.from(new Set(matchedTokens[topKey].map(t => t.toLowerCase())))
      };
    }

    return { key: 'unknown', title: 'General Engineering', confidence: 'low' };
  }

  // Detect Job Information (Job Title, Company, Requisition ID, URL) and preserve context across multi-page/state changes
  function detectJobContext() {
    let jobTitle = '';
    let company = '';
    let reqId = '';
    const ats = detectAtsPlatform();
    const applyFlow = extractApplyFlowParams();

    const invalidCompanyNames = new Set([
      'recruiting', 'employer', 'company', 'jobs', 'careers', 'boards', 'apply', 'workday', 'greenhouse', 'lever',
      'paylocity', 'smartrecruiters', 'icims', 'jobvite', 'taleo', 'ashbyhq', 'ashby', 'workable', 'bamboohr', 'adp',
      'jazzhr', 'rippling', 'ultipro', 'ukg', 'myworkdayjobs', 'dover', 'localhost',
      'chatgpt', 'openai', 'google', 'youtube', 'github', 'reddit', 'twitter', 'facebook', 'instagram'
    ]);

    // 0a. Dover ATS Specific Context Parsing
    try {
      if (typeof window !== 'undefined' && window.location.hostname.includes('dover.com')) {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 2 && pathParts[0] === 'apply') {
          const compSlug = pathParts[1];
          if (compSlug && !invalidCompanyNames.has(compSlug.toLowerCase()) && !/^[0-9a-f-]{36}$/i.test(compSlug)) {
            company = compSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
        }
        const doverTitleEl = document.querySelector('h1, [class*="JobHeader_title"], [class*="job-title"]');
        if (doverTitleEl) {
          const tText = clean(doverTitleEl.innerText);
          if (tText && !isGenericOrWizardStepTitle(tText)) jobTitle = tText;
        }
      }
    } catch (_) {}

    // 0. Check Apply-Flow Backend Context if available
    const afCtx = (typeof window !== 'undefined' && window.__SQC_APPLYFLOW_CONTEXT) ? window.__SQC_APPLYFLOW_CONTEXT : null;
    const persistedAf = (typeof window !== 'undefined' && window.__SQC_PERSISTED_AF_SESSION) ? window.__SQC_PERSISTED_AF_SESSION : null;

    // 1. JSON-LD structured data (often contains accurate official title, company, reqId on landing page)
    try {
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        const parsed = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item && (item['@type'] === 'JobPosting' || item.title || item.hiringOrganization)) {
            if (!jobTitle && item.title && !isGenericOrWizardStepTitle(String(item.title).trim())) {
              jobTitle = clean(item.title);
            }
            if (!company && item.hiringOrganization && item.hiringOrganization.name) {
              const cName = clean(item.hiringOrganization.name);
              if (!invalidCompanyNames.has(cName.toLowerCase())) {
                company = cName;
              }
            }
            if (!reqId && item.identifier) {
              const idVal = item.identifier.value || (typeof item.identifier === 'string' ? item.identifier : '');
              if (idVal && !isGenericOrWizardStepTitle(idVal) && !isWizardStepSlug(idVal)) reqId = clean(idVal);
            }
          }
        }
      }
    } catch (_) {}

    // 2. DOM Title Candidates
    if (!jobTitle) {
      const titleCandidates = [
        document.querySelector('[data-automation-id="jobPostingHeader"]'),
        document.querySelector('[data-automation-id="headerTitle"]'),
        document.querySelector('.app-title'),
        document.querySelector('.job-title'),
        document.querySelector('.posting-title'),
        document.querySelector('.posting-headline h2'),
        document.querySelector('h1.heading'),
        document.querySelector('h1.job-title'),
        document.querySelector('h1'),
        document.querySelector('h2')
      ];

      for (const el of titleCandidates) {
        if (el) {
          const txt = getCleanNodeText(el);
          if (txt && !isGenericOrWizardStepTitle(txt)) {
            if (/^careers at /i.test(txt) || /^jobs at /i.test(txt)) {
              if (!company) {
                const cCandidate = txt.replace(/^careers at |^jobs at /i, '').trim();
                if (!invalidCompanyNames.has(cCandidate.toLowerCase())) company = cCandidate;
              }
              continue;
            }
            jobTitle = txt;
            break;
          }
        }
      }
    }

    // 3. Fallback / Parse from document.title
    if (document.title) {
      let pageTitle = clean(document.title)
        .replace(/\s*[-–—|•]\s*(?:Paylocity|Workday|Greenhouse|Lever|SmartRecruiters|iCIMS|Jobvite|JazzHR|Workable|ADP|BambooHR|Ashby|Rippling).*$/i, '')
        .trim();

      const parts = pageTitle.split(/[-–—|•]/);
      if (parts.length > 1) {
        const p0 = clean(parts[0]);
        const p1 = clean(parts[1]);
        if (!jobTitle) {
          if (!isGenericOrWizardStepTitle(p0)) jobTitle = p0;
          else if (!isGenericOrWizardStepTitle(p1)) jobTitle = p1;
        }
        if (!company) {
          if (!invalidCompanyNames.has(p1.toLowerCase()) && !isGenericOrWizardStepTitle(p1)) company = p1;
          else if (!invalidCompanyNames.has(p0.toLowerCase()) && !isGenericOrWizardStepTitle(p0) && p0 !== jobTitle) company = p0;
        }
      } else if (!jobTitle && !isGenericOrWizardStepTitle(pageTitle)) {
        jobTitle = pageTitle;
      }
    }

    // 4. Company Candidates in DOM
    if (!company) {
      const compCandidates = [
        document.querySelector('[data-automation-id="companyName"]'),
        document.querySelector('.company-name'),
        document.querySelector('.posting-headline .company'),
        document.querySelector('.job-details-company'),
        document.querySelector('meta[property="og:site_name"]'),
        document.querySelector('meta[name="company"]')
      ];

      for (const el of compCandidates) {
        if (el) {
          const val = clean(el.innerText || el.getAttribute('content') || el.getAttribute('alt'));
          if (val && !isCodeOrJunk(val) && !invalidCompanyNames.has(val.toLowerCase()) && !isGenericOrWizardStepTitle(val)) {
            company = val;
            break;
          }
        }
      }
    }

    // 5. Hostname Fallback (ignoring generic ATS hosts)
    if (!company) {
      const host = window.location.hostname.replace(/^(www|boards|jobs|careers|recruiting)\./, '').split('.')[0];
      if (host && !invalidCompanyNames.has(host.toLowerCase())) {
        company = host.charAt(0).toUpperCase() + host.slice(1);
      }
    }

    // 6. Requisition ID Candidates
    if (!reqId) {
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
            const parsed = txt.replace(/req(uisition)?\s*(id|#)?\s*:?/i, '').trim();
            if (parsed && !isGenericOrWizardStepTitle(parsed) && !isWizardStepSlug(parsed)) {
              reqId = parsed;
              break;
            }
          }
        }
      }
    }

    if (!reqId) {
      const params = new URLSearchParams(window.location.search);
      const paramReq = params.get('gh_jid') || params.get('job_id') || params.get('req_id') || params.get('requisitionId') || params.get('jobId') || '';
      if (paramReq && !isWizardStepSlug(paramReq)) {
        reqId = paramReq;
      }
      if (!reqId) {
        // Paylocity /Recruiting/Jobs/Apply/4542466
        const paylocityMatch = window.location.pathname.match(/\/Apply\/(\d+)/i);
        if (paylocityMatch) {
          reqId = paylocityMatch[1];
        } else {
          const match = window.location.pathname.match(/(?:jobs|requisitions|posting|req|details)[/-]+(?:apply[/-]+)?([a-zA-Z0-9_-]{3,30})/i);
          if (match && !isWizardStepSlug(match[1])) {
            reqId = match[1];
          }
        }
      }
    }

    // 7. Multi-Page & Pre-Transition Context Preservation Logic
    let originalJobUrl = window.location.href;
    try {
      const savedLockedKey = sessionStorage.getItem('applyflow_locked_job_key') || '';
      const savedTitle = sessionStorage.getItem('applyflow_job_title') || persistedAf?.jobTitle || afCtx?.jobTitle || afCtx?.title || '';
      const savedCompany = sessionStorage.getItem('applyflow_company') || persistedAf?.company || afCtx?.company || afCtx?.companyName || '';
      const savedReqId = sessionStorage.getItem('applyflow_req_id') || persistedAf?.reqId || '';
      const savedOrigUrl = sessionStorage.getItem('applyflow_original_job_url') || persistedAf?.sourceUrl || '';

      // Determine if the user switched to a genuinely different job posting
      const currentExplicitJobId = applyFlow.jobId || '';
      const currentExplicitReqId = reqId || '';
      const activeIdentifier = currentExplicitJobId || currentExplicitReqId || savedReqId || 'default';

      const isDifferentJob = Boolean(
        savedLockedKey &&
        ((currentExplicitJobId && !savedLockedKey.includes(currentExplicitJobId)) ||
         (!currentExplicitJobId && currentExplicitReqId && savedReqId && currentExplicitReqId !== savedReqId))
      );

      if (isDifferentJob) {
        // New job opened in same tab: reset cached job-specific metadata for the new job
        sessionStorage.setItem('applyflow_locked_job_key', `${currentExplicitJobId}_${currentExplicitReqId}`);
        if (jobTitle && jobTitle !== 'Application Role') sessionStorage.setItem('applyflow_job_title', jobTitle);
        if (company && company !== 'Employer') sessionStorage.setItem('applyflow_company', company);
        if (reqId) sessionStorage.setItem('applyflow_req_id', reqId);
        sessionStorage.setItem('applyflow_original_job_url', window.location.href);
        sessionStorage.removeItem('applyflow_jd_salary');
        sessionStorage.removeItem('applyflow_jd_text');
      } else {
        if (!savedLockedKey && (currentExplicitJobId || currentExplicitReqId)) {
          sessionStorage.setItem('applyflow_locked_job_key', `${currentExplicitJobId}_${currentExplicitReqId}`);
        }

        // Detect if current page is a sub-step / application form / confirmation view where the original job posting context was removed or altered
        const isWizardOrSubStepUrl = /\/(apply|step|questions|questionnaire|review|submit|confirm|confirmation|thank|success|eeo|voluntary|disclosures|login|signin|auth)\b/i.test(window.location.pathname + window.location.hash);

        // Preserve original Job Title from before state/page change if already captured
        if (savedTitle && savedTitle !== 'Application Role' && (isWizardOrSubStepUrl || !jobTitle || jobTitle === 'Application Role' || isGenericOrWizardStepTitle(jobTitle))) {
          jobTitle = savedTitle;
        } else if (jobTitle && jobTitle !== 'Application Role' && !isGenericOrWizardStepTitle(jobTitle)) {
          sessionStorage.setItem('applyflow_job_title', jobTitle);
        } else if (savedTitle) {
          jobTitle = savedTitle;
        }

        // Preserve original Company from before state/page change
        if (savedCompany && savedCompany !== 'Employer' && (isWizardOrSubStepUrl || !company || company === 'Employer')) {
          company = savedCompany;
        } else if (company && company !== 'Employer') {
          sessionStorage.setItem('applyflow_company', company);
        } else if (savedCompany) {
          company = savedCompany;
        }

        // Preserve Requisition ID across wizard steps so sessionKey never fragments
        if (savedReqId && (!reqId || isWizardOrSubStepUrl)) {
          reqId = savedReqId;
        } else if (reqId) {
          sessionStorage.setItem('applyflow_req_id', reqId);
        }

        // Preserve original Job URL from before the wizard/confirmation transition
        if (savedOrigUrl) {
          originalJobUrl = savedOrigUrl;
        } else {
          sessionStorage.setItem('applyflow_original_job_url', window.location.href);
        }
      }
    } catch (_) {}

    const jdSalary = detectJdSalaryRange();
    // Eagerly extract/cache JD full text while on the job description page before DOM state changes
    const jdText = extractJdFullText();
    const detectedJobStack = detectJobTechStack(jobTitle, jdText, applyFlow);

    return {
      job_title: jobTitle || 'Application Role',
      company: company || 'Employer',
      req_id: reqId || '',
      portal_job_id: applyFlow.jobId || '',
      target_candidate_id: applyFlow.profileId || '',
      target_profile_name: applyFlow.profileName || '',
      profile_name: applyFlow.profileName || '',
      target_stack: applyFlow.targetStack || '',
      applier_id: applyFlow.applierId || '',
      applier_name: applyFlow.applierName || '',
      ats_domain: ats,
      job_url: originalJobUrl || window.location.href,
      current_page_url: window.location.href,
      jd_salary: jdSalary,
      jd_text: jdText,
      detected_job_stack: detectedJobStack
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

  // Unified Candidate-Scoped Session Key Generator for Multi-Page Wizard Persistence
  function getAppSessionKey(candidateId, reqId, applyJobId) {
    let effectiveJobId = applyJobId || '';
    if (!effectiveJobId) {
      try {
        effectiveJobId = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('applyflow_job_id') : '') ||
                         (typeof window !== 'undefined' ? window.__SQC_PERSISTED_AF_SESSION?.jobId : '') || '';
      } catch (_) {}
    }
    let effectiveReqId = reqId || '';
    if (!effectiveReqId && typeof sessionStorage !== 'undefined') {
      try {
        effectiveReqId = sessionStorage.getItem('applyflow_req_id') || '';
      } catch (_) {}
    }
    const discriminator = effectiveJobId || effectiveReqId || 'active';
    return candidateId
      ? `sqc_app_${candidateId}_${window.location.hostname}_${discriminator}`
      : `sqc_app_${window.location.hostname}_${discriminator}`;
  }

  // Master Form State Extraction
  function extractAllFields() {
    const job = detectJobContext();
    const alreadyAppliedInfo = detectAlreadyApplied();
    const submissionSuccessInfo = detectSubmissionSuccess();
    const submissionFailureInfo = detectSubmissionFailure();
    const applyFlow = extractApplyFlowParams();

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
      const widget = el.closest('.k-widget, .k-combobox, .k-dropdown, .k-autocomplete, [role="combobox"], [role="listbox"], .bootstrap-select, .select2-container, mat-select');
      if (widget) {
        processedElements.add(widget);
        widget.querySelectorAll('input, select, textarea, button, span').forEach(child => processedElements.add(child));
      }
    }

    // 1. SCAN ALL INPUTS (Text, Email, Tel, Number, Radio, Checkbox, File)
    const inputs = queryAllDeep('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])');
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
        const rootDoc = input.ownerDocument || document;
        const radiosInGroup = input.name 
          ? queryAllDeep(`input[type="radio"][name="${CSS.escape(input.name)}"]`, rootDoc)
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
      const widget = input.closest('.k-widget, .k-combobox, .k-dropdown, .k-autocomplete, [role="combobox"], [role="listbox"], .bootstrap-select, .select2-container, mat-select');
      markWidgetProcessed(input);

      const label = cleanFieldLabel(rawLabel);
      if (isJunkOrPhantomField(label, input)) return;

      const labelLower = label.toLowerCase();
      const nameLower = (input.name || '').toLowerCase();
      const idLower = (input.id || '').toLowerCase();
      const autoId = (input.getAttribute('data-automation-id') || '').toLowerCase();
      
      let targetElement = input;
      // Read value: prefer .value property, fall back to innerText for Kendo combobox display text
      let val = clean(input.value || input.getAttribute('value') || input.innerText || input.textContent || '');
      
      if (widget) {
        const visibleInput = widget.querySelector('input.k-input') || widget.querySelector('input:not([style*="display: none"]):not([type="hidden"])');
        if (visibleInput) {
          targetElement = visibleInput;
          // Also try innerText/textContent as Kendo may show text without updating .value
          const visVal = clean(visibleInput.value || visibleInput.getAttribute('value') || visibleInput.innerText || visibleInput.textContent || '');
          if (visVal && !isUnansweredPlaceholder(visVal)) {
            val = visVal;
          }
        }

        if (!val || isUnansweredPlaceholder(val)) {
          const allInputs = widget.querySelectorAll('input, select');
          for (const wi of allInputs) {
            const wVal = clean(wi.value || wi.getAttribute('value') || '');
            if (wVal && !isUnansweredPlaceholder(wVal)) {
              val = wVal;
              break;
            }
          }
        }

        if (!val || isUnansweredPlaceholder(val)) {
          const customVal = extractCustomSelectValue(widget);
          if (customVal && !isUnansweredPlaceholder(customVal)) {
            val = customVal;
          }
        }

        // Last resort: read displayed text from k-input span or any display element in the widget
        if (!val || isUnansweredPlaceholder(val)) {
          const displaySpan = widget.querySelector('.k-input-value-text, [class*="k-input-value"], .k-combobox-clearable');
          if (displaySpan) {
            const spanTxt = clean(displaySpan.innerText || displaySpan.textContent || '');
            if (spanTxt && !isUnansweredPlaceholder(spanTxt)) val = spanTxt;
          }
        }
      }

      if (isUnansweredPlaceholder(val)) val = '';

      // If still empty and the input itself has a non-empty aria-valuenow or data-value, use that
      if (!val) {
        const ariaVal = clean(input.getAttribute('aria-valuenow') || input.getAttribute('data-value') || input.getAttribute('data-val') || '');
        if (ariaVal && !isUnansweredPlaceholder(ariaVal)) val = ariaVal;
      }

      const labelNorm = labelLower.replace(/[*:\s_]+/g, ' ').trim();
      const isSignature = labelNorm.includes('first and last name') || labelNorm.includes('full name') || labelNorm === 'name' || labelNorm.includes('signature');
      const isFirst = !isSignature && (nameLower.includes('first') || idLower.includes('first') || labelNorm.includes('first name') || labelNorm === 'first' || autoId.includes('firstname') || input.autocomplete === 'given-name');
      const isLast = !isSignature && !isFirst && (nameLower.includes('last') || idLower.includes('last') || labelNorm.includes('last name') || labelNorm === 'last' || autoId.includes('lastname') || input.autocomplete === 'family-name');
      const isFull = isSignature || (!isFirst && !isLast && (nameLower === 'name' || idLower === 'name' || autoId.includes('fullname') || input.autocomplete === 'name'));
      const isEmail = (type === 'email' || nameLower.includes('email') || idLower.includes('email') || labelNorm.includes('email') || autoId.includes('email') || input.autocomplete === 'email');
      const isPhone = (type === 'tel' || nameLower.includes('phone') || idLower.includes('phone') || labelNorm.includes('phone') || labelNorm.includes('mobile') || autoId.includes('phone') || input.autocomplete === 'tel');
      const isSalary = (nameLower.includes('salary') || idLower.includes('salary') || labelNorm.includes('salary') || labelNorm.includes('compensation') || labelNorm.includes('rate') || labelNorm.includes('pay') || autoId.includes('salary'));

      const fallbackLabel = isFirst ? 'First Name' : (isLast ? 'Last Name' : (isFull ? 'Full Name' : (isEmail ? 'Email' : (isPhone ? 'Phone' : (isSalary ? 'Salary' : 'Input')))));
      const displayLabel = label || input.name || fallbackLabel;
      const isReq = isFieldRequired(targetElement, displayLabel);

      if (isFirst) {
        firstName = val;
        elementRefs.names.first = targetElement;
      } else if (isLast) {
        lastName = val;
        elementRefs.names.last = targetElement;
      } else if (isFull) {
        fullName = val;
        elementRefs.names.full = targetElement;
      } else if (isEmail) {
        email = val;
        elementRefs.email = targetElement;
      } else if (isPhone) {
        phone = val;
        elementRefs.phone = targetElement;
      } else if (isSalary) {
        salary = val;
        salaryNumeric = val ? parseFloat(val.replace(/[^0-9.]/g, '')) : null;
        elementRefs.salary = targetElement;
      } else {
        const qLabel = displayLabel || 'Screening Question';
        elementRefs.questions.push({ label: qLabel, type: 'text', value: val, required: isReq, is_required: isReq, element: targetElement });
      }

      allFormEntries.push({ label: displayLabel, type, value: val, required: isReq, is_required: isReq, element: targetElement });
    });

    // 2. SCAN ALL TEXTAREAS
    const textareas = queryAllDeep('textarea');
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
    const selects = queryAllDeep(
      'select, [role="combobox"]:not(input):not(textarea), .k-dropdown, [data-role="dropdownlist"], mat-select'
    );
    selects.forEach(sel => {
      if (sel.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      if (processedElements.has(sel)) return;

      // If this select/widget contains any input/child already processed in Section 1, skip duplicate extraction!
      const allChildren = sel.querySelectorAll('input, select, textarea');
      const hasProcessedChild = Array.from(allChildren).some(c => processedElements.has(c));
      if (hasProcessedChild) {
        markWidgetProcessed(sel);
        return;
      }

      markWidgetProcessed(sel);

      const rawLabel = getElementLabel(sel) || 'Dropdown';
      const label = cleanFieldLabel(rawLabel);
      if (isJunkOrPhantomField(label, sel)) return;

      let targetElement = sel;
      const visibleInput = sel.querySelector('input.k-input') || sel.querySelector('input:not([style*="display: none"]):not([type="hidden"])');
      if (visibleInput) targetElement = visibleInput;

      const isReq = isFieldRequired(targetElement, label);
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

      if (isUnansweredPlaceholder(val)) val = '';

      elementRefs.questions.push({ label, type: 'select', value: val, required: isReq, is_required: isReq, element: targetElement, options });
      allFormEntries.push({ label, type: 'select', value: val, required: isReq, is_required: isReq, element: targetElement, options });
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

    // Active candidate profile reference
    const currentActiveProfile = (typeof SubmissionHUD !== 'undefined' && SubmissionHUD.getActiveProfile ? SubmissionHUD.getActiveProfile() : null) || window.__SQC_ACTIVE_PROFILE || null;
    const candidateId = currentActiveProfile?.id || applyFlow.profileId || '';

    // Load & merge cumulative state using Unified Candidate-Scoped Session Keys
    const sessionKey = getAppSessionKey(candidateId, job.req_id, applyFlow.jobId);
    let savedState = {};
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only use saved state if it belongs to the active candidate
        if (!candidateId || !parsed.candidate_id || parsed.candidate_id === candidateId) {
          savedState = parsed;
        }
      }
      // Cross-origin / multi-page fallback from background persisted session if sessionStorage started fresh
      if ((!savedState || Object.keys(savedState).length === 0) && window.__SQC_PERSISTED_AF_SESSION?.savedFormState) {
        const persistedForm = window.__SQC_PERSISTED_AF_SESSION.savedFormState;
        const sameCand = !candidateId || !persistedForm.candidate_id || persistedForm.candidate_id === candidateId;
        const sameJob = (!applyFlow.jobId && !job.req_id) ||
          (applyFlow.jobId && persistedForm.portal_job_id === applyFlow.jobId) ||
          (job.req_id && persistedForm.req_id === job.req_id);
        if (sameCand && sameJob) {
          savedState = persistedForm;
        }
      }
    } catch (_) {}

    // Multi-Page & Pre-Removal State Preservation Rule:
    // - If an input on the current page has a non-empty value, its current DOM value is ground truth.
    // - If an input on the current page is empty ONLY because a new wizard step just rendered, or the form was reset/removed
    //   during transition, preserve the non-empty value captured on the previous step unless the user explicitly cleared it.
    const isSameCandidate = !savedState.candidate_id || savedState.candidate_id === candidateId;
    const wasClearedByUser = (el) => Boolean(el && el.dataset && el.dataset.sqcUserCleared === 'true');

    const resolveFieldVal = (el, liveVal, savedVal) => {
      if (liveVal) return liveVal;
      if (el && wasClearedByUser(el)) return '';
      return (isSameCandidate && savedVal) ? savedVal : '';
    };

    const mergedFirstName = resolveFieldVal(elementRefs.names.first, firstName, savedState.candidate_first_name);
    const mergedLastName = resolveFieldVal(elementRefs.names.last, lastName, savedState.candidate_last_name);
    const mergedFullName = resolveFieldVal(elementRefs.names.full, fullName, savedState.candidate_name) || `${mergedFirstName} ${mergedLastName}`.trim();
    const mergedEmail = resolveFieldVal(elementRefs.email, email, savedState.email_entered);
    const mergedPhone = resolveFieldVal(elementRefs.phone, phone, savedState.phone_entered);
    const mergedSalary = resolveFieldVal(elementRefs.salary, salary, savedState.salary_expected);
    const mergedSalaryNum = (salaryNumeric !== null)
      ? salaryNumeric
      : ((elementRefs.salary && wasClearedByUser(elementRefs.salary)) ? null : (isSameCandidate && savedState.salary_numeric !== undefined ? savedState.salary_numeric : null));

    const tailoredResumeActive = typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('sqc_tailored_resume'));
    const tailoredFilename = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sqc_tailored_resume_filename') : null;
    // Never wipe out a previously uploaded resume from Step 1 just because Step 2/3 has an empty file input (e.g. Cover Letter)
    let mergedResume = resumeFilename || (isSameCandidate ? savedState.resume_uploaded : '') || '';
    if (!mergedResume && tailoredResumeActive) {
      mergedResume = tailoredFilename || 'Tailored Resume Loaded (Verified)';
    }
    const mergedResumeSize = resumeSize || (isSameCandidate ? savedState.resume_size : null);

    // Canonical key-based map for deduplication across multi-page steps
    const entryMap = new Map();
    const existingEntries = isSameCandidate ? (savedState.all_entries || []) : [];

    existingEntries.forEach(e => {
      if (e && e.label) {
        const cleanedLbl = cleanFieldLabel(e.label);
        if (!isJunkOrPhantomField(cleanedLbl)) {
          const canonKey = getCanonicalLabelKey(cleanedLbl);
          const validEl = (typeof Element !== 'undefined' && e.element instanceof Element) ? e.element : null;
          entryMap.set(canonKey, { ...e, label: cleanedLbl, element: validEl });
        }
      }
    });

    allFormEntries.forEach(e => {
      if (e && e.label) {
        const cleanedLbl = cleanFieldLabel(e.label);
        if (!isJunkOrPhantomField(cleanedLbl, e.element)) {
          const canonKey = getCanonicalLabelKey(cleanedLbl);
          const existing = entryMap.get(canonKey);
          const prevVal = (existing && !isUnansweredPlaceholder(existing.value)) ? existing.value : '';
          let val = e.value;
          if ((!val || isUnansweredPlaceholder(val) || val === 'No file chosen') && prevVal && !wasClearedByUser(e.element)) {
            val = prevVal;
          }
          const req = e.required !== undefined ? e.required : (existing ? existing.required : false);
          const validEl = (typeof Element !== 'undefined' && e.element instanceof Element)
            ? e.element
            : ((typeof Element !== 'undefined' && existing?.element instanceof Element) ? existing.element : null);
          entryMap.set(canonKey, {
            label: cleanedLbl,
            type: e.type,
            value: val,
            required: req,
            is_required: req,
            unanswered: isUnansweredPlaceholder(val),
            options: (Array.isArray(e.options) && e.options.length > 0) ? e.options : existing?.options,
            element: validEl
          });
        }
      }
    });

    const mergedAllEntries = Array.from(entryMap.values());
    const serializableEntries = mergedAllEntries.map(({ element, ...rest }) => rest);
    const totalFields = mergedAllEntries.length;
    const requiredFields = mergedAllEntries.filter(e => e.required || e.is_required).length;
    const unansweredRequired = mergedAllEntries.filter(e => (e.required || e.is_required) && isUnansweredPlaceholder(e.value)).length;

    // Filter screening answers to include ONLY genuine answered custom screening questions,
    // excluding standard profile identity fields (already stored in top-level candidate data),
    // boilerplate consent checkboxes, and unselected/unanswered optional fields.
    const standardIdentityFieldRegex = /^(first\s*name|last\s*name|middle\s*name|preferred\s*(?:first\s*)?name|full\s*name|legal\s*name|name|email|email\s*address|confirm\s*email|phone|phone\s*number|mobile|mobile\s*number|mobile\s*phone|home\s*phone|home\s*phone\s*number|telephone|resume\s*\/\s*attachment|upload\s*resume|paste\s*resume\s*text|resume|desired\s*salary|salary\s*expectations?|salary)$/i;
    const consentBoilerplateRegex = /^(fill\s*out\s*application\s*with\s*my\s*resume|i\s*have\s*read\s*and\s*accept|i\s*agree\s*to|i\s*certify\s*that|consent\s*to|acknowledgement|terms\s*and\s*conditions)/i;

    const screeningAnswersDict = { ...(isSameCandidate && savedState.screening_answers ? savedState.screening_answers : {}) };
    mergedAllEntries.forEach(e => {
      if (!e || !e.label) return;
      const lbl = cleanFieldLabel(e.label);
      if (!lbl || isCodeOrJunk(lbl) || isJunkOrPhantomField(lbl)) return;

      // 1. Skip standard identity fields if it's just standard personal info
      if (lbl.length < 35 && standardIdentityFieldRegex.test(lbl.trim())) return;

      // 2. Skip boilerplate application consent/acknowledgment checkboxes
      if (consentBoilerplateRegex.test(lbl.trim())) return;

      const val = e.value || '';
      const isReq = Boolean(e.required || e.is_required);
      const isUnanswered = isUnansweredPlaceholder(val);

      // 3. Skip unchecked optional checkboxes (e.g. unselected referral sources or optional tech tags)
      if (e.type === 'checkbox' && (!val || val === 'Unchecked (No)') && !isReq) return;

      // 4. Skip empty/unanswered optional fields (e.g. optional demographics: pronouns, sexual orientation, ethnicity)
      if (isUnanswered && !isReq) return;

      // Format clean answer value
      const formattedVal = val || (e.type === 'checkbox' ? (isReq ? 'Unchecked (No)' : '') : (isReq ? 'Unanswered' : ''));
      if (formattedVal) {
        screeningAnswersDict[lbl] = formattedVal;
      }
    });

    const effectiveJdSalary = (job.jd_salary && job.jd_salary.has_jd_salary)
      ? job.jd_salary
      : ((savedState.jd_salary && savedState.jd_salary.has_jd_salary) ? savedState.jd_salary : (job.jd_salary || null));
    const effectiveJdText = job.jd_text || savedState.jd_text || '';
    const effectiveJobTitle = (job.job_title && job.job_title !== 'Application Role')
      ? job.job_title
      : (savedState.job_title || job.job_title || 'Application Role');
    const effectiveCompany = (job.company && job.company !== 'Employer')
      ? job.company
      : (savedState.company || job.company || 'Employer');

    const cumulativeSnapshot = {
      job_title: effectiveJobTitle,
      company: effectiveCompany,
      req_id: job.req_id || savedState.req_id,
      portal_job_id: job.portal_job_id || savedState.portal_job_id || '',
      target_candidate_id: job.target_candidate_id || savedState.target_candidate_id || '',
      target_profile_name: job.target_profile_name || savedState.target_profile_name || '',
      profile_name: job.profile_name || savedState.profile_name || '',
      applier_id: job.applier_id || savedState.applier_id || '',
      applier_name: job.applier_name || savedState.applier_name || '',
      apply_flow_params: applyFlow,
      ats_domain: job.ats_domain || savedState.ats_domain,
      job_url: job.job_url || savedState.job_url || window.location.href,
      current_page_url: window.location.href,
      jd_salary: effectiveJdSalary,
      jd_text: effectiveJdText,
      detected_job_stack: job.detected_job_stack,

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

      is_submission_success: submissionSuccessInfo.is_success,
      submission_success_message: submissionSuccessInfo.message,

      is_submission_failed: submissionFailureInfo.is_failed,
      submission_failure_message: submissionFailureInfo.message,

      logged_in_account: extractLoggedInAccount(),
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

    // Save pruned clean snapshot to sessionStorage (without DOM element references)
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        candidate_id: candidateId,
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
        is_submission_success: submissionSuccessInfo.is_success,
        submission_success_message: submissionSuccessInfo.message,
        is_submission_failed: submissionFailureInfo.is_failed,
        submission_failure_message: submissionFailureInfo.message,
        all_entries: serializableEntries,
        screening_answers: cumulativeSnapshot.screening_answers,
        job_title: cumulativeSnapshot.job_title,
        company: cumulativeSnapshot.company,
        req_id: cumulativeSnapshot.req_id,
        portal_job_id: cumulativeSnapshot.portal_job_id,
        target_candidate_id: cumulativeSnapshot.target_candidate_id,
        target_profile_name: cumulativeSnapshot.target_profile_name,
        profile_name: cumulativeSnapshot.profile_name,
        applier_id: cumulativeSnapshot.applier_id,
        applier_name: cumulativeSnapshot.applier_name,
        apply_flow_params: cumulativeSnapshot.apply_flow_params,
        ats_domain: cumulativeSnapshot.ats_domain,
        job_url: cumulativeSnapshot.job_url,
        jd_salary: cumulativeSnapshot.jd_salary,
        jd_text: cumulativeSnapshot.jd_text
      }));
    } catch (_) {}

    return cumulativeSnapshot;
  }

  // =========================================================================
  // AUTOMATED FORM RESTORATION & AUTOFILL ENGINE
  // =========================================================================

  // Safe programmatic click that never hijacks window scroll position
  function safeTriggerClick(el) {
    if (!el) return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    try {
      el.click();
    } catch (_) {}
    if (window.scrollY !== sy || window.scrollX !== sx) {
      window.scrollTo(sx, sy);
    }
  }

  function normalizeTextForMatch(str) {
    if (!str) return '';
    return clean(str)
      .toLowerCase()
      .replace(/[\u2018\u2019']/g, '') // remove single quotes / curly apostrophes
      .replace(/[\u201C\u201D"]/g, '') // remove double quotes
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function setNativeInputValue(input, val) {
    if (!input || val === undefined || val === null) return false;
    const sVal = String(val);
    if (input.value === sVal && sVal !== '') return false;

    const sx = window.scrollX;
    const sy = window.scrollY;

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

    // Trigger full event pipeline for React, Angular, Kendo UI, jQuery (without focus-scroll jumping)
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.dispatchEvent(new Event('focusout', { bubbles: true }));

    // If part of Kendo UI or custom widget, synchronize companion inputs
    const kendoWidget = input.closest('.k-widget, .k-combobox, .k-dropdown, .k-autocomplete');
    if (kendoWidget) {
      const companionInputs = kendoWidget.querySelectorAll('input');
      companionInputs.forEach(ci => {
        if (ci !== input && ci.value !== sVal) {
          try {
            const proto = Object.getPrototypeOf(ci);
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(ci, 'value');
            if (descriptor && descriptor.set) descriptor.set.call(ci, sVal);
            else ci.value = sVal;
          } catch (_) {
            ci.value = sVal;
          }
          ci.dispatchEvent(new Event('input', { bubbles: true }));
          ci.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    if (window.scrollY !== sy || window.scrollX !== sx) {
      window.scrollTo(sx, sy);
    }
    return true;
  }

  function setNativeTextareaValue(ta, val) {
    if (!ta || val === undefined || val === null) return false;
    const sVal = String(val);
    if (ta.value === sVal && sVal !== '') return false;

    const sx = window.scrollX;
    const sy = window.scrollY;

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

    // Dispatch input & change events (avoid focus triggering viewport scrolling)
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.dispatchEvent(new Event('blur', { bubbles: true }));
    ta.dispatchEvent(new Event('focusout', { bubbles: true }));

    if (window.scrollY !== sy || window.scrollX !== sx) {
      window.scrollTo(sx, sy);
    }
    return true;
  }

  function setNativeSelectValue(sel, targetVal) {
    if (!sel || !targetVal || isUnansweredPlaceholder(targetVal)) return false;
    const targetNorm = normalizeTextForMatch(targetVal);
    let matchedIndex = -1;
    let actualSelect = (sel.tagName === 'SELECT') ? sel : sel.querySelector('select');

    if (!actualSelect) {
      // Check parent container for hidden or adjacent select
      actualSelect = sel.closest('.form-group, .field, .form-row, [class*="question"], div')?.querySelector('select');
    }

    if (actualSelect && actualSelect.options && actualSelect.options.length) {
      const options = actualSelect.options;

      // 1. Exact or normalized match
      for (let i = 0; i < options.length; i++) {
        const optTxt = normalizeTextForMatch(options[i].text);
        const optVal = normalizeTextForMatch(options[i].value);
        if (optTxt === targetNorm || optVal === targetNorm) {
          matchedIndex = i;
          break;
        }
      }

      // 2. Substring match
      if (matchedIndex === -1 && targetNorm.length > 2) {
        for (let i = 0; i < options.length; i++) {
          const optTxt = normalizeTextForMatch(options[i].text);
          const optVal = normalizeTextForMatch(options[i].value);
          if (optTxt.includes(targetNorm) || targetNorm.includes(optTxt) || (optVal && targetNorm.includes(optVal))) {
            matchedIndex = i;
            break;
          }
        }
      }

      // 3. Domain-specific synonym matching
      if (matchedIndex === -1) {
        // Education / Degree (Bachelor's)
        if (targetNorm.includes('bachelor') || targetNorm.includes('undergraduate') || targetNorm.includes('college')) {
          for (let i = 0; i < options.length; i++) {
            const optTxt = normalizeTextForMatch(options[i].text);
            if (/(bachelor|undergraduate|4 year|four year|college degree|ba\b|bs\b|b a\b|b s\b)/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
          if (matchedIndex === -1) {
            for (let i = 0; i < options.length; i++) {
              const optTxt = normalizeTextForMatch(options[i].text);
              if (/(college|university|degree)/i.test(optTxt) && !optTxt.includes('master') && !optTxt.includes('doctor')) {
                matchedIndex = i;
                break;
              }
            }
          }
        }
        // Master's Degree
        else if (targetNorm.includes('master') || targetNorm.includes('graduate')) {
          for (let i = 0; i < options.length; i++) {
            const optTxt = normalizeTextForMatch(options[i].text);
            if (/(master|m s|m a|graduate degree|postgraduate)/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
        }
        // Referral / How heard (LinkedIn)
        else if (targetNorm.includes('linkedin') || targetNorm.includes('job board') || targetNorm.includes('source')) {
          for (let i = 0; i < options.length; i++) {
            const optTxt = normalizeTextForMatch(options[i].text);
            if (/linkedin/i.test(optTxt)) {
              matchedIndex = i;
              break;
            }
          }
          if (matchedIndex === -1) {
            for (let i = 0; i < options.length; i++) {
              const optTxt = normalizeTextForMatch(options[i].text);
              if (/(job board|indeed|glassdoor|online|internet|company website|career site|social media|other)/i.test(optTxt)) {
                matchedIndex = i;
                break;
              }
            }
          }
        }
        // Negative answers (No / None / False)
        else if (targetNorm === 'no' || targetNorm === 'none' || targetNorm === 'false') {
          for (let i = 0; i < options.length; i++) {
            const optTxt = normalizeTextForMatch(options[i].text);
            const optVal = normalizeTextForMatch(options[i].value);
            if (/^no\b|^none\b|^false\b|^not applicable|^never|^i do not/i.test(optTxt) || optVal === '0' || optVal === 'no' || optVal === 'false') {
              matchedIndex = i;
              break;
            }
          }
        }
        // Positive answers (Yes / True)
        else if (targetNorm === 'yes' || targetNorm === 'true') {
          for (let i = 0; i < options.length; i++) {
            const optTxt = normalizeTextForMatch(options[i].text);
            const optVal = normalizeTextForMatch(options[i].value);
            if (/^yes\b|^true\b|^i am\b|^i have\b/i.test(optTxt) || optVal === '1' || optVal === 'yes' || optVal === 'true') {
              matchedIndex = i;
              break;
            }
          }
        }
      }

      if (matchedIndex !== -1) {
        const sx = window.scrollX;
        const sy = window.scrollY;

        try {
          const proto = Object.getPrototypeOf(actualSelect);
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(actualSelect, 'value');
          if (descriptor && descriptor.set) {
            descriptor.set.call(actualSelect, actualSelect.options[matchedIndex].value);
          } else {
            actualSelect.value = actualSelect.options[matchedIndex].value;
          }
        } catch (_) {
          actualSelect.value = actualSelect.options[matchedIndex].value;
        }

        actualSelect.selectedIndex = matchedIndex;
        actualSelect.dispatchEvent(new Event('input', { bubbles: true }));
        actualSelect.dispatchEvent(new Event('change', { bubbles: true }));

        if (window.scrollY !== sy || window.scrollX !== sx) {
          window.scrollTo(sx, sy);
        }
      }
    }

    // Update visible label / span in custom UI dropdowns
    const container = sel.closest('.k-dropdown, [role="combobox"], .bootstrap-select, .select2-container, .form-group, .field, div');
    if (container) {
      const displaySpan = container.querySelector('.k-input, .filter-option-inner-inner, .filter-option, .select2-selection__rendered, [class*="singleValue"], [class*="selected"], [class*="placeholder"], [class*="value"], button[role="combobox"], button.dropdown-toggle');
      if (displaySpan) {
        const textToShow = (matchedIndex !== -1 && actualSelect && actualSelect.options ? actualSelect.options[matchedIndex].text : targetVal);
        if (displaySpan.tagName === 'INPUT') {
          displaySpan.value = textToShow;
        } else {
          displaySpan.innerText = textToShow;
        }
      }
    }

    return matchedIndex !== -1;
  }

  function setNativeRadioValue(radioGroup, targetVal) {
    if (!radioGroup || !radioGroup.length || !targetVal) return false;
    const targetNorm = normalizeTextForMatch(targetVal);
    
    for (const r of radioGroup) {
      const optionLabel = normalizeTextForMatch(getRadioOptionLabel(r));
      const val = normalizeTextForMatch(r.value);
      const isYesMatch = (targetNorm === 'yes' || targetNorm === 'true') && 
        (/^yes\b|^true\b|^agree\b/i.test(optionLabel) || /^yes\b|^true\b/i.test(val) || val === '1');
      const isNoMatch = (targetNorm === 'no' || targetNorm === 'false') && 
        (/^no\b|^false\b|^disagree\b|^none\b/i.test(optionLabel) || /^no\b|^false\b/i.test(val) || val === '0');
      const isDirectMatch = (optionLabel === targetNorm || val === targetNorm || (targetNorm.length > 2 && optionLabel.includes(targetNorm)));

      if (isYesMatch || isNoMatch || isDirectMatch) {
        if (r.checked) return true; // Already selected, skip to prevent scroll jump

        const sx = window.scrollX;
        const sy = window.scrollY;

        try {
          const proto = Object.getPrototypeOf(r);
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(r, 'checked');
          if (descriptor && descriptor.set) {
            descriptor.set.call(r, true);
          } else {
            r.checked = true;
          }
        } catch (_) {
          r.checked = true;
        }

        const parentLabel = r.closest('label') || (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null);
        if (parentLabel && parentLabel !== r) {
          safeTriggerClick(parentLabel);
        } else {
          safeTriggerClick(r);
        }

        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));

        if (window.scrollY !== sy || window.scrollX !== sx) {
          window.scrollTo(sx, sy);
        }
        return true;
      }
    }
    return false;
  }

  function setNativeCheckboxValue(cb, shouldCheck) {
    if (!cb) return false;
    const target = Boolean(shouldCheck);
    if (cb.checked === target) return true;

    const sx = window.scrollX;
    const sy = window.scrollY;

    // 1. Native click action (naturally updates framework state in React, Angular, Paylocity, Workday)
    try {
      cb.click();
    } catch (_) {}

    // 2. If click didn't change state to target, use prototype descriptor setter
    if (cb.checked !== target) {
      try {
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked') || Object.getOwnPropertyDescriptor(cb, 'checked');
        if (descriptor && descriptor.set) {
          descriptor.set.call(cb, target);
        } else {
          cb.checked = target;
        }
      } catch (_) {
        cb.checked = target;
      }
      cb.dispatchEvent(new Event('input', { bubbles: true }));
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 3. If custom styled checkbox UI (custom-control, k-checkbox, etc.)
    const parentLabel = cb.closest('label') || (cb.id ? document.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : null);
    if (parentLabel && cb.checked !== target) {
      try { parentLabel.click(); } catch (_) {}
    }

    if (window.scrollY !== sy || window.scrollX !== sx) {
      window.scrollTo(sx, sy);
    }
    return true;
  }

  // Restore form fields on the page from sessionStorage and active candidate profile
  function restoreSavedForm(profile, settings = {}) {
    const initScrollX = window.scrollX;
    const initScrollY = window.scrollY;

    const job = detectJobContext();
    const candidateId = profile?.id || '';
    const sessionKey = getAppSessionKey(candidateId, job.req_id);
    let savedState = {};
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!candidateId || !parsed.candidate_id || parsed.candidate_id === candidateId) {
          savedState = parsed;
        }
      }
    } catch (_) {}

    const p = profile || {};
    const cfg = settings || {};
    const allowSalary = cfg.autoFillCompensation !== false;
    const allowCustomQa = cfg.autoFillCustomQuestions !== false;

    // Resolve dynamic in-memory / session tailored resume data and effective tech stack
    let tailoredData = null;
    try {
      if (typeof window !== 'undefined' && window.__SQC_TAILORED_RESUME_DATA) {
        tailoredData = window.__SQC_TAILORED_RESUME_DATA;
      } else if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem('sqc_tailored_resume_data');
        if (raw) tailoredData = JSON.parse(raw);
      }
    } catch (_) {}

    const effectiveStack = (window.JobFormValidator && window.JobFormValidator.getEffectiveStack)
      ? window.JobFormValidator.getEffectiveStack(p, cfg.activeStackKey, job.job_title)
      : (p.stacks?.[cfg.activeStackKey] || p.stacks?.[p.activeStackKey] || null);

    const savedAnswers = savedState.screening_answers || {};
    let restoredCount = 0;

    const findSavedValue = (label) => {
      if (!label) return '';
      const isDirtyOrPlaceholder = (v) => !v || isUnansweredPlaceholder(v) || /^(nil|null|none|n\/a|na|test|dummy)$/i.test(String(v).trim());
      if (savedAnswers[label] && !isDirtyOrPlaceholder(savedAnswers[label])) {
        return savedAnswers[label];
      }
      const canonTarget = getCanonicalLabelKey(label);

      // 1. Check profile customFields (dynamic user-configured Q&A)
      if (allowCustomQa && Array.isArray(p.customFields)) {
        for (const cf of p.customFields) {
          if (!cf || !cf.label || isDirtyOrPlaceholder(cf.value)) continue;
          const cfCanon = getCanonicalLabelKey(cf.label);
          if (cfCanon === canonTarget || canonTarget.includes(cfCanon) || cfCanon.includes(canonTarget)) {
            return cf.value;
          }
        }
      }

      // 2. Check savedAnswers in session
      for (const [k, v] of Object.entries(savedAnswers)) {
        if (getCanonicalLabelKey(k) === canonTarget && !isDirtyOrPlaceholder(v)) {
          return v;
        }
      }
      return '';
    };

    // 1. Restore Text, Email, Tel, Number Inputs & Radio Groups
    const inputs = queryAllDeep('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])');
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
        const rootDoc = input.ownerDocument || document;
        const radios = input.name
          ? queryAllDeep(`input[type="radio"][name="${CSS.escape(input.name)}"]`, rootDoc)
          : [input];
        const groupQuestion = getRadioGroupQuestion(radios);
        const groupKey = input.name || groupQuestion || labelNorm;
        if (processedRadioGroups.has(groupKey)) return;
        processedRadioGroups.add(groupKey);

        const groupLabel = cleanFieldLabel(groupQuestion);
        const groupLabelNorm = getCanonicalLabelKey(groupLabel);

        const savedVal = findSavedValue(groupLabel) || findSavedValue(label);
        let targetRadioVal = savedVal;

        if (!targetRadioVal) {
          const optionLabels = radios.map(r => getRadioOptionLabel(r)).join(' ');
          const checkTxt = `${groupLabelNorm} ${labelNorm} ${getCanonicalLabelKey(optionLabels)}`;

          if (checkTxt.includes('other than california') || checkTxt.includes('except california') || (checkTxt.includes('live in a u s state') && checkTxt.includes('california'))) {
            const candidateInCalifornia = (p.state || '').toLowerCase().includes('california') || (p.location?.resideState || '').toLowerCase().includes('ca');
            targetRadioVal = candidateInCalifornia ? 'No' : 'Yes';
          } else if (checkTxt.includes('align with your salary') || (checkTxt.includes('salary range') && checkTxt.includes('expectations')) || checkTxt.includes('salary expectations')) {
            targetRadioVal = 'Yes';
          } else if (
            checkTxt.includes('how did you hear') || checkTxt.includes('referral') ||
            checkTxt.includes('source') || checkTxt.includes('how heard') ||
            checkTxt.includes('company website') || checkTxt.includes('friend or family') ||
            checkTxt.includes('current employee')
          ) {
            targetRadioVal = p.howHeard?.howHeard || p.howHeard || 'Company Website';
          } else if (checkTxt.includes('veteran') || checkTxt.includes('military')) {
            targetRadioVal = p.eeoc?.identifyAsMilitaryVeteran || 'No';
          } else if (checkTxt.includes('clearance') || checkTxt.includes('security')) {
            targetRadioVal = p.credentials?.securityClearance || 'No';
          } else if (checkTxt.includes('authorized') || checkTxt.includes('lawfully') || checkTxt.includes('legally authorized') || checkTxt.includes('work in the united states') || checkTxt.includes('work in the us')) {
            targetRadioVal = p.workAuth?.authorizedInUS || 'Yes';
          } else if (checkTxt.includes('sponsor') || checkTxt.includes('visa') || checkTxt.includes('h-1b') || checkTxt.includes('h1-b') || checkTxt.includes('o-1') || checkTxt.includes('employment visa')) {
            targetRadioVal = p.workAuth?.requiresSponsorship || 'No';
          } else if (checkTxt.includes('18 or older') || checkTxt.includes('age') || checkTxt.includes('legal age')) {
            targetRadioVal = p.eligibility?.age18OrOlder || 'Yes';
          } else if (
            checkTxt.includes('current or former employee') || checkTxt.includes('former employee') ||
            checkTxt.includes('previous employee') || checkTxt.includes('affiliated company') ||
            checkTxt.includes('affiliate') || checkTxt.includes('worked for') ||
            checkTxt.includes('worked here') || checkTxt.includes('worked before') ||
            checkTxt.includes('are you a member') || checkTxt.includes('member of') ||
            checkTxt.includes('have you worked') || checkTxt.includes('relative') ||
            checkTxt.includes('family member') || checkTxt.includes('relationship with') ||
            checkTxt.includes('conflict of interest')
          ) {
            targetRadioVal = 'No';
          } else if (
            checkTxt.includes('terminated') || checkTxt.includes('misconduct') ||
            checkTxt.includes('disciplinary') || checkTxt.includes('suspended') ||
            checkTxt.includes('non-compete') || checkTxt.includes('restrictive covenant') ||
            checkTxt.includes('nda') || checkTxt.includes('confidentiality') ||
            checkTxt.includes('convicted') || checkTxt.includes('felony') ||
            checkTxt.includes('crime') || checkTxt.includes('government employee') ||
            checkTxt.includes('finra')
          ) {
            targetRadioVal = 'No';
          } else if (
            checkTxt.includes('travel') || checkTxt.includes('onsite') ||
            checkTxt.includes('overtime') || checkTxt.includes('hybrid') ||
            checkTxt.includes('essential functions') || checkTxt.includes('minimum qualifications') ||
            checkTxt.includes('driver license') || checkTxt.includes('drivers license')
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
        } else {
          // Only auto-check consent/legal/acknowledgement checkboxes that are STANDALONE
          // (not part of a multi-checkbox skill/referral/source group)
          const isConsentType = labelNorm.includes('acknowledgement') || labelNorm.includes('agree') ||
            labelNorm.includes('consent') || labelNorm.includes('terms') || labelNorm.includes('sms');
          if (isConsentType) {
            // Count siblings with same parent — if > 2 siblings, it's a multi-select group, skip auto-check
            const parentContainer = input.closest('fieldset, .form-group, [role="group"], .form-section, section, ul, ol');
            const siblingCheckboxes = parentContainer
              ? parentContainer.querySelectorAll('input[type="checkbox"]').length
              : 1;
            if (siblingCheckboxes <= 2) {
              shouldCheck = true;
            }
          }
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
        if (labelNorm.includes('first and last name') || labelNorm.includes('full name') || labelNorm === 'name' || labelNorm.includes('full legal name') || labelNorm.includes('signature') || labelNorm.includes('type your name') || nameLower === 'name' || idLower === 'name' || autoId.includes('fullname') || input.autocomplete === 'name') {
          valueToFill = p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
        } else if (nameLower.includes('first') || idLower.includes('first') || labelNorm.includes('first name') || labelNorm === 'first' || autoId.includes('firstname') || input.autocomplete === 'given-name') {
          valueToFill = p.firstName || (p.fullName ? p.fullName.split(' ')[0] : '');
        } else if (nameLower.includes('last') || idLower.includes('last') || labelNorm.includes('last name') || labelNorm === 'last' || autoId.includes('lastname') || input.autocomplete === 'family-name') {
          valueToFill = p.lastName || (p.fullName ? p.fullName.split(' ').slice(1).join(' ') : '');
        } else if (labelNorm.includes('middle') || nameLower.includes('middle')) {
          valueToFill = p.middleName || 'R';
        } else if (labelNorm.includes('preferred') || nameLower.includes('preferred')) {
          valueToFill = p.preferredName || p.firstName || '';
        } else if (type === 'email' || nameLower.includes('email') || idLower.includes('email') || labelNorm.includes('email') || autoId.includes('email') || input.autocomplete === 'email') {
          const candidateAliases = (p.emailAliases || [p.primaryEmail]).filter(Boolean).map(e => e.toLowerCase().trim());
          const isVerifiedSavedEmail = savedState.email_entered && candidateAliases.includes(savedState.email_entered.toLowerCase().trim());
          valueToFill = isVerifiedSavedEmail ? savedState.email_entered : (p.primaryEmail || '');
        } else if (type === 'tel' || nameLower.includes('phone') || idLower.includes('phone') || labelNorm.includes('phone') || labelNorm.includes('mobile') || autoId.includes('phone') || input.autocomplete === 'tel') {
          valueToFill = p.formattedPhone || p.phone || (savedState.phone_entered || '');
        } else if (labelNorm.includes('address line 1') || labelNorm === 'address' || labelNorm === 'street address' || labelNorm.includes('address') || nameLower.includes('address1') || nameLower.includes('address')) {
          valueToFill = p.address || p.streetAddress || p.location?.address || '';
        } else if (labelNorm.includes('address line 2') || nameLower.includes('address2')) {
          valueToFill = p.addressLine2 || '';
        } else if (labelNorm === 'city' || labelNorm === 'locality' || nameLower.includes('city') || nameLower.includes('locality')) {
          valueToFill = p.city || p.location?.city || '';
        } else if (labelNorm === 'county' || nameLower.includes('county')) {
          valueToFill = p.county || 'Miami-Dade';
        } else if (labelNorm === 'state' || labelNorm === 'administrative area' || labelNorm.includes('state/province') || labelNorm.includes('state or province') || labelNorm.includes('state') || nameLower.includes('state') || nameLower.includes('adminarea')) {
          valueToFill = p.state || p.location?.resideState || p.location?.state || 'Florida';
        } else if (labelNorm.includes('zip') || labelNorm.includes('postal') || nameLower.includes('zip') || nameLower.includes('postal')) {
          valueToFill = p.zip || p.zipCode || p.postalCode || p.location?.zip || '';
        } else if (labelNorm.includes('country') || nameLower.includes('country')) {
          valueToFill = p.country || p.location?.country || 'United States';
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
        } else if (labelNorm.includes('github') || labelNorm.includes('git hub') || nameLower.includes('github')) {
          valueToFill = p.github || p.links?.github || '';
        } else if (labelNorm.includes('portfolio') || labelNorm.includes('personal site') || labelNorm.includes('website') || nameLower.includes('portfolio')) {
          valueToFill = p.portfolio || p.website || p.links?.portfolio || '';
        } else if (labelNorm.includes('backend language') || labelNorm.includes('preferred backend')) {
          valueToFill = tailoredData?.backendSkills || effectiveStack?.preferredBackend || p.languagesFrameworks?.preferredBackend || '';
        } else if (labelNorm.includes('frontend framework') || labelNorm.includes('preferred frontend')) {
          valueToFill = tailoredData?.frontendSkills || effectiveStack?.preferredFrontend || p.languagesFrameworks?.preferredFrontend || '';
        } else if (labelNorm.includes('database') || labelNorm.includes('preferred database')) {
          valueToFill = tailoredData?.dbCloudSkills || effectiveStack?.preferredDatabase || p.languagesFrameworks?.preferredDatabase || '';
        } else if (labelNorm.includes('skill') || labelNorm.includes('technolog') || labelNorm.includes('programming language') || labelNorm.includes('frameworks') || labelNorm.includes('tech stack')) {
          const allSkills = tailoredData?.primaryStackKeywords?.length
            ? [tailoredData.backendSkills, tailoredData.frontendSkills, tailoredData.dbCloudSkills].filter(Boolean).join(', ')
            : (effectiveStack?.keywords?.join(', ') || (p.primaryStackKeywords || []).join(', ') || p.targetStack || '');
          valueToFill = allSkills;
        } else if (labelNorm.includes('school') || labelNorm.includes('university') || labelNorm.includes('college') || labelNorm.includes('institution') || nameLower.includes('school') || nameLower.includes('university')) {
          valueToFill = p.backgroundAndEducation?.schoolsAttended || p.school || 'University of Notre Dame';
        } else if (labelNorm.includes('degree') || labelNorm.includes('major') || labelNorm.includes('field of study')) {
          valueToFill = p.backgroundAndEducation?.education || p.degree || "Bachelor of Science in Computer Science";
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
    const textareas = queryAllDeep('textarea');
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
        } else if (labelNorm.includes('linkedin') || labelNorm.includes('linked in') || labelNorm.includes('linkedin profile')) {
          val = p.linkedin || p.links?.linkedin || 'https://www.linkedin.com/in/adam-myers-6ab405428';
        } else if (labelNorm.includes('github') || labelNorm.includes('git hub')) {
          val = p.github || p.links?.github || '';
        } else if (labelNorm.includes('portfolio') || labelNorm.includes('website') || labelNorm.includes('personal site')) {
          val = p.portfolio || p.website || p.links?.portfolio || '';
        } else if (labelNorm.includes('backend language') || labelNorm.includes('preferred backend')) {
          val = tailoredData?.backendSkills || effectiveStack?.preferredBackend || p.languagesFrameworks?.preferredBackend || '';
        } else if (labelNorm.includes('frontend framework') || labelNorm.includes('preferred frontend')) {
          val = tailoredData?.frontendSkills || effectiveStack?.preferredFrontend || p.languagesFrameworks?.preferredFrontend || '';
        } else if (labelNorm.includes('database') || labelNorm.includes('preferred database')) {
          val = tailoredData?.dbCloudSkills || effectiveStack?.preferredDatabase || p.languagesFrameworks?.preferredDatabase || '';
        } else if (labelNorm.includes('skill') || labelNorm.includes('technolog') || labelNorm.includes('tech stack') || labelNorm.includes('frameworks') || labelNorm.includes('programming languages')) {
          const allSkills = tailoredData?.primaryStackKeywords?.length
            ? [tailoredData.backendSkills, tailoredData.frontendSkills, tailoredData.dbCloudSkills].filter(Boolean).join(', ')
            : (effectiveStack?.keywords?.join(', ') || (p.primaryStackKeywords || []).join(', ') || p.targetStack || '');
          val = allSkills;
        }
      }

      if (val && (!ta.value || isUnansweredPlaceholder(ta.value))) {
        if (setNativeTextareaValue(ta, val)) {
          restoredCount++;
        }
      }
    });

    // 3. Restore Dropdowns / Selects
    const selects = queryAllDeep('select, [role="combobox"]:not(input):not(textarea), .k-dropdown, mat-select, .select2-container, .bootstrap-select, div[class*="dropdown"], div[class*="select"]');
    const processedSelects = new Set();

    selects.forEach(sel => {
      if (sel.closest('#sqc-hud-container, #sqc-modal-overlay')) return;
      
      // If container contains a select, prioritize the native select
      let targetElement = sel;
      if (sel.tagName !== 'SELECT') {
        const innerSelect = sel.querySelector('select');
        if (innerSelect) {
          targetElement = innerSelect;
        }
      }

      if (processedSelects.has(targetElement)) return;
      processedSelects.add(targetElement);

      const label = cleanFieldLabel(getElementLabel(targetElement) || getElementLabel(sel) || '');
      const labelNorm = getCanonicalLabelKey(label);
      let val = findSavedValue(label);

      if (!val || isUnansweredPlaceholder(val)) {
        if (labelNorm.includes('country')) {
          val = p.country || 'United States';
        } else if (labelNorm.includes('state') || labelNorm.includes('administrative area') || labelNorm.includes('province')) {
          val = p.state || p.location?.resideState || 'FL';
        } else if (labelNorm.includes('city') || labelNorm.includes('locality')) {
          val = p.city || '';
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
          labelNorm.includes('worked for') || labelNorm.includes('worked before') ||
          labelNorm.includes('member') || labelNorm.includes('are you a member') ||
          labelNorm.includes('have you worked') || labelNorm.includes('relative') ||
          labelNorm.includes('family member') || labelNorm.includes('relationship with') ||
          labelNorm.includes('non-compete') || labelNorm.includes('misconduct') ||
          labelNorm.includes('conflict of interest')
        ) {
          val = 'No';
        } else if (labelNorm.includes('sms') || labelNorm.includes('text')) {
          val = 'Yes';
        } else if (labelNorm.includes('authorized') || labelNorm.includes('work lawfully') || labelNorm.includes('legally authorized') || labelNorm.includes('work in the united states') || labelNorm.includes('work in the us')) {
          val = p.workAuth?.authorizedInUS || 'Yes';
        } else if (labelNorm.includes('sponsor') || labelNorm.includes('visa') || labelNorm.includes('h-1b') || labelNorm.includes('h1-b') || labelNorm.includes('o-1') || labelNorm.includes('employment visa')) {
          val = p.workAuth?.requiresSponsorship || 'No';
        } else if (labelNorm.includes('education') || labelNorm.includes('degree') || labelNorm.includes('highest level') || labelNorm.includes('highest level of education')) {
          val = p.degreeLevel || p.backgroundAndEducation?.degreeLevel || "Bachelor's Degree";
        } else if (labelNorm.includes('how did you hear') || labelNorm.includes('referral') || labelNorm.includes('how heard') || labelNorm.includes('source')) {
          val = p.howHeard?.howHeard || p.howHeard || 'LinkedIn';
        } else if (labelNorm.includes('school') || labelNorm.includes('university') || labelNorm.includes('college') || labelNorm.includes('institution')) {
          val = p.backgroundAndEducation?.schoolsAttended || p.school || 'University of Notre Dame';
        } else if (labelNorm.includes('graduate')) {
          val = 'Yes';
        }
      }

      if (val && setNativeSelectValue(targetElement, val)) {
        restoredCount++;
      }
    });

    // Restore scroll position after all form fields are filled
    if (window.scrollY !== initScrollY || window.scrollX !== initScrollX) {
      window.scrollTo(initScrollX, initScrollY);
    }

    return { count: restoredCount, sessionKey };
  }

  // =========================================================================
  // CHATGPT PROMPT GENERATOR & AI ANSWER APPLIER
  // =========================================================================

  // Extract full Job Description text from ATS DOM and persist across multi-page steps
  function extractJdFullText() {
    if (window.__SQC_APPLYFLOW_CONTEXT) {
      const af = window.__SQC_APPLYFLOW_CONTEXT;
      if (af.jobDescription || af.description || af.jobDetails?.description) {
        const afJd = clean(af.jobDescription || af.description || af.jobDetails?.description);
        if (afJd) {
          try { sessionStorage.setItem('applyflow_jd_text', afJd.slice(0, 4000)); } catch (_) {}
          return afJd.slice(0, 4000);
        }
      }
    }

    // 1. Check explicit JD containers first (high confidence)
    const explicitJdSelectors = [
      '[data-automation-id="jobPostingDescription"]',
      '.job-description',
      '#job-description',
      '.posting-description',
      '.job-details',
      '.job-summary',
      '[class*="job-description" i]',
      '[class*="jobDescription" i]',
      '[id*="job-description" i]',
      '[id*="jobDescription" i]'
    ];

    for (const sel of explicitJdSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, button, input, select, textarea, form, #sqc-hud-container, #sqc-modal-overlay').forEach(n => n.remove());
          const txt = (clone.innerText || clone.textContent || '').trim();
          if (txt.length > 150) {
            const sliced = txt.slice(0, 4000);
            try { sessionStorage.setItem('applyflow_jd_text', sliced); } catch (_) {}
            return sliced;
          }
        }
      } catch (_) {}
    }

    // 2. If explicit JD container was removed (e.g., navigated to Step 2/3/4 of application wizard),
    // restore the cached JD text captured on Page 1 before falling back to generic <main>/<article>
    try {
      const savedJd = sessionStorage.getItem('applyflow_jd_text') || window.__SQC_PERSISTED_AF_SESSION?.jdText || '';
      if (savedJd && savedJd.length > 150) {
        return savedJd;
      }
    } catch (_) {}

    // 3. Fallback generic containers (only when not on a form-only wizard sub-step)
    const fallbackSelectors = ['#content .section', '.content .section', 'article', 'main'];
    for (const sel of fallbackSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, button, input, select, textarea, form, #sqc-hud-container, #sqc-modal-overlay').forEach(n => n.remove());
          const txt = (clone.innerText || clone.textContent || '').trim();
          if (txt.length > 200) {
            const sliced = txt.slice(0, 4000);
            try { sessionStorage.setItem('applyflow_jd_text', sliced); } catch (_) {}
            return sliced;
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

      // 1. Try standard JSON.parse first
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
        // 2. Lenient JSON Parsing: Extract each { "id": ..., "question": ..., "answer": ... } block individually
        try {
          const itemRegex = /\{\s*"id"\s*:\s*"([^"]+)"[\s\S]*?"question"\s*:\s*"([\s\S]*?)"\s*,\s*"answer"\s*:\s*"([\s\S]*?)"\s*\}/gi;
          let match;
          while ((match = itemRegex.exec(str)) !== null) {
            answersList.push({
              id: match[1],
              question: match[2].replace(/\\"/g, '"').trim(),
              answer: match[3].replace(/\\"/g, '"').trim()
            });
          }
        } catch (_) {}

        // 3. Regex Fallback: Scan for "question" and "answer" pairs even with unescaped internal quotes
        if (!answersList.length) {
          try {
            const rawItems = str.split(/(?=\{\s*"id"\s*:|\{\s*"question"\s*:)/);
            for (const item of rawItems) {
              const idM = item.match(/"id"\s*:\s*"([^"]+)"/i);
              const qM = item.match(/"question"\s*:\s*([\s\S]*?),\s*"answer"\s*:/i);
              const aM = item.match(/"answer"\s*:\s*([\s\S]*?)(?=\s*\}|$)/i);
              if (qM && aM) {
                let cleanQ = qM[1].trim().replace(/^"|"$/g, '');
                let cleanA = aM[1].trim().replace(/^"|"$/g, '');
                answersList.push({
                  id: idM ? idM[1] : '',
                  question: cleanQ,
                  answer: cleanA
                });
              }
            }
          } catch (_) {}
        }

        // 4. Line-by-line fallback for Q: A format
        if (!answersList.length) {
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

    const p = (typeof SubmissionHUD !== 'undefined' && SubmissionHUD.getActiveProfile ? SubmissionHUD.getActiveProfile() : null) || window.__SQC_ACTIVE_PROFILE || {};

    // Helper to populate an element with an answer value
    function populateElement(el, ansVal, qTextContext = '') {
      if (!el || ansVal === undefined || ansVal === null) return false;
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      const qContextNorm = getCanonicalLabelKey(qTextContext || getElementLabel(el) || '');
      
      // Clean Markdown links like [https://linkedin.com/...](https://linkedin.com/...)
      let sVal = String(ansVal).trim()
        .replace(/\[(https?:\/\/[^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\[(.*?)\]\(.*?\)$/, '$1');

      // Profile Fallback Override: If a text/URL/textarea asks for LinkedIn link and ChatGPT answered 'No' or invalid
      if ((tag === 'textarea' || type === 'text' || type === 'url') && (qContextNorm.includes('linkedin') && !qContextNorm.includes('hear') && !qContextNorm.includes('learn'))) {
        if (/^(no|false|n\/?a|none)$/i.test(sVal) || !sVal.includes('linkedin.com')) {
          sVal = p.linkedin || 'https://www.linkedin.com/in/adam-myers-6ab405428';
        }
      }

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
      let ansVal = item.answer !== undefined ? item.answer : (item.a !== undefined ? item.a : item.value);
      const qId = String(item.id || '');
      if (ansVal === undefined || ansVal === null) return;

      const qCanon = getCanonicalLabelKey(qText);
      let matched = false;

      // 1. Checkboxes matching by individual option text (e.g. PostgreSQL, SQL Server, LinkedIn, Corporate Website)
      for (const el of elementsToFill) {
        if (el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-ai-modal-overlay')) continue;
        if (el.type === 'checkbox') {
          const optLabel = cleanFieldLabel(getRadioOptionLabel(el) || '');
          const optCanon = getCanonicalLabelKey(optLabel);
          const valCanon = getCanonicalLabelKey(clean(el.value || ''));

          if (optCanon) {
            // Use STRICT equality only for checkboxes — startsWith is too loose and causes mass-checking
            const isMatch = (optCanon === qCanon) ||
              (valCanon && valCanon.length > 2 && valCanon === qCanon);

            if (isMatch) {
              const shouldCheck = /yes|true|check|1/i.test(String(ansVal));
              setNativeCheckboxValue(el, shouldCheck);
              filledElements.add(el);
              filledCount++;
              matched = true;
              break;
            }
          }
        }
      }

      if (matched) return;

      // 2. Radio Groups matching by group prompt question (e.g. "Do you have a dedicated, quiet workspace...")
      for (const el of elementsToFill) {
        if (el.closest('#sqc-hud-container, #sqc-modal-overlay, #sqc-ai-modal-overlay')) continue;
        if (el.type === 'radio') {
          const radios = el.name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)) : [el];
          const groupQ = cleanFieldLabel(getRadioGroupQuestion(radios) || '');
          const groupCanon = getCanonicalLabelKey(groupQ);

          if (
            groupCanon === qCanon ||
            (groupCanon.length > 6 && qCanon.includes(groupCanon)) ||
            (qCanon.length > 6 && groupCanon.includes(qCanon))
          ) {
            if (setNativeRadioValue(radios, String(ansVal))) {
              radios.forEach(r => filledElements.add(r));
              filledCount++;
              matched = true;
              break;
            }
          }
        }
      }

      if (matched) return;

      // 3. Text, Textarea, Select matching by Canonical Label / Substring
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
          if (populateElement(el, ansVal, qText)) {
            filledElements.add(el);
            filledCount++;
            matched = true;
            break;
          }
        }
      }
    });

    // 4. Referral Checkboxes Fallback: Ensure required referral checkboxes have at least one valid selection
    const allCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => !cb.closest('#sqc-hud-container, #sqc-modal-overlay'));
    const referralCheckboxes = allCheckboxes.filter(cb => {
      const parentTxt = (cb.closest('fieldset, form, div, .form-group')?.innerText || '').toLowerCase();
      return parentTxt.includes('how did you learn') || parentTxt.includes('how did you hear') || parentTxt.includes('referral source');
    });

    if (referralCheckboxes.length > 0) {
      const anyChecked = referralCheckboxes.some(cb => cb.checked);
      if (!anyChecked) {
        const preferredCb = referralCheckboxes.find(cb => {
          const lbl = getRadioOptionLabel(cb).toLowerCase();
          return lbl.includes('linkedin') || lbl.includes('corporate') || lbl.includes('website') || lbl.includes('online');
        }) || referralCheckboxes[0];

        if (preferredCb) {
          setNativeCheckboxValue(preferredCb, true);
          filledCount++;
        }
      }
    }

    // Automatically update session state
    try {
      const job = detectJobContext();
      const candidateId = (typeof SubmissionHUD !== 'undefined' && SubmissionHUD.getActiveProfile ? SubmissionHUD.getActiveProfile()?.id : null) || '';
      const sessionKey = getAppSessionKey(candidateId, job.req_id);
      let saved = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
      saved.candidate_id = candidateId;
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
    getCanonicalJobPath,
    getAtsPositionSlug,
    detectAtsPlatform,
    isJobApplicationPortal,
    cleanupNonJobSession,
    detectJobContext,
    detectJobTechStack,
    detectAlreadyApplied,
    detectIntermediateWizardStep,
    detectSubmissionSuccess,
    detectSubmissionFailure,
    extractLoggedInAccount,
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
