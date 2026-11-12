'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const el = id => document.getElementById(id);
  const send = message => chrome.runtime.sendMessage(message);
  let tabId;
  function status(message, tone = 'neutral', label) {
    el('connection-state').textContent = message;
    el('connection-state').dataset.tone = tone;
    if (label) {
      el('connection-badge').textContent = label;
      el('connection-badge').dataset.tone = tone;
    }
  }
  function render(result) {
    const i = result.integration || {};
    el('api-origin').value = i.apiOrigin || '';
    const states = {
      VERIFIED: ['success', 'Verified'], AUTHENTICATED: ['success', 'Connected'],
      DISCONNECTED: ['neutral', 'Offline'], SIGNED_OUT: ['neutral', 'Signed out'],
      UNASSIGNED: ['warning', 'Unassigned'], PASSWORD_CHANGE_REQUIRED: ['warning', 'Action needed']
    };
    const [tone, label] = states[i.state] || ['error', 'Needs attention'];
    status(i.state === 'DISCONNECTED' ? 'Add your server URL to get started.' :
      i.message || result.error || 'Unable to connect.', tone, label);
    el('connect').textContent = i.apiOrigin ? 'Refresh connection' : 'Connect to ApplyFlow';
    el('disconnect').hidden = !i.apiOrigin;
    el('open-applyflow').hidden = !i.apiOrigin;
    el('assignment-badge').textContent = i.state === 'VERIFIED' ? 'Verified · Locked' : 'Awaiting verification';
    el('assignment-badge').dataset.verified = String(i.state === 'VERIFIED');
    el('assignment-note').textContent = i.state === 'VERIFIED' ?
      'Assignment locked and managed by ApplyFlow.' : 'To verify, open an assigned job in ApplyFlow.';
    el('applier').textContent = i.applier?.name || 'Not connected';
    el('candidate').textContent = result.activeProfile?.fullName || 'Unverified';
    el('job').textContent = [result.applyFlowContext?.jobTitle, result.applyFlowContext?.company].filter(Boolean).join(' | ') || 'Unverified';
    el('profile-version').textContent = result.settings?.verifiedContext?.profileVersion || result.activeProfile?.version || '-';
    el('autofill').checked = result.settings?.autoAutofillOnPageLoad !== false;
    el('mode').value = result.settings?.interceptionMode || 'active';
    const authenticated = Boolean(i.applier);
    el('authentication').hidden = !i.apiOrigin;
    el('login-form').hidden = authenticated;
    el('signed-in-controls').hidden = !authenticated;
    el('signed-in-email').textContent = i.applier?.email || i.applier?.name || '';
    el('password-settings').open = i.passwordChangeRequired === true;
  }
  async function refresh(force = false) { render(await send({ type: 'GET_CONFIG', tabId, force })); }
  async function busy(work) {
    const buttons = ['connect', 'disconnect', 'sign-in', 'sign-out', 'change-password'];
    buttons.forEach(id => { el(id).disabled = true; });
    status('Verifying with ApplyFlow…', 'neutral', 'Checking');
    try { await work(); } catch (error) { status(error.message, 'error', 'Needs attention'); }
    finally { buttons.forEach(id => { el(id).disabled = false; }); }
  }
  el('connect').onclick = () => busy(async () => {
    const result = await send({ type: 'SQC_CONNECT', apiOrigin: el('api-origin').value.trim(), tabId });
    if (!result.success) throw new Error(result.error);
    render(result);
  });
  el('disconnect').onclick = () => busy(async () => { await send({ type: 'SQC_DISCONNECT' }); await refresh(); });
  el('login-form').onsubmit = event => {
    event.preventDefault();
    const email = el('login-email').value.trim();
    const password = el('login-password').value;
    el('login-password').value = '';
    busy(async () => {
      const result = await send({ type: 'SQC_LOGIN', email, password, tabId });
      if (!result.success) { await refresh(); throw new Error(result.error); }
      render(result);
    });
  };
  el('sign-out').onclick = () => busy(async () => {
    const result = await send({ type: 'SQC_LOGOUT' });
    if (!result.success) throw new Error(result.error);
    render(result);
    el('login-email').value = '';
    if (result.remoteSignedOut === false) status('SQC is signed out locally. The server session could not be revoked; sign out in ApplyFlow too.', 'warning');
  });
  el('password-form').onsubmit = event => {
    event.preventDefault();
    const currentPassword = el('current-password').value;
    const newPassword = el('new-password').value;
    const confirmed = newPassword === el('confirm-password').value;
    ['current-password', 'new-password', 'confirm-password'].forEach(id => { el(id).value = ''; });
    if (!confirmed) { status('New passwords do not match. Please enter them again.', 'error'); return; }
    busy(async () => {
      const result = await send({ type: 'SQC_CHANGE_PASSWORD', currentPassword, newPassword, tabId });
      if (!result.success) { await refresh(); throw new Error(result.error); }
      render(result);
      if (result.integration?.applier && !result.integration.passwordChangeRequired) status('Password changed. Your ApplyFlow session and assigned profile have been refreshed.', 'success');
    });
  };
  el('open-applyflow').onclick = () => {
    try {
      const u = new URL(el('api-origin').value.trim());
      if (!['https:', 'http:'].includes(u.protocol)) throw new Error();
      chrome.tabs.create({ url: u.origin + '/api/sqc/login' });
    } catch (_) { status('Enter your ApplyFlow server URL first.', 'error'); el('api-origin').focus(); }
  };
  async function save(settings) {
    const result = await send({ type: 'SAVE_SETTINGS', settings });
    if (!result.success) { status(result.error, 'error'); return; }
    await refresh();
  }
  el('autofill').onchange = () => save({ autoAutofillOnPageLoad: el('autofill').checked });
  el('mode').onchange = () => save({ interceptionMode: el('mode').value });
  el('settings').onclick = () => chrome.runtime.openOptionsPage();
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  // The first-install setup tab has no job context; authentication needs only the endpoint.
  tabId = /^https?:\/\//i.test(tabs[0]?.url || '') ? tabs[0].id : undefined;
  await busy(() => refresh());
});
