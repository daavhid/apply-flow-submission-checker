'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const el = id => document.getElementById(id);
  const send = message => chrome.runtime.sendMessage(message);
  let tabId;
  function render(result) {
    const i = result.integration || {};
    el('api-origin').value = i.apiOrigin || '';
    el('connection-state').textContent = `${i.state || 'ERROR'}: ${i.message || result.error || 'Unable to connect.'}`;
    el('applier').textContent = i.applier?.name || 'Not connected';
    el('candidate').textContent = result.activeProfile?.fullName || 'Unverified';
    el('job').textContent = [result.applyFlowContext?.jobTitle, result.applyFlowContext?.company].filter(Boolean).join(' | ') || 'Unverified';
    el('profile-version').textContent = result.settings?.verifiedContext?.profileVersion || '-';
    el('autofill').checked = result.settings?.autoAutofillOnPageLoad !== false;
    el('mode').value = result.settings?.interceptionMode || 'active';
  }
  async function refresh(force = false) { render(await send({ type: 'GET_CONFIG', tabId, force })); }
  async function busy(work) {
    el('connect').disabled = true;
    el('connection-state').textContent = 'Verifying with ApplyFlow...';
    try { await work(); } catch (error) { el('connection-state').textContent = error.message; }
    finally { el('connect').disabled = false; }
  }
  el('connect').onclick = () => busy(async () => {
    const result = await send({ type: 'SQC_CONNECT', apiOrigin: el('api-origin').value.trim(), tabId });
    if (!result.success) throw new Error(result.error);
    render(result);
  });
  el('disconnect').onclick = () => busy(async () => { await send({ type: 'SQC_DISCONNECT' }); await refresh(); });
  el('open-applyflow').onclick = () => {
    try {
      const u = new URL(el('api-origin').value.trim());
      if (!['https:', 'http:'].includes(u.protocol)) throw new Error();
      chrome.tabs.create({ url: u.origin + '/api/sqc/login' });
    } catch (_) { el('connection-state').textContent = 'Enter your ApplyFlow server URL first.'; }
  };
  async function save(settings) {
    const result = await send({ type: 'SAVE_SETTINGS', settings });
    if (!result.success) el('connection-state').textContent = result.error;
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
