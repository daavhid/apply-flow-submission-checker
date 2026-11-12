/* Presentation state only. Backend verification remains authoritative for all portal actions. */
(function (root) {
  'use strict';
  function identityKey(config) {
    const i = config?.integration;
    const a = i?.profileAssignment;
    return JSON.stringify([i?.apiOrigin, i?.applier?.id, a?.id, a?.version,
      config?.activeProfile?.id, config?.activeProfile?.version]);
  }
  function stage(config, confirmation) {
    const i = config?.integration || {};
    if (!i.apiOrigin) return 'server';
    if (!i.applier || ['SIGNED_OUT', 'DISCONNECTED', 'FORBIDDEN'].includes(i.state)) return 'signin';
    if (i.passwordChangeRequired || i.state === 'PASSWORD_CHANGE_REQUIRED') return 'password';
    if (!config.activeProfile || !i.profileAssignment) return 'unassigned';
    return confirmation === identityKey(config) ? 'ready' : 'profile';
  }
  const api = { stage, identityKey };
  root.SQCFlow = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
