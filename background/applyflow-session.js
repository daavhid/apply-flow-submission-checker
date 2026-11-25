/* ApplyFlow contract v2. No candidate defaults, URL-selected servers, or local identity overrides. */
(function (root) {
  'use strict';
  function create({ chrome, fetch, policy, screening = root.SQCScreeningPolicy, localResume = root.SQCLocalResume,
    localResumes = localResume?.createStore({session:chrome.storage.session}), deployment=root.SQCDeployment, defaults = {}, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    let revision = 0;
    let queue = Promise.resolve();
    const resumeFiles = new Map();
    const pendingAnswers = new Map();
    const contextConflicts=new Map();
    const maxResumeBytes = 10 * 1024 * 1024;
    const journal=root.SQCApplicationJournal?.create({store:chrome.storage.session,now});
    const forbidden = new Set(['SAVE_PROFILE', 'DELETE_PROFILE', 'ARCHIVE_PROFILE', 'TOGGLE_ARCHIVE_PROFILE',
      'SYNC_DEFAULT_PROFILES', 'SET_ACTIVE_PROFILE', 'ADMIN_UNLOCK_PROFILE', 'ADMIN_TOGGLE_LOCK', 'SAVE_WEBHOOKS']);
    const preferences = ['autoAutofillOnPageLoad', 'detectCaptchaAndAlert', 'autoFillDemographics',
      'autoFillCompensation', 'autoFillCustomQuestions', 'minScreeningLength', 'streamLiveEvents', 'interceptionMode'];
    const privileged = sender => sender.url?.startsWith(chrome.runtime.getURL('')) === true;
    const failure = (state, error, details = {}) => Object.assign(new Error(error), { state, ...details });
    const pageIdentity=value=>{try{const u=new URL(value),out=new URL(u.origin+u.pathname);for(const name of ['ashby_jid','gh_jid','job','jobId','job_id','reqId','reqid','positionId','position_id'])if(u.searchParams.has(name))out.searchParams.set(name,u.searchParams.get(name));if(/(?:^|\.)greenhouse\.io$/.test(u.hostname)&&u.searchParams.has('token'))out.searchParams.set('token',u.searchParams.get('token'));return out.href;}catch(_){return '';}};
    const reloadPage=value=>{try{const u=new URL(value);if(Object.keys(hints(value)).length)u.hash='';return u.href;}catch(_){return '';}};
    async function saveRecovery(tab,context,auth,url){
      const {sqcApplicationRecovery={}}=await chrome.storage.local.get('sqcApplicationRecovery');
      const prior=sqcApplicationRecovery[tab.id],same=prior?.hints.applicationSessionId===context.applicationSessionId&&prior?.applierId===auth.applier.id&&prior?.apiOrigin===auth.apiOrigin;
      sqcApplicationRecovery[tab.id]={hints:{applicationSessionId:context.applicationSessionId,jobId:context.job.id,profileId:context.profile.id},applierId:auth.applier.id,apiOrigin:auth.apiOrigin,updatedAt:now(),
        pages:[...new Set([...(same?prior.pages:[]),reloadPage(tab.url),reloadPage(url)])].filter(Boolean).slice(-30)};
      await chrome.storage.local.set({sqcApplicationRecovery});
    }
    async function restoreRecovery(tab,url,auth){
      const {sqcApplicationRecovery={}}=await chrome.storage.local.get('sqcApplicationRecovery');
      const belongs=record=>record?.apiOrigin===auth.apiOrigin&&record.applierId===auth.applier.id;
      const own=sqcApplicationRecovery[tab.id];
      if(belongs(own)&&!own.browserDetached)return {...own,retainedFromDisk:true};
      // Restored tabs may have new IDs. Match exact observed pages, never a
      // shared domain or the globally last application/candidate.
      const matches=Object.entries(sqcApplicationRecovery).filter(([,record])=>belongs(record)&&record.browserDetached&&record.pages?.some(page=>page===reloadPage(tab.url)||page===reloadPage(url))).map(([id,record])=>({...record,sourceTabId:Number(id)}));
      const identities=new Set(matches.map(record=>JSON.stringify(record.hints)));
      return identities.size===1?{...matches[0],browserDetached:false,retainedFromDisk:true}:null;
    }
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
          if(!['/api/sqc/session','/api/sqc/login'].includes(path))throw failure('REQUEST_UNAUTHORIZED',`ApplyFlow rejected this request (HTTP 401 at ${path}). Your account session is checked separately.`,{status:401,path});
          await clear(true); // Expired authorization must not erase bound recovery IDs.
          const {sqcConnection}=await chrome.storage.local.get('sqcConnection');
          if(sqcConnection?.apiOrigin===apiOrigin)await chrome.storage.local.set({sqcConnection:{apiOrigin,signedOut:true}});
          throw failure(path === '/api/sqc/login' ? 'INVALID_CREDENTIALS' : 'SIGNED_OUT',
            path === '/api/sqc/login' ? 'Email or password is incorrect.' : 'Sign in with your ApplyFlow email and password.');
        }
        if (res.status === 403) throw failure('FORBIDDEN', `ApplyFlow denied access (HTTP 403 at ${path}). Check your session or assignment permissions.`, {status:403,path});
        let data;
        try { data = await res.json(); }
        catch (_) { throw failure([404,405].includes(res.status)?'HTTP_ROUTE_MISSING':'INVALID_RESPONSE',
          `ApplyFlow returned HTTP ${res.status} at ${path} without a JSON API response. Check that this route is deployed.`,{status:res.status,path}); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('INVALID_RESPONSE',`ApplyFlow returned an invalid JSON object at ${path}.`,{status:res.status,path});
        if (res.status === 409) {
          const detail=data.error&&typeof data.error==='object'?data.error:data;
          const code=String(detail.code||data.code||'CONFLICT').slice(0,100);
          const reason=typeof data.error==='string'?data.error:detail.message||data.message||'ApplyFlow reported a conflict without a detailed explanation.';
          const fields=detail.fields||detail.details?.fields||data.fields;
          const versions=value=>Object.fromEntries(['jobVersion','profileVersion','resumeVersion','profileAssignmentVersion'].filter(key=>['string','number'].includes(typeof value?.[key])).map(key=>[key,String(value[key]).slice(0,100)]));
          throw failure(/^(?:(?:JOB|PROFILE|RESUME|ASSIGNMENT)_)?VERSION_MISMATCH$/.test(code)?'VERSION_MISMATCH':'BACKEND_CONFLICT',`ApplyFlow HTTP 409 at ${path} [${code}]: ${['/api/sqc/login','/api/sqc/password'].includes(path)?'ApplyFlow could not complete this authentication request.':String(reason).slice(0,800)}`,
            {status:409,path,backendCode:code,validationFields:Array.isArray(fields)?fields.map(field=>typeof field==='string'?field:field?.field||field?.path).filter(value=>typeof value==='string').slice(0,30):[],
              expectedVersions:versions(detail.expectedVersions||detail.details?.expectedVersions||data.expectedVersions),currentVersions:versions(detail.currentVersions||detail.details?.currentVersions||data.currentVersions)});
        }
        if (!res.ok || data.success !== true && !(options.allowWithoutSuccess && data.success === undefined) &&
            !(options.allowGenerationFailure && ['FAILED','CANCELLED'].includes(String(data.status || '').toUpperCase()))) {
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
    async function clear(keepLaunchHints = false) {
      revision++;
      resumeFiles.clear();
      for (const operation of pendingAnswers.values()) operation.controller.abort();
      await chrome.storage.session.remove(['sqcAuth', 'sqcContexts', 'sqcTabBindings','sqcApplicationAnswers','sqcDuplicateAcknowledgements','sqcPortalAvailability','sqcPortalNetwork']);
      contextConflicts.clear();
      if (!keepLaunchHints) {await chrome.storage.session.remove('sqcLaunchHints');await chrome.storage.local.remove('sqcApplicationRecovery');}
      if(!keepLaunchHints)try { await localResumes?.clear(); } catch (_) { /* Storage errors must never prevent identity invalidation. */ }
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
          if (response.status === 401) throw new Error('ApplyFlow denied access to the saved resume file (HTTP 401). Your account remains connected. Refresh the resume or upload its original file.');
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
      let profile = data.profile;
      if(profile&&root.SQCCandidateReference){const reference=profile.baseContextText||profile.baseContext;const previous=cached?.apiOrigin===apiOrigin&&cached.applier.id===data.applier.id&&cached.profile?.id===profile.id&&cached.profile?.version===profile.version?cached.profile.candidateReferenceFacts:null;profile=root.SQCCandidateReference.merge({...profile,...(!reference&&previous?{candidateReferenceFacts:previous}:{})},reference);const {baseContextText,baseContext,...safeProfile}=profile;profile=safeProfile;}
      if (assignment != null && (!assignment.id || !assignment.version || !assignment.profileId || !assignment.profileVersion || assignment.status !== 'ACTIVE' ||
          assignment.applierId !== data.applier.id || assignment.profileId !== profile?.id ||
          assignment.profileVersion !== profile?.version || profile?.verified !== true || !profile?.fullName)) {
        throw failure('INVALID_CONTEXT', 'ApplyFlow returned an invalid applier profile assignment.');
      }
      if (!assignment && profile) throw failure('INVALID_CONTEXT', 'A profile requires a verified applier assignment.');
      // Optional overview roster. It does not replace the active assignment used by the gate.
      const roster=data.assignedProfiles===undefined?[]:data.assignedProfiles;
      if(!Array.isArray(roster)||roster.length>200||roster.some(entry=>{
        const a=entry?.assignment,p=entry?.profile;
        return !a?.id||!a.version||a.status!=='ACTIVE'||a.applierId!==data.applier.id||a.profileId!==p?.id||
          a.profileVersion!==p?.version||p?.verified!==true||!p.fullName;
      }))throw failure('INVALID_CONTEXT','ApplyFlow returned an invalid assigned-profile roster.');
      if (stamp !== revision) throw failure('STALE_CONTEXT', 'Connection changed. Retry verification.');
      if (cached && (cached.applier.id !== data.applier.id || cached.sessionId !== data.session.id ||
          cached.assignment?.id !== assignment?.id || cached.assignment?.version !== assignment?.version ||
          cached.profile?.version !== profile?.version || data.session.passwordChangeRequired === true)) {
        await chrome.storage.session.remove('sqcContexts');
      }
      const applier = { id: data.applier.id, name: data.applier.name, email: data.applier.email };
      const auth = { apiOrigin, sessionId: data.session.id, applier, csrfToken: data.csrfToken,
        assignment: assignment || null, profile: assignment ? profile : null,
        assignedProfiles:roster.map(entry=>({id:entry.profile.id,version:entry.profile.version,fullName:entry.profile.fullName,verified:true,assignment:entry.assignment})),
        passwordChangeRequired: data.session.passwordChangeRequired === true,
        expiresAt, checkedAt: now() };
      await chrome.storage.session.set({ sqcAuth: auth });
      return auth;
    }
    function hints(url) {
      return Object.fromEntries(Object.entries(policy.launchHints(url)).filter(([, value]) => value !== undefined));
    }
    function forProfile(auth,profileId){
      if(!profileId||auth.assignment?.profileId===profileId)return auth;
      const assigned=auth.assignedProfiles?.find(profile=>profile.id===profileId&&profile.assignment?.applierId===auth.applier.id&&profile.assignment.status==='ACTIVE');
      return assigned?{...auth,assignment:assigned.assignment,profile:assigned}:auth;
    }
    async function resolveContext(auth, tab, url, force) {
      const { sqcContexts = {}, sqcTabBindings = {}, sqcLaunchHints = {} } = await chrome.storage.session.get(['sqcContexts','sqcTabBindings','sqcLaunchHints']);
      let previous = sqcContexts[tab.id];
      const explicit = hints(url);
      let launch=sqcLaunchHints[tab.id];
      if(!launch){launch=await restoreRecovery(tab,url,auth);if(launch){sqcLaunchHints[tab.id]=launch;await chrome.storage.session.set({sqcLaunchHints});}}
      // Browser-captured launch IDs survive a redirect before any content script runs.
      // These are discovery claims only; the server must still approve every destination.
      const retained = {...(launch &&
        (!launch.apiOrigin || launch.apiOrigin === auth.apiOrigin) &&
        (!launch.applierId || launch.applierId === auth.applier.id) ? launch.hints : {})};
      // A revoked assignment cannot be restored from disk. Explicit profile IDs
      // remain strict; a server-managed reassignment must use the fresh roster.
      if(retained.profileId&&retained.profileId!==auth.assignment?.profileId&&!auth.assignedProfiles?.some(profile=>profile.id===retained.profileId&&profile.assignment?.status==='ACTIVE'))delete retained.profileId;
      const sameLaunch=['applicationSessionId','jobId','profileId'].every(key=>!explicit[key]||!retained[key]||explicit[key]===retained[key]);
      const requested=sameLaunch?{...retained,...explicit}:explicit;
      auth=forProfile(auth,requested.profileId||sqcTabBindings[tab.id]?.profileId||sqcContexts[tab.id]?.profile?.id||sqcTabBindings[tab.openerTabId]?.profileId);
      const belongsToAuth = c => c?.authSessionId === auth.sessionId &&
        c.profile?.id === auth.assignment?.profileId && c.profile?.version === auth.assignment?.profileVersion &&
        c.assignment?.profileAssignmentId === auth.assignment?.id && c.assignment?.profileAssignmentVersion === auth.assignment?.version;
      // A new application tab may reuse only one unambiguous, already approved job route.
      if (!previous) {
        const matches = Object.values(sqcContexts).filter(c => belongsToAuth(c) && policy.matchesContext(url,c) &&
          (!requested.applicationSessionId || requested.applicationSessionId === c.applicationSessionId) &&
          (!requested.jobId || requested.jobId === c.job.id) && (!requested.profileId || requested.profileId === c.profile.id));
        if (new Set(matches.map(c=>c.applicationSessionId)).size === 1) previous=matches[0];
      }
      // Only explicit launch identifiers or an exact backend-authorized route can carry an assignment.
      const compatible = previous?.authSessionId === auth.sessionId && policy.matchesContext(url, previous) &&
        (!requested.applicationSessionId || requested.applicationSessionId === previous.applicationSessionId) &&
        (!requested.jobId || requested.jobId === previous.job.id) && (!requested.profileId || requested.profileId === previous.profile.id);
      if (compatible && !force && previous.checkedAt + 30000 > now() && previous.expiresAt > now()) {
        if (!sqcContexts[tab.id]) await chrome.storage.session.set({sqcContexts:{...sqcContexts,[tab.id]:previous}});
        return previous;
      }
      const priorBinding = sqcTabBindings[tab.id] || (Number.isInteger(tab.openerTabId) ? sqcTabBindings[tab.openerTabId] : null);
      const fromContext = belongsToAuth(previous) ? {applicationSessionId:previous.applicationSessionId,jobId:previous.job.id,profileId:previous.profile.id,
        authSessionId:auth.sessionId,profileAssignmentId:auth.assignment.id,profileAssignmentVersion:auth.assignment.version,profileVersion:auth.assignment.profileVersion} : null;
      let binding = fromContext || priorBinding;
      if (binding && (binding.authSessionId!==auth.sessionId || binding.profileId!==auth.assignment.profileId || binding.profileVersion!==auth.assignment.profileVersion ||
          binding.profileAssignmentId!==auth.assignment.id || binding.profileAssignmentVersion!==auth.assignment.version ||
          ['applicationSessionId','jobId','profileId'].some(key=>requested[key] && requested[key]!==binding[key]))) binding=null;
      if (binding) sqcTabBindings[tab.id]=binding; else delete sqcTabBindings[tab.id];
      // A retained binding supplies request hints only. It never authorizes a new URL.
      await chrome.storage.session.set({sqcTabBindings});
      delete sqcContexts[tab.id];
      await chrome.storage.session.set({ sqcContexts });
      const body = { contractVersion: 2, url, trackingMode:'application-session',resumePolicy:'existing-only',allowResumeGeneration:false,
        duplicatePolicy:{scope:'profile',includeOtherAppliers:true,matchBy:['jobId','requisitionId','title','company','location']},
        ...(binding ? {applicationSessionId:binding.applicationSessionId,jobId:binding.jobId,profileId:binding.profileId} : {}),
        ...(compatible ? { applicationSessionId: previous.applicationSessionId } :
          binding && !Object.keys(explicit).length ? {previousApplicationSessionId:binding.applicationSessionId} : {}), ...requested };
      const stamp = revision;
      let data;
      try{data=await request(auth.apiOrigin, '/api/sqc/application-context', 'POST', body, auth.csrfToken);}
      catch(error){error.verificationRequest={tabId:tab.id,page:pageIdentity(url),applicationSessionId:body.applicationSessionId||null,jobId:body.jobId||null,profileId:body.profileId||null,previousApplicationSessionId:body.previousApplicationSessionId||null};throw error;}
      let c = data.context;
      if(c?.profile&&root.SQCCandidateReference){
        const reference=c.profile.baseContextText||c.profile.baseContext||'';
        const sessionFacts=auth.profile?.id===c.profile.id&&auth.profile?.version===c.profile.version?auth.profile.candidateReferenceFacts:null;
        c={...c,profile:root.SQCCandidateReference.merge({...c.profile,...(!reference&&sessionFacts?{candidateReferenceFacts:sessionFacts}:{})},reference)};
        if(root.SQCCandidateReference.isPromptDocument(c.resume?.text)){
          c={...c,profile:root.SQCCandidateReference.merge(c.profile,c.resume.text),resume:null,
            resumeError:'Candidate reference facts were loaded. The generator prompt is not a resume. Upload the actual job resume or sync the generated original from ApplyFlow.'};
        }
        const {baseContextText,baseContext,...safeProfile}=c.profile;c={...c,profile:safeProfile};
      }
      // A missing parsed document must not prevent the assigned job from becoming
      // active. Ignore its unusable bytes and let the applier upload an original.
      if(c&&c.resume==null)c={...c,resume:null};
      if(c?.resume?.verified===true&&c.resume.profileId===c.profile?.id&&
        (c.resume.kind!=='tailored'||c.resume.jobId===c.job?.id)&&!String(c.resume.text||'').trim()){
        c={...c,resume:null,resumeError:'ApplyFlow verified the job but returned no parsed resume text. Upload the original job resume to prepare its context.'};
      }
      const expiry = Date.parse(c?.expiresAt);
      if(c?.profile?.id&&!binding&&!requested.profileId)auth=forProfile(auth,c.profile.id);
      if (data.contractVersion !== 2 || !c?.applicationSessionId || c.authSessionId !== auth.sessionId ||
          c.applier?.id !== auth.applier.id || c.assignment?.status !== 'ACTIVE' ||
          c.assignment.applierId !== auth.applier.id || c.assignment.profileId !== c.profile?.id ||
          c.assignment.jobId !== c.job?.id || c.profile?.verified !== true || !c.profile?.id ||
          c.profile.id !== auth.assignment?.profileId || c.profile.version !== auth.assignment?.profileVersion ||
          c.assignment.profileAssignmentId !== auth.assignment?.id || c.assignment.profileAssignmentVersion !== auth.assignment?.version ||
          !c.profile?.version || !c.profile?.fullName || !c.job?.id || !c.job?.version ||
          (c.resume !== null && (c.resume?.verified !== true || !c.resume?.id || !c.resume?.version || !c.resume?.text || c.resume.profileId !== c.profile.id ||
          (c.resume.kind === 'tailored' && c.resume.jobId !== c.job.id))) ||
          !Number.isFinite(expiry) || expiry <= now() || !/^https?:\/\//i.test(url) ||
          (requested.applicationSessionId && requested.applicationSessionId !== c.applicationSessionId) ||
          (requested.jobId && requested.jobId !== c.job.id) || (requested.profileId && requested.profileId !== c.profile.id)) {
        const checks=[
          ['contractVersion',data.contractVersion===2],['context.applicationSessionId',Boolean(c?.applicationSessionId)],
          ['context.authSessionId (signed-in session)',c?.authSessionId===auth.sessionId],['context.applier.id',c?.applier?.id===auth.applier.id],
          ['context.assignment.status',c?.assignment?.status==='ACTIVE'],['context.assignment.applierId',c?.assignment?.applierId===auth.applier.id],
          ['context.assignment.profileId',c?.assignment?.profileId===c?.profile?.id],['context.assignment.jobId',c?.assignment?.jobId===c?.job?.id],
          ['context.profile.verified',c?.profile?.verified===true],['context.profile.id (locked candidate)',c?.profile?.id===auth.assignment?.profileId],
          ['context.profile.version',c?.profile?.version===auth.assignment?.profileVersion],['context.assignment.profileAssignmentId',c?.assignment?.profileAssignmentId===auth.assignment?.id],
          ['context.assignment.profileAssignmentVersion',c?.assignment?.profileAssignmentVersion===auth.assignment?.version],
          ['context.profile.fullName/version',Boolean(c?.profile?.fullName&&c.profile.version)],['context.job.id/version',Boolean(c?.job?.id&&c.job.version)],
          ['context.resume (verified candidate/job document)',c?.resume===null||Boolean(c?.resume?.verified&&c.resume.id&&c.resume.version&&c.resume.text&&c.resume.profileId===c?.profile?.id&&(c.resume.kind!=='tailored'||c.resume.jobId===c?.job?.id))],
          ['context.expiresAt (must be in the future)',Number.isFinite(expiry)&&expiry>now()],
          ['applicationSessionId (launch tracking ID)',!requested.applicationSessionId||requested.applicationSessionId===c?.applicationSessionId],
          ['jobId (launch tracking ID)',!requested.jobId||requested.jobId===c?.job?.id],['profileId (launch tracking ID)',!requested.profileId||requested.profileId===c?.profile?.id]
        ];
        const fields=checks.filter(([,valid])=>!valid).map(([name])=>name);
        throw failure('CONTEXT_MISMATCH','Job verification failed: ApplyFlow returned missing or mismatched '+(fields.join(', ')||'context fields')+'.',
          {path:'/api/sqc/application-context',validationFields:fields});
      }
      if (binding && (c.applicationSessionId!==binding.applicationSessionId || c.job.id!==binding.jobId || c.profile.id!==binding.profileId)) throw failure('CONTEXT_MISMATCH','The continuation page belongs to a different application. Open it from ApplyFlow.');
      if (stamp !== revision) throw failure('STALE_CONTEXT', 'Connection changed. Retry verification.');
      // Recheck the tab after an asynchronous request; never install an old response into a new page.
      const currentTab = await chrome.tabs.get(tab.id);
      if (currentTab.url !== tab.url) throw failure('STALE_CONTEXT', 'The job page changed during verification. Retry.');
      const sameApplication=previous&&belongsToAuth(previous)&&previous.applicationSessionId===c.applicationSessionId&&previous.job.id===c.job.id;
      previous = { ...c, verifiedUrls:[...new Set([...(sameApplication?previous.verifiedUrls||[]:[]),url])].slice(-100),checkedAt: now(), expiresAt: Math.min(expiry, auth.expiresAt, now() + 60000) };
      const latest = await chrome.storage.session.get('sqcContexts');
      await chrome.storage.session.set({ sqcContexts: { ...(latest.sqcContexts || {}), [tab.id]: previous },
        sqcTabBindings:{...sqcTabBindings,[tab.id]:{applicationSessionId:c.applicationSessionId,jobId:c.job.id,profileId:c.profile.id,authSessionId:auth.sessionId,
          profileAssignmentId:auth.assignment.id,profileAssignmentVersion:auth.assignment.version,profileVersion:auth.assignment.profileVersion}} });
      sqcLaunchHints[tab.id]={...sqcLaunchHints[tab.id],hints:{applicationSessionId:c.applicationSessionId,jobId:c.job.id,profileId:c.profile.id},apiOrigin:auth.apiOrigin,applierId:auth.applier.id};
      await chrome.storage.session.set({sqcLaunchHints});
      await saveRecovery(tab,c,auth,url);
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
      let auth = null, context = null, displayAuth = null,contextPageUrl='',contextTabId;
      let integration = { state: 'DISCONNECTED', message: 'Connect SQC to ApplyFlow using the extension popup.', apiOrigin };
      try {
        const managed=deployment ? await deployment.load() : null;
        if(managed)Object.assign(settings,{deploymentManaged:true,deploymentPolicy:managed,resumeMode:managed.resume.mode,autoAttachResume:managed.resume.autoAttach,
          autoAutofillOnPageLoad:managed.autofill.enabled,autoFillExperience:managed.autofill.experience,autoFillSkills:managed.autofill.skills,
          autoFillDemographics:managed.autofill.demographics,autoFillCompensation:managed.autofill.compensation,autoFillCustomQuestions:managed.autofill.customQuestions,
          interceptionMode:managed.validation.mode,minScreeningLength:managed.validation.minScreeningLength,detectCaptchaAndAlert:managed.validation.detectCaptcha,streamLiveEvents:managed.validation.streamLiveEvents});
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
        contextTabId=tab?.id;
        const targetUrl=tab&&(privileged(sender)?tab.url:(sender.url||tab.url));
        const ownWorkspace=targetUrl&&new URL(targetUrl).origin===apiOrigin;
        if (tab && (auth.assignment||auth.assignedProfiles?.length) && !auth.passwordChangeRequired && !ownWorkspace) {
          // Every frame is verified against its own URL; the context routes must authorize embedded forms too.
          const url = privileged(sender) ? tab.url : (sender.url || tab.url);
          contextPageUrl=url;
          const conflictKey=apiOrigin+'|'+tab.id+'|'+url,conflict=contextConflicts.get(conflictKey);
          if(!message.force&&conflict?.until>now())throw conflict.error;
          const {sqcContexts:priorContexts={}}=await chrome.storage.session.get('sqcContexts');
          try{context = await resolveContext(auth, tab, url, message.force === true);}
          catch(error){
            const changedAssignment=error.state==='CONTEXT_MISMATCH'&&error.validationFields?.some(field=>[
              'context.authSessionId (signed-in session)','context.profile.version','context.assignment.profileAssignmentId','context.assignment.profileAssignmentVersion'
            ].includes(field));
            const staleVersions=(error.state==='VERSION_MISMATCH'||error.state==='BACKEND_CONFLICT'&&error.backendCode==='CONFLICT')&&error.path==='/api/sqc/application-context';
            if(!changedAssignment&&!staleVersions)throw error;
            // A newly assigned/updated profile can arrive before the cached session
            // expires. Renew it once automatically; never loop or relax identity checks.
            auth=await authenticate(apiOrigin,true);
            if((!auth.assignment&&!auth.assignedProfiles?.length)||auth.passwordChangeRequired)throw error;
            try{context=await resolveContext(auth,tab,url,true);}
            catch(retryError){
              Object.assign(retryError,{recoveryAttempted:true});
              if(retryError.status===409){const until=now()+15000;Object.assign(retryError,{nextRecoveryAt:new Date(until).toISOString()});while(contextConflicts.size>=100)contextConflicts.delete(contextConflicts.keys().next().value);contextConflicts.set(conflictKey,{until,error:retryError});}
              throw retryError;
            }
            integration={...integration,applier:auth.applier,profileAssignment:auth.assignment,expiresAt:auth.expiresAt};
          }
          auth=forProfile(auth,context.profile.id);
          contextConflicts.delete(conflictKey);
          integration={...integration,applier:auth.applier,profileAssignment:auth.assignment};
          settings.resumeMode=context.job.tailoringRequired===true||context.resume?.tailoringRequired===true?'tailored':(managed?.resume.mode||'tailored');
          const documentBinding=settings.resumeMode==='fixed'?localResume.fixedBinding(auth,context):localResume.binding(auth,context);
          const documentKey=settings.resumeMode==='fixed'?'fixed:'+documentBinding:tab.id;
          let uploaded;
          try { uploaded = await localResumes?.get(documentKey, documentBinding); } catch (_) { /* The verified base profile remains usable if local document storage is unavailable. */ }
          if(!uploaded&&localResumes&&settings.resumeMode!=='fixed'){
            const {sqcLaunchHints={}}=await chrome.storage.session.get('sqcLaunchHints'),sourceTabId=sqcLaunchHints[tab.id]?.sourceTabId;
            if(Number.isInteger(sourceTabId)&&sourceTabId!==tab.id){try{uploaded=await localResumes.get(sourceTabId,documentBinding);if(uploaded)await localResumes.put(tab.id,documentBinding,uploaded);}catch(_){}}
          }
          if(uploaded&&root.SQCCandidateReference?.isPromptDocument(uploaded.text)){
            context={...context,profile:root.SQCCandidateReference.merge(context.profile,uploaded.text),resumeError:'The previously selected file was candidate reference instructions, not a job resume. Upload the actual original job document.'};
            await localResumes.remove(documentKey);uploaded=null;
          }
          // Carry the same reviewed document into an approved continuation tab, never another job.
          if (!uploaded && localResumes && settings.resumeMode!=='fixed') {
            const binding=localResume.binding(auth,context);
            for (const [sourceTab,source] of Object.entries(priorContexts)) {
              if(Number(sourceTab)===tab.id || localResume.binding(auth,source)!==binding) continue;
              try { uploaded=await localResumes.get(Number(sourceTab),binding);
                if(uploaded){await localResumes.put(tab.id,binding,uploaded);break;}
              } catch (_) { /* Keep the backend profile usable if local storage is unavailable. */ }
            }
          }
          const baseResume = context.resume;
          // An uploaded document is independent of ApplyFlow's default resume. A linked server copy is not.
          if (uploaded?.source === 'applyflow' && (uploaded.id !== baseResume?.id || uploaded.version !== baseResume?.version ||
              uploaded.file?.sha256 !== baseResume?.file?.sha256)) {
            await localResumes.remove(documentKey); uploaded = null;
          }
          context = {...context, resume: uploaded ? {...uploaded, jobId:context.job.id,
            baseResumeId:baseResume?.id || null,baseResumeVersion:baseResume?.version || null} :
            (baseResume || {id:'none',version:'none',text:'',source:'missing',file:{}})};
          // Version/hash changes change the cache key. Status refreshes must not
          // download the same multi-megabyte original for every field operation.
          const file = includeResumeFile ? await resumeFile(auth, context, false) : context.resume.file || {};
          if ((await chrome.tabs.get(tab.id)).url !== tab.url) throw failure('STALE_CONTEXT', 'The job page changed while loading its resume. Retry verification.');
          context = {...context, resume: {...context.resume, file}};
          integration = { ...integration, state: 'VERIFIED', message: 'Assignment verified by ApplyFlow.' };
          settings.verifiedContext = { state: 'VERIFIED', applicationSessionId: context.applicationSessionId,
            profileAssignmentId: auth.assignment.id, profileAssignmentVersion: auth.assignment.version,
            applierId: auth.applier.id, profileId: context.profile.id, jobId: context.job.id,
            profileVersion: context.profile.version, jobVersion: context.job.version, resumeId: context.resume.id,
            resumeSource:context.resume.source || 'applyflow', resumeSha256:context.resume.file?.sha256 || '',
            resumeVersion: context.resume.version, expiresAt: context.expiresAt, verifiedUrls:context.verifiedUrls,
            duplicate:policy.duplicate(context),status: context.status || 'PENDING' };
          const {sqcPortalAvailability={}}=await chrome.storage.session.get('sqcPortalAvailability'),observation=sqcPortalAvailability[tab.id];
          if(observation?.url===tab.url&&observation.applicationSessionId===context.applicationSessionId&&observation.profileId===context.profile.id&&observation.jobId===context.job.id)settings.portalAvailability=observation;
        }
      } catch (error) {
        context = null; settings.verifiedContext = null;
        if (error.state==='SIGNED_OUT' || error.state==='FORBIDDEN' && !auth) { await clear(true); auth = null; }
        if(!auth&&privileged(sender)&&['UNAVAILABLE','TIMEOUT','BACKEND_ERROR','HTTP_ROUTE_MISSING','INVALID_RESPONSE'].includes(error.state)){
          const {sqcAuth:cached}=await chrome.storage.session.get('sqcAuth');
          if(cached?.apiOrigin===apiOrigin&&cached.expiresAt>now())displayAuth=cached;
        }
        integration = { state: error.state || 'UNAVAILABLE', message: error.message, apiOrigin,
          ...((auth||displayAuth) ? { applier: (auth||displayAuth).applier, profileAssignment: (auth||displayAuth).assignment,
            passwordChangeRequired: (auth||displayAuth).passwordChangeRequired,...(displayAuth?{accountVerified:false}:{}) } : {}),
          ...(error.path?{path:error.path}:{}),...(error.status?{httpStatus:error.status}:{}),...(error.validationFields?{validationFields:error.validationFields}:{}),
          ...(error.backendCode?{backendCode:error.backendCode}:{}),...(error.recoveryAttempted?{recoveryAttempted:true}:{}),...(error.nextRecoveryAt?{nextRecoveryAt:error.nextRecoveryAt}:{}),
          ...(error.expectedVersions?{expectedVersions:error.expectedVersions,currentVersions:error.currentVersions}: {}) };
        if(error.verificationRequest)integration.verificationRequest=error.verificationRequest;
        if(Number.isInteger(contextTabId)){
          const {sqcLaunchHints={}}=await chrome.storage.session.get('sqcLaunchHints'),launch=sqcLaunchHints[contextTabId];
          if(launch&&(!launch.apiOrigin||launch.apiOrigin===apiOrigin)&&(!launch.applierId||launch.applierId===(auth||displayAuth)?.applier.id))integration.tracking={...launch.hints,launchPage:launch.launchPage||'',pages:launch.pages||[],events:launch.events||[],retained:true};
        }
      }
      settings.applierId = auth?.applier.id || '';
      settings.applierName = auth?.applier.name || '';
      settings.applierEmail = auth?.applier.email || '';
      settings.integrationState = integration.state;
      settings.integrationMessage = integration.message;
      let profile = (auth||displayAuth)?.profile || null;
      if (context) {
        if(root.SQCCandidateReference){const inherited=auth.profile?.id===context.profile.id&&auth.profile?.version===context.profile.version?auth.profile.candidateReferenceFacts:null;context={...context,profile:root.SQCCandidateReference.merge({...context.profile,...(!context.profile.candidateReferenceFacts&&inherited?{candidateReferenceFacts:inherited}:{})},'')};}
        settings.savedFormAnswers=journal?await journal.restore(auth,settings.verifiedContext,contextPageUrl,context.savedApplication):[];
        const parsedFacts=root.SQCResumeContext?.parse(context.resume.text);
        const resumeFacts=context.resume.facts?{...context.resume.facts,education:context.resume.facts.education||parsedFacts?.education||[]}:parsedFacts||null;
        profile = { ...context.profile, resumeText: context.resume.text, baseResumeText: context.resume.text,
          resumeBase64: context.resume.file?.dataUrl || '',
          resumeFilename: context.resume.file?.filename || '',
          resumeId: context.resume.id, resumeVersion: context.resume.version, resumeJobId: context.resume.jobId || '',
          resumeSource:context.resume.source || 'applyflow',
          resumeBaseId:context.resume.source === 'sqc_upload' ? context.resume.baseResumeId : context.resume.id,
          resumeBaseVersion:context.resume.source === 'sqc_upload' ? context.resume.baseResumeVersion : context.resume.version,
          resumeIsTailored: context.resume.kind === 'tailored' && context.resume.jobId === context.job.id,
          resumeTailoringRequired: settings.resumeMode!=='fixed',
          resumeMode:settings.resumeMode||'tailored',
          resumeReady:Boolean(context.resume.text)&&(settings.resumeMode==='fixed'||context.resume.kind==='tailored'&&context.resume.jobId===context.job.id),
          resumeContext:resumeFacts,
          resumeSha256: context.resume.file?.sha256 || '', resumeFileError: context.resume.file?.error || (context.resume.source==='sqc_upload'?'':context.resumeError) || '',
          resumeMimeType: context.resume.file?.mimeType || '',
          primaryStackKeywords: (Array.isArray(context.resume.skills)&&context.resume.skills.length ? context.resume.skills : context.resume.skills?.primaryStackKeywords) || resumeFacts?.skills || [],
          salaryFloor: context.profile.salaryFloor ?? context.profile.compensation?.salaryFloor,
          desiredSalary: context.profile.desiredSalary ?? context.profile.compensation?.desiredSalary };
      }
      settings.activeProfileId = profile?.id || '';
      const overviewProfiles=[...(profile?[profile]:[]),...((auth||displayAuth)?.assignedProfiles||[]).filter(p=>p.id!==profile?.id)];
      return { success: true, settings, activeProfile: profile, profiles: overviewProfiles, integration,
        applyFlowContext: context ? { jobId: context.job.id, jobTitle: context.job.title, company: context.job.company,
          duplicate:policy.duplicate(context),duplicateCheckStatus:context.duplicateCheck?.status||'UNKNOWN',
          currentStatus: context.status, applier: auth.applier, profileName: profile.fullName } : null };
    }
    async function handleInternal(message, sender) {
      const action = message.action || message.type;
      if(action==='SQC_RECORD_PORTAL_NAVIGATION'){
        if(!sender.tab||privileged(sender)||(sender.frameId||0)!==0||message.frameOrigin!=='https://jobs.ashbyhq.com'||!['ATS_RESET_JOB_SELECTION','ATS_SET_JOB_SELECTION'].includes(message.kind))return {success:false};
        const {sqcLaunchHints={},sqcAuth:auth}=await chrome.storage.session.get(['sqcLaunchHints','sqcAuth']);
        const launch=sqcLaunchHints[sender.tab.id];
        if(!launch||!auth||launch.applierId&&launch.applierId!==auth.applier.id)return {success:false};
        launch.events=[...(launch.events||[]),{kind:message.kind,page:pageIdentity(sender.url||sender.tab.url),frameOrigin:message.frameOrigin,at:now()}].slice(-12);
        await chrome.storage.session.set({sqcLaunchHints});return {success:true};
      }
      if(action==='SQC_CAPTURE_STEP'){
        if(!journal||!sender.tab||privileged(sender))return {success:false,error:'Capture requires a verified application page.'};
        const {sqcAuth:auth,sqcContexts={}}=await chrome.storage.session.get(['sqcAuth','sqcContexts']);
        const raw=sqcContexts[sender.tab.id],stamp=message.context;
        if(!auth||!raw||raw.authSessionId!==auth.sessionId||raw.expiresAt<=now()||!policy.matchesContext(sender.url||sender.tab.url,raw)||
          stamp?.applicationSessionId!==raw.applicationSessionId||stamp?.jobId!==raw.job.id||stamp?.profileId!==raw.profile.id||stamp?.profileVersion!==raw.profile.version||stamp?.jobVersion!==raw.job.version||
          stamp?.applierId!==auth.applier.id||stamp?.profileAssignmentId!==raw.assignment.profileAssignmentId||stamp?.profileAssignmentVersion!==raw.assignment.profileAssignmentVersion)return {success:false,error:'The application changed before its answers could be captured.'};
        const managed=deployment?await deployment.load():null;if(managed?.tracking.captureAnswers===false)return {success:true,skipped:true};
        return {success:true,...await journal.capture(auth,stamp,{url:sender.url||sender.tab.url,label:message.label,fields:message.fields},managed?.tracking)};
      }
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
        if(action!=='SQC_CLEAR_LOCAL_RESUME'&&cfg.settings.deploymentPolicy?.resume.allowUpload===false)return {success:false,error:'Resume uploads are disabled in config/settings.json.'};
        const assignmentKeys=['applicationSessionId','jobId','jobVersion','profileId','profileVersion','applierId','profileAssignmentId','profileAssignmentVersion'];
        if (assignmentKeys.some(key => !message.context?.[key] || message.context[key] !== c[key]) ||
            action === 'SQC_CLEAR_LOCAL_RESUME' && !screening.same(message.context,c)) {
          return {success:false,error:'The application changed. Reopen the resume manager.'};
        }
        const {sqcAuth:auth, sqcContexts = {}} = await chrome.storage.session.get(['sqcAuth','sqcContexts']);
        const fixed=cfg.settings.resumeMode==='fixed',documentBinding=fixed?localResume.fixedBinding(auth,sqcContexts[sender.tab.id]):localResume.binding(auth,sqcContexts[sender.tab.id]);
        const documentKey=fixed?'fixed:'+documentBinding:sender.tab.id;
        let expectedResume;
        if (action === 'SQC_CLEAR_LOCAL_RESUME') await localResumes.remove(documentKey);
        else if (action === 'SQC_LINK_APPLYFLOW_RESUME') {
          const original = sqcContexts[sender.tab.id]?.resume;
          if (original?.verified !== true || (!fixed&&(original.kind !== 'tailored'||original.jobId!==c.jobId)) ||
              !/^[a-f0-9]{64}$/i.test(original.file?.sha256 || '')) return {success:false,error:'Sync the job-tailored resume metadata from ApplyFlow before linking its downloaded file.'};
          const file = await resumeFile(auth,{...sqcContexts[sender.tab.id],resume:{...original,file:{...original.file,url:undefined,dataUrl:message.dataUrl}}},true);
          if (!file.dataUrl) return {success:false,error:file.error || 'This file does not match the ApplyFlow resume.'};
          if ((await chrome.tabs.get(sender.tab.id)).url !== sender.tab.url) return {success:false,error:'The job page changed while linking the resume.'};
          expectedResume={...original,source:'applyflow',file};
          await localResumes.put(documentKey,documentBinding,expectedResume);
        } else {
          const validated = await localResume.validate(message.resume, cfg.activeProfile);
          const resume=fixed?{...validated,kind:'base'}:validated;
          expectedResume=resume;
          if ((await chrome.tabs.get(sender.tab.id)).url !== sender.tab.url) return {success:false,error:'The job page changed during upload. Try again.'};
          await localResumes.put(documentKey,documentBinding,resume);
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
        await clear(true);
        await chrome.storage.local.set({ sqcConnection: { apiOrigin, ...(needsLogin ? { signedOut: true } : {}) } });
        return config({ force: true }, sender);
      }
      if (action === 'SQC_LOGIN') {
        if (!privileged(sender)) return { success: false, error: 'Sign in from the extension popup.' };
        const { sqcConnection } = await chrome.storage.local.get('sqcConnection');
        if (!sqcConnection?.apiOrigin) return { success: false, error: 'Connect your ApplyFlow endpoint first.' };
        const email = String(message.email || '').trim();
        const password = typeof message.password === 'string' ? message.password : '';
        try {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) throw failure('INVALID_CREDENTIALS', 'Enter your ApplyFlow email and password.');
          await clear(true);
          await chrome.storage.local.set({ sqcConnection: { apiOrigin: sqcConnection.apiOrigin, signedOut: true } });
          // The unauthenticated challenge protects the login POST against login CSRF.
          const challenge = await loginChallenge(sqcConnection.apiOrigin);
          await request(sqcConnection.apiOrigin, '/api/sqc/login', 'POST', { email, password,allowResumeGeneration:false }, challenge.csrfToken);
          // Identity and the locked profile must always be fetched from the authenticated session endpoint.
          await chrome.storage.local.set({ sqcConnection: { apiOrigin: sqcConnection.apiOrigin } });
          const result = await config({ force: true }, sender);
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
          await clear(true);
          return await config({ force: true }, sender);
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
      if (action === 'GET_LAUNCH_STATUS') {
        const cfg=await config(message,sender,false),c=cfg.settings?.verifiedContext;
        return {success:true,state:c?'VERIFIED':cfg.integration?.state||'UNAVAILABLE',profileName:cfg.activeProfile?.fullName||'',resumeReady:cfg.activeProfile?.resumeReady===true,jobStatus:c?.status||'',portal:cfg.settings?.portalAvailability,message:cfg.integration?.message||''};
      }
      if (action === 'SQC_PORTAL_ELIGIBILITY') {
        const {sqcContexts = {}, sqcAuth, sqcTabBindings={},sqcLaunchHints={}} = await chrome.storage.session.get(['sqcContexts', 'sqcAuth','sqcTabBindings','sqcLaunchHints']);
        const url = sender.url || sender.tab?.url;
        // This only decides whether to show the HUD. GET_CONFIG must renew expired leases
        // before any autofill, file attachment, or application action is allowed.
        const approved=Boolean(sqcAuth && Object.values(sqcContexts).some(context =>
          context.authSessionId === sqcAuth.sessionId && policy.matchesContext(url,context)));
        if(approved) return {success:true,eligible:true};
        if(sqcAuth && (sqcTabBindings[sender.tab?.id]?.authSessionId===sqcAuth.sessionId || sqcLaunchHints[sender.tab?.id])){const resolved=await config({},sender,false);return {success:true,eligible:Boolean(resolved.settings.verifiedContext)};}
        // A stripped URL or empty intermediate page still gets a chance to be verified.
        // The prior tab session is discovery evidence only; the backend must authorize this URL.
        const prior=sqcContexts[sender.tab?.id];
        let samePortal=false;
        try {samePortal=prior?.verifiedUrls?.some(route=>new URL(route).origin===new URL(url).origin)===true;} catch (_) {}
        if(sqcAuth && prior?.authSessionId===sqcAuth.sessionId && samePortal) {
          const resolved=await config({},sender,false);
          return {success:true,eligible:Boolean(resolved.settings.verifiedContext)};
        }
        return {success:true,eligible:false};
      }
      if (forbidden.has(action)) return { success: false, isLocked: true, error: 'Candidate and applier assignments are managed in ApplyFlow.' };
      if (action === 'SAVE_SETTINGS' || action === 'SET_INTERCEPTION_MODE') {
        if(deployment)return {success:false,error:'Extension selections are managed in config/settings.json.'};
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
        const applied = cfg.applyFlowContext.duplicate?.confirmed===true || ['SUBMITTED', 'APPLIED', 'ALREADY_APPLIED'].includes(cfg.applyFlowContext.currentStatus);
        return { success: true, already_applied: applied, has_applied: applied, can_apply: !applied,
          existingRecord: applied ? cfg.applyFlowContext : null };
      }
      if (['LOG_SUBMISSION', 'APPLYFLOW_WEBHOOK', 'DISPATCH_LIVE_FEEDBACK'].includes(action)) {
        if (!sender.tab || privileged(sender)) return { success: false, error: 'Application events require a verified job tab.' };
        // MessageSender.url can describe the document's original URL while an
        // ATS has moved to a confirmation route with history.pushState.
        // Resolve the live browser-owned frame, never a URL supplied by content.
        if(chrome.webNavigation?.getFrame){
          let frame;
          try{frame=await chrome.webNavigation.getFrame({tabId:sender.tab.id,frameId:sender.frameId||0});}catch(_){}
          if(!frame||frame.errorOccurred||!/^https?:\/\//i.test(frame.url||'')||sender.documentId&&frame.documentId&&sender.documentId!==frame.documentId)
            return {success:false,error:'The application document changed before sync. Read the current confirmation page and retry.'};
          sender={...sender,url:frame.url,documentId:frame.documentId||sender.documentId,tab:await chrome.tabs.get(sender.tab.id)};
        }
        const cfg = await config({ force: true }, sender, false);
        const c = cfg.settings.verifiedContext;
        if (!c) return { success: false, error: cfg.integration.message };
        const { sqcAuth: auth } = await chrome.storage.session.get('sqcAuth');
        const payload = { ...(message.payload || {}) };
        if(['PORTAL_ACCESS_FAILED','LINK_NOT_FOUND'].includes(payload.job_status)){
          if(cfg.applyFlowContext?.duplicate?.confirmed||['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(cfg.applyFlowContext?.currentStatus))return {success:true,skipped:true,applyFlowStatus:cfg.applyFlowContext.currentStatus};
          const {sqcPortalAvailability={}}=await chrome.storage.session.get('sqcPortalAvailability'),observation=sqcPortalAvailability[sender.tab.id];
          if(!observation?.confirmed||!observation.unavailable||observation.url!==(sender.url||sender.tab.url)||observation.applicationSessionId!==c.applicationSessionId||observation.profileId!==c.profileId||observation.jobId!==c.jobId||
            payload.submission_confirmed_by!=='AUTO_DETECTED_JOB_UNAVAILABLE'||payload.portal_evidence?.type!=='JOB_UNAVAILABLE_NOTICE'||payload.portal_evidence.url!==observation.url||payload.portal_evidence.message!==observation.evidence||now()-observation.checkedAt>120000)
            return {success:false,error:'Only confirmed job-unavailable evidence can mark a posting unavailable. Login, CAPTCHA and temporary failures are not closed jobs.'};
        }
        if (payload.is_final_submission===true || ['SUBMITTED','APPLIED','ALREADY_APPLIED'].includes(String(payload.job_status||'').toUpperCase())) {
          const evidence=payload.portal_evidence;
          const checks={
            'final submission flag':payload.is_final_submission===true,
            'completion status':['SUBMITTED','APPLIED','ALREADY_APPLIED'].includes(String(payload.job_status||'').toUpperCase()),
            'portal confirmation source':['CONFIRMED_ON_PORTAL_SUCCESS_PAGE','AUTO_DETECTED_ALREADY_APPLIED_ON_PORTAL'].includes(payload.submission_confirmed_by),
            'success notice':['SUCCESS_NOTICE','ALREADY_APPLIED_NOTICE'].includes(evidence?.type)&&typeof evidence?.message==='string'&&Boolean(evidence.message.trim()),
            'current frame URL':evidence?.url===(sender.url||sender.tab.url),
            'final portal step':evidence?.intermediate===false,
            'recent observation':Number.isFinite(Date.parse(evidence?.observedAt))&&Math.abs(now()-Date.parse(evidence.observedAt))<=120000
          };
          const missing=Object.keys(checks).filter(name=>!checks[name]);
          if(missing.length)return {success:false,code:'PORTAL_EVIDENCE_MISMATCH',fields:missing,error:'SQC could not validate submission evidence: '+missing.join(', ')+'. Keep the employer confirmation visible and retry sync.'};
        }
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
        if(live&&root.SQCLiveProgress&&(!root.SQCLiveProgress.hasData(payload.extracted_data)||cfg.applyFlowContext?.duplicate?.confirmed))return {success:true,skipped:true,applyFlowStatus:cfg.applyFlowContext.currentStatus};
        if (live && cfg.settings.streamLiveEvents === false) return { success: true, skipped: true };
        payload.event_id = typeof payload.event_id === 'string' ? payload.event_id : crypto.randomUUID();
        const endpoint = live ? '/api/submissions/live-event' : '/api/submissions/webhook';
        if(!live&&journal){
          const captured=await journal.read(auth,c);
          payload.application_steps=captured.steps;
          const recorded=captured.steps.flatMap(step=>step.fields.filter(field=>field.answer.trim()).map(field=>({question:field.question,answer:field.answer,field_id:field.id,step:step.label,url:step.url,resume_id:field.resumeId,resume_version:field.resumeVersion})));
          const seen=new Set(recorded.map(item=>item.question+'|'+item.answer));
          payload.screening_qa=[...recorded,...(payload.screening_qa||[]).filter(item=>!seen.has(item.question+'|'+item.answer))];
        }
        if(chrome.webNavigation?.getFrame){
          let frame;try{frame=await chrome.webNavigation.getFrame({tabId:sender.tab.id,frameId:sender.frameId||0});}catch(_){}
          if(!frame||frame.errorOccurred||frame.url!==sender.url||sender.documentId&&frame.documentId&&sender.documentId!==frame.documentId)
            return {success:false,error:'The application document changed during verification. Keep the current confirmation visible and retry sync.'};
        }
        const result = await request(auth.apiOrigin, endpoint, 'POST', payload, auth.csrfToken);
        if (result.applicationSessionId !== c.applicationSessionId || result.eventId !== payload.event_id || result.accepted !== true || typeof result.recordId!=='string' || !result.recordId.trim() ||
          result.jobId!==undefined&&result.jobId!==c.jobId || result.profileId!==undefined&&result.profileId!==c.profileId) {
          return { success: false, error: 'ApplyFlow did not acknowledge this application event.' };
        }
        let applyFlowStatus=['APPLIED','SUBMITTED','ALREADY_APPLIED','LINK_NOT_FOUND','PORTAL_ACCESS_FAILED','IN_PROGRESS'].includes(result.status)?result.status:cfg.applyFlowContext?.currentStatus||null;
        if (!live) {
          const { submissionsHistory = [] } = await chrome.storage.local.get('submissionsHistory');
          const localRecord = { ...payload, screenshot: '', screenshot_url: '', screenshots: [],
            extracted_data: { ...payload.extracted_data, screenshots: [] } };
          await chrome.storage.local.set({ submissionsHistory: [{ ...localRecord, delivery_status: 'ACKNOWLEDGED',
            id: result.recordId, timestamp: new Date(now()).toISOString() }, ...submissionsHistory].slice(0, 50) });
          if(['SUBMITTED','APPLIED','ALREADY_APPLIED'].includes(String(payload.job_status||'').toUpperCase())){
            try{await journal?.remove(auth,c);}catch(_){}
            const managed=deployment?await deployment.load():null;
            if(['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(result.status)){
              // The committed, correlated acknowledgement is authoritative.
              // Publish it before any later periodic context refresh.
              const {sqcContexts={}}=await chrome.storage.session.get('sqcContexts');
              const current=sqcContexts[sender.tab.id];
              if(current?.applicationSessionId===c.applicationSessionId&&current?.job?.id===c.jobId&&current?.profile?.id===c.profileId){
                sqcContexts[sender.tab.id]={...current,status:result.status};
                await chrome.storage.session.set({sqcContexts});
              }
            }else if(managed?.submission.refreshApplyFlowStatus!==false){try{const synced=await config({force:true},sender,false);const next=synced.applyFlowContext?.currentStatus;applyFlowStatus=next||applyFlowStatus;}catch(_){} }
          }
        }
        return { success: true, data: result, recordId: result.recordId,applyFlowStatus };
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
          if(c.duplicate?.confirmed)throw failure('ALREADY_APPLIED','ApplyFlow already has an application for this candidate and job. No new answers were generated.');
          if(cfg.settings.portalAvailability?.blocking)throw failure('PORTAL_UNAVAILABLE','The job page is unavailable or requires an access check. No AI request was sent.');
          if (cfg.activeProfile.resumeTailoringRequired && !cfg.activeProfile.resumeIsTailored) throw failure('TAILORING_REQUIRED','Upload the tailored resume for this application before requesting screening answers.');
          if (!cfg.activeProfile.resumeText) throw failure('RESUME_REQUIRED','Upload a tailored resume or sync one from ApplyFlow before generating answers.');
          const {sqcAuth:auth} = await chrome.storage.session.get('sqcAuth');
          const resumeContext = cfg.activeProfile.resumeSource === 'sqc_upload' ? {
            source:'sqc_upload', verified:false, id:c.resumeId, version:c.resumeVersion, sha256:cfg.activeProfile.resumeSha256,
            filename:cfg.activeProfile.resumeFilename,text:cfg.activeProfile.resumeText,skills:cfg.activeProfile.primaryStackKeywords,
            facts:cfg.activeProfile.resumeContext,
            baseResumeId:cfg.activeProfile.resumeBaseId,baseResumeVersion:cfg.activeProfile.resumeBaseVersion
          } : undefined;
          return {auth,c,url,questions,resumeContext,candidateFacts:cfg.activeProfile.candidateReferenceFacts,revision,identity:contextIdentity(c),topUrl:(await chrome.tabs.get(sender.tab.id)).url};
        });
        const payload = {contractVersion:2,...screening.stamp(snapshot.c),requestId:message.requestId,url:snapshot.url,
          ...(snapshot.candidateFacts?{candidateFacts:snapshot.candidateFacts}:{}),
          ...(snapshot.resumeContext ? {resumeContext:snapshot.resumeContext} : {}),
          questions:snapshot.questions,customInstructions:typeof message.customInstructions==='string' ? message.customInstructions.slice(0,4000) : ''};
        const expected = {...screening.stamp(snapshot.c),requestId:payload.requestId};
        // Codex has a nine-minute provider budget; allow transport and queue overhead.
        const deadline = now() + 600000;
        const assertCurrent = async () => {
          if (operation.controller.signal.aborted || revision !== snapshot.revision) throw failure('CANCELLED','The account or application changed. Answers were discarded.');
          if ((await chrome.tabs.get(sender.tab.id)).url !== snapshot.topUrl) throw failure('STALE_CONTEXT','The application page changed. Answers were discarded.');
        };
        await assertCurrent();
        const options = () => ({timeoutMs:Math.max(1,Math.min(25000,deadline-now())),signal:operation.controller.signal,allowGenerationFailure:true});
        let result,answerPath;
        for(answerPath of ['/api/sqc/answer-questions','/api/submissions/answer-questions','/api/ai/answer-questions']) {
          try {result=await request(snapshot.auth.apiOrigin,answerPath,'POST',payload,snapshot.auth.csrfToken,options());break;}
          catch(error){
            if(answerPath==='/api/sqc/answer-questions' && ['TIMEOUT','UNAVAILABLE'].includes(error.state)) {
              // The POST may have been accepted even if its response was lost.
              // Recover that exact request rather than spending another generation.
              try { result=await request(snapshot.auth.apiOrigin,answerPath+'/requests/'+encodeURIComponent(payload.requestId),'GET',undefined,undefined,options());break; }
              catch (_) { throw error; }
            }
            if(error.state!=='HTTP_ROUTE_MISSING'||answerPath==='/api/ai/answer-questions')throw error;
          }
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
        while (['PENDING','QUEUED','RUNNING'].includes(String(result.status || '').toUpperCase())) {
          validateEnvelope(result);
          if (now() >= deadline) throw failure('TIMEOUT','Answer generation took too long. Please try again.');
          statusUrl = result.statusUrl || statusUrl;
          if (typeof statusUrl !== 'string') throw failure('INVALID_RESPONSE','ApplyFlow did not supply an answer-status URL.');
          const url = new URL(statusUrl,snapshot.auth.apiOrigin);
          if (url.origin !== snapshot.auth.apiOrigin || url.username || url.password || url.hash) throw failure('INVALID_RESPONSE','The answer-status URL must use your saved ApplyFlow server.');
          await sleep(3000); await assertCurrent();
          if (now() >= deadline) throw failure('TIMEOUT','Answer generation took too long. Please try again.');
          try {
            result = await request(snapshot.auth.apiOrigin,url.pathname+url.search,'GET',undefined,undefined,options());
          } catch (error) {
            // Only retry safe status reads; never enqueue a second generation after a timeout.
            if (['TIMEOUT','UNAVAILABLE'].includes(error.state) || [429,502,503,504].includes(error.status)) continue;
            throw error;
          }
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
    const rememberLaunch=(tabId,url)=>serialize(async()=>{
      if(!Number.isInteger(tabId)||tabId<0||!/^https?:\/\//i.test(url||''))return;
      const requested=hints(url);
      const {sqcLaunchHints={},sqcAuth:auth}=await chrome.storage.session.get(['sqcLaunchHints','sqcAuth']);
      const {sqcConnection,sqcApplicationRecovery={}}=await chrome.storage.local.get(['sqcConnection','sqcApplicationRecovery']);
      const saved=sqcApplicationRecovery[tabId];
      const prior=sqcLaunchHints[tabId]||(saved?.apiOrigin===sqcConnection?.apiOrigin&&(!auth||saved.applierId===auth.applier.id)?saved:null);
      if(!Object.keys(requested).length){
        if(prior){sqcLaunchHints[tabId]={...prior,pages:[...new Set([...(prior.pages||[]),pageIdentity(url)])].filter(Boolean).slice(-12)};await chrome.storage.session.set({sqcLaunchHints});}
        return;
      }
      if(!sqcLaunchHints[tabId]&&Object.keys(sqcLaunchHints).length>=100)return;
      const same=prior&&['applicationSessionId','jobId','profileId'].every(key=>!requested[key]||!prior.hints[key]||requested[key]===prior.hints[key]);
      sqcLaunchHints[tabId]={hints:same?{...prior.hints,...requested}:requested,apiOrigin:sqcConnection?.apiOrigin||'',applierId:auth?.applier.id||(same?prior.applierId:null),launchPage:same?prior.launchPage||pageIdentity(url):pageIdentity(url),pages:same?[...new Set([...(prior.pages||[]),pageIdentity(url)])].slice(-12):[pageIdentity(url)]};
      await chrome.storage.session.set({sqcLaunchHints});
      if(auth&&auth.apiOrigin===sqcConnection?.apiOrigin)sqcApplicationRecovery[tabId]={...sqcLaunchHints[tabId],updatedAt:now()};
      else if(!same)delete sqcApplicationRecovery[tabId];
      await chrome.storage.local.set({sqcApplicationRecovery});
    });
    const inheritTab=(sourceTabId,tabId,url)=>serialize(async()=>{
      const managed=deployment?await deployment.load():null;if(managed?.tracking.inheritNewTabs===false)return;
      if(!Number.isInteger(sourceTabId)||!Number.isInteger(tabId)||sourceTabId===tabId||(!/^https?:\/\//i.test(url||'')&&url!=='about:blank'&&url!==''))return;
      let {sqcAuth:auth,sqcContexts={},sqcTabBindings={},sqcLaunchHints={}}=await chrome.storage.session.get(['sqcAuth','sqcContexts','sqcTabBindings','sqcLaunchHints']);
      const parent=sqcTabBindings[sourceTabId],requested=/^https?:\/\//i.test(url||'')?hints(url):{};
      if(auth)auth=forProfile(auth,parent?.profileId);
      const pending=sqcLaunchHints[sourceTabId];
      if(pending&&!sqcLaunchHints[tabId]&&!sqcTabBindings[tabId]&&Object.keys(sqcLaunchHints).length<100&&
        !Object.keys(requested).length){
        await chrome.storage.session.set({sqcLaunchHints:{...sqcLaunchHints,[tabId]:{...pending,parentTabId:sourceTabId}}});
      }
      if(!auth||parent?.authSessionId!==auth.sessionId||parent.profileId!==auth.assignment?.profileId||parent.profileAssignmentVersion!==auth.assignment.version||
        ['applicationSessionId','jobId','profileId'].some(name=>requested[name]&&requested[name]!==parent[name])||sqcTabBindings[tabId])return;
      await chrome.storage.session.set({sqcTabBindings:{...sqcTabBindings,[tabId]:{...parent,parentTabId:sourceTabId}}});
      const source=sqcContexts[sourceTabId];if(source&&localResumes){const binding=localResume.binding(auth,source),document=await localResumes.get(sourceTabId,binding);if(document)await localResumes.put(tabId,binding,document);}
    });
    const forgetTab=tabId=>serialize(async()=>{const {sqcAuth:auth,sqcContexts={},sqcTabBindings={},sqcLaunchHints={}}=await chrome.storage.session.get(['sqcAuth','sqcContexts','sqcTabBindings','sqcLaunchHints']);const previous=sqcTabBindings[tabId];delete sqcContexts[tabId];delete sqcTabBindings[tabId];delete sqcLaunchHints[tabId];await chrome.storage.session.set({sqcContexts,sqcTabBindings,sqcLaunchHints});const {sqcApplicationRecovery={}}=await chrome.storage.local.get('sqcApplicationRecovery');delete sqcApplicationRecovery[tabId];await chrome.storage.local.set({sqcApplicationRecovery});await localResumes?.remove(tabId);for(const key of contextConflicts.keys())if(key.includes('|'+tabId+'|'))contextConflicts.delete(key);if(auth&&previous&&!Object.values(sqcTabBindings).some(b=>b.applicationSessionId===previous.applicationSessionId))await journal?.remove(auth,previous);for(const [key,op] of pendingAnswers)if(key.startsWith(tabId+':'))op.controller.abort();});
    return { handle, clear, forgetTab,inheritTab,rememberLaunch };
  }
  root.SQCApplyFlowSession = { create };
  if (typeof module !== 'undefined') module.exports = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
