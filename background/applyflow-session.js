/* ApplyFlow contract v2. No candidate defaults, URL-selected servers, or local identity overrides. */
(function (root) {
  'use strict';
  function create({ chrome, fetch, policy, screening = root.SQCScreeningPolicy, localResume = root.SQCLocalResume,
    localResumes = localResume?.createStore({session:chrome.storage.session}), defaults = {}, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    let revision = 0;
    let queue = Promise.resolve();
    const resumeFiles = new Map();
    const pendingAnswers = new Map();
    const maxResumeBytes = 10 * 1024 * 1024;
    const forbidden = new Set(['SAVE_PROFILE', 'DELETE_PROFILE', 'ARCHIVE_PROFILE', 'TOGGLE_ARCHIVE_PROFILE',
      'SYNC_DEFAULT_PROFILES', 'SET_ACTIVE_PROFILE', 'ADMIN_UNLOCK_PROFILE', 'ADMIN_TOGGLE_LOCK', 'SAVE_WEBHOOKS']);
    const preferences = ['autoAutofillOnPageLoad', 'detectCaptchaAndAlert', 'autoFillDemographics',
      'autoFillCompensation', 'autoFillCustomQuestions', 'minScreeningLength', 'streamLiveEvents', 'interceptionMode'];
    const privileged = sender => sender.url?.startsWith(chrome.runtime.getURL('')) === true;
    const failure = (state, error, details = {}) => Object.assign(new Error(error), { state, ...details });
    async function request(apiOrigin, path, method = 'GET', body, csrfToken, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, {once:true});
      try {
        if (options.signal?.aborted) throw failure('CANCELLED', 'Answer generation was stopped.');
        const res = await fetch(apiOrigin + path, {
          method, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
            'X-SQC-Extension-Id': chrome.runtime.id,
            ...(csrfToken ? { 'X-SQC-CSRF': csrfToken } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (res.status === 401) {
          await clear();
          throw failure(path === '/api/sqc/login' ? 'INVALID_CREDENTIALS' : 'SIGNED_OUT',
            path === '/api/sqc/login' ? 'Email or password is incorrect.' : 'Sign in with your ApplyFlow email and password.');
        }
        if (res.status === 403) throw failure('FORBIDDEN', `ApplyFlow denied access (HTTP 403 at ${path}). Check your session or assignment permissions.`, {status:403,path});
        let data;
        try { data = await res.json(); }
        catch (_) { throw failure([404,405].includes(res.status)?'HTTP_ROUTE_MISSING':'INVALID_RESPONSE',
          `ApplyFlow returned HTTP ${res.status} at ${path} without a JSON API response. Check that this route is deployed.`,{status:res.status,path}); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('INVALID_RESPONSE',`ApplyFlow returned an invalid JSON object at ${path}.`,{status:res.status,path});
        if (res.status === 409) throw failure('VERSION_MISMATCH', 'The application versions changed. Refresh SQC and try again.');
        if (!res.ok || data.success !== true && !(options.allowWithoutSuccess && data.success === undefined)) {
          const reason=typeof data.error==='string'?data.error:data.error?.message || data.message || 'The backend did not complete this request.';
          const code=data.error?.code || data.code;
          const missing=[404,405].includes(res.status) && (!code || ['NOT_FOUND','ROUTE_NOT_FOUND','METHOD_NOT_ALLOWED'].includes(code));
          throw failure(missing?'HTTP_ROUTE_MISSING':'BACKEND_ERROR',
            ['/api/sqc/login', '/api/sqc/password'].includes(path) ? 'ApplyFlow could not complete this authentication request.' :
              `ApplyFlow HTTP ${res.status} at ${path}${code?' ['+code+']':''}: ${String(reason).slice(0,800)}`,
            {status:res.status,path,backendCode:code});
        }
        return data;
      } catch (error) {
        if (error.state) throw error;
        if (options.signal?.aborted) throw failure('CANCELLED', 'Answer generation was stopped.');
        if (controller.signal.aborted) throw failure('TIMEOUT', 'The request timed out. Please try again.');
        throw failure('UNAVAILABLE', `SQC could not reach ${apiOrigin}${path}. No HTTP response was received. Check the saved endpoint, network, and server access policy.`,{path});
      } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
    }
    async function clear() {
      revision++;
      resumeFiles.clear();
      for (const operation of pendingAnswers.values()) operation.controller.abort();
      await chrome.storage.session.remove(['sqcAuth', 'sqcContexts']);
      try { await localResumes?.clear(); } catch (_) { /* Storage errors must never prevent identity invalidation. */ }
    }
    async function resumeFile(auth, context, force) {
      const file = context.resume.file || {};
      const key = [auth.sessionId, context.applicationSessionId, context.profile.id, context.resume.id, context.resume.version, file.url, file.sha256].join(':');
      if (!force && resumeFiles.has(key)) return resumeFiles.get(key);
      let controller, timer;
      try {
        let dataUrl = file.dataUrl || '';
        let bytes, mime = file.mimeType || '';
        if (!dataUrl && file.url) {
          const url = new URL(file.url, auth.apiOrigin);
          if (url.origin !== auth.apiOrigin || url.username || url.password || url.hash) throw new Error('ApplyFlow must provide a resume download on its configured API origin.');
          controller = new AbortController(); timer = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(url.href, { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
            signal: controller.signal, headers: { Accept: 'application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/msword, text/plain', 'X-SQC-Extension-Id': chrome.runtime.id } });
          if (response.status === 401) throw failure('SIGNED_OUT', 'Your ApplyFlow session expired while downloading the resume. Sign in again.');
          if (!response.ok) throw new Error('ApplyFlow could not deliver the generated resume file.');
          if (Number(response.headers?.get('content-length')) > maxResumeBytes) throw new Error('The generated resume exceeds the 10 MB file limit.');
          const chunks = []; let length = 0;
          if (response.body?.getReader) {
            const reader = response.body.getReader();
            for (;;) { const {done, value} = await reader.read(); if (done) break; length += value.byteLength;
              if (length > maxResumeBytes) { await reader.cancel(); throw new Error('The generated resume exceeds the 10 MB file limit.'); } chunks.push(value); }
            bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          } else bytes = new Uint8Array(await response.arrayBuffer());
          mime ||= (response.headers?.get('content-type') || '').split(';')[0];
        } else if (dataUrl) {
          const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
          if (!match || match[2].length > maxResumeBytes * 1.4) throw new Error('ApplyFlow returned an invalid resume file.');
          mime = match[1]; bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
        } else return {...file, dataUrl: '', error: ''};
        if (!bytes.length || bytes.length > maxResumeBytes) throw new Error('ApplyFlow returned an empty or oversized resume file.');
        if (!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain'].includes(mime)) throw new Error('ApplyFlow must return a PDF, Word document, or text resume.');
        if (file.sha256) {
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2,'0')).join('');
          if (digest !== String(file.sha256).toLowerCase()) throw new Error('The resume file does not match the version verified by ApplyFlow.');
        }
        if (!dataUrl) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); dataUrl = `data:${mime};base64,${btoa(binary)}`; }
        const result = {...file, dataUrl, mimeType: mime, error: ''};
        // Keep binary files out of durable storage and bound the worker's memory cache.
        while (resumeFiles.size >= 3) resumeFiles.delete(resumeFiles.keys().next().value);
        resumeFiles.set(key, result); return result;
      } catch (error) { if (error.state) throw error; return {...file, dataUrl: '', error: error.name === 'AbortError' ? 'The resume download timed out. Refresh to retry.' : error.message}; }
      finally { if (timer) clearTimeout(timer); }
    }
    async function loginChallenge(apiOrigin) {
      const challenge = await request(apiOrigin, '/api/sqc/auth');
      if (challenge.contractVersion !== 2 || !challenge.csrfToken ||
          !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= now()) {
        throw failure('INVALID_CONTEXT', 'ApplyFlow login challenge is invalid or expired.');
      }
      return challenge;
    }
    async function authenticate(apiOrigin, force = false) {
      const { sqcAuth: cached } = await chrome.storage.session.get('sqcAuth');
      if (!force && cached?.apiOrigin === apiOrigin && cached.checkedAt + 30000 > now() && cached.expiresAt > now()) return cached;
      const stamp = revision;
      const data = await request(apiOrigin, '/api/sqc/session');
      const expiresAt = Date.parse(data.session?.expiresAt);
      if (data.contractVersion !== 2 || !data.session?.id || !data.applier?.id || !data.applier?.name ||
          typeof data.applier?.email !== 'string' || !data.applier.email.trim() ||
          !data.csrfToken || !Number.isFinite(expiresAt) || expiresAt <= now()) {
        throw failure('INVALID_CONTEXT', 'ApplyFlow session response is incomplete or expired.');
      }
      const assignment = data.profileAssignment;
      const profile = data.profile;
      if (assignment != null && (!assignment.id || !assignment.version || !assignment.profileId || !assignment.profileVersion || assignment.status !== 'ACTIVE' ||
          assignment.applierId !== data.applier.id || assignment.profileId !== profile?.id ||
          assignment.profileVersion !== profile?.version || profile?.verified !== true || !profile?.fullName)) {
        throw failure('INVALID_CONTEXT', 'ApplyFlow returned an invalid applier profile assignment.');
      }
      if (!assignment && profile) throw failure('INVALID_CONTEXT', 'A profile requires a verified applier assignment.');
      if (stamp !== revision) throw failure('STALE_CONTEXT', 'Connection changed. Retry verification.');
      if (cached && (cached.applier.id !== data.applier.id || cached.sessionId !== data.session.id ||
          cached.assignment?.id !== assignment?.id || cached.assignment?.version !== assignment?.version ||
          cached.profile?.version !== profile?.version || data.session.passwordChangeRequired === true)) {
        await chrome.storage.session.remove('sqcContexts');
      }
      const applier = { id: data.applier.id, name: data.applier.name, email: data.applier.email };
      const auth = { apiOrigin, sessionId: data.session.id, applier, csrfToken: data.csrfToken,
        assignment: assignment || null, profile: assignment ? profile : null,
        passwordChangeRequired: data.session.passwordChangeRequired === true,
        expiresAt, checkedAt: now() };
      await chrome.storage.session.set({ sqcAuth: auth });
      return auth;
    }
    function hints(url) {
      return Object.fromEntries(Object.entries(policy.launchHints(url)).filter(([, value]) => value !== undefined));
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
      const body = { contractVersion: 2, url,
        ...(compatible ? { applicationSessionId: previous.applicationSessionId } : {}), ...requested };
      const stamp = revision;
      const data = await request(auth.apiOrigin, '/api/sqc/application-context', 'POST', body, auth.csrfToken);
      const c = data.context;
      const expiry = Date.parse(c?.expiresAt);
      if (data.contractVersion !== 2 || !c?.applicationSessionId || c.authSessionId !== auth.sessionId ||
          c.applier?.id !== auth.applier.id || c.assignment?.status !== 'ACTIVE' ||
          c.assignment.applierId !== auth.applier.id || c.assignment.profileId !== c.profile?.id ||
          c.assignment.jobId !== c.job?.id || c.profile?.verified !== true || !c.profile?.id ||
          c.profile.id !== auth.assignment?.profileId || c.profile.version !== auth.assignment?.profileVersion ||
          c.assignment.profileAssignmentId !== auth.assignment?.id || c.assignment.profileAssignmentVersion !== auth.assignment?.version ||
          !c.profile?.version || !c.profile?.fullName || !c.job?.id || !c.job?.version ||
          (c.resume !== null && (c.resume?.verified !== true || !c.resume?.id || !c.resume?.version || !c.resume?.text || c.resume.profileId !== c.profile.id ||
          (c.resume.kind === 'tailored' && c.resume.jobId !== c.job.id))) ||
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
    async function config(message, sender, includeResumeFile = true) {
      const stored = await chrome.storage.local.get(['sqcConnection', 'settings']);
      const apiOrigin = stored.sqcConnection?.apiOrigin || '';
      const settings = { ...defaults };
      for (const key of preferences) if (stored.settings?.[key] !== undefined) settings[key] = stored.settings[key];
      Object.assign(settings, { integrationMode: 'applyflow', isProfileLocked: true, allowOverride: false,
        activeProfileId: '', applierId: '', applierName: '', applierEmail: '', activeStackKey: 'auto',
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
        if (stored.sqcConnection.signedOut) throw failure('SIGNED_OUT', 'Sign in with your ApplyFlow email and password.');
        auth = await authenticate(apiOrigin, message.force === true);
        integration = { state: auth.passwordChangeRequired ? 'PASSWORD_CHANGE_REQUIRED' : auth.assignment ? 'AUTHENTICATED' : 'UNASSIGNED',
          message: auth.passwordChangeRequired ? 'Change your temporary password before applying.' : auth.assignment ?
            'Your assigned profile is locked. Open an assigned job from ApplyFlow.' : 'No active candidate profile is assigned to your ApplyFlow account.', apiOrigin,
          applier: auth.applier, profileAssignment: auth.assignment, passwordChangeRequired: auth.passwordChangeRequired, expiresAt: auth.expiresAt };
        let tab = privileged(sender) ? null : sender.tab;
        if (!tab && privileged(sender) && Number.isInteger(message.tabId)) tab = await chrome.tabs.get(message.tabId);
        if (tab && auth.assignment && !auth.passwordChangeRequired) {
          // Every frame is verified against its own URL; the context routes must authorize embedded forms too.
          const url = privileged(sender) ? tab.url : (sender.url || tab.url);
          context = await resolveContext(auth, tab, url, message.force === true);
          let uploaded;
          try { uploaded = await localResumes?.get(tab.id, localResume.binding(auth, context)); } catch (_) { /* The verified base profile remains usable if local document storage is unavailable. */ }
          const baseResume = context.resume;
          // An uploaded document is independent of ApplyFlow's default resume. A linked server copy is not.
          if (uploaded?.source === 'applyflow' && (uploaded.id !== baseResume?.id || uploaded.version !== baseResume?.version ||
              uploaded.file?.sha256 !== baseResume?.file?.sha256)) {
            await localResumes.remove(tab.id); uploaded = null;
          }
          context = {...context, resume: uploaded ? {...uploaded, jobId:context.job.id,
            baseResumeId:baseResume?.id || null,baseResumeVersion:baseResume?.version || null} :
            (baseResume || {id:'none',version:'none',text:'',source:'missing',file:{}})};
          const file = includeResumeFile ? await resumeFile(auth, context, message.force === true) : context.resume.file || {};
          if ((await chrome.tabs.get(tab.id)).url !== tab.url) throw failure('STALE_CONTEXT', 'The job page changed while loading its resume. Retry verification.');
          context = {...context, resume: {...context.resume, file}};
          integration = { ...integration, state: 'VERIFIED', message: 'Assignment verified by ApplyFlow.' };
          settings.verifiedContext = { state: 'VERIFIED', applicationSessionId: context.applicationSessionId,
            profileAssignmentId: auth.assignment.id, profileAssignmentVersion: auth.assignment.version,
            applierId: auth.applier.id, profileId: context.profile.id, jobId: context.job.id,
            profileVersion: context.profile.version, jobVersion: context.job.version, resumeId: context.resume.id,
            resumeSource:context.resume.source || 'applyflow', resumeSha256:context.resume.file?.sha256 || '',
            resumeVersion: context.resume.version, expiresAt: context.expiresAt, allowedRoutes: context.allowedRoutes,
            status: context.status || 'PENDING' };
        }
      } catch (error) {
        context = null; settings.verifiedContext = null;
        if (['SIGNED_OUT', 'FORBIDDEN'].includes(error.state)) { await clear(); auth = null; }
        integration = { state: error.state || 'UNAVAILABLE', message: error.message, apiOrigin,
          ...(auth ? { applier: auth.applier, profileAssignment: auth.assignment,
            passwordChangeRequired: auth.passwordChangeRequired } : {}) };
      }
      settings.applierId = auth?.applier.id || '';
      settings.applierName = auth?.applier.name || '';
      settings.applierEmail = auth?.applier.email || '';
      settings.integrationState = integration.state;
      settings.integrationMessage = integration.message;
      let profile = auth?.profile || null;
      if (context) {
        profile = { ...context.profile, resumeText: context.resume.text, baseResumeText: context.resume.text,
          resumeBase64: context.resume.file?.dataUrl || '',
          resumeFilename: context.resume.file?.filename || '',
          resumeId: context.resume.id, resumeVersion: context.resume.version, resumeJobId: context.resume.jobId || '',
          resumeSource:context.resume.source || 'applyflow',
          resumeBaseId:context.resume.source === 'sqc_upload' ? context.resume.baseResumeId : context.resume.id,
          resumeBaseVersion:context.resume.source === 'sqc_upload' ? context.resume.baseResumeVersion : context.resume.version,
          resumeIsTailored: context.resume.kind === 'tailored' && context.resume.jobId === context.job.id,
          resumeTailoringRequired: true,
          resumeContext:context.resume.facts || root.SQCResumeContext?.parse(context.resume.text) || null,
          resumeSha256: context.resume.file?.sha256 || '', resumeFileError: context.resume.file?.error || '',
          resumeMimeType: context.resume.file?.mimeType || '',
          primaryStackKeywords: (Array.isArray(context.resume.skills) ? context.resume.skills : context.resume.skills?.primaryStackKeywords) || context.profile.primaryStackKeywords || [],
          salaryFloor: context.profile.salaryFloor ?? context.profile.compensation?.salaryFloor,
          desiredSalary: context.profile.desiredSalary ?? context.profile.compensation?.desiredSalary };
      }
      settings.activeProfileId = profile?.id || '';
      return { success: true, settings, activeProfile: profile, profiles: profile ? [profile] : [], integration,
        applyFlowContext: context ? { jobId: context.job.id, jobTitle: context.job.title, company: context.job.company,
          currentStatus: context.status, applier: auth.applier, profileName: profile.fullName } : null };
    }
    async function handleInternal(message, sender) {
      const action = message.action || message.type;
      if (action === 'SQC_AI_STATUS') {
        if (!sender.tab || privileged(sender)) return {success:false,error:'Check AI status from the application Q&A panel.'};
        const cfg=await config({force:true},sender,false);
        const {sqcAuth:auth}=await chrome.storage.session.get('sqcAuth');
        if(!auth || !cfg.integration.applier) return {success:false,error:cfg.integration.message};
        let data,path;
        for (path of ['/api/ai/status','/api/ai/health']) {
          try {data=await request(auth.apiOrigin,path,'GET',undefined,undefined,{allowWithoutSuccess:true});break;}
          catch(error){if(error.state!=='HTTP_ROUTE_MISSING'||path==='/api/ai/health')throw error;}
        }
        const status=data.data || data;
        const ready=status.connected===false || status.configured===false || ['FAILED','ERROR','UNAVAILABLE','UNCONFIGURED'].includes(String(status.status).toUpperCase()) ? false :
          status.connected===true || ['READY','CONNECTED','HEALTHY','OK'].includes(String(status.status).toUpperCase()) ? true : null;
        return {success:true,ready,message:`AI status endpoint reachable. Provider: ${status.provider?.name || status.provider || 'not reported'}; model: ${status.model || 'not reported'}. ${status.message || (ready===false?'ApplyFlow reports the AI provider is not ready. Ask its administrator to check provider/model credentials.':ready===true?'ApplyFlow reports the provider is ready.':'Provider connectivity was not reported; this does not confirm generation works.')}`};
      }
      if (['SQC_SET_LOCAL_RESUME', 'SQC_CLEAR_LOCAL_RESUME', 'SQC_LINK_APPLYFLOW_RESUME'].includes(action)) {
        if (!sender.tab || privileged(sender) || !localResumes) return {success:false,error:'Upload a resume from a verified application HUD.'};
        const cfg = await config({force:true}, sender, false), c = cfg.settings.verifiedContext;
        if (!c) return {success:false,error:cfg.integration.message};
        const assignmentKeys=['applicationSessionId','jobId','jobVersion','profileId','profileVersion','applierId','profileAssignmentId','profileAssignmentVersion'];
        if (assignmentKeys.some(key => !message.context?.[key] || message.context[key] !== c[key]) ||
            action === 'SQC_CLEAR_LOCAL_RESUME' && !screening.same(message.context,c)) {
          return {success:false,error:'The application changed. Reopen the resume manager.'};
        }
        const {sqcAuth:auth, sqcContexts = {}} = await chrome.storage.session.get(['sqcAuth','sqcContexts']);
        let expectedResume;
        if (action === 'SQC_CLEAR_LOCAL_RESUME') await localResumes.remove(sender.tab.id);
        else if (action === 'SQC_LINK_APPLYFLOW_RESUME') {
          const original = sqcContexts[sender.tab.id]?.resume;
          if (original?.verified !== true || original.kind !== 'tailored' || original.jobId !== c.jobId ||
              !/^[a-f0-9]{64}$/i.test(original.file?.sha256 || '')) return {success:false,error:'Sync the job-tailored resume metadata from ApplyFlow before linking its downloaded file.'};
          const file = await resumeFile(auth,{...sqcContexts[sender.tab.id],resume:{...original,file:{...original.file,url:undefined,dataUrl:message.dataUrl}}},true);
          if (!file.dataUrl) return {success:false,error:file.error || 'This file does not match the ApplyFlow resume.'};
          if ((await chrome.tabs.get(sender.tab.id)).url !== sender.tab.url) return {success:false,error:'The job page changed while linking the resume.'};
          expectedResume={...original,source:'applyflow',file};
          await localResumes.put(sender.tab.id,localResume.binding(auth,sqcContexts[sender.tab.id]),expectedResume);
        } else {
          const resume = await localResume.validate(message.resume, cfg.activeProfile);
          expectedResume=resume;
          if ((await chrome.tabs.get(sender.tab.id)).url !== sender.tab.url) return {success:false,error:'The job page changed during upload. Try again.'};
          await localResumes.put(sender.tab.id, localResume.binding(auth, sqcContexts[sender.tab.id]), resume);
        }
        for (const [key, operation] of pendingAnswers) if (key.startsWith(sender.tab.id + ':')) operation.controller.abort();
        const saved = await config({}, sender);
        if (expectedResume && (!saved.activeProfile?.resumeBase64 || saved.activeProfile.resumeId !== expectedResume.id ||
            saved.activeProfile.resumeVersion !== expectedResume.version || saved.activeProfile.resumeSource !== expectedResume.source)) {
          return {success:false,error:'The document was not restored after saving. Reopen the resume manager and retry.'};
        }
        return saved;
      }
      if (action === 'SQC_CONNECT') {
        if (!privileged(sender)) return { success: false, error: 'Configure ApplyFlow from the extension popup.' };
        const apiOrigin = policy.origin(message.apiOrigin);
        const { sqcConnection } = await chrome.storage.local.get('sqcConnection');
        // A new workspace starts with explicit credentials, never an ambient website login.
        const needsLogin = sqcConnection?.apiOrigin !== apiOrigin || message.requireLogin === true || sqcConnection?.signedOut;
        if (needsLogin) await loginChallenge(apiOrigin);
        await clear();
        await chrome.storage.local.set({ sqcConnection: { apiOrigin, ...(needsLogin ? { signedOut: true } : {}) } });
        return config({ force: true, tabId: message.tabId }, sender);
      }
      if (action === 'SQC_LOGIN') {
        if (!privileged(sender)) return { success: false, error: 'Sign in from the extension popup.' };
        const { sqcConnection } = await chrome.storage.local.get('sqcConnection');
        if (!sqcConnection?.apiOrigin) return { success: false, error: 'Connect your ApplyFlow endpoint first.' };
        const email = String(message.email || '').trim();
        const password = typeof message.password === 'string' ? message.password : '';
        try {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) throw failure('INVALID_CREDENTIALS', 'Enter your ApplyFlow email and password.');
          await clear();
          await chrome.storage.local.set({ sqcConnection: { apiOrigin: sqcConnection.apiOrigin, signedOut: true } });
          // The unauthenticated challenge protects the login POST against login CSRF.
          const challenge = await loginChallenge(sqcConnection.apiOrigin);
          await request(sqcConnection.apiOrigin, '/api/sqc/login', 'POST', { email, password }, challenge.csrfToken);
          // Identity and the locked profile must always be fetched from the authenticated session endpoint.
          await chrome.storage.local.set({ sqcConnection: { apiOrigin: sqcConnection.apiOrigin } });
          const result = await config({ force: true, tabId: message.tabId }, sender);
          if (result.integration?.applier && result.integration.applier.email.trim().toLowerCase() !== email.toLowerCase()) {
            await clear();
            await chrome.storage.local.set({ sqcConnection: { apiOrigin: sqcConnection.apiOrigin, signedOut: true } });
            throw failure('CONTEXT_MISMATCH', 'ApplyFlow returned a different signed-in email. Sign in again.');
          }
          return result;
        } finally { message.password = ''; }
      }
      if (action === 'SQC_CHANGE_PASSWORD') {
        if (!privileged(sender)) return { success: false, error: 'Change your password from the extension popup.' };
        const { sqcConnection } = await chrome.storage.local.get('sqcConnection');
        try {
          if (!sqcConnection?.apiOrigin || sqcConnection.signedOut) throw failure('SIGNED_OUT', 'Sign in before changing your password.');
          if (!message.currentPassword || !message.newPassword || message.currentPassword === message.newPassword) {
            throw failure('INVALID_PASSWORD', 'Enter your current password and a different new password.');
          }
          const auth = await authenticate(sqcConnection.apiOrigin, true);
          await request(auth.apiOrigin, '/api/sqc/password', 'POST', {
            currentPassword: message.currentPassword, newPassword: message.newPassword
          }, auth.csrfToken);
          await clear();
          return await config({ force: true, tabId: message.tabId }, sender);
        } finally { message.currentPassword = ''; message.newPassword = ''; }
      }
      if (action === 'SQC_LOGOUT') {
        if (!privileged(sender)) return { success: false, error: 'Sign out from the extension popup.' };
        const { sqcConnection } = await chrome.storage.local.get('sqcConnection');
        let remoteSignedOut = false;
        try {
          if (sqcConnection?.apiOrigin && !sqcConnection.signedOut) {
            const auth = await authenticate(sqcConnection.apiOrigin, true);
            await request(auth.apiOrigin, '/api/sqc/logout', 'POST', {}, auth.csrfToken);
            remoteSignedOut = true;
          }
        } catch (_) { /* Local sign-out must still lock SQC if the server is unavailable. */ }
        finally {
          await clear();
          if (sqcConnection?.apiOrigin) await chrome.storage.local.set({ sqcConnection: { apiOrigin: sqcConnection.apiOrigin, signedOut: true } });
        }
        return { ...(await config({}, sender)), remoteSignedOut };
      }
      if (action === 'SQC_DISCONNECT') {
        if (!privileged(sender)) return { success: false, error: 'Disconnect from the extension popup.' };
        await clear();
        await chrome.storage.local.remove('sqcConnection');
        return { success: true };
      }
      if (action === 'GET_CONFIG') return config(message, sender);
      if (action === 'SQC_PORTAL_ELIGIBILITY') {
        const {sqcContexts = {}, sqcAuth} = await chrome.storage.session.get(['sqcContexts', 'sqcAuth']);
        const url = sender.url || sender.tab?.url;
        // This only decides whether to show the HUD. GET_CONFIG must renew expired leases
        // before any autofill, file attachment, or application action is allowed.
        return {success: true, eligible: Boolean(sqcAuth &&
          Object.values(sqcContexts).some(context => context.authSessionId === sqcAuth.sessionId &&
            policy.matchesUrl(url, context.allowedRoutes)))};
      }
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
          profile_assignment_id: c.profileAssignmentId, profile_assignment_version: c.profileAssignmentVersion,
          job_version: c.jobVersion, resume_id: c.resumeId, resume_version: c.resumeVersion };
        if (Object.entries(expected).some(([key, value]) => payload[key] !== value)) {
          return { success: false, error: 'Application context changed. Refresh SQC before reporting this event.' };
        }
        // Never forward client-specified destinations or identities.
        delete payload.serverUrl; delete payload.sqc_api_url;
        Object.assign(payload, { contractVersion: 2, application_session_id: c.applicationSessionId,
          job_id: c.jobId, profile_id: c.profileId, candidate_id: c.profileId,
          applier_id: c.applierId, applier_name: cfg.integration.applier.name,
          applier_email: cfg.integration.applier.email,
          profile_name: cfg.activeProfile.fullName, profile_assigned: cfg.activeProfile.fullName,
          profile_version: c.profileVersion, job_version: c.jobVersion, resume_id: c.resumeId, resume_version: c.resumeVersion });
        payload.resume_source = cfg.activeProfile.resumeSource;
        payload.resume_sha256 = cfg.activeProfile.resumeSha256;
        payload.base_resume_id = cfg.activeProfile.resumeBaseId;
        payload.base_resume_version = cfg.activeProfile.resumeBaseVersion;
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
    const answerKey = sender => sender.tab?.id + ':' + (sender.frameId || 0);
    const contextIdentity = c => JSON.stringify([screening.stamp(c), c.applierId, c.profileAssignmentId, c.profileAssignmentVersion]);
    async function answerQuestions(message, sender) {
      if (!sender.tab || privileged(sender)) return {success:false,error:'Question answering requires a verified job tab.'};
      const key = answerKey(sender);
      if (pendingAnswers.has(key)) return {success:false,error:'Questions are already being generated for this page.'};
      const operation = {controller:new AbortController(),requestId:message.requestId};
      pendingAnswers.set(key,operation);
      try {
        const snapshot = await serialize(async () => {
          const url = sender.url || sender.tab.url;
          if (message.url !== url || typeof message.requestId !== 'string' || !/^[a-z0-9_-]{8,128}$/i.test(message.requestId)) throw failure('INVALID_REQUEST','Refresh the question fields and try again.');
          const questions = screening.questions(message.questions);
          const cfg = await config({force:true},sender,false), c = cfg.settings.verifiedContext;
          if (!c) throw failure(cfg.integration.state, cfg.integration.message);
          if (!screening.same(message.context,c) || ['applierId','profileAssignmentId','profileAssignmentVersion'].some(key => message.context?.[key] !== c[key])) throw failure('VERSION_MISMATCH','The application changed before generation started. Refresh SQC and try again.');
          if (!cfg.activeProfile.resumeIsTailored) throw failure('TAILORING_REQUIRED','Upload the tailored resume for this application before requesting screening answers.');
          if (!cfg.activeProfile.resumeText) throw failure('RESUME_REQUIRED','Upload a tailored resume or sync one from ApplyFlow before generating answers.');
          const {sqcAuth:auth} = await chrome.storage.session.get('sqcAuth');
          const resumeContext = cfg.activeProfile.resumeSource === 'sqc_upload' ? {
            source:'sqc_upload', verified:false, id:c.resumeId, version:c.resumeVersion, sha256:cfg.activeProfile.resumeSha256,
            filename:cfg.activeProfile.resumeFilename,text:cfg.activeProfile.resumeText,skills:cfg.activeProfile.primaryStackKeywords,
            facts:cfg.activeProfile.resumeContext,
            baseResumeId:cfg.activeProfile.resumeBaseId,baseResumeVersion:cfg.activeProfile.resumeBaseVersion
          } : undefined;
          return {auth,c,url,questions,resumeContext,revision,identity:contextIdentity(c),topUrl:(await chrome.tabs.get(sender.tab.id)).url};
        });
        const payload = {contractVersion:2,...screening.stamp(snapshot.c),requestId:message.requestId,url:snapshot.url,
          ...(snapshot.resumeContext ? {resumeContext:snapshot.resumeContext} : {}),
          questions:snapshot.questions,customInstructions:typeof message.customInstructions==='string' ? message.customInstructions.slice(0,4000) : ''};
        const expected = {...screening.stamp(snapshot.c),requestId:payload.requestId};
        const deadline = now() + 120000;
        const assertCurrent = async () => {
          if (operation.controller.signal.aborted || revision !== snapshot.revision) throw failure('CANCELLED','The account or application changed. Answers were discarded.');
          if ((await chrome.tabs.get(sender.tab.id)).url !== snapshot.topUrl) throw failure('STALE_CONTEXT','The application page changed. Answers were discarded.');
        };
        await assertCurrent();
        const options = () => ({timeoutMs:Math.max(1,Math.min(25000,deadline-now())),signal:operation.controller.signal});
        let result,answerPath;
        for(answerPath of ['/api/sqc/answer-questions','/api/submissions/answer-questions','/api/ai/answer-questions']) {
          try {result=await request(snapshot.auth.apiOrigin,answerPath,'POST',payload,snapshot.auth.csrfToken,options());break;}
          catch(error){if(error.state!=='HTTP_ROUTE_MISSING'||answerPath==='/api/ai/answer-questions')throw error;}
        }
        const validateEnvelope = value => {
          try {screening.envelope(value,expected);}
          catch (_) {throw failure('INCOMPATIBLE_API',`ApplyFlow responded at ${answerPath}, but the response is missing or mismatches the request ID and job/profile/resume versions required by SQC contract v2. Ask the ApplyFlow agent to align this endpoint.`,{path:answerPath});}
        };
        const checkGenerationFailure = value => {
          if (['FAILED','CANCELLED'].includes(String(value.status || '').toUpperCase())) {
            const reason=typeof value.error==='string'?value.error:value.error?.message || value.message || 'Ask the ApplyFlow administrator to check the configured AI provider, model, and credentials.';
            throw failure('GENERATION_FAILED',`ApplyFlow AI generation failed at ${answerPath}: ${String(reason).slice(0,800)}`,{path:answerPath});
          }
        };
        checkGenerationFailure(result);validateEnvelope(result);
        let statusUrl;
        for (let poll=0; ['PENDING','QUEUED','RUNNING'].includes(String(result.status || '').toUpperCase()); poll++) {
          validateEnvelope(result);
          if (poll >= 40 || now() >= deadline) throw failure('TIMEOUT','Answer generation took too long. Please try again.');
          statusUrl = result.statusUrl || statusUrl;
          if (typeof statusUrl !== 'string') throw failure('INVALID_RESPONSE','ApplyFlow did not supply an answer-status URL.');
          const url = new URL(statusUrl,snapshot.auth.apiOrigin);
          if (url.origin !== snapshot.auth.apiOrigin || url.username || url.password || url.hash) throw failure('INVALID_RESPONSE','The answer-status URL must use your saved ApplyFlow server.');
          await sleep(3000); await assertCurrent();
          if (now() >= deadline) throw failure('TIMEOUT','Answer generation took too long. Please try again.');
          result = await request(snapshot.auth.apiOrigin,url.pathname+url.search,'GET',undefined,undefined,options());
          checkGenerationFailure(result);
        }
        await assertCurrent();
        checkGenerationFailure(result);
        const answers = screening.answers(result,expected,snapshot.questions);
        return await serialize(async () => {
          await assertCurrent();
          const current = await config({force:true},sender,false);
          const {sqcAuth:auth} = await chrome.storage.session.get('sqcAuth');
          if (!current.settings.verifiedContext || contextIdentity(current.settings.verifiedContext) !== snapshot.identity || auth?.sessionId !== snapshot.auth.sessionId) throw failure('VERSION_MISMATCH','The assignment or resume changed during generation. Answers were discarded.');
          await assertCurrent();
          return {success:true,contractVersion:2,...expected,answers,meta:{questionsCount:snapshot.questions.length}};
        });
      } finally { if (pendingAnswers.get(key) === operation) pendingAnswers.delete(key); }
    }
    function serialize(work) {
      const result = queue.then(work); queue = result.catch(() => {}); return result;
    }
    // Serialize context updates so concurrent frames, sign-out, and reconnect cannot resurrect stale state.
    function handle(message, sender) {
      const action=message.action || message.type;
      // Generation runs outside the mutation queue so logout and lease refresh stay responsive.
      if (['ANSWER_QUESTIONS','SQC_ANSWER_QUESTIONS'].includes(action)) return answerQuestions(message,sender);
      if (action === 'SQC_CANCEL_QUESTIONS') {
        const operation = pendingAnswers.get(answerKey(sender));
        if (!privileged(sender) && sender.tab && operation?.requestId === message.requestId) operation.controller.abort();
        return Promise.resolve({success:true});
      }
      return serialize(() => handleInternal(message,sender));
    }
    return { handle, clear };
  }
  root.SQCApplyFlowSession = { create };
  if (typeof module !== 'undefined') module.exports = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
