/* Settings are browser preferences. Identity and assignment remain owned by ApplyFlow. */
(function (root) {
  'use strict';
  const defaults = { interceptionMode: 'active', autoAutofillOnPageLoad: true,
    autoFillDemographics: true, autoFillCompensation: true, autoFillCustomQuestions: true,
    detectCaptchaAndAlert: true, streamLiveEvents: true, minScreeningLength: 15 };
  function preferences(settings = {}) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const value = settings[key];
      if (typeof fallback === 'boolean') return [key, value !== false];
      if (key === 'interceptionMode') return [key, value === 'audit' ? 'audit' : 'active'];
      return [key, Number.isInteger(value) && value >= 1 && value <= 500 ? value : fallback];
    }));
  }
  function validate(draft) {
    if (!['active', 'audit'].includes(draft.interceptionMode)) throw new Error('Choose a validation mode.');
    if (!Number.isInteger(draft.minScreeningLength) || draft.minScreeningLength < 1 || draft.minScreeningLength > 500) {
      throw new Error('Screening answer length must be a whole number between 1 and 500.');
    }
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === 'boolean' && typeof draft[key] !== 'boolean') throw new Error('Choose a value for each preference.');
    }
    return Object.fromEntries(Object.keys(defaults).map(key => [key, draft[key]]));
  }
  function outcome(record) {
    const status = String(record.validation_status || 'Recorded');
    const tone = /^PASSED$/i.test(status) ? 'success' : /WARNING|OVERRIDDEN/i.test(status) ? 'warning' :
      /BLOCKED|FAILED|REJECTED|INELIGIBLE|ERROR|MISMATCH/i.test(status) ? 'error' : 'neutral';
    return { tone, label: status.toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()) };
  }
  function historyRows(records, query = '', filter = 'all') {
    const search = query.trim().toLowerCase();
    return records.map((record, index) => ({record, index})).filter(({record}) => {
      const tone = outcome(record).tone;
      if (filter === 'passed' && tone !== 'success') return false;
      if (filter === 'attention' && !['warning', 'error'].includes(tone)) return false;
      return !search || [record.profile_name, record.profile_assigned, record.candidate_id,
        record.applier_name, record.extracted_data?.job_title, record.extracted_data?.company,
        record.validation_status, record.job_id].some(value => String(value || '').toLowerCase().includes(search));
    });
  }
  function csv(records) {
    const cell = value => {
      let text = String(value ?? '');
      if (/^\s*[=+@-]|^[\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    return [['Timestamp', 'Candidate', 'Job title', 'Company', 'Validation', 'Delivery', 'Job ID'],
      ...records.map(r => [r.timestamp, r.profile_name || r.profile_assigned || r.candidate_id,
        r.extracted_data?.job_title, r.extracted_data?.company, r.validation_status, r.delivery_status, r.job_id])]
      .map(row => row.map(cell).join(',')).join('\r\n');
  }
  const api = { preferences, validate, outcome, historyRows, csv };
  root.SQCSettings = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
