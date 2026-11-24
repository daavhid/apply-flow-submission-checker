/* Classify the action being taken, independently of cached or cumulative extracted values. */
(function (root) {
  'use strict';
  const ignored = '#sqc-hud-container, #sqc-modal-overlay, #sqc-portal-lock-banner, .sqc-root';
  const actions = 'button, input[type="submit"], input[type="image"], input[type="button"], a, [role="button"]';
  const entry = /^(?:start|begin)(?: (?:a|your|my|this|the))? application$|^apply manually$|^autofill with resume$|^use my last application$/i;
  const apply = /^apply(?: now| for (?:this )?job| to (?:this )?position| for this position)?$/i;
  const step = /^(?:next(?: step)?|continue|save\s*(?:&|and)\s*continue|proceed|review(?: application| your application)?)(?:\s*[:\-–—]\s*[^\n]+|\s+(?:to|with)\s+[^\n]+)?$/i;
  const otherNavigation = /^(?:log ?in|sign ?in|register|back|previous|prev|upload|choose file|browse|agree|i agree|accept|cancel|close|exit|save|save draft|save and exit|save for later)$/i;
  const explicitFinal = /^(?:submit(?: (?:my |your )?application| profile)?|send application|complete application|finish(?: and submit)?|confirm and submit|complete submission|review and submit)$/i;

  function classify(facts) {
    const label = String(facts.label || '').trim().replace(/\s+/g, ' ').replace(/^[←→‹›«»\s]+|[←→‹›«»\s]+$/g,'');
    if (facts.ignored) return 'ignore';
    if (facts.navigation || facts.opensForm || entry.test(label) ||
        /apply\s+(?:on\s+(?:company\s+site|website|ziprecruiter)|externally|with\s+(?:indeed|linkedin))/i.test(label)) return 'navigation';
    if (otherNavigation.test(label)) return 'navigation';
    if (step.test(label)) return 'step';
    const relevant = facts.hasApplicantFields || facts.review;
    if (apply.test(label)) {
      if (!relevant) return 'navigation';
      if (facts.intermediate) return 'step';
      return facts.nativeSubmit || facts.afterFields || facts.review ? 'final' : 'navigation';
    }
    if (explicitFinal.test(label) || facts.finalId) return facts.intermediate ? 'step' : 'final';
    if (facts.nativeSubmit && relevant && /submit|send|finish|complete/i.test(label)) return facts.intermediate ? 'step' : 'final';
    if (facts.submitEvent && relevant) return facts.intermediate ? 'step' : 'final';
    return 'unknown';
  }

  function visible(field) {
    if (field.disabled || field.closest(ignored + ', [hidden], [inert], [aria-hidden="true"]')) return false;
    if (/^(?:hidden|submit|image|button|reset|password|search)$/i.test(field.type || '')) return false;
    if (!field.getClientRects().length) return false;
    const style = field.ownerDocument.defaultView.getComputedStyle(field);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }
  function applicantField(field) {
    if (!visible(field)) return false;
    const label = [...(field.labels || [])].map(node => node.textContent).join(' ');
    const description = [field.name, field.id, field.autocomplete, field.getAttribute('aria-label'),
      field.getAttribute('placeholder'), label].join(' ');
    return /(?:first|last|full|given|family)[\s_-]*name|(?:^|\W)(?:name|email|e-mail|phone|resume|résumé|cv|candidate|applicant)(?:\W|$)|cover[\s_-]*letter|work[\s_-]*experience|sponsor|authorized|screening|compensation|salary/i.test(description) ||
      field.type === 'email' || field.type === 'tel' || field.tagName === 'TEXTAREA';
  }
  function fields(scope, form) {
    const nodes = scope?.elements ? Array.from(scope.elements) : Array.from(scope?.querySelectorAll('input, textarea, select, [role="combobox"], [contenteditable="true"]') || []);
    const applicationScope = /application|applicant|candidate/i.test([scope?.id, scope?.getAttribute('name'), scope?.getAttribute('class'), scope?.getAttribute('aria-label')].join(' '));
    return nodes.filter(field => (!field.form || field.form === form) &&
      (applicantField(field) || (applicationScope && visible(field))));
  }
  function opensForm(action, doc) {
    const refs = [action.getAttribute('aria-controls'), action.getAttribute('data-target'), action.getAttribute('data-bs-target')].filter(Boolean);
    for (const ref of refs) {
      let target;
      try { target = ref.startsWith('#') ? doc.querySelector(ref) : doc.getElementById(ref.split(/\s+/)[0]); } catch (_) {}
      const submitsTarget = target && action.form === target && /^(?:submit|image)$/i.test(action.type || '');
      if (target && !submitsTarget && !target.contains(action) && (target.matches('form, [role="dialog"], [role="form"]') || target.querySelector('form, input, textarea, select'))) return true;
    }
    return /^(?:modal|collapse|dialog)$/i.test(action.getAttribute('data-toggle') || action.getAttribute('data-bs-toggle') || '');
  }
  function inspect(target, { form = null, submitEvent = false, intermediate = false } = {}) {
    // Option labels can be "Continue", "Apply", etc. Editing a field is never a
    // submission click, even when its widget sits inside a button-like wrapper.
    if (!submitEvent && target?.closest?.('select, textarea, input:not([type="submit"]):not([type="image"]):not([type="button"]), [role="combobox"], [role="listbox"], [role="option"], .select2-container, .select2-dropdown')) return 'ignore';
    const action = target?.closest?.(actions);
    if (target?.closest?.(ignored)) return 'ignore';
    const doc = (action || form || target)?.ownerDocument;
    if (!doc) return 'unknown';
    const owner = action?.form || action?.closest('form') || form;
    let scope = owner || action?.closest('[role="form"], .application-form, .application-review, [data-automation-id="reviewPage"]');
    let applicantFields = fields(scope, owner);
    if (!scope && action) {
      // For form-less SPAs, use the nearest container with applicant controls. Fields owned by
      // another form (newsletter, dormant application, search) cannot classify this button.
      for (let parent = action.parentElement; parent; parent = parent.parentElement) {
        const candidates = fields(parent, null);
        if (candidates.length) { scope = parent; applicantFields = candidates; break; }
      }
    }
    scope ||= action?.parentElement || form;
    const visibleLabel=(action?.innerText || action?.textContent || action?.value || '').trim();
    const label = visibleLabel.replace(/[←→‹›«»\s]/g,'') ? visibleLabel : (action?.getAttribute('aria-label') || action?.getAttribute('title') || visibleLabel).trim();
    const href = action?.tagName === 'A' ? (action.getAttribute('href') || '').trim() : '';
    const navigation = Boolean(href && href !== '#' && !/^javascript:/i.test(href));
    const id = [action?.id, action?.getAttribute('data-automation-id'), action?.getAttribute('data-qa')].filter(Boolean).join(' ');
    const finalId = /submit-button|submitapplication|submitbtn|^submit$/i.test(id) && !/next|continue|start|login|agree/i.test(id);
    const nativeSubmit = Boolean(owner && action && /^(?:submit|image)$/i.test(action.type || action.getAttribute('type') || ''));
    const before = applicantFields.filter(field => action && (field.compareDocumentPosition(action) & 4) !== 0).length;
    const review = /review (?:your |my |the )?application|application (?:review|summary)|confirm (?:your |my )?application/i.test(scope?.innerText || '');
    return classify({ label, navigation, opensForm: action ? opensForm(action, doc) : false,
      hasApplicantFields: applicantFields.length > 0, afterFields: before > 0 && before >= applicantFields.length / 2,
      review, nativeSubmit, finalId, intermediate, submitEvent });
  }
  const api = { classify, inspect };
  root.SQCSubmitIntent = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
