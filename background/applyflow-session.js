/* ApplyFlow contract v1. No candidate defaults, URL-selected servers, or local identity overrides. */
(function (root) {
  'use strict';
  function create({ chrome, fetch, policy, defaults = {}, now = Date.now }) {
    let revision = 0;
    let queue = Promise.resolve();
    const forbidden = new Set(['SAVE_PROFILE', 'DELETE_PROFILE', 'ARCHIVE_PROFILE', 'TOGGLE_ARCHIVE_PROFILE',
      'SYNC_DEFAULT_PROFILES', 'SET_ACTIVE_PROFILE', 'ADMIN_UNLOCK_PROFILE', 'ADMIN_TOGGLE_LOCK', 'SAVE_WEBHOOKS']);
    const preferences = ['autoAutofillOnPageLoad', 'detectCaptchaAndAlert', 'autoFillDemographics',
      'autoFillCompensation', 'autoFillCustomQuestions', 'minScreeningLength', 'streamLiveEvents', 'interceptionMode'];
    const privileged = sender => sender.url?.startsWith(chrome.runtime.getURL('')) === true;
    const failure = (state, error) => Object.assign(new Error(error), { state });
    async function request(apiOrigin, path, method = 'GET', body, csrfToken) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(apiOrigin + path, {
          method, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
            'X-SQC-Extension-Id': chrome.runtime.id,
            ...(csrfToken ? { 'X-SQC-CSRF': csrfToken } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (res.status === 401) { await clear(); throw failure('SIGNED_OUT', 'Sign in to ApplyFlow, then reconnect SQC.'); }
        if (res.status === 403) throw failure('FORBIDDEN', 'ApplyFlow denied access. Refresh your assignment.');
        const data = await res.json();
        if (!res.ok || data.success !== true) throw failure('UNAVAILABLE', data.error?.message || 'ApplyFlow could not verify this request.');
        return data;
      } catch (error) {
        if (error.state) throw error;
        throw failure('UNAVAILABLE', 'ApplyFlow is unreachable or returned an invalid response.');
      } finally { clearTimeout(timer); }
    }
    async function clear() {
      revision++;
      await chrome.storage.session.remove(['sqcAuth', 'sqcContexts']);
    }
    async function authenticate(apiOrigin, force = false) {
      const { sqcAuth: cached } = await chrome.storage.session.get('sqcAuth');
      if (!force && cached?.apiOrigin === apiOrigin && cached.checkedAt + 30000 > now() && cached.expiresAt > now()) return cached;
      const stamp = revision;
      const data = await request(apiOrigin, '/api/sqc/session');
      const expiresAt = Date.parse(data.session?.expiresAt);
      if (data.contractVersion !== 1 || !data.session?.id || !data.applier?.id || !data.applier?.name ||
          !data.csrfToken || !Number.isFinite(expiresAt) || expiresAt <= now()) {
        throw failure('INVALID_CONTEXT', 'ApplyFlow session response is incomplete or expired.');
      }
      if (stamp !== revision) throw failure('STALE_CONTEXT', 'Connection changed. Retry verification.');
      if (cached && (cached.applier.id !== data.applier.id || cached.sessionId !== data.session.id)) {
        await chrome.storage.session.remove('sqcContexts');
      }
      const auth = { apiOrigin, sessionId: data.session.id, applier: data.applier, csrfToken: data.csrfToken,
        expiresAt, checkedAt: now() };
      await chrome.storage.session.set({ sqcAuth: auth });
      return auth;
    }
    function hints(url) {
      return policy.launchHints(url);
    }
    async function resolveContext(auth, tab, url, force) {
      const { sqcContexts = {} } = await chrome.storage.session.get('sqcContexts');
      let previous = sqcContexts[tab.id];
      const requested = hints(url);
      // Only explicit launch identifiers or an exact backend-authorized route can carry an assignment.
      const compatible = previous?.authSessionId === auth.sessionId && policy.matchesUrl(url, previous.allowedRoutes) &&
        (!requested.applicationSessionId || requested.applicationSessionId === previous.applicationSessionId) &&
        (!requested.jobId || requested.jobId === previous.job.id) && (!requested.profileId || requested.profileId === previous.profile.id);
      if (compatible && !force && previous.checkedAt + 30000 > now() && previous.expiresAt > now()) return previous;
      delete sqcContexts[tab.id];
      await chrome.storage.session.set({ sqcContexts });
      const body = { contractVersion: 1, url,
        ...(compatible ? { applicationSessionId: previous.applicationSessionId } : {}), ...requested };
      const stamp = revision;
      const data = await request(auth.apiOrigin, '/api/sqc/application-context', 'POST', body, auth.csrfToken);
      const c = data.context;
      const expiry = Date.parse(c?.expiresAt);
      if (data.contractVersion !== 1 || !c?.applicationSessionId || c.authSessionId !== auth.sessionId ||
          c.applier?.id !== auth.applier.id || c.assignment?.status !== 'ACTIVE' ||
          c.assignment.applierId !== auth.applier.id || c.assignment.profileId !== c.profile?.id ||
          c.assignment.jobId !== c.job?.id || c.profile?.verified !== true || !c.profile?.id ||
          !c.profile?.version || !c.profile?.fullName || !c.job?.id || !c.job?.version ||
          c.resume?.verified !== true || !c.resume?.id || !c.resume?.version || !c.resume?.text || c.resume.profileId !== c.profile.id ||
          !Number.isFinite(expiry) || expiry <= now() || !policy.matchesUrl(url, c.allowedRoutes) ||
          (requested.applicationSessionId && requested.applicationSessionId !== c.applicationSessionId) ||
          (requested.jobId && requested.jobId !== c.job.id) || (requested.profileId && requested.profileId !== c.profile.id)) {
        throw failure('CONTEXT_MISMATCH', 'ApplyFlow could not verify the candidate, job, resume, and applier assignment.');
      }
      if (stamp !== revision) throw failure('STALE_CONTEXT', 'Connection changed. Retry verification.');
      // Recheck the tab after an asynchronous request; never install an old response into a new page.
      const currentTab = await chrome.tabs.get(tab.id);
      if (currentTab.url !== tab.url) throw failure('STALE_CONTEXT', 'The job page changed during verification. Retry.');
      previous = { ...c, checkedAt: now(), expiresAt: Math.min(expiry, auth.expiresAt, now() + 60000) };
      const latest = await chrome.storage.session.get('sqcContexts');
      await chrome.storage.session.set({ sqcContexts: { ...(latest.sqcContexts || {}), [tab.id]: previous } });
      return previous;
    }
    async function config(message, sender) {
      const stored = await chrome.storage.local.get(['sqcConnection', 'settings']);
      const apiOrigin = stored.sqcConnection?.apiOrigin || '';
      const settings = { ...defaults };
      for (const key of preferences) if (stored.settings?.[key] !== undefined) settings[key] = stored.settings[key];
      Object.assign(settings, { integrationMode: 'applyflow', isProfileLocked: true, allowOverride: false,
        activeProfileId: '', applierId: '', applierName: '', activeStackKey: 'auto',
        mockBackendSuccess: false, webhooks: [], backendApiKey: '',
        backendWebhookUrl: apiOrigin ? apiOrigin + '/api/submissions/webhook' : '',
        verifiedContext: null });
      let auth = null, context = null;
      let integration = { state: 'DISCONNECTED', message: 'Connect SQC to ApplyFlow using the extension popup.', apiOrigin };
      try {
        if (!apiOrigin) {
          settings.integrationState = integration.state;
          settings.integrationMessage = integration.message;
          return { success: true, settings, profiles: [], activeProfile: null, integration };
        }
        auth = await authenticate(apiOrigin, message.force === true);
        integration = { state: 'AUTHENTICATED', message: 'Open an assigned job from ApplyFlow.', apiOrigin,
          applier: auth.applier, expiresAt: auth.expiresAt };
        let tab = privileged(sender) ? null : sender.tab;
        if (!tab && privileged(sender) && Number.isInteger(message.tabId)) tab = await chrome.tabs.get(message.tabId);
        if (tab) {
          // Every frame is verified against its own URL; the context routes must authorize embedded forms too.
          const url = privileged(sender) ? tab.url : (sender.url || tab.url);
          context = await resolveContext(auth, tab, url, message.force === true);
          integration = { ...integration, state: 'VERIFIED', message: 'Assignment verified by ApplyFlow.' };
          settings.verifiedContext = { state: 'VERIFIED', applicationSessionId: context.applicationSessionId,
            applierId: auth.applier.id, profileId: context.profile.id, jobId: context.job.id,
            profileVersion: context.profile.version, jobVersion: context.job.version, resumeId: context.resume.id,
            resumeVersion: context.resume.version, expiresAt: context.expiresAt, allowedRoutes: context.allowedRoutes,
            status: context.status || 'PENDING' };
        }
      } catch (error) {
        if (['SIGNED_OUT', 'FORBIDDEN'].includes(error.state)) await clear();
        integration = { state: error.state || 'UNAVAILABLE', message: error.message, apiOrigin,
          ...(auth ? { applier: auth.applier } : {}) };
      }
      settings.applierId = auth?.applier.id || '';
      settings.applierName = auth?.applier.name || '';
      settings.integrationState = integration.state;
      settings.integrationMessage = integration.message;
      let profile = null;
      if (context) {
        profile = { ...context.profile, resumeText: context.resume.text, baseResumeText: context.resume.text,
          resumeBase64: context.resume.file?.dataUrl || '',
          resumeFilename: context.resume.file?.filename || '',
          primaryStackKeywords: context.profile.primaryStackKeywords || [],
          salaryFloor: context.profile.salaryFloor ?? context.profile.compensation?.salaryFloor,
          desiredSalary: context.profile.desiredSalary ?? context.profile.compensation?.desiredSalary };
        settings.activeProfileId = profile.id;
      }
      return { success: true, settings, activeProfile: profile, profiles: profile ? [profile] : [], integration,
        applyFlowContext: context ? { jobId: context.job.id, jobTitle: context.job.title, company: context.job.company,
          currentStatus: context.status, applier: auth.applier, profileName: profile.fullName } : null };
    }
    async function handleInternal(message, sender) {
      const action = message.action || message.type;
      if (action === 'SQC_CONNECT') {
        if (!privileged(sender)) return { success: false, error: 'Configure ApplyFlow from the extension popup.' };
        const apiOrigin = policy.origin(message.apiOrigin);
        await clear();
        await chrome.storage.local.set({ sqcConnection: { apiOrigin } });
        return config({ force: true, tabId: message.tabId }, sender);
      }
      if (action === 'SQC_DISCONNECT') {
        if (!privileged(sender)) return { success: false, error: 'Disconnect from the extension popup.' };
        await clear();
        await chrome.storage.local.remove('sqcConnection');
        return { success: true };
      }
      if (action === 'GET_CONFIG') return config(message, sender);
      if (forbidden.has(action)) return { success: false, isLocked: true, error: 'Candidate and applier assignments are managed in ApplyFlow.' };
      if (action === 'SAVE_SETTINGS' || action === 'SET_INTERCEPTION_MODE') {
        if (!privileged(sender)) return { success: false, error: 'Change preferences in extension settings.' };
        const stored = await chrome.storage.local.get('settings');
        const saved = stored.settings || {};
        const incoming = action === 'SET_INTERCEPTION_MODE' ? { interceptionMode: message.mode } : message.settings || {};
        for (const key of preferences) if (incoming[key] !== undefined) saved[key] = incoming[key];
        await chrome.storage.local.set({ settings: saved });
        return config({}, sender);
      }
      if (action === 'FETCH_APPLYFLOW_CONTEXT' || action === 'CHECK_DUPLICATE_JOB' || action === 'CHECK_DUPLICATE') {
        const cfg = await config({}, sender);
        if (!cfg.settings.verifiedContext) return { success: false, error: cfg.integration.message };
        if (action === 'FETCH_APPLYFLOW_CONTEXT') return { success: true, data: cfg.applyFlowContext };
        const applied = ['SUBMITTED', 'APPLIED', 'ALREADY_APPLIED'].includes(cfg.applyFlowContext.currentStatus);
        return { success: true, already_applied: applied, has_applied: applied, can_apply: !applied,
          existingRecord: applied ? cfg.applyFlowContext : null };
      }
      if (['LOG_SUBMISSION', 'APPLYFLOW_WEBHOOK', 'DISPATCH_LIVE_FEEDBACK'].includes(action)) {
        if (!sender.tab || privileged(sender)) return { success: false, error: 'Application events require a verified job tab.' };
        const cfg = await config({ force: true }, sender);
        const c = cfg.settings.verifiedContext;
        if (!c) return { success: false, error: cfg.integration.message };
        const { sqcAuth: auth } = await chrome.storage.session.get('sqcAuth');
        const payload = { ...(message.payload || {}) };
        const expected = { application_session_id: c.applicationSessionId, profile_version: c.profileVersion,
          job_version: c.jobVersion, resume_id: c.resumeId, resume_version: c.resumeVersion };
        if (Object.entries(expected).some(([key, value]) => payload[key] !== value)) {
          return { success: false, error: 'Application context changed. Refresh SQC before reporting this event.' };
        }
        // Never forward client-specified destinations or identities.
        delete payload.serverUrl; delete payload.sqc_api_url;
        Object.assign(payload, { contractVersion: 1, application_session_id: c.applicationSessionId,
          job_id: c.jobId, profile_id: c.profileId, candidate_id: c.profileId,
          applier_id: c.applierId, applier_name: cfg.integration.applier.name,
          profile_name: cfg.activeProfile.fullName, profile_assigned: cfg.activeProfile.fullName,
          profile_version: c.profileVersion, job_version: c.jobVersion, resume_id: c.resumeId, resume_version: c.resumeVersion });
        payload.extracted_data = { ...(payload.extracted_data || {}), job_id: c.jobId, profile_id: c.profileId,
          applier_id: c.applierId, job_url: sender.url || sender.tab.url };
        const live = action === 'DISPATCH_LIVE_FEEDBACK';
        if (live && cfg.settings.streamLiveEvents === false) return { success: true, skipped: true };
        payload.event_id = typeof payload.event_id === 'string' ? payload.event_id : crypto.randomUUID();
        const endpoint = live ? '/api/submissions/live-event' : '/api/submissions/webhook';
        const result = await request(auth.apiOrigin, endpoint, 'POST', payload, auth.csrfToken);
        if (result.applicationSessionId !== c.applicationSessionId || result.eventId !== payload.event_id || result.accepted !== true) {
          return { success: false, error: 'ApplyFlow did not acknowledge this application event.' };
        }
        if (!live) {
          const { submissionsHistory = [] } = await chrome.storage.local.get('submissionsHistory');
          const localRecord = { ...payload, screenshot: '', screenshot_url: '', screenshots: [],
            extracted_data: { ...payload.extracted_data, screenshots: [] } };
          await chrome.storage.local.set({ submissionsHistory: [{ ...localRecord, delivery_status: 'ACKNOWLEDGED',
            id: result.recordId, timestamp: new Date(now()).toISOString() }, ...submissionsHistory].slice(0, 50) });
        }
        return { success: true, data: result, recordId: result.recordId };
      }
      return undefined;
    }
    // Serialize context updates so concurrent frames, sign-out, and reconnect cannot resurrect stale state.
    function handle(message, sender) {
      const work = queue.then(() => handleInternal(message, sender));
      queue = work.catch(() => {});
      return work;
    }
    return { handle, clear };
  }
  root.SQCApplyFlowSession = { create };
  if (typeof module !== 'undefined') module.exports = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
