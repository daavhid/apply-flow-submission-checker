'use strict';
window.SQCWorkspace = (() => {
  const paths = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    job: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M12 12v3"/>',
    settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
    back: '<path d="m14 6-6 6 6 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${paths[name] || paths.shield}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const feedback = '<p id="feedback" class="feedback" role="status" aria-live="polite" hidden></p>';
  const primary = (label, id, type = 'button') => `<button class="button primary" id="${id}" type="${type}"><span>${label}</span>${icon('arrow')}</button>`;
  const field = (id, label, type, autocomplete) => `<div class="field"><label for="${id}">${label}</label><div class="input-wrap"><input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" required>${type === 'password' ? `<button type="button" class="reveal" data-reveal="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">${icon('eye')}</button>` : ''}</div></div>`;

  async function start(surface) {
    const installedManifest=chrome.runtime.getManifest?.();
    if(installedManifest?.version) {
      const build=document.createElement('p');build.className='workspace-build';
      build.textContent='SQC '+(installedManifest.version_name || installedManifest.version);
      document.body.appendChild(build);
    }
    // Keep links to the previous install page working without showing a popup in a browser tab.
    if (surface === 'popup' && new URLSearchParams(location.search).has('setup')) {
      location.replace(chrome.runtime.getURL('onboarding/onboarding.html'));
      return;
    }
    const view = document.getElementById('view');
    const send = message => chrome.runtime.sendMessage(message);
    let config, confirmation, override = '', processing = false, activeTab, portal = null;
    let currentStage = '';

    function notify(message, tone = 'error') {
      const node = document.getElementById('feedback');
      if (!node) return;
      node.textContent = message;
      node.dataset.tone = tone;
      node.hidden = false;
    }
    function busy(value) {
      processing = value;
      view.setAttribute('aria-busy', String(value));
      view.querySelectorAll('button, input, select').forEach(node => { node.disabled = value; });
      view.classList.toggle('is-busy', value);
    }
    async function perform(work) {
      if (processing) return;
      busy(true);
      try { await work(); }
      catch (error) { notify(error.message || 'Something went wrong. Please try again.'); }
      finally { busy(false); }
    }
    async function read(force = false) {
      let result = await send({ type: 'GET_CONFIG', force });
      if (!result?.success) throw new Error(result?.error || 'Unable to load your workspace.');
      portal = null;
      if (result.integration?.applier && !result.integration.passwordChangeRequired && /^https?:\/\//i.test(activeTab?.url || '')) {
        const contextual = await send({ type: 'GET_CONFIG', tabId: activeTab.id, force });
        if (contextual?.integration?.state === 'VERIFIED') { result = contextual; portal = activeTab; }
        else if (contextual?.integration && (!contextual.integration.applier || contextual.integration.passwordChangeRequired)) result = contextual;
      }
      config = result;
      ({ sqcSetupConfirmation: confirmation } = await chrome.storage.local.get('sqcSetupConfirmation'));
      return result;
    }
    function steps(stage) {
      const index = { server: 0, signin: 1, password: 1, profile: 2, unassigned: 2, ready: 3 }[stage];
      if (index == null) return '';
      return `<ol class="steps" aria-label="Setup progress">${['Workspace', 'Sign in', 'Profile', 'Ready'].map((label, n) => `<li class="${n === index ? 'current' : n < index ? 'complete' : ''}" ${n === index ? 'aria-current="step"' : ''}><span>${n < index ? icon('check') : n + 1}</span>${label}</li>`).join('')}</ol>`;
    }
    function heading(eyebrow, title, subtitle, emblem = 'shield') {
      return `<div class="intro"><div class="intro-icon">${icon(emblem)}</div><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1" id="screen-heading">${title}</h1><p class="subtitle">${subtitle}</p></div>`;
    }
    function person(name, subtitle, style = '') {
      return `<div class="person ${style}"><span class="avatar">${escape(initials(name))}</span><span class="person-text"><strong>${escape(name)}</strong><small>${escape(subtitle)}</small></span>${style === 'candidate' ? `<span class="mini-lock">${icon('lock')}Assigned</span>` : ''}</div>`;
    }
    function identity() {
      const i = config.integration;
      return `<div class="identity-stack"><div class="identity-label">SIGNED IN AS</div>${person(i.applier.name, i.applier.email)}<div class="identity-connector"><span></span>${icon('lock')}Synced from ApplyFlow</div><div class="identity-label">YOUR ASSIGNED CANDIDATE</div>${person(config.activeProfile.fullName, config.activeProfile.primaryEmail || config.activeProfile.email || 'Verified candidate profile', 'candidate')}</div>`;
    }
    function shell(stage, content) {
      view.innerHTML = `<div class="workspace-frame ${stage === 'ready' ? 'ready-frame' : ''}">${surface === 'setup' ? steps(stage) : ''}${content}${stage === 'ready' ? '<div class="workspace-actions"><button class="button secondary" id="open-qa">Open application sidebar</button></div>' : ''}</div>`;
      view.setAttribute('aria-busy', 'false');
      view.dataset.stage = stage;
      bind();
      if(stage==='preferences'&&config.settings?.deploymentManaged){view.querySelectorAll('#preferences-form input,#preferences-form button').forEach(input=>{input.disabled=true;});notify('Managed by config/settings.json. Update the JSON and reload the extension to change these settings.','info');}
      if (currentStage && currentStage !== stage) {
        document.getElementById('screen-heading')?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
      currentStage = stage;
    }
    function render() {
      const stage = SQCFlow.stage(config, confirmation);
      if (stage !== 'ready' && override !== 'server' &&
          !(override === 'password' && iCanChangePassword()) && !(override === 'profile' && stage === 'profile')) override = '';
      const screen = override || stage;
      const i = config.integration || {};
      if (surface === 'popup' && stage !== 'ready' && !override) {
        const titles = { server: 'Your workspace starts here.', signin: 'Welcome back.', password: 'Secure your account.', profile: 'Your profile is synced.', unassigned: 'Waiting for your assignment.' };
        shell('launch', `${heading('LET’S GET YOU READY', titles[stage], 'A guided setup connects your account, syncs your candidate, and gets the gatekeeper ready.')}<div class="panel launch-panel"><div class="journey"><span>${icon('check')}Connect workspace</span><span>${icon('user')}Sign in with email &amp; password</span><span>${icon('shield')}Sync your assigned profile</span></div>${feedback}${primary(stage === 'server' ? 'Set up this browser' : 'Continue setup', 'open-setup')}<p class="fine-print">Works even when ApplyFlow is in another Chrome profile.</p></div>`);
        return;
      }
      if (screen === 'server') {
        shell('server', `${heading('YOUR WORKSPACE', 'Let’s connect your workspace.', 'Start with your ApplyFlow server address. We’ll connect your account next.')}<form class="panel" id="server-form"><div class="field"><label for="api-origin">Backend API URL</label><input id="api-origin" type="url" placeholder="https://applyflow-api.jhproit.com" value="${escape(i.apiOrigin || 'https://applyflow-api.jhproit.com')}" autocomplete="url" spellcheck="false" aria-describedby="server-help" required><p class="field-hint" id="server-help">Use the server address supplied by your team.</p></div>${feedback}${primary('Continue to sign in', 'connect', 'submit')}${i.applier ? '<button class="text-button back-button" id="back-workspace" type="button">Keep current connection</button>' : ''}<div class="trust-note">${icon('lock')}Your connection is checked before you sign in.</div></form>`);
      } else if (screen === 'signin') {
        shell('signin', `${heading('SIGN IN SECURELY', 'Your account. This browser.', 'Use your ApplyFlow email and password. Your ApplyFlow website can stay in another Chrome profile.', 'lock')}<form class="panel" id="login-form"><div class="server-chip"><span class="status-dot"></span><span>${escape(i.apiOrigin)}</span><button id="edit-server" class="text-button" type="button">Change</button></div>${field('login-email', 'ApplyFlow email', 'email', 'username')}${field('login-password', 'Password', 'password', 'current-password')}${feedback}${primary('Sign in & sync profile', 'sign-in', 'submit')}<div class="trust-note">${icon('shield')}Your password is sent to your ApplyFlow server and never saved by the extension.</div></form>`);
        if (!['SIGNED_OUT', 'DISCONNECTED'].includes(i.state)) notify(i.message || 'Sign in to continue.');
      } else if (screen === 'password') {
        shell('password', `${heading('ACCOUNT SECURITY', 'Make this account yours.', 'Choose a new password before we prepare your application workspace.', 'lock')}<form class="panel" id="password-form">${field('current-password', 'Current password', 'password', 'current-password')}${field('new-password', 'New password', 'password', 'new-password')}${field('confirm-password', 'Confirm new password', 'password', 'new-password')}${feedback}${primary('Update password', 'change-password', 'submit')}${!i.passwordChangeRequired ? '<button class="text-button back-button" id="back-account" type="button">Back to account</button>' : '<button class="text-button back-button" id="sign-out" type="button">Sign in with a different account</button>'}</form>`);
      } else if (screen === 'profile' || screen === 'unassigned') {
        if (stage === 'unassigned') {
          shell('unassigned', `${heading('ACCOUNT CONNECTED', 'You’re in. Your profile is next.', 'Your account is connected, but your team hasn’t assigned a candidate yet.')}<div class="panel"><div class="server-chip"><span class="status-dot"></span><span>${escape(i.apiOrigin)}</span><button id="edit-server" class="text-button" type="button">Change</button></div>${person(i.applier.name, i.applier.email)}<div class="empty-assignment">${icon('user')}<strong>Waiting for a candidate assignment</strong><p>Ask your ApplyFlow admin to assign a profile. We’ll sync it here.</p></div>${feedback}${primary('Check for assignment', 'refresh')}<button class="text-button back-button" id="sign-out">Use a different account</button></div>`);
        } else {
          shell('profile', `${heading('PROFILE SYNCED', 'The right person. Every time.', 'Your assigned candidate is ready. Review the details before entering your workspace.')}<div class="panel">${identity()}<div class="context-note">${icon('lock')}This assignment is managed by your team in ApplyFlow and stays attached to your account.</div>${feedback}${primary('Continue to workspace', 'confirm-profile')}<button class="text-button back-button" id="sign-out">This isn’t my account</button></div>`);
        }
      } else if (screen === 'account') {
        shell('account', `<button class="text-button back-button top-back" id="back-workspace">${icon('back')}Back to workspace</button>${heading('YOUR ACCOUNT', 'Connected to your team.', 'Your account and candidate assignment are synced from ApplyFlow.', 'user')}<div class="panel">${identity()}<div class="account-server"><span>Workspace server</span><strong>${escape(i.apiOrigin)}</strong></div>${feedback}<div class="account-actions"><button class="button secondary" id="refresh">${icon('refresh')}Sync assignment</button><button class="button secondary" id="password-settings">${icon('lock')}Change password</button><button class="text-button" id="edit-server">Change workspace server</button><button class="text-button danger" id="sign-out">Sign out of this extension</button></div></div>`);
      } else if (screen === 'preferences') {
        shell('preferences', `<button class="text-button back-button top-back" id="back-workspace">${icon('back')}Back to workspace</button>${heading('MAKE IT YOURS', 'Protection preferences.', 'Choose how the gatekeeper supports your applications.', 'settings')}<form class="panel" id="preferences-form"><label class="toggle-row" for="autofill"><span><strong>Autofill verified details</strong><small>Use your assigned candidate on verified applications.</small></span><input class="switch" id="autofill" type="checkbox" ${config.settings?.autoAutofillOnPageLoad !== false ? 'checked' : ''}></label><fieldset class="mode-options"><legend>Validation mode</legend><label class="mode-option"><input type="radio" name="mode" value="active" ${config.settings?.interceptionMode !== 'audit' ? 'checked' : ''}><span><strong>Active gate <em>Recommended</em></strong><small>Resolve blocking issues before submitting.</small></span></label><label class="mode-option"><input type="radio" name="mode" value="audit" ${config.settings?.interceptionMode === 'audit' ? 'checked' : ''}><span><strong>Passive audit</strong><small>Review and record issues without blocking submission.</small></span></label></fieldset><p class="field-hint">Both modes require a verified application assignment.</p>${feedback}${primary('Save preferences', 'save-preferences', 'submit')}</form>`);
      } else {
        const active = Boolean(portal && config.settings?.verifiedContext);
        const mode = config.settings?.interceptionMode === 'audit' ? 'Passive audit' : 'Active gate';
        shell('ready', `<div class="workspace-topline"><span class="online-label"><span class="status-dot"></span>WORKSPACE READY</span><button class="text-button" id="account">${icon('user')}Account</button></div><div class="ready-intro"><div class="ready-shield">${icon('shield')}</div><h1 id="screen-heading" tabindex="-1">${active ? 'Your application is connected.' : 'Ready for your next application.'}</h1><p class="subtitle">${active ? 'Your candidate and job are verified. The live HUD is available on your application tab.' : 'You’re signed in and your candidate is synced. The live HUD will appear when you open a job portal.'}</p></div><div class="hud-preview"><span class="hud-avatar">${escape(initials(config.activeProfile.fullName))}<span class="status-dot"></span></span><strong>${escape(config.activeProfile.fullName)}</strong><span class="hud-status">${active ? 'Verified' : 'Standing by'}</span></div><div class="panel application-panel"><div class="section-label">${icon('job')}${active ? 'CURRENT APPLICATION' : 'APPLICATION MONITOR'}</div>${active ? `<h2>${escape(config.applyFlowContext?.jobTitle || 'Assigned application')}</h2><p class="subtitle">${escape(config.applyFlowContext?.company || '')}</p><span class="verified-note">${icon('check')}Candidate, job &amp; resume verified</span>` : `<div class="waiting-state"><span class="radar">${icon('job')}</span><div><h2>Waiting for an application</h2><p>Open your assigned job in this browser. Protection begins after the job is verified.</p></div></div>`}<div class="session-line"><span>Applier</span><strong>${escape(i.applier.name)}</strong></div><div class="session-line"><span>Protection mode</span><strong>${mode}</strong></div></div>${feedback}<div class="workspace-actions">${active ? primary('Return to application', 'return-portal') : '<button class="button secondary" id="refresh">' + icon('refresh') + 'Refresh assignments</button>'}<button class="button secondary" id="preferences">${icon('settings')}Preferences</button></div><div class="workspace-bottom"><button class="text-button" id="review-profile">View synced profile</button><button class="text-button" id="history">Audit history ${icon('arrow')}</button></div>`);
      }
    }
    function iCanChangePassword() {
      return Boolean(config.integration?.applier && !['SIGNED_OUT', 'FORBIDDEN'].includes(config.integration.state));
    }
    const on = (id, handler, event = 'click') => document.getElementById(id)?.addEventListener(event, handler);
    function navigate(destination) { override = destination; render(); }
    function bind() {
      on('open-setup', () => perform(async () => { const r = await send({ type: 'OPEN_SETUP', tabId: activeTab?.id }); if (!r?.success) throw new Error(r?.error || 'Unable to open setup.'); window.close(); }));
      on('edit-server', () => navigate('server'));
      on('back-workspace', () => navigate(''));
      on('back-account', () => navigate('account'));
      on('account', () => navigate('account'));
      on('review-profile', () => navigate('profile'));
      on('preferences', () => navigate('preferences'));
      on('open-qa', () => perform(async () => {
        if (!Number.isInteger(activeTab?.id)) throw new Error('Open an application tab first.');
        await chrome.sidePanel.open({tabId: activeTab.id});
        if (surface === 'popup') window.close();
      }));
      on('password-settings', () => navigate('password'));
      on('history', () => perform(async () => {
        const result = await send({ type: 'OPEN_OPTIONS', section: 'history' });
        if (!result?.success) throw new Error(result?.error || 'Unable to open audit history.');
      }));
      on('return-portal', () => perform(async () => { await chrome.tabs.update(portal.id, {active: true}); window.close(); }));
      on('refresh', () => perform(async () => {
        notify('Checking ApplyFlow for your latest assignment…', 'info');
        await read(true);
        override = '';
        render();
        const checkedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const stage = SQCFlow.stage(config, confirmation);
        if (stage === 'unassigned') {
          notify(`Checked at ${checkedAt}. ApplyFlow returned no active candidate assignment for this account. Ask your admin to check the assignment.`, 'warning');
        } else if (stage === 'profile' || stage === 'ready') {
          notify(`Checked at ${checkedAt}. ${stage === 'profile' ? 'Your assigned profile is synced. Review the details to continue.' : 'Your account and assigned profile are up to date.'}`, 'success');
        } else {
          notify(config.integration?.message || 'Unable to check your assignment. Please sign in again.');
        }
      }));
      on('confirm-profile', () => perform(async () => {
        // Recheck identity immediately before acknowledgement; local acknowledgement never authorizes a portal action.
        const previousKey = SQCFlow.identityKey(config);
        await read(true);
        if (SQCFlow.stage(config) !== 'profile' || previousKey !== SQCFlow.identityKey(config)) {
          override = ''; render(); notify('Your assignment changed. Review the latest details before continuing.', 'warning'); return;
        }
        confirmation = previousKey;
        await chrome.storage.local.set({sqcSetupConfirmation: confirmation});
        override = ''; render();
      }));
      on('server-form', event => {
        event.preventDefault();
        const apiOrigin = document.getElementById('api-origin').value.trim();
        perform(async () => {
          const r = await send({type: 'SQC_CONNECT', apiOrigin, requireLogin: true});
          if (!r?.success) throw new Error(r?.error || 'Unable to connect to this workspace.');
          config = r; override = ''; render();
          document.getElementById('login-email')?.focus();
        });
      }, 'submit');
      on('login-form', event => {
        event.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        document.getElementById('login-password').value = '';
        perform(async () => {
          const r = await send({type: 'SQC_LOGIN', email, password});
          if (!r?.success || !r.integration?.applier) throw new Error(r?.error || r?.integration?.message || 'Sign-in failed. Try again.');
          config = r; override = ''; confirmation = undefined; render();
        });
      }, 'submit');
      on('sign-out', () => perform(async () => {
        const r = await send({type: 'SQC_LOGOUT'});
        if (!r?.success) throw new Error(r?.error || 'Unable to sign out.');
        await chrome.storage.local.remove('sqcSetupConfirmation');
        confirmation = undefined; config = r; override = ''; render();
        if (r.remoteSignedOut === false) notify('Signed out in this extension. The server could not revoke the session; contact your team if needed.', 'warning');
      }));
      on('password-form', event => {
        event.preventDefault();
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const matching = newPassword === document.getElementById('confirm-password').value;
        ['current-password', 'new-password', 'confirm-password'].forEach(id => { document.getElementById(id).value = ''; });
        if (!matching) { notify('The new passwords don’t match. Please enter them again.'); return; }
        perform(async () => {
          const r = await send({type: 'SQC_CHANGE_PASSWORD', currentPassword, newPassword});
          if (!r?.success) throw new Error(r?.error || 'Unable to update your password.');
          config = r; override = ''; render();
          if (r.integration?.passwordChangeRequired) notify(r.integration.message);
        });
      }, 'submit');
      on('preferences-form', event => {
        event.preventDefault();
        const settings = {autoAutofillOnPageLoad: document.getElementById('autofill').checked, interceptionMode: view.querySelector('[name="mode"]:checked').value};
        perform(async () => {
          const r = await send({type: 'SAVE_SETTINGS', settings});
          if (!r?.success) throw new Error(r?.error || 'Unable to save preferences.');
          await read(); override = ''; render(); notify('Preferences saved.', 'success');
        });
      }, 'submit');
      view.querySelectorAll('[data-reveal]').forEach(button => button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.reveal);
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${input.id === 'login-password' ? 'password' : input.id.replaceAll('-', ' ')}`);
      }));
    }
    async function refreshFromElsewhere(fromStorage = false) {
      if (processing || !config || document.hidden) return;
      if (!fromStorage && (!['ready', 'unassigned'].includes(SQCFlow.stage(config, confirmation)) ||
          override || view.querySelector('input:focus'))) return;
      try { const old = JSON.stringify(config); await read(); if (old !== JSON.stringify(config) || SQCFlow.stage(config, confirmation) !== currentStage) render(); }
      catch (_) { /* Keep the current screen; explicit refresh exposes any connection error. */ }
    }
    try {
      if (surface === 'popup') [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
      else {
        const sourceTabId = new URLSearchParams(location.search).get('tabId');
        if (sourceTabId && /^\d+$/.test(sourceTabId)) {
          try { activeTab = await chrome.tabs.get(Number(sourceTabId)); } catch (_) { /* The original portal may have closed. */ }
        }
      }
      await read(); render();
    } catch (error) {
      shell('error', `${heading('WORKSPACE UNAVAILABLE', 'Let’s try that again.', 'Your extension couldn’t load its connection.')}<div class="panel">${feedback}${primary('Retry', 'retry')}</div>`);
      notify(error.message);
      on('retry', () => location.reload());
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !['sqcConnection', 'sqcSetupConfirmation'].some(key => key in changes)) return;
      setTimeout(() => refreshFromElsewhere(true), 150);
    });
    setInterval(refreshFromElsewhere, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFromElsewhere(); });
  }
  return { start };
})();
