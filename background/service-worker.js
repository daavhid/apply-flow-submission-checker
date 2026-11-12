/**
 * Submission Quality Checker - Background Service Worker
 * Manages candidate profiles, submission audit logs, duplicate checks, and live webhook dispatching.
 */

// Candidate profiles are supplied only by authenticated ApplyFlow context.
const DEFAULT_PROFILES = [];

const DEFAULT_SETTINGS = {
  "applierId": "",
  "activeProfileId": "",
  "activeStackKey": "dotnet",
  "isProfileLocked": true,
  "interceptionMode": "active",
  "allowOverride": false,
  "minScreeningLength": 15,
  "backendWebhookUrl": "",
  "backendApiKey": "",
  "mockBackendSuccess": false,
  "streamLiveEvents": true,
  "autoDuplicateWindowDays": 14,
  "autoDetectJobContext": true,
  "autoAutofillOnPageLoad": true,
  "detectCaptchaAndAlert": true,
  "autoFillDemographics": true,
  "autoFillCompensation": true,
  "autoFillCustomQuestions": true,
  "webhooks": [],
  "integrationMode": "applyflow"
};

// Remove legacy editable identity data during migration; audit history is preserved.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const sqcMigration = chrome.storage.local.remove([
  'profiles', 'latestApplyFlowSession', 'applyflow_api_url', 'manual_api_url', 'appliedJobs', 'duplicateCache'
]);
chrome.runtime.onInstalled.addListener(async details => {
  await sqcMigration;
  const { settings = {} } = await chrome.storage.local.get('settings');
  for (const key of ['activeProfileId', 'applierId', 'applierName', 'adminPasskey', 'backendApiKey', 'webhooks']) delete settings[key];
  await chrome.storage.local.set({ settings: { ...settings, integrationMode: 'applyflow', isProfileLocked: true } });
  if (details.reason === 'install') {
    const { sqcConnection } = await chrome.storage.local.get('sqcConnection');
    if (!sqcConnection?.apiOrigin) await openSetup();
  }
});

async function openSetup(sourceTabId) {
  const base = chrome.runtime.getURL('onboarding/onboarding.html');
  const url = base + (Number.isInteger(sourceTabId) ? '?tabId=' + sourceTabId : '');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url?.split(/[?#]/)[0] === base);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true,
      ...(Number.isInteger(sourceTabId) && existing.url !== url ? { url } : {}) });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
  return { success: true };
}

async function openSettings(section) {
  const base = chrome.runtime.getURL('options/options.html');
  const target = ['account', 'history'].includes(section) ? section : 'preferences';
  const url = base + '#' + target;
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url?.split(/[?#]/)[0] === base);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true, url });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
  return { success: true };
}

importScripts('../content/context-policy.js', 'applyflow-session.js');
const sqcApplyFlow = SQCApplyFlowSession.create({ chrome, fetch: (...args) => fetch(...args), policy: SQCContextPolicy, defaults: DEFAULT_SETTINGS });

// In-Memory Tab-Isolated Sessions Map (tabId -> SessionData)
const tabApplyFlowSessions = new Map();
const sqcEvidenceReady = chrome.storage.session.get('sqcEvidence').then(({ sqcEvidence = {} }) => {
  for (const [id, value] of Object.entries(sqcEvidence)) tabApplyFlowSessions.set(Number(id), value);
});

function bindEvidenceContext(config, tabId) {
  const c = config.settings?.verifiedContext;
  if (!tabId || !c) return;
  const key = [c.applicationSessionId, c.applierId, c.profileAssignmentId, c.profileAssignmentVersion, c.profileId, c.profileVersion, c.jobVersion, c.resumeVersion].join(':');
  if (tabApplyFlowSessions.get(tabId)?.contextKey !== key) tabApplyFlowSessions.set(tabId, { contextKey: key, screenshots: [] });
  config.sessionScreenshots = tabApplyFlowSessions.get(tabId).screenshots || [];
}

function compactEvidence() {
  return Object.fromEntries([...tabApplyFlowSessions].slice(-8).map(([id, session]) => [id, {
    contextKey: session.contextKey,
    screenshots: (session.screenshots || []).slice(-4).map(shot => {
      const { image_url, url, base64, image, screenshot, ...compact } = shot;
      return compact;
    })
  }]));
}

// Clean up tab tracking when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await sqcEvidenceReady;
  tabApplyFlowSessions.delete(tabId);
  await chrome.storage.session.set({ sqcEvidence: compactEvidence() });
});

// Message Bus Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    await sqcMigration;
    await sqcEvidenceReady;
    const integrated = await sqcApplyFlow.handle(message, sender);
    if (integrated !== undefined) {
      if (['SQC_CONNECT', 'SQC_DISCONNECT', 'SQC_LOGIN', 'SQC_LOGOUT', 'SQC_CHANGE_PASSWORD'].includes(message.type)) tabApplyFlowSessions.clear();
      if (integrated.integration?.state === 'SIGNED_OUT') tabApplyFlowSessions.clear();
      bindEvidenceContext(integrated, sender.tab?.id || message.tabId);
      if (message.type === 'GET_CONFIG' && message.tabId && integrated.integration?.state === 'VERIFIED' &&
          sender.url?.startsWith(chrome.runtime.getURL(''))) {
        chrome.tabs.sendMessage(message.tabId, {type: 'SQC_CONTEXT_AVAILABLE'}).catch(() => {});
      }
      if (['SQC_CONNECT', 'SQC_DISCONNECT', 'SQC_LOGIN', 'SQC_LOGOUT', 'SQC_CHANGE_PASSWORD', 'SAVE_SETTINGS', 'SET_INTERCEPTION_MODE'].includes(message.type)) notifyTabsAboutStateChange();
      return integrated;
    }
    // Only extension UI can invoke maintenance commands. Portal scripts get a narrow allowlist.
    const contentActions = new Set(['OPEN_SETUP', 'OPEN_OPTIONS', 'PERSIST_REDIRECT_TRACKING', 'CAPTURE_PAGE_SCREENSHOT', 'GET_SESSION_SCREENSHOTS', 'DELETE_SESSION_SCREENSHOT', 'CLEAR_SESSION_SCREENSHOTS']);
    const isPortalSender = sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''));
    if (isPortalSender && !contentActions.has(message.type)) return { success: false, error: 'Unsupported portal action' };
    if (message.type === 'OPEN_SETUP') return openSetup(isPortalSender ? sender.tab.id : message.tabId);
    if (message.type === 'OPEN_OPTIONS') return openSettings(message.section);
    if (isPortalSender) {
      const verified = await sqcApplyFlow.handle({ type: 'GET_CONFIG' }, sender);
      if (!verified.settings.verifiedContext) return { success: false, error: verified.integration.message };
      bindEvidenceContext(verified, sender.tab.id);
      if (message.type === 'CAPTURE_PAGE_SCREENSHOT') {
        const c = verified.settings.verifiedContext;
        const m = message.meta || {};
        if (m.application_session_id !== c.applicationSessionId || m.profile_version !== c.profileVersion || m.resume_version !== c.resumeVersion) {
          return { success: false, error: 'Screenshot context changed. Refresh the assignment.' };
        }
      }
    }
    const actionType = message.action || message.type;
    switch (actionType) {
      case "PERSIST_REDIRECT_TRACKING": {
        const { data: sessionData } = message;
        if (sessionData && (sessionData.jobId || sessionData.profileId || sessionData.reqId || sessionData.jobTitle)) {
          const tabId = sender.tab?.id;
          const prevSession = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
          
          // Never let an external ATS UUID overwrite a genuine ApplyFlow CUID
          const isApplyFlowCuid = (id) => /^c[a-z0-9]{20,30}$/i.test(String(id || '').trim());
          const incomingIsCuid = isApplyFlowCuid(sessionData.jobId);
          const prevIsCuid = isApplyFlowCuid(prevSession.jobId);

          const isNewJob = Boolean(
            (incomingIsCuid && prevIsCuid && sessionData.jobId !== prevSession.jobId) ||
            (!sessionData.jobId && sessionData.reqId && prevSession.reqId && sessionData.reqId !== prevSession.reqId)
          );
          const base = isNewJob ? {} : prevSession;

          const validTitle = (t) => t && t !== 'Application Role';
          const validCompany = (c) => c && c !== 'Employer';

          // Preserve authentic CUID if incoming is an external ATS slug
          const resolvedJobId = incomingIsCuid
            ? sessionData.jobId
            : (prevIsCuid ? prevSession.jobId : (sessionData.jobId || base.jobId || ''));

          const sessionToSave = {
            ...base,
            ...sessionData,
            jobId: resolvedJobId,
            profileId: sessionData.profileId || base.profileId || '',
            profileName: sessionData.profileName || base.profileName || '',
            applierId: sessionData.applierId || base.applierId || '',
            jobTitle: validTitle(sessionData.jobTitle) ? sessionData.jobTitle : (base.jobTitle || sessionData.jobTitle || ''),
            company: validCompany(sessionData.company) ? sessionData.company : (base.company || sessionData.company || ''),
            reqId: sessionData.reqId || base.reqId || '',
            jdSalary: sessionData.jdSalary?.has_jd_salary ? sessionData.jdSalary : (base.jdSalary || sessionData.jdSalary || null),
            jdText: sessionData.jdText || base.jdText || '',
            savedFormState: sessionData.savedFormState || base.savedFormState || null,
            screenshots: Array.isArray(sessionData.screenshots) ? sessionData.screenshots : (base.screenshots || []),
            sourceUrl: base.sourceUrl || sessionData.sourceUrl || '',
            savedAt: Date.now()
          };
          if (tabId) {
            tabApplyFlowSessions.set(tabId, sessionToSave);
          }
          if (sessionToSave.jobId || sessionToSave.profileId) {
            const { screenshots: _omitShots, ...lightSession } = sessionToSave;
            await chrome.storage.local.set({ latestApplyFlowSession: lightSession });
          }
          return { success: true, session: sessionToSave };
        }
        return { success: false, error: "Invalid session tracking data" };
      }

      case "CAPTURE_PAGE_SCREENSHOT": {
        const meta = message.meta || message;
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        let rawDataUrl = meta.preCapturedDataUrl || message.preCapturedDataUrl || '';

        if (windowId !== undefined) {
          try {
            const activeTabs = await chrome.tabs.query({ active: true, windowId });
            if (activeTabs[0]?.id !== tabId) throw new Error('Job tab is not visible; use a form summary snapshot.');
            const captured = await chrome.tabs.captureVisibleTab(windowId, {
              format: "jpeg",
              quality: 68
            });
            if (captured) {
              rawDataUrl = captured;
            }
          } catch (capErr) {
            console.warn("[SQC Service Worker] captureVisibleTab notice:", capErr.message);
          }
        }

        if (!rawDataUrl) {
          rawDataUrl = meta.preCapturedDataUrl || message.preCapturedDataUrl || '';
        }

        if (!rawDataUrl) {
          return { success: false, error: "No screenshot image captured" };
        }

        const prevSession = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
        const incomingJobId = meta.job_id || meta.jobId || message.jobId || '';
        const incomingReqId = meta.req_id || meta.reqId || message.reqId || '';
        const isNewJob = Boolean(
          (incomingJobId && prevSession.jobId && incomingJobId !== prevSession.jobId) ||
          (!incomingJobId && incomingReqId && prevSession.reqId && incomingReqId !== prevSession.reqId)
        );
        const existingShots = isNewJob ? [] : (Array.isArray(prevSession.screenshots) ? [...prevSession.screenshots] : []);

        const stepLabel = meta.step_label || meta.stepLabel || message.stepLabel || "Application Form";
        const trigger = meta.trigger || message.trigger || "AUTO_CAPTURE";
        const pageUrl = meta.page_url || meta.pageUrl || message.pageUrl || sender.tab?.url || "";
        const scrollBucket = Math.round((Number(meta.scroll_y || message.scrollY) || 0) / 450);
        const answeredCount = Number(meta.answered_count || message.answeredCount) || 0;
        const stepKey = `${pageUrl.split('#')[0]}::${stepLabel}::${scrollBucket}::${trigger}`;

        const shotId = `shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const shotItem = {
          id: shotId,
          step_key: stepKey,
          step_label: stepLabel,
          trigger,
          page_url: pageUrl,
          job_id: incomingJobId || prevSession.jobId || "",
          req_id: incomingReqId || prevSession.reqId || "",
          answered_count: answeredCount,
          total_fields_count: Number(meta.total_fields_count || message.totalFieldsCount) || 0,
          scroll_y: Number(meta.scroll_y || message.scrollY) || 0,
          captured_at: new Date().toISOString(),
          data_url: rawDataUrl,
          image_url: rawDataUrl,
          url: rawDataUrl,
          base64: rawDataUrl,
          image: rawDataUrl,
          screenshot: rawDataUrl
        };

        // Deduplicate by stepKey unless manual snap or final submit
        const existingIdx = existingShots.findIndex(s => s.step_key === stepKey);
        if (existingIdx >= 0 && trigger !== "MANUAL_SNAP" && trigger !== "FINAL_SUBMIT") {
          existingShots[existingIdx] = shotItem;
        } else {
          existingShots.push(shotItem);
        }

        // Keep up to 8 most relevant screenshots per job application
        const trimmedShots = existingShots.slice(-8);

        if (tabId) {
          tabApplyFlowSessions.set(tabId, {
            ...prevSession,
            jobId: incomingJobId || prevSession.jobId || "",
            reqId: incomingReqId || prevSession.reqId || "",
            screenshots: trimmedShots,
            savedAt: Date.now()
          });
        }

        return {
          success: true,
          screenshot: shotItem,
          screenshots: trimmedShots
        };
      }

      case "GET_SESSION_SCREENSHOTS": {
        const tabId = sender.tab?.id;
        const sess = (tabId && tabApplyFlowSessions.has(tabId)) ? tabApplyFlowSessions.get(tabId) : {};
        return {
          success: true,
          screenshots: Array.isArray(sess.screenshots) ? sess.screenshots : []
        };
      }

      case "DELETE_SESSION_SCREENSHOT": {
        const tabId = sender.tab?.id;
        const shotId = message.screenshotId;
        if (tabId && tabApplyFlowSessions.has(tabId)) {
          const sess = tabApplyFlowSessions.get(tabId);
          sess.screenshots = (sess.screenshots || []).filter(s => s.id !== shotId);
          tabApplyFlowSessions.set(tabId, sess);
          return { success: true, screenshots: sess.screenshots };
        }
        return { success: true, screenshots: [] };
      }

      case "CLEAR_SESSION_SCREENSHOTS": {
        const tabId = sender.tab?.id;
        if (tabId && tabApplyFlowSessions.has(tabId)) {
          const sess = tabApplyFlowSessions.get(tabId);
          sess.screenshots = [];
          tabApplyFlowSessions.set(tabId, sess);
        }
        return { success: true, screenshots: [] };
      }

      case "GET_HISTORY": {
        const { submissionsHistory = [] } = await chrome.storage.local.get("submissionsHistory");
        return { success: true, history: submissionsHistory };
      }

      case "CLEAR_HISTORY": {
        await chrome.storage.local.set({ submissionsHistory: [], duplicateCache: {} });
        return { success: true };
      }

      case "TEST_BACKEND_PING": {
        const { url, apiKey } = message;
        if (!url) return { success: false, error: "No URL provided" };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
              },
              body: JSON.stringify({ ping: true, timestamp: new Date().toISOString() }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok || res.status === 200 || res.status === 201 || res.status === 204) {
              return { success: true, status: res.status, statusText: `Online (HTTP ${res.status} ${res.statusText || 'OK'})` };
            }

            // If endpoint is reachable but returned 400/404/405, the host server is alive
            if (res.status === 400 || res.status === 404 || res.status === 405) {
              return { success: true, status: res.status, statusText: `Server Online (HTTP ${res.status})` };
            }

            return { success: false, status: res.status, error: `HTTP ${res.status}: ${res.statusText || 'Error'}` };
          } catch (postErr) {
            clearTimeout(timeoutId);
            // Fallback: Check if origin server or /api/health is up
            try {
              const origin = new URL(url).origin;
              const hRes = await fetch(`${origin}/api/health`, { method: "GET" });
              if (hRes.ok) {
                return { success: true, status: 200, statusText: `Online on ${origin} (/api/health)` };
              }
            } catch (_) {}

            try {
              const origin = new URL(url).origin;
              const rRes = await fetch(origin, { method: "GET" });
              if (rRes.ok || rRes.status < 500) {
                return { success: true, status: rRes.status, statusText: `Online on ${origin}` };
              }
            } catch (_) {}

            return { success: false, error: postErr.message || 'Endpoint unreachable' };
          }
        } catch (err) {
          return { success: false, error: err.message || 'Endpoint unreachable' };
        }
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  };

  handler()
    .then(async result => {
      await chrome.storage.session.set({ sqcEvidence: compactEvidence() });
      sendResponse(result);
    })
    .catch(async err => {
      if (['SQC_LOGIN', 'SQC_LOGOUT', 'SQC_CHANGE_PASSWORD'].includes(message.type)) {
        tabApplyFlowSessions.clear();
        await chrome.storage.session.remove('sqcEvidence');
        notifyTabsAboutStateChange();
      }
      sendResponse({ success: false, error: err.message, state: err.state });
    });

  return true; // Keep message channel open for async response
});

function notifyTabsAboutStateChange() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED" }).catch(() => {
          // Tab might not have content script injected
        });
      }
    });
  });
}
