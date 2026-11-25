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
    await openSetup();
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

importScripts('../config/connection.js','../content/context-policy.js', '../content/screening-policy.js', '../content/resume-context.js','../content/candidate-reference.js','../content/portal-availability.js','../content/live-progress.js', 'local-resume.js', 'application-journal.js', 'applyflow-session.js','job-activation.js','portal-availability.js');
const sqcApplyFlow = SQCApplyFlowSession.create({ chrome, fetch: (...args) => fetch(...args), policy: SQCContextPolicy, defaults: DEFAULT_SETTINGS });
const sqcAvailability=globalThis.SQCPortalAvailabilityService?.create({chrome,session:sqcApplyFlow});
const sqcActivator=globalThis.SQCJobActivation?.create({chrome,session:sqcApplyFlow,policy:SQCContextPolicy,onVerified:(tabId,cfg)=>sqcAvailability?.check(tabId,cfg)});
chrome.runtime.onStartup?.addListener(async()=>{
  // Browser tab IDs can be reused. Detach old IDs, preserving exact-page claims
  // for unambiguous restored tabs instead of throwing all recovery away.
  const {sqcApplicationRecovery={}}=await chrome.storage.local.get('sqcApplicationRecovery');
  await chrome.storage.local.set({sqcApplicationRecovery:Object.fromEntries(Object.entries(sqcApplicationRecovery).map(([id,record])=>[id,{...record,browserDetached:true}]))});
  sqcActivator?.activateOpenTabs().catch(()=>{});
});
sqcMigration.then(()=>sqcActivator?.activateOpenTabs()).catch(()=>{});

// In-Memory Tab-Isolated Sessions Map (tabId -> SessionData)
const tabApplyFlowSessions = new Map();
const sqcEvidenceReady = chrome.storage.session.get('sqcEvidence').then(({ sqcEvidence = {} }) => {
  for (const [id, value] of Object.entries(sqcEvidence)) tabApplyFlowSessions.set(Number(id), value);
});

function bindEvidenceContext(config, tabId) {
  const c = config.settings?.verifiedContext;
  if (!tabId || !c) return;
  const key = [c.applicationSessionId, c.applierId, c.profileAssignmentId, c.profileAssignmentVersion, c.profileId, c.profileVersion, c.jobId].join(':');
  if (tabApplyFlowSessions.get(tabId)?.contextKey !== key) {
    const existing=[...tabApplyFlowSessions.values()].find(session=>session.contextKey===key);
    tabApplyFlowSessions.set(tabId, {contextKey:key,screenshots:existing ? structuredClone(existing.screenshots || []) : []});
  }
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
  await sqcAvailability?.clear(tabId);
  await sqcApplyFlow.forgetTab?.(tabId);
  await sqcEvidenceReady;
  tabApplyFlowSessions.delete(tabId);
  await chrome.storage.session.set({ sqcEvidence: compactEvidence() });
});

// Browser navigation events also cover history changes made in the site's main world.
chrome.webNavigation?.onBeforeNavigate?.addListener(details=>{
  if(details.frameId===0)sqcAvailability?.clear(details.tabId).catch(()=>{});
  if(details.frameId===0)sqcApplyFlow.rememberLaunch?.(details.tabId,details.url).catch(()=>{});
});
chrome.webRequest?.onCompleted?.addListener(details=>{sqcAvailability?.network(details).then(()=>sqcActivator?.activate(details.tabId)).catch(()=>{});},{urls:['<all_urls>'],types:['main_frame']});
chrome.webRequest?.onErrorOccurred?.addListener(details=>{sqcAvailability?.network(details).then(()=>sqcActivator?.activate(details.tabId)).catch(()=>{});},{urls:['<all_urls>'],types:['main_frame']});
chrome.tabs.onActivated?.addListener(({tabId})=>{
  sqcActivator?.activate(tabId);
});
chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if(changeInfo.status==='complete')sqcActivator?.activate(tabId);
  if (!changeInfo.url) return;
  sqcApplyFlow.rememberLaunch?.(tabId,changeInfo.url).then(()=>Number.isInteger(tab?.openerTabId)?sqcApplyFlow.inheritTab?.(tab.openerTabId,tabId,changeInfo.url):undefined).then(()=>sqcActivator?.activate(tabId)).catch(()=>{});
  chrome.tabs.sendMessage(tabId, {type:'SQC_ROUTE_CHANGED'}).catch(()=>{});
});
chrome.tabs.onCreated?.addListener(tab=>{
  const url=tab.pendingUrl||tab.url||'';
  sqcApplyFlow.rememberLaunch?.(tab.id,url).then(()=>Number.isInteger(tab.openerTabId)?sqcApplyFlow.inheritTab?.(tab.openerTabId,tab.id,url):undefined).then(()=>sqcActivator?.activate(tab.id)).catch(()=>{});
});
chrome.webNavigation?.onCreatedNavigationTarget?.addListener(details=>{
  sqcApplyFlow.inheritTab?.(details.sourceTabId,details.tabId,details.url).then(()=>sqcActivator?.activate(details.tabId)).catch(()=>{});
});
chrome.webNavigation?.onCommitted?.addListener(details=>{if(details.frameId===0)sqcActivator?.activate(details.tabId);});
chrome.webNavigation?.onHistoryStateUpdated?.addListener(details=>{
  if(details.frameId===0)chrome.tabs.sendMessage(details.tabId,{type:'SQC_ROUTE_CHANGED'}).catch(()=>{});
});

// Message Bus Handler
const sqcSidebarPorts=new Map();
function broadcastSidebarVisibility(windowId){
  const visible=[...sqcSidebarPorts.values()].some(panel=>panel.windowId===windowId&&panel.visible);
  chrome.tabs.query({windowId}).then(tabs=>Promise.all(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'SQC_SIDEBAR_VISIBILITY',visible}).catch(()=>{})))).catch(()=>{});
}
chrome.runtime.onConnect?.addListener(port=>{
  if(port.name!=='sqc-workspace'||port.sender?.url!==chrome.runtime.getURL('sidebar/sidebar.html'))return;
  port.onMessage.addListener(message=>{if(!Number.isInteger(message.windowId))return;const previous=sqcSidebarPorts.get(port);sqcSidebarPorts.set(port,{windowId:message.windowId,visible:message.visible!==false});if(previous&&previous.windowId!==message.windowId)broadcastSidebarVisibility(previous.windowId);broadcastSidebarVisibility(message.windowId);});
  port.onDisconnect.addListener(()=>{const windowId=sqcSidebarPorts.get(port)?.windowId;sqcSidebarPorts.delete(port);if(Number.isInteger(windowId))broadcastSidebarVisibility(windowId);});
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(message.type==='SQC_JOB_ACTIVATION')return;
  if (typeof message.type==='string' && message.type.startsWith('SQC_SIDEBAR_')) return;
  if(message.type==='SQC_LAUNCH_STATUS'&&sender.tab){
    sqcApplyFlow.handle({type:'GET_LAUNCH_STATUS'},sender).then(result=>sendResponse({...result,sidebarVisible:[...sqcSidebarPorts.values()].some(panel=>panel.windowId===sender.tab.windowId&&panel.visible)})).catch(error=>sendResponse({success:false,error:error.message}));return true;
  }
  if (message.type==='OPEN_SQC_SIDEBAR') {
    if(!sender.tab?.id){sendResponse({success:false,error:'Open the workspace from the extension toolbar.'});return;}
    chrome.sidePanel.open(Number.isInteger(sender.tab.windowId)?{windowId:sender.tab.windowId}:{tabId:sender.tab.id}).then(()=>sendResponse({success:true})).catch(error=>sendResponse({success:false,error:error.message}));return true;
  }
  // The dedicated Q&A listener owns these messages and must be the only responder.
  if (typeof (message.type || message.action) === "string" && (message.type || message.action).startsWith("QA_")) return;
  const handler = async () => {
    await sqcMigration;
    await sqcEvidenceReady;
    if(message.type==='SQC_CHECK_PORTAL_AVAILABILITY'&&sender.tab&&sender.frameId!==undefined&&sender.frameId!==0)return {success:false,error:'Only the main job page can request availability checks.'};
    if(message.type==='SQC_CHECK_PORTAL_AVAILABILITY'&&sender.tab){const cfg=await sqcApplyFlow.handle({type:'GET_CONFIG'},{url:sender.tab.url,tab:sender.tab});return {success:true,availability:await sqcAvailability?.check(sender.tab.id,cfg)};}
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
      if(['SQC_LOGIN','SQC_CHANGE_PASSWORD'].includes(message.type)&&integrated.integration?.applier)sqcActivator?.activateOpenTabs().catch(()=>{});
      if(sender.tab&&message.payload?.is_final_submission===true&&['LOG_SUBMISSION','APPLYFLOW_WEBHOOK'].includes(message.action||message.type)){
        try{chrome.runtime.sendMessage?.({type:'SQC_SUBMISSION_CHANGED',tabId:sender.tab.id,windowId:sender.tab.windowId}).catch(()=>{});}catch(_){}
      }
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
        const cachedSession=tabApplyFlowSessions.get(tabId),captureJobId=meta.job_id||meta.jobId||message.jobId||'';
        if(meta.trigger==='QUESTIONS_ANSWERED'&&meta.form_fingerprint&&(!captureJobId||!cachedSession?.jobId||captureJobId===cachedSession.jobId)){
          const previous=cachedSession?.screenshots?.find(shot=>shot.form_fingerprint===meta.form_fingerprint&&shot.page_url?.split('#')[0]===String(meta.page_url||sender.tab?.url||'').split('#')[0]);
          if(previous)return {success:true,duplicate:true,screenshot:previous,screenshots:cachedSession.screenshots};
        }

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
        const stepKey = `${pageUrl.split('#')[0]}::${stepLabel}::${scrollBucket}`;

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
          form_fingerprint:meta.form_fingerprint||'',
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
        const merged=SQCLiveProgress.mergeScreenshots(existingShots,shotItem);
        const trimmedShots=merged.screenshots;

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
          screenshot: merged.screenshot,
          duplicate:merged.duplicate,
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
      sendResponse({ success: false, error: err.message, state: err.state, status:err.status, path:err.path });
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
