'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../content/context-policy');
const screening = require('../content/screening-policy');
require('../content/resume-context');
require('../content/candidate-reference');
require('../content/live-progress');
require('../background/application-journal');
const localResume = require('../background/local-resume');
const { create } = require('../background/applyflow-session');

function fixture(deployment,defaultApiOrigin='') {
  let clock = Date.parse('2026-11-11T12:00:00Z');
  const future = () => new Date(clock + 3600000).toISOString();
  function area(seed = {}) {
    const data = structuredClone(seed);
    return { data, async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, structuredClone(data[k])]));
    }, async set(value) { Object.assign(data, structuredClone(value)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; } };
  }
  const tabs = { 1: { id: 1, url: 'https://jobs.example/roles/1#application_session_id=application-1' },
    2: { id: 2, url: 'https://jobs.example/roles/2#application_session_id=application-2' } };
  const chrome = { runtime: { id: 'sqc', getURL: p => 'chrome-extension://sqc/' + p },
    storage: { local: area({ sqcConnection: { apiOrigin: 'https://applyflow.example' }, settings: {} }), session: area() },
    tabs: { async get(id) { return structuredClone(tabs[id]); } } };
  let signedIn = true, applier = 'applier-1', mutate = c => c, onContext = () => {}, ack = true;
  let password = 'temporary-test-password', passwordChangeRequired = false, assigned = true, generation = 0;
  let lockedProfileId = 'profile-1', assignmentVersion = '1', logoutUnavailable = false, challengeExpired = false;
  let mutateSession = data => data;
  const sessionId = () => 'auth-' + applier + (generation ? '-' + generation : '');
  const assignedProfile = () => ({ id: lockedProfileId, version: 'v1', verified: true, fullName: 'Candidate ' + lockedProfileId.slice(-1) });
  const assignment = () => ({ id: 'assignment-1', version: assignmentVersion, status: 'ACTIVE', applierId: applier, profileId: lockedProfileId, profileVersion: 'v1' });
  const calls = [];
  let interceptFetch = null;
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (interceptFetch) {const intercepted=await interceptFetch(url,options);if(intercepted)return intercepted;}
    if (url.endsWith('/api/sqc/auth')) return { status: 200, ok: true, async json() {
      return { success: true, contractVersion: 2, csrfToken: 'login-challenge', expiresAt: challengeExpired ? '2020-01-01T00:00:00Z' : future() };
    } };
    if (url.endsWith('/api/sqc/login')) {
      const b = JSON.parse(options.body);
      if (b.email !== 'applier@example.com' || b.password !== password) return { status: 401 };
      signedIn = true; generation++;
      return { status: 200, ok: true, async json() { return { success: true, contractVersion: 2 }; } };
    }
    if (!signedIn) return { status: 401 };
    if (url.endsWith('/files/expired.pdf')) return {status:401, ok:false};
    if (url.endsWith('/files/resume.pdf')) return {status:200, ok:true,
      headers: {get: key => key === 'content-type' ? 'application/pdf' : null},
      async arrayBuffer() {return new TextEncoder().encode('%PDF-1.7\nVerified generated resume').buffer;} };
    let data;
    if (url.endsWith('/api/sqc/session')) data = { success: true, contractVersion: 2,
      session: { id: sessionId(), expiresAt: future(), passwordChangeRequired },
      applier: { id: applier, name: applier, email: 'applier@example.com' }, csrfToken: 'server-csrf',
      profileAssignment: assigned ? assignment() : null, profile: assigned ? assignedProfile() : null };
    else if (url.endsWith('/api/sqc/logout')) {
      if (logoutUnavailable) throw new Error('Server offline');
      signedIn = false; data = { success: true };
    }
    else if (url.endsWith('/api/sqc/password')) {
      const b = JSON.parse(options.body);
      if (b.currentPassword !== password) return { status: 400, ok: false, async json() { return { success: false }; } };
      password = b.newPassword; passwordChangeRequired = false; generation++; data = { success: true };
    }
    else if (url.endsWith('/api/sqc/application-context')) {
      const b = JSON.parse(options.body);
      const n = b.url.includes('/roles/2') ? '2' : '1';
      data = { success: true, contractVersion: 2, context: mutate({ applicationSessionId: 'application-' + n,
        authSessionId: sessionId(), expiresAt: future(), applier: { id: applier },
        assignment: { status: 'ACTIVE', applierId: applier, profileId: lockedProfileId, jobId: 'job-' + n,
          profileAssignmentId: 'assignment-1', profileAssignmentVersion: assignmentVersion },
        profile: assignedProfile(),
        job: { id: 'job-' + n, version: 'v1', title: 'Engineer', company: 'Example' },
        resume: { id: 'resume-1', profileId: lockedProfileId, version: 'v1', verified: true, text: 'Verified resume' },
        allowedRoutes: [{ url: 'https://jobs.example/roles/' + n, includeSubpaths: true }], status: 'PENDING' }) };
      onContext();
    } else if (url.endsWith('/api/sqc/answer-questions')) {
      const b = JSON.parse(options.body);
      data = {
        success: true,
        contractVersion: 2,
        applicationSessionId: b.applicationSessionId,
        requestId: b.requestId,
        jobId:b.jobId,jobVersion:b.jobVersion,profileId:b.profileId,profileVersion:b.profileVersion,resumeId:b.resumeId,resumeVersion:b.resumeVersion,
        answers: (b.questions || []).map(q => ({
          id: q.id,
          question: q.question,
          answer: 'Codex answer for ' + q.question,
          status: 'ANSWERED',
          confidence: 0.95,
        })),
        meta: { questionsCount: (b.questions || []).length },
      };
    } else {
      const b = JSON.parse(options.body);
      data = { success: true, accepted: ack, eventId: b.event_id, applicationSessionId: b.application_session_id, recordId: 'record-1' };
    }
    if (url.endsWith('/api/sqc/session')) data = mutateSession(data);
    return { status: 200, ok: true, async json() { return data; } };
  };
  const localResumes = localResume.memoryStore();
  const service = create({ chrome, fetch, policy, screening, localResume, localResumes,deployment,defaultApiOrigin,sleep:async()=>{}, now: () => clock });
  const sender = id => ({ url: tabs[id].url, tab: structuredClone(tabs[id]) });
  const ui = { url: 'chrome-extension://sqc/popup/popup.html' };
  return { service, chrome, calls, tabs, sender, ui, localResumes, now: () => clock,
    restart() { return create({ chrome, fetch, policy, screening, localResume, localResumes,deployment,defaultApiOrigin,sleep:async()=>{}, now: () => clock }); },
    intercept(fn) {interceptFetch=fn;},
    advance(ms) { clock += ms; }, signOut() { signedIn = false; }, changeApplier() { applier = 'applier-2'; },
    requirePasswordChange() { passwordChangeRequired = true; }, unassign() { assigned = false; },
    reassign() { lockedProfileId = 'profile-2'; assignmentVersion = '2'; },
    failLogout() { logoutUnavailable = true; }, expireChallenge() { challengeExpired = true; },
    mutateSession(fn) { mutateSession = fn; },
    mutate(fn) { mutate = fn; }, duringContext(fn) { onContext = fn; }, noAck() { ack = false; } };
}

test('connections accept HTTPS origins and localhost only; reject credentials and paths', () => {
  assert.equal(policy.origin('https://applyflow.example'), 'https://applyflow.example');
  assert.equal(policy.origin('http://localhost:5000'), 'http://localhost:5000');
  for (const url of ['http://remote.example', 'https://user:pass@applyflow.example', 'https://applyflow.example/api', 'file:///']) {
    assert.throws(() => policy.origin(url));
  }
});
test('job route matching respects origin, path boundaries, and job-identifying query parameters', () => {
  const r = [{ url: 'https://jobs.example/apply?job=1', includeSubpaths: true }];
  assert.equal(policy.matchesUrl('https://jobs.example/apply/step2?job=1&utm=x', r), true);
  for (const url of ['https://jobs.example/apply?job=2', 'https://other.example/apply?job=1', 'https://jobs.example/apply-other?job=1']) {
    assert.equal(policy.matchesUrl(url, r), false);
  }
});
test('unconnected extension has no candidate fallback', async () => {
  const f = fixture(); await f.chrome.storage.local.remove('sqcConnection');
  const result = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(result.integration.state, 'DISCONNECTED');
  assert.equal(result.activeProfile, null); assert.deepEqual(result.profiles, []); assert.equal(f.calls.length, 0);
});

test('a shared fresh install uses the bundled deployed API and goes directly to credential sign-in',async()=>{
  const apiOrigin=require('../config/connection').apiOrigin,f=fixture(undefined,apiOrigin);await f.chrome.storage.local.remove('sqcConnection');
  const initial=await f.service.handle({type:'GET_CONFIG'},f.ui);
  assert.equal(initial.integration.apiOrigin,'https://applyflow-api.jhproit.com');assert.equal(initial.integration.state,'SIGNED_OUT');assert.equal(initial.activeProfile,null);assert.equal(f.calls.length,0);
  const login=await f.service.handle({type:'SQC_LOGIN',email:'applier@example.com',password:'temporary-test-password'},f.ui);
  assert.equal(login.integration.applier.email,'applier@example.com');assert.ok(f.calls.every(call=>call.url.startsWith(apiOrigin+'/')));
  assert.equal((await f.restart().handle({type:'GET_CONFIG'},f.ui)).integration.apiOrigin,apiOrigin);
  await f.service.handle({type:'SQC_LOGOUT'},f.ui);const signedOut=await f.service.handle({type:'GET_CONFIG'},f.ui);assert.equal(signedOut.integration.apiOrigin,apiOrigin);assert.equal(signedOut.integration.state,'SIGNED_OUT');
});

test('bundled API bootstraps direct sign-in while an explicitly saved workspace remains selected',async()=>{
  const f=fixture(undefined,'https://applyflow-api.jhproit.com');
  assert.equal((await f.service.handle({type:'GET_CONFIG'},f.ui)).integration.apiOrigin,'https://applyflow.example');
  await f.chrome.storage.local.remove('sqcConnection');
  const login=await f.service.handle({type:'SQC_LOGIN',email:'applier@example.com',password:'temporary-test-password'},f.ui);assert.equal(login.integration.apiOrigin,'https://applyflow-api.jhproit.com');
});
test('verified context locks identity, loads approved resume, and never exposes CSRF to content', async () => {
  const f = fixture();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'VERIFIED'); assert.equal(r.settings.isProfileLocked, true);
  assert.equal(r.activeProfile.resumeText, 'Verified resume'); assert.equal(r.settings.applierId, 'applier-1');
  assert.ok(!JSON.stringify(r).includes('server-csrf'));
  assert.equal(f.calls[1].options.headers['X-SQC-CSRF'], 'server-csrf');
  assert.equal(f.calls[1].options.credentials, 'include');
  assert.equal(f.calls[0].options.headers['X-SQC-Extension-Id'], 'sqc');
});

test('a generated job resume is fetched with extension credentials and supplies its own skills', async () => {
  const f=fixture();
  const bytes=new TextEncoder().encode('%PDF-1.7\nVerified generated resume');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  f.mutate(c=>({...c,job:{...c.job,tailoringRequired:true},resume:{...c.resume,kind:'tailored',jobId:c.job.id,
    skills:['TypeScript','PostgreSQL'],file:{url:'/files/resume.pdf',filename:'Candidate-generated.pdf',sha256}}}));
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(result.integration.state,'VERIFIED');
  assert.equal(result.activeProfile.resumeIsTailored,true);
  assert.equal(result.activeProfile.resumeTailoringRequired,true);
  assert.deepEqual(result.activeProfile.primaryStackKeywords,['TypeScript','PostgreSQL']);
  assert.ok(result.activeProfile.resumeBase64.startsWith('data:application/pdf;base64,'));
  const download=f.calls.find(call=>call.url.endsWith('/files/resume.pdf'));
  assert.equal(download.options.credentials,'include'); assert.equal(download.options.redirect,'error');
  assert.equal(f.chrome.storage.session.data.sqcContexts[1].resume.file.dataUrl,undefined);
});

test('a wrong generated file or foreign-origin download cannot be attached, while candidate context stays available', async () => {
  for(const file of [{url:'https://foreign.example/resume.pdf'}, {url:'/files/resume.pdf',sha256:'0'.repeat(64)}]) {
    const f=fixture();f.mutate(c=>({...c,resume:{...c.resume,file}}));
    const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
    assert.equal(result.integration.state,'VERIFIED');assert.equal(result.activeProfile.resumeBase64,'');
    assert.ok(result.activeProfile.resumeFileError);
    assert.equal(f.calls.some(call=>call.url.startsWith('https://foreign.example')),false);
  }
});

test('deployed PDF policy requests and selects an explicit verified PDF variant, preserving its original bytes',async()=>{
 const managed=structuredClone(require('../config/runtime').defaults),f=fixture({load:async()=>managed});
 f.mutate(c=>({...c,resume:{...c.resume,skills:[{name:'Python',years:8},{skill:'SQL'}],facts:{skills:[]},file:{filename:'Candidate.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',url:'/files/resume.docx'},files:{pdf:{filename:'Candidate.pdf',mimeType:'application/pdf',url:'/files/resume.pdf'}}}}));
 const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
 assert.equal(result.activeProfile.resumeFilename,'Candidate.pdf');assert.equal(result.activeProfile.resumeMimeType,'application/pdf');assert.deepEqual(result.activeProfile.primaryStackKeywords,['Python','SQL']);
 assert.equal(atob(result.activeProfile.resumeBase64.split(',')[1]),'%PDF-1.7\nVerified generated resume');
 assert.equal(JSON.parse(f.calls.find(call=>call.url.endsWith('/application-context')).options.body).preferredResumeFormat,'pdf');
 assert.equal(f.calls.some(call=>call.url.endsWith('/files/resume.docx')),false);
});

test('PDF policy blocks silent DOCX attachment without blocking resume text context or replacing uploaded originals',async()=>{
 const managed=structuredClone(require('../config/runtime').defaults),f=fixture({load:async()=>managed});
 f.mutate(c=>({...c,resume:{...c.resume,file:{filename:'Candidate.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',url:'/files/resume.docx'}}}));
 const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.activeProfile.resumeBase64,'');assert.match(result.activeProfile.resumeFileError,/non-PDF/);assert.equal(result.activeProfile.resumeText,'Verified resume');
 const uploaded=await uploadLocal(f);assert.equal(uploaded.activeProfile.resumeSource,'sqc_upload');assert.ok(uploaded.activeProfile.resumeBase64.startsWith('data:text/plain'));
});

test('a PDF filename cannot disguise non-PDF bytes',async()=>{
 const managed=structuredClone(require('../config/runtime').defaults),f=fixture({load:async()=>managed});
 f.mutate(c=>({...c,resume:{...c.resume,file:{filename:'Candidate.pdf',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,'+btoa('PK not a PDF')}}}));
 const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.activeProfile.resumeBase64,'');assert.match(result.activeProfile.resumeFileError,/actual PDF bytes/);
});

test('a tailored resume for another job cannot establish a verified context', async () => {
  const f=fixture();f.mutate(c=>({...c,resume:{...c.resume,kind:'tailored',jobId:'other-job'}}));
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(result.settings.verifiedContext,null);assert.equal(result.integration.state,'CONTEXT_MISMATCH');
});

test('a rejected resume download does not sign out the authenticated account or hide the assigned profile', async () => {
  const f=fixture();f.mutate(c=>({...c,resume:{...c.resume,file:{url:'/files/expired.pdf'}}}));
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(result.integration.state,'VERIFIED');assert.equal(result.activeProfile.fullName,'Candidate 1');
  assert.equal(result.activeProfile.resumeBase64,'');assert.match(result.activeProfile.resumeFileError,/HTTP 401/);
  assert.equal(f.chrome.storage.session.data.sqcAuth.applier.id,'applier-1');
});

test('sign-in establishes only account context even when a job tab ID is supplied',async()=>{
  const f=fixture();
  const result=await f.service.handle({type:'SQC_LOGIN',email:'applier@example.com',password:'temporary-test-password',tabId:1},f.ui);
  assert.equal(result.integration.state,'AUTHENTICATED');assert.equal(result.activeProfile.id,'profile-1');assert.equal(result.settings.verifiedContext,null);
  assert.deepEqual(f.calls.map(c=>new URL(c.url).pathname),['/api/sqc/auth','/api/sqc/login','/api/sqc/session']);
  assert.equal(JSON.parse(f.calls.find(c=>c.url.endsWith('/login')).options.body).allowResumeGeneration,false);
});
test('ApplyFlow workspace and login pages do not request job context or resume files',async()=>{
  const f=fixture();f.tabs[1].url='https://applyflow.example/login#application_session_id=application-1';
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.integration.state,'AUTHENTICATED');
  assert.equal(result.settings.verifiedContext,null);assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/session'));
});
test('job verification explicitly requests an existing resume without generation',async()=>{
  const f=fixture();f.mutate(c=>({...c,resume:null}));const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(result.integration.state,'VERIFIED');assert.equal(result.activeProfile.resumeReady,false);
  const body=JSON.parse(f.calls.find(c=>c.url.endsWith('/application-context')).options.body);assert.equal(body.resumePolicy,'existing-only');assert.equal(body.allowResumeGeneration,false);
  assert.equal(f.calls.length,2);
});
test('an absent parsed resume does not prevent automatic job activation or original-file upload',async()=>{
  const f=fixture();f.mutate(c=>({...c,resume:{...c.resume,text:undefined,file:{filename:'existing.pdf',url:'/files/resume.pdf'}}}));
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.integration.state,'VERIFIED');assert.equal(result.activeProfile.resumeReady,false);
  assert.match(result.activeProfile.resumeFileError,/no parsed resume text/);assert.equal(f.calls.some(call=>call.url.endsWith('/files/resume.pdf')),false);
  const upload=await f.service.handle({type:'SQC_SET_LOCAL_RESUME',context:result.settings.verifiedContext,resume:{filename:'draft.txt',dataUrl:'data:text/plain;base64,'+btoa(localText),text:localText,confirmed:true}},f.sender(1));
  assert.equal(upload.success,true);assert.equal(upload.activeProfile.resumeReady,true);
});
test('context failures identify the exact mismatched tracking or assignment field without exposing credentials',async()=>{
  const f=fixture();f.mutate(c=>({...c,applicationSessionId:'wrong-launch',profile:{...c.profile,version:'wrong-version'}}));
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.integration.state,'CONTEXT_MISMATCH');
  assert.ok(result.integration.validationFields.includes('context.profile.version'));assert.match(result.integration.message,/applicationSessionId/);
  assert.equal(result.integration.path,'/api/sqc/application-context');assert.equal(JSON.stringify(result).includes('server-csrf'),false);
});
test('a profile version updated after sign-in refreshes the assignment and retries verification once automatically',async()=>{
  const f=fixture();let version='v1';
  f.mutateSession(data=>({...data,profile:{...data.profile,version},profileAssignment:{...data.profileAssignment,profileVersion:version}}));
  f.mutate(c=>{version='v2';return {...c,profile:{...c.profile,version}};});
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.integration.state,'VERIFIED');assert.equal(result.settings.verifiedContext.profileVersion,'v2');
  assert.equal(f.calls.filter(c=>c.url.endsWith('/session')).length,2);assert.equal(f.calls.filter(c=>c.url.endsWith('/application-context')).length,2);
});
test('a generator base prompt yields only candidate reference facts, never resume bytes or job skills',async()=>{
  const f=fixture(),prompt='# RESUME JSON GENERATOR\nAct as a resume writer. Generate a fictional resume.\n## 2. Candidate Information\nName: Candidate 1\nLocation: Miami, FL 33196\nEducation:\nExample University — Bachelor of Science in Computer Science | May 1, 2015\n## 3. Tailoring rules\nInvent Python and Rust projects.';
  f.mutate(c=>({...c,resume:{...c.resume,kind:'base',text:prompt,file:{url:'/files/resume.pdf'}}}));
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.integration.state,'VERIFIED');assert.equal(cfg.activeProfile.city,'Miami');assert.equal(cfg.activeProfile.graduationYear,'2015');assert.equal(cfg.activeProfile.address,undefined);
  assert.equal(cfg.activeProfile.resumeReady,false);assert.equal(cfg.activeProfile.resumeText,'');assert.equal(cfg.activeProfile.resumeBase64,'');assert.deepEqual(cfg.activeProfile.primaryStackKeywords,[]);assert.equal(f.calls.some(call=>call.url.endsWith('/files/resume.pdf')),false);
});
test('two assigned candidates retain distinct per-tab assignments, including child tabs',async()=>{
  const f=fixture(),assignment={id:'assignment-2',version:'2',status:'ACTIVE',applierId:'applier-1',profileId:'profile-2',profileVersion:'v2'},profile={id:'profile-2',version:'v2',verified:true,fullName:'Candidate 2'};
  f.mutateSession(data=>({...data,assignedProfiles:[{assignment,profile}]}));
  f.mutate(c=>c.job.id==='job-1'?{...c,profile,resume:{...c.resume,profileId:profile.id},assignment:{...c.assignment,profileId:profile.id,profileAssignmentId:assignment.id,profileAssignmentVersion:assignment.version}}:c);
  f.tabs[1].url+='&sqc_profile_id=profile-2';const first=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(first.settings.verifiedContext.profileId,'profile-2');assert.equal(first.integration.profileAssignment.id,'assignment-2');
  const second=await f.service.handle({type:'GET_CONFIG'},f.sender(2));assert.equal(second.settings.verifiedContext.profileId,'profile-1');assert.equal(f.chrome.storage.session.data.sqcAuth.profile.id,'profile-1');
  f.tabs[3]={id:3,url:'https://ats.example/step-two'};await f.service.inheritTab(1,3,f.tabs[3].url);
  const child=await f.service.handle({type:'GET_CONFIG'},f.sender(3));assert.equal(child.settings.verifiedContext.profileId,'profile-2');assert.equal(child.settings.verifiedContext.profileAssignmentId,'assignment-2');
});
test('empty live snapshots are skipped; actual input receives the backend IN_PROGRESS acknowledgement',async()=>{
  const f=fixture(),cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1)),c=cfg.settings.verifiedContext;
  const stamp={application_session_id:c.applicationSessionId,profile_assignment_id:c.profileAssignmentId,profile_assignment_version:c.profileAssignmentVersion,profile_version:c.profileVersion,job_version:c.jobVersion,resume_id:c.resumeId,resume_version:c.resumeVersion};
  let result=await f.service.handle({type:'DISPATCH_LIVE_FEEDBACK',payload:{...stamp,is_final_submission:false,job_status:'PENDING',validation_status:'IN_PROGRESS',extracted_data:{all_entries:[{label:'Email',value:''}]}}},f.sender(1));assert.equal(result.skipped,true);
  f.intercept((url,options)=>{if(url.endsWith('/live-event')){const p=JSON.parse(options.body);return jsonResponse({success:true,accepted:true,eventId:p.event_id,applicationSessionId:c.applicationSessionId,recordId:'record',status:'IN_PROGRESS'});}});
  result=await f.service.handle({type:'DISPATCH_LIVE_FEEDBACK',payload:{...stamp,is_final_submission:false,job_status:'PENDING',validation_status:'IN_PROGRESS',extracted_data:{all_entries:[{label:'Email',value:'candidate@example.com'}]}}},f.sender(1));
  assert.equal(result.applyFlowStatus,'IN_PROGRESS');assert.equal(f.chrome.storage.local.data.submissionsHistory,undefined);
});
test('job-unavailable events require stable worker evidence and never downgrade an applied candidate-job record',async()=>{
  const f=fixture(),cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1)),c=cfg.settings.verifiedContext;
  const payload={application_session_id:c.applicationSessionId,profile_assignment_id:c.profileAssignmentId,profile_assignment_version:c.profileAssignmentVersion,profile_version:c.profileVersion,job_version:c.jobVersion,resume_id:c.resumeId,resume_version:c.resumeVersion,job_status:'PORTAL_ACCESS_FAILED',is_final_submission:false,submission_confirmed_by:'AUTO_DETECTED_JOB_UNAVAILABLE',portal_evidence:{type:'JOB_UNAVAILABLE_NOTICE',url:f.tabs[1].url,message:'404 (Not found)',observedAt:new Date(f.now()).toISOString(),intermediate:false}};
  assert.equal((await f.service.handle({type:'LOG_SUBMISSION',payload},f.sender(1))).success,false);assert.equal(f.calls.some(call=>call.url.endsWith('/webhook')),false);
  f.chrome.storage.session.data.sqcPortalAvailability={1:{confirmed:true,unavailable:true,url:f.tabs[1].url,applicationSessionId:c.applicationSessionId,jobId:c.jobId,profileId:c.profileId,evidence:payload.portal_evidence.message,checkedAt:f.now()}};
  f.intercept((url,options)=>url.endsWith('/webhook')?jsonResponse({success:true,accepted:true,eventId:JSON.parse(options.body).event_id,applicationSessionId:c.applicationSessionId,recordId:'record',status:'LINK_NOT_FOUND'}):undefined);
  const report=await f.service.handle({type:'LOG_SUBMISSION',payload},f.sender(1));assert.equal(report.applyFlowStatus,'LINK_NOT_FOUND');
  const count=f.calls.filter(call=>call.url.endsWith('/webhook')).length;f.mutate(context=>({...context,status:'APPLIED'}));
  const protectedResult=await f.service.handle({type:'LOG_SUBMISSION',payload},f.sender(1));assert.equal(protectedResult.skipped,true);assert.equal(protectedResult.applyFlowStatus,'APPLIED');assert.equal(f.calls.filter(call=>call.url.endsWith('/webhook')).length,count);
});
test('transient account outages retain display context without permitting application actions',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.ui);f.advance(31000);
  f.intercept(url=>{if(url.endsWith('/session'))throw new Error('Network unavailable');});
  const ui=await f.service.handle({type:'GET_CONFIG',force:true},f.ui);assert.equal(ui.integration.accountVerified,false);assert.equal(ui.integration.applier.id,'applier-1');assert.equal(ui.activeProfile.id,'profile-1');assert.equal(ui.settings.verifiedContext,null);
  const content=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(content.activeProfile,null);assert.equal(content.settings.verifiedContext,null);
  f.intercept(null);assert.equal((await f.service.handle({type:'GET_CONFIG',force:true},f.ui)).integration.state,'AUTHENTICATED');
});
test('job request authorization failures do not revoke a valid account session',async()=>{
  const f=fixture();f.intercept(url=>url.endsWith('/application-context')?{status:401,ok:false}:undefined);
  const result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.integration.state,'REQUEST_UNAUTHORIZED');assert.equal(result.settings.verifiedContext,null);
  assert.equal(f.chrome.storage.session.data.sqcAuth.applier.id,'applier-1');assert.equal(f.chrome.storage.local.data.sqcConnection.signedOut,undefined);
});
test('a confirmed rejected session stays signed out instead of retrying ambient website authentication',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.ui);f.signOut();
  assert.equal((await f.service.handle({type:'GET_CONFIG',force:true},f.ui)).integration.state,'SIGNED_OUT');
  const count=f.calls.length;
  assert.equal((await f.service.handle({type:'GET_CONFIG'},f.ui)).integration.state,'SIGNED_OUT');assert.equal(f.calls.length,count);
});
test('a later approved portal step can discover the existing job without URL launch parameters', async () => {
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.tabs[1].url='https://jobs.example/roles/1/step2';
  const allowed=await f.service.handle({type:'SQC_PORTAL_ELIGIBILITY'},f.sender(1));
  assert.equal(allowed.eligible,true);
  f.tabs[1].url='https://unrelated.example/';
  f.intercept((url,options)=>url.endsWith('/application-context')&&JSON.parse(options.body).url.includes('unrelated.example')?{status:403,ok:false}:undefined);
  assert.equal((await f.service.handle({type:'SQC_PORTAL_ELIGIBILITY'},f.sender(1))).eligible,false);
  f.intercept(null);
  f.advance(61000);f.tabs[1].url='https://jobs.example/roles/1/step2';
  assert.equal((await f.service.handle({type:'SQC_PORTAL_ELIGIBILITY'},f.sender(1))).eligible,true);
  const renewed=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(renewed.integration.state,'VERIFIED');assert.ok(renewed.settings.verifiedContext.expiresAt>f.now());
  await f.service.handle({type:'SQC_LOGOUT'},f.ui);
  assert.equal((await f.service.handle({type:'SQC_PORTAL_ELIGIBILITY'},f.sender(1))).eligible,false);
});
test('approved multi-page navigation retains the job and local resume after worker restart', async () => {
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const original=f.chrome.storage.session.data.sqcContexts[1];
  const auth=f.chrome.storage.session.data.sqcAuth;
  const resume={id:'sqc-upload:test',version:'test',source:'sqc_upload',kind:'tailored',profileId:original.profile.id,text:'Reviewed local resume',file:{}};
  await f.localResumes.put(1,localResume.binding(auth,original),resume);
  f.advance(61000);f.tabs[1].url='https://jobs.example/roles/1/application/experience';
  const result=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(result.settings.verifiedContext.applicationSessionId,'application-1');
  assert.equal(result.activeProfile.resumeText,resume.text);
  const call=f.calls.filter(c=>c.url.endsWith('/application-context')).at(-1);
  assert.equal(JSON.parse(call.options.body).applicationSessionId,'application-1');
});

test('an approved continuation in a new tab retains the unambiguous session and reviewed resume', async () => {
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const context=f.chrome.storage.session.data.sqcContexts[1],auth=f.chrome.storage.session.data.sqcAuth;
  await f.localResumes.put(1,localResume.binding(auth,context),{id:'sqc-upload:test',version:'test',source:'sqc_upload',kind:'tailored',profileId:context.profile.id,text:'Same job resume',file:{}});
  f.tabs[3]={id:3,url:'https://jobs.example/roles/1/application/experience'};
  const cfg=await f.restart().handle({type:'GET_CONFIG'},f.sender(3));
  assert.equal(cfg.settings.verifiedContext.applicationSessionId,'application-1');
  assert.equal(cfg.activeProfile.resumeText,'Same job resume');
  assert.equal(f.chrome.storage.session.data.sqcContexts[3].job.id,'job-1');
  f.tabs[3].url='https://jobs.example/roles/2#application_session_id=application-2';
  const other=await f.service.handle({type:'GET_CONFIG'},f.sender(3));
  assert.equal(other.settings.verifiedContext.jobId,'job-2');
  assert.notEqual(other.activeProfile.resumeText,'Same job resume');
});

test('a backend-rejected step keeps continuity hints but pauses application actions', async () => {
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.tabs[1].url='https://jobs.example/applications/experience';
  f.intercept(url=>url.endsWith('/application-context')?{status:403,ok:false}:undefined);
  const denied=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(denied.settings.verifiedContext,null);
  const call=f.calls.filter(c=>c.url.endsWith('/application-context')).at(-1);
  const body=JSON.parse(call.options.body);
  assert.equal(body.previousApplicationSessionId,'application-1');
  assert.equal(body.applicationSessionId,'application-1');
  assert.equal(body.jobId,'job-1');
  f.intercept(null);
  // Reinstall the initial route, then simulate trusted backend approval of the new step.
  f.tabs[1].url='https://jobs.example/roles/1#application_session_id=application-1';
  await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:'https://jobs.example/applications/experience'}]}));
  f.tabs[1].url='https://jobs.example/applications/experience';
  const approved=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(approved.settings.verifiedContext.applicationSessionId,'application-1');
});

test('an empty intermediate page can request backend approval through portal discovery', async () => {
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:'https://jobs.example/applications/review'}]}));
  f.tabs[1].url='https://jobs.example/applications/review';
  const allowed=await f.service.handle({type:'SQC_PORTAL_ELIGIBILITY'},f.sender(1));
  assert.equal(allowed.eligible,true);
  assert.equal(JSON.parse(f.calls.filter(c=>c.url.endsWith('/application-context')).at(-1).options.body).previousApplicationSessionId,'application-1');
});

test('ambiguous contexts in other tabs cannot select a continuation session', async () => {
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  await f.service.handle({type:'GET_CONFIG'},f.sender(2));
  const contexts=f.chrome.storage.session.data.sqcContexts;
  contexts[2].allowedRoutes=contexts[1].allowedRoutes;
  f.tabs[3]={id:3,url:'https://jobs.example/roles/1/experience'};
  await f.service.handle({type:'GET_CONFIG'},f.sender(3));
  const body=JSON.parse(f.calls.filter(c=>c.url.endsWith('/application-context')).at(-1).options.body);
  assert.equal(body.applicationSessionId,undefined);
  assert.equal(body.previousApplicationSessionId,undefined);
});

test('two job tabs retain isolated job contexts under the applier locked profile across worker restart', async () => {
  const f = fixture();
  await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const b = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(2));
  assert.equal(b.activeProfile.id, 'profile-1');
  assert.equal(b.settings.verifiedContext.jobId, 'job-2');
  const restarted = create({ chrome: f.chrome, fetch: async () => { throw new Error('Unexpected fetch'); }, policy, localResumes:f.localResumes, now: f.now });
  const a = await restarted.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(a.activeProfile.id, 'profile-1');
  assert.equal(a.settings.verifiedContext.jobId, 'job-1');
});
for (const [name, mutation] of [
  ['wrong applier', c => ({ ...c, applier: { id: 'attacker' } })],
  ['wrong assignment owner', c => ({ ...c, assignment: { ...c.assignment, applierId: 'other' } })],
  ['unverified profile', c => ({ ...c, profile: { ...c.profile, verified: false } })],
  ['missing profile version', c => ({ ...c, profile: { ...c.profile, version: null } })],
  ['unverified resume', c => ({ ...c, resume: { ...c.resume, verified: false } })],
  ['resume owned by another candidate', c => ({ ...c, resume: { ...c.resume, profileId: 'other' } })],
  ['mismatched job assignment', c => ({ ...c, assignment:{...c.assignment,jobId:'wrong-job'} })],
  ['revoked assignment', c => ({ ...c, assignment: { ...c.assignment, status: 'REVOKED' } })],
  ['expired context', c => ({ ...c, expiresAt: '2020-01-01T00:00:00Z' })]
]) test('rejects ' + name, async () => {
  const f = fixture(); f.mutate(mutation);
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'CONTEXT_MISMATCH'); assert.equal(r.settings.verifiedContext, null);
});
test('URL profile hints cannot override the backend assignment', async () => {
  const f = fixture(); f.tabs[1].url += '&profile_id=forged-profile';
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.settings.verifiedContext, null);
});
test('a stale network response cannot attach a candidate after navigation', async () => {
  const f = fixture(); f.duringContext(() => { f.tabs[1].url = 'https://jobs.example/roles/2'; });
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'STALE_CONTEXT'); assert.equal(r.settings.verifiedContext, null);
});
test('sign-out removes cached assignments; force refresh never uses stale candidate', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1)); f.signOut();
  const r = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(r.integration.state, 'SIGNED_OUT'); assert.equal(r.activeProfile, null);
  assert.equal(f.chrome.storage.session.data.sqcContexts, undefined);
});
test('expired lease stops content actions, even if portal looks submitted', async () => {
  const f = fixture(); const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(policy.ready(r.settings, f.tabs[1].url, f.now()), true);
  f.advance(61000);
  assert.equal(policy.ready(r.settings, f.tabs[1].url, f.now()), false);
});
test('a changed assignment hint invalidates a still-live content lease', async () => {
  const f = fixture(); const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(policy.ready(r.settings, f.tabs[1].url.replace('application-1', 'application-2'), f.now()), false);
});
test('ATS-owned job_id query parameters cannot replace ApplyFlow identifiers', async () => {
  const f = fixture();
  f.tabs[1].url = 'https://jobs.example/roles/1?job_id=portal-uuid#application_session_id=application-1';
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'VERIFIED');
  assert.equal(policy.ready(r.settings, f.tabs[1].url, f.now()), true);
});
test('local profile management and portal-driven connection changes are rejected', async () => {
  const f = fixture();
  for (const type of ['SAVE_PROFILE', 'ADMIN_UNLOCK_PROFILE', 'SET_ACTIVE_PROFILE', 'SQC_CONNECT', 'SQC_DISCONNECT', 'SAVE_SETTINGS', 'SQC_LOGIN', 'SQC_LOGOUT', 'SQC_CHANGE_PASSWORD']) {
    assert.equal((await f.service.handle({ type, apiOrigin: 'https://evil.example' }, f.sender(1))).success, false);
  }
});
test('UI preferences cannot unlock or override authenticated identity', async () => {
  const f = fixture();
  await f.service.handle({ type: 'SAVE_SETTINGS', settings: { applierId: 'forged', integrationMode: 'local', isProfileLocked: false, autoAutofillOnPageLoad: false } }, f.ui);
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.settings.applierId, 'applier-1'); assert.equal(r.settings.isProfileLocked, true);
  assert.equal(r.settings.integrationMode, 'applyflow'); assert.equal(r.settings.autoAutofillOnPageLoad, false);
});
test('events use verified identities and configured origin; server acknowledgement is required', async () => {
  const f = fixture();
  const msg = { type: 'LOG_SUBMISSION', action: 'APPLYFLOW_WEBHOOK', serverUrl: 'https://evil.example',
    payload: { application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1',
      profile_assignment_id: 'assignment-1', profile_assignment_version: '1',
      resume_id: 'resume-1', resume_version: 'v1', applier_id: 'forged', profile_id: 'forged', serverUrl: 'https://evil.example', job_status: 'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{type:'SUCCESS_NOTICE',message:'Your application has been submitted',url:f.tabs[1].url,observedAt:new Date(f.now()).toISOString(),intermediate:false} } };
  const r = await f.service.handle(msg, f.sender(1)); assert.equal(r.success, true);
  const call = f.calls.find(value=>value.url.endsWith('/api/submissions/webhook')), payload = JSON.parse(call.options.body);
  assert.equal(call.url, 'https://applyflow.example/api/submissions/webhook');
  assert.equal(payload.applier_id, 'applier-1'); assert.equal(payload.profile_id, 'profile-1');
  assert.equal(payload.applier_email, 'applier@example.com');
  assert.equal(payload.serverUrl, undefined); assert.equal(payload.application_session_id, 'application-1');
  f.noAck(); assert.equal((await f.service.handle(msg, f.sender(1))).success, false);
  assert.equal(f.chrome.storage.local.data.submissionsHistory.length, 1);
});

test('profile changes while an audit event is in flight require fresh evidence', async () => {
  const f = fixture();
  await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.mutate(c => ({ ...c, profile: { ...c.profile, version: 'v2' } }));
  const r = await f.service.handle({ type: 'LOG_SUBMISSION', payload: {
    application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1', resume_id: 'resume-1', resume_version: 'v1',
    profile_assignment_id: 'assignment-1', profile_assignment_version: '1'
  } }, f.sender(1));
  assert.equal(r.success, false);
  assert.ok(!f.calls.some(call => call.url.endsWith('/api/submissions/webhook')));
});
test('authentication refresh binds new applier context and invalidates old tab assignments', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.changeApplier(); f.advance(31000);
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(2));
  assert.equal(r.settings.applierId, 'applier-2');
  assert.equal(f.chrome.storage.session.data.sqcContexts[1], undefined);
});
test('an extension options tab is privileged without becoming an application tab', async () => {
  const f = fixture();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, { ...f.ui, tab: { id: 99, url: f.ui.url } });
  assert.equal(r.integration.state, 'AUTHENTICATED'); assert.equal(r.activeProfile.id, 'profile-1');
});

test('first connection checks the server but requires explicit credentials despite an existing website session', async () => {
  const f = fixture(); await f.chrome.storage.local.remove('sqcConnection');
  const r = await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://applyflow.example' }, f.ui);
  assert.equal(r.integration.state, 'SIGNED_OUT');
  assert.equal(r.settings.applierId, '');
  assert.equal(r.activeProfile, null);
  assert.deepEqual(f.chrome.storage.local.data.sqcConnection, { apiOrigin: 'https://applyflow.example', signedOut: true });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://applyflow.example/api/sqc/auth');
  const refreshed = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.ui);
  assert.equal(refreshed.integration.state, 'SIGNED_OUT');
  assert.equal(f.calls.length, 1);
});

test('the guided setup can require credentials again on the same server without reusing website identity', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const r = await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://applyflow.example', requireLogin: true }, f.ui);
  assert.equal(r.integration.state, 'SIGNED_OUT');
  assert.equal(f.chrome.storage.session.data.sqcAuth, undefined);
  assert.equal(f.chrome.storage.session.data.sqcContexts, undefined);
});

test('the configured backend URL survives worker restart, sign-out, and assignment refresh', async () => {
  const f = fixture();
  await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://saved.applyflow.example', requireLogin: true }, f.ui);
  await f.chrome.storage.session.remove(['sqcAuth', 'sqcContexts']);
  const restarted = f.restart();
  const signedOut = await restarted.handle({ type: 'GET_CONFIG', force: true }, f.ui);
  assert.equal(signedOut.integration.apiOrigin, 'https://saved.applyflow.example');
  assert.equal(signedOut.integration.state, 'SIGNED_OUT');
  await restarted.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' }, f.ui);
  const refreshed = await restarted.handle({ type: 'GET_CONFIG', force: true }, f.ui);
  assert.equal(refreshed.integration.apiOrigin, 'https://saved.applyflow.example');
  assert.equal(refreshed.integration.state, 'AUTHENTICATED');
  await restarted.handle({ type: 'SQC_LOGOUT' }, f.ui);
  assert.equal(f.chrome.storage.local.data.sqcConnection.apiOrigin, 'https://saved.applyflow.example');
});

test('an invalid server challenge preserves the previously configured workspace', async () => {
  const f = fixture(); f.expireChallenge();
  await assert.rejects(f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://new.example' }, f.ui), /challenge is invalid or expired/);
  assert.equal(f.chrome.storage.local.data.sqcConnection.apiOrigin, 'https://applyflow.example');
});

test('setup signs in from a browser with no ApplyFlow website session and syncs its assigned profile', async () => {
  const f = fixture(); f.signOut(); await f.chrome.storage.local.remove('sqcConnection');
  const ui = { url: 'chrome-extension://sqc/onboarding/onboarding.html', tab: { id: 99 } };
  await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://applyflow.example' }, ui);
  const r = await f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' }, ui);
  assert.equal(r.integration.state, 'AUTHENTICATED');
  assert.equal(r.integration.applier.email, 'applier@example.com');
  assert.equal(r.activeProfile.id, 'profile-1');
  assert.equal(r.applyFlowContext, null);
  assert.equal(f.calls.filter(c => c.url.endsWith('/api/sqc/application-context')).length, 0);
});

test('the runtime extension ID is sent automatically for Store and local installations', async () => {
  for (const id of ['unpacked-development-id', 'published-store-id']) {
    const f = fixture(); f.chrome.runtime.id = id;
    await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
    assert.ok(f.calls.every(call => call.options.headers['X-SQC-Extension-Id'] === id));
  }
});

test('email/password sign-in bootstraps CSRF, locks the server-assigned profile, and never stores credentials', async () => {
  const f = fixture(); f.signOut();
  const message = { type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password', apiOrigin: 'https://evil.example' };
  const r = await f.service.handle(message, f.ui);
  assert.equal(r.integration.state, 'AUTHENTICATED');
  assert.equal(r.activeProfile.id, 'profile-1');
  assert.equal(r.settings.isProfileLocked, true);
  assert.equal(r.integration.profileAssignment.id, 'assignment-1');
  assert.equal(message.password, '');
  assert.equal(f.calls[0].url, 'https://applyflow.example/api/sqc/auth');
  const login = f.calls.find(c => c.url.endsWith('/api/sqc/login'));
  assert.equal(login.options.headers['X-SQC-CSRF'], 'login-challenge');
  assert.equal(JSON.parse(login.options.body).email, 'applier@example.com');
  assert.ok(!JSON.stringify(f.chrome.storage).includes('temporary-test-password'));
  assert.ok(!JSON.stringify(r).includes('login-challenge'));
});

test('invalid credentials clear previous identity and keep the extension signed out', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const message = { type: 'SQC_LOGIN', email: 'applier@example.com', password: 'wrong-password' };
  await assert.rejects(f.service.handle(message, f.ui), /Email or password is incorrect/);
  assert.equal(message.password, '');
  const result = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(result.integration.state, 'SIGNED_OUT'); assert.equal(result.activeProfile, null);
});

test('temporary password must be changed before a job context can be used', async () => {
  const f = fixture(); f.requirePasswordChange();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal(r.settings.verifiedContext, null);
  assert.equal(f.calls.filter(call => call.url.endsWith('application-context')).length, 0);
  const message = { type: 'SQC_CHANGE_PASSWORD', currentPassword: 'temporary-test-password', newPassword: 'new-test-password', tabId: 1 };
  const changed = await f.service.handle(message, f.ui);
  assert.equal(changed.integration.state, 'AUTHENTICATED');
  assert.equal(changed.activeProfile.id, 'profile-1');
  assert.equal(changed.integration.passwordChangeRequired, false);
  assert.equal(message.currentPassword, ''); assert.equal(message.newPassword, '');
  assert.ok(!JSON.stringify(f.chrome.storage).includes('new-test-password'));
  assert.equal(f.calls.some(call=>call.url.endsWith('/application-context')),false);
  assert.equal((await f.service.handle({type:'GET_CONFIG'},f.sender(1))).integration.state,'VERIFIED');
});

test('changing the password invalidates the old credentials', async () => {
  const f = fixture();
  await f.service.handle({ type: 'SQC_CHANGE_PASSWORD', currentPassword: 'temporary-test-password', newPassword: 'new-test-password' }, f.ui);
  await f.service.handle({ type: 'SQC_LOGOUT' }, f.ui);
  await assert.rejects(f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' }, f.ui), /incorrect/);
  const r = await f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'new-test-password' }, f.ui);
  assert.equal(r.integration.state, 'AUTHENTICATED');
});

test('sign-out revokes the backend session and persists the local lock across reconnect', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const r = await f.service.handle({ type: 'SQC_LOGOUT' }, f.ui);
  assert.equal(r.remoteSignedOut, true); assert.equal(r.integration.state, 'SIGNED_OUT');
  const reconnect = await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://applyflow.example' }, f.ui);
  assert.equal(reconnect.integration.state, 'SIGNED_OUT');
  assert.equal(reconnect.activeProfile, null);
});

test('an authenticated applier without an assigned profile cannot open a job context', async () => {
  const f = fixture(); f.unassign();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'UNASSIGNED'); assert.equal(r.activeProfile, null);
  assert.equal(r.settings.verifiedContext, null);
});

test('a job assignment cannot switch the candidate locked to the signed-in applier', async () => {
  const f = fixture();
  f.mutate(c => ({ ...c, profile: { ...c.profile, id: 'profile-2' },
    assignment: { ...c.assignment, profileId: 'profile-2' }, resume: { ...c.resume, profileId: 'profile-2' } }));
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'CONTEXT_MISMATCH');
  assert.equal(r.activeProfile.id, 'profile-1'); assert.equal(r.settings.verifiedContext, null);
});

test('an expired login challenge prevents sending credentials to the login endpoint', async () => {
  const f = fixture(); f.expireChallenge();
  const msg = { type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' };
  await assert.rejects(f.service.handle(msg, f.ui), /challenge is invalid or expired/);
  assert.equal(msg.password, '');
  assert.equal(f.calls.filter(c => c.url.endsWith('/api/sqc/login')).length, 0);
});

test('login rejects a backend session belonging to a different email', async () => {
  const f = fixture(); f.mutateSession(data => ({ ...data, applier: { ...data.applier, email: 'other@example.com' } }));
  await assert.rejects(f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' }, f.ui), /different signed-in email/);
  const result = await f.service.handle({ type: 'GET_CONFIG' }, f.ui);
  assert.equal(result.integration.state, 'SIGNED_OUT'); assert.equal(result.activeProfile, null);
});

test('local sign-out remains locked if backend logout fails and its cookie is still valid', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1)); f.failLogout();
  const r = await f.service.handle({ type: 'SQC_LOGOUT' }, f.ui);
  assert.equal(r.remoteSignedOut, false); assert.equal(r.integration.state, 'SIGNED_OUT');
  const calls = f.calls.length;
  const cfg = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(cfg.activeProfile, null); assert.equal(f.calls.length, calls);
});

test('server reassignment replaces the applier profile lock and invalidates old evidence versions', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.reassign();
  const r = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(r.activeProfile.id, 'profile-2');
  assert.equal(r.settings.verifiedContext.profileAssignmentVersion, '2');
  const stale = await f.service.handle({ type: 'LOG_SUBMISSION', payload: {
    application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1',
    resume_id: 'resume-1', resume_version: 'v1', profile_assignment_id: 'assignment-1', profile_assignment_version: '1'
  } }, f.sender(1));
  assert.equal(stale.success, false);
});

test('a wizard route without launch parameters preserves its verified application session ID', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.tabs[1].url = 'https://jobs.example/roles/1/step2';
  const r = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(r.integration.state, 'VERIFIED');
  const body = JSON.parse(f.calls.filter(c => c.url.endsWith('/api/sqc/application-context')).at(-1).options.body);
  assert.equal(body.applicationSessionId, 'application-1');
});

test('screening questions can be answered via /api/sqc/answer-questions with verified context', async () => {
  const f = fixture();
  const cfg=await uploadLocal(f);
  const res = await f.service.handle({
    action: 'ANSWER_QUESTIONS',
    requestId:'batch_test_123',context:cfg.settings.verifiedContext,url:f.tabs[1].url,
    questions: [
      { id: 'q_why', question: 'Why this role?', type: 'textarea' },
    ],
  }, f.sender(1));

  assert.equal(res.success, true);
  assert.equal(res.answers.length, 1);
  assert.equal(res.answers[0].id, 'q_why');
  assert.equal(res.answers[0].answer, 'Codex answer for Why this role?');

  const answerCall = f.calls.find(c => c.url.endsWith('/api/sqc/answer-questions'));
  assert.ok(answerCall);
  const payload = JSON.parse(answerCall.options.body);
  assert.equal(payload.contractVersion, 2);
  assert.equal(payload.applicationSessionId, 'application-1');
  assert.equal(payload.jobId, 'job-1');
  assert.equal(payload.profileId, 'profile-1');
  assert.equal(payload.resumeId, cfg.activeProfile.resumeId);
  assert.equal(payload.questions.length, 1);
});

async function screeningMessage(f) {
  const cfg=await uploadLocal(f);
  return {type:'ANSWER_QUESTIONS',requestId:'batch_test_uuid',context:cfg.settings.verifiedContext,url:f.tabs[1].url,
    questions:[{id:'why',question:'Why this role?',type:'textarea',maxLength:1000}]};
}
const answerResponse = (payload, extra={}) => ({success:true,contractVersion:2,...screening.stamp(payload),requestId:payload.requestId,
  answers:[{id:'why',status:'ANSWERED',answer:'My verified experience fits this role.'}],...extra});
const jsonResponse = (data,status=200) => ({status,ok:status>=200&&status<300,async json(){return data;}});

test('ApplyFlow mixed question batches preserve checkbox arrays, radio/dropdown options and numeric metadata',async()=>{
 const f=fixture(),message=await screeningMessage(f);
 message.questions=[
  {id:'tools',question:'Select all tools used',type:'checkbox',options:['Python','SQL','Rust'],required:true},
  {id:'level',question:'Choose experience level',type:'radio',options:['Junior','Senior']},
  {id:'country',question:'Country',type:'select',options:['United States','Canada']},
  {id:'years',question:'Years of experience?',type:'number',min:0,max:50,step:1,help:'Whole years only.'},
  {id:'why',question:'Why this role?',type:'textarea',maxLength:1000}
 ];
 let posted;
 f.intercept((url,options)=>{
  if(!url.endsWith('/answer-questions'))return;
  posted=JSON.parse(options.body);
  return jsonResponse(answerResponse(posted,{answers:[
   {id:'tools',status:'ANSWERED',answer:['Python','SQL']},
   {id:'level',status:'ANSWERED',answer:'Senior',matchedOption:'Senior'},
   {id:'country',status:'ANSWERED',answer:'United States',matchedOption:'United States'},
   {id:'years',status:'ANSWERED',answer:'5'},
   {id:'why',status:'ANSWERED',answer:'I build reliable Python services.'}
  ]}));
 });
 const result=await f.service.handle(message,f.sender(1));assert.equal(result.success,true);
 assert.deepEqual(posted.questions,message.questions.map(q=>({...q,required:q.required===true})));
 assert.deepEqual(result.answers[0].answer,['Python','SQL']);
 const normalized=require('../ai/client').normalize({answers:result.answers},message.questions);
 assert.ok(normalized.every(answer=>!answer.needsInput));assert.equal(normalized[0].answer,'Python\nSQL');
 assert.equal(normalized[1].answer,'Senior');assert.equal(normalized[2].answer,'United States');assert.equal(normalized[3].answer,'5');
});

test('context version conflicts refresh the session once and retry the same tracked job',async()=>{
 const f=fixture();let version='v1',contexts=0;
 f.tabs[1].url='https://www.mimica.ai/careers?ashby_jid=ashby-posting&src=jobright#application_session_id=application-1&sqc_job_id=job-1&sqc_profile_id=profile-1';
 await f.service.rememberLaunch(1,f.tabs[1].url);
 f.mutateSession(data=>({...data,profile:{...data.profile,version},profileAssignment:{...data.profileAssignment,profileVersion:version}}));
 f.mutate(c=>({...c,profile:{...c.profile,version}}));
 f.intercept(url=>{if(url.endsWith('/application-context')&&++contexts===1){version='v2';return jsonResponse({success:false,error:{code:'VERSION_MISMATCH',message:'Candidate profile version is stale',fields:['profileVersion'],expectedVersions:{profileVersion:'v2'}}},409);}});
 const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.settings.verifiedContext.profileVersion,'v2');assert.equal(contexts,2);
 const sent=f.calls.filter(call=>call.url.endsWith('/application-context')).map(call=>JSON.parse(call.options.body));
 for(const body of sent){assert.equal(body.applicationSessionId,'application-1');assert.equal(body.jobId,'job-1');assert.equal(body.profileId,'profile-1');assert.ok(body.url.includes('ashby_jid=ashby-posting'));}
 assert.equal(f.calls.filter(call=>call.url.endsWith('/session')).length,2);
});

test('persistent 409 diagnostics retain the real backend error and tracking, with bounded automatic retries',async()=>{
 const f=fixture();await f.service.rememberLaunch(1,f.tabs[1].url);
 f.intercept(url=>url.endsWith('/application-context')?jsonResponse({success:false,error:{code:'VERSION_MISMATCH',message:'Stored application profile version is v1; current is v2',fields:[{field:'profileVersion'}],expectedVersions:{profileVersion:'v2'},currentVersions:{profileVersion:'v1'}}},409):undefined);
 const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.settings.verifiedContext,null);assert.equal(cfg.integration.httpStatus,409);assert.equal(cfg.integration.path,'/api/sqc/application-context');assert.equal(cfg.integration.recoveryAttempted,true);
 assert.match(cfg.integration.message,/Stored application profile version/);assert.deepEqual(cfg.integration.validationFields,['profileVersion']);assert.equal(cfg.integration.expectedVersions.profileVersion,'v2');assert.equal(cfg.integration.tracking.applicationSessionId,'application-1');
 const before=f.calls.length;await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(f.calls.length,before);
 assert.equal(f.calls.filter(call=>call.url.endsWith('/application-context')).length,2);
});

test('non-version conflicts are not mislabeled or retried as stale versions',async()=>{
 const f=fixture();f.intercept(url=>url.endsWith('/application-context')?jsonResponse({success:false,error:{code:'APPLICATION_SESSION_REVOKED',message:'The launch session was revoked'}},409):undefined);
 const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.integration.state,'BACKEND_CONFLICT');assert.equal(cfg.integration.backendCode,'APPLICATION_SESSION_REVOKED');assert.match(cfg.integration.message,/revoked/);assert.equal(f.calls.filter(call=>call.url.endsWith('/application-context')).length,1);
});

test('unclassified 409 responses get one safe revalidation without inventing a backend error code',async()=>{
 const f=fixture();f.intercept(url=>url.endsWith('/application-context')?jsonResponse({success:false,error:'Stored launch snapshot is stale'},409):undefined);
 const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.settings.verifiedContext,null);assert.equal(cfg.integration.backendCode,'CONFLICT');assert.match(cfg.integration.message,/Stored launch snapshot is stale/);assert.equal(cfg.integration.recoveryAttempted,true);assert.equal(f.calls.filter(call=>call.url.endsWith('/application-context')).length,2);
});

test('automatic conflict recovery cannot replace the original candidate or job with another backend identity',async()=>{
 const f=fixture();f.tabs[1].url+='&sqc_job_id=job-1&sqc_profile_id=profile-1';let calls=0;f.intercept(url=>{if(url.endsWith('/application-context')&&++calls===1)return jsonResponse({success:false,error:{code:'VERSION_MISMATCH',message:'Refresh versions'}},409);});
 f.mutate(c=>({...c,job:{...c.job,id:'another-job'},assignment:{...c.assignment,jobId:'another-job'}}));
 const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.settings.verifiedContext,null);assert.equal(cfg.integration.state,'CONTEXT_MISMATCH');assert.equal(cfg.integration.recoveryAttempted,true);assert.ok(cfg.integration.validationFields.includes('jobId (launch tracking ID)')||cfg.integration.message.includes('different application'));
});

test('Mimica redirects and embedded Ashby pages retain original IDs independently of another open job',async()=>{
 const f=fixture();f.tabs[1].url='https://www.mimica.ai/careers?ashby_jid=ashby-posting&src=jobright#application_session_id=application-1&sqc_job_id=job-1&sqc_profile_id=profile-1';await f.service.rememberLaunch(1,f.tabs[1].url);
 await f.service.handle({type:'GET_CONFIG'},f.sender(1));await f.service.handle({type:'GET_CONFIG'},f.sender(2));
 f.tabs[1].url='https://mimica.ai/careers?ashby_jid=ashby-posting&src=jobright';await f.service.rememberLaunch(1,f.tabs[1].url);
 await f.service.handle({type:'GET_CONFIG'},f.sender(1));
 const iframe={...f.sender(1),frameId:3,url:'https://jobs.ashbyhq.com/embed/Mimica/ashby-posting/application'};
 const cfg=await f.service.handle({type:'GET_CONFIG'},iframe);assert.equal(cfg.settings.verifiedContext.jobId,'job-1');assert.equal(cfg.settings.verifiedContext.profileId,'profile-1');
 const body=JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body);assert.equal(body.applicationSessionId,'application-1');assert.equal(body.jobId,'job-1');assert.equal(body.url,iframe.url);
 assert.equal(f.chrome.storage.session.data.sqcLaunchHints[1].hints.profileId,'profile-1');assert.ok(f.chrome.storage.session.data.sqcLaunchHints[1].pages.some(page=>page.includes('ashby_jid=ashby-posting')));
 assert.equal(f.chrome.storage.session.data.sqcTabBindings[2].jobId,'job-2');
});

test('same-applier session rotation does not erase a tracked redirect identity',async()=>{
 const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
 f.mutateSession(data=>({...data,session:{...data.session,id:'rotated-session'}}));f.mutate(c=>({...c,authSessionId:'rotated-session'}));
 f.tabs[1].url='https://another-ats.example/login/then-apply';
 const cfg=await f.restart().handle({type:'GET_CONFIG',force:true},f.sender(1));assert.equal(cfg.settings.verifiedContext.applicationSessionId,'application-1');assert.equal(cfg.settings.verifiedContext.jobId,'job-1');
});

test('about:blank child tabs retain recovery claims before their opener closes',async()=>{
 const f=fixture();await f.service.rememberLaunch(1,f.tabs[1].url);f.tabs[3]={id:3,url:'about:blank'};await f.service.inheritTab(1,3,'about:blank');await f.service.forgetTab(1);
 f.tabs[3].url='https://ats.example/application/step-1';
 const cfg=await f.restart().handle({type:'GET_CONFIG'},f.sender(3));assert.equal(cfg.settings.verifiedContext.applicationSessionId,'application-1');
});

test('stale client assignments fail before the screening provider is called',async()=>{
  const f=fixture(),message=await screeningMessage(f);f.reassign();
  await assert.rejects(f.service.handle(message,f.sender(1)),/changed before generation/);
  assert.equal(f.calls.some(call=>call.url.endsWith('/answer-questions')),false);
});

test('failed provider jobs preserve HTTP 200 transport, provider 429 and polling request details for Q&A debugging',async()=>{
 require('../ai/diagnostics');const f=fixture(),message=await screeningMessage(f);let payload;
 f.intercept((url,options)=>{
   if(url.endsWith('/api/sqc/answer-questions')){payload=JSON.parse(options.body);return jsonResponse({...payload,success:true,status:'QUEUED',statusUrl:'/api/sqc/answer-questions/requests/run-test'});}
   if(url.endsWith('/api/sqc/answer-questions/requests/run-test'))return jsonResponse({...payload,success:true,status:'FAILED',provider:'Codex',runId:'run-test',error:{status:429,code:'insufficient_quota',message:'429 You have no credits remaining'}});
 });
 await assert.rejects(f.service.handle(message,f.sender(1)),error=>{
   assert.equal(error.debug.httpStatus,200);assert.equal(error.debug.providerStatus,429);assert.equal(error.debug.stage,'polling');assert.equal(error.debug.classification,'PROVIDER_QUOTA');assert.equal(error.debug.runId,'run-test');assert.equal(error.debug.path,'/api/sqc/answer-questions/requests/run-test');return true;
 });
});
test('answer responses must echo the original request and all version identifiers',async()=>{
  const f=fixture(),message=await screeningMessage(f);
  f.intercept((url,options)=>url.endsWith('/answer-questions')?jsonResponse(answerResponse(JSON.parse(options.body),{resumeVersion:'different'})):undefined);
  await assert.rejects(f.service.handle(message,f.sender(1)),error=>error.state==='INCOMPATIBLE_API' && /contract v2/.test(error.message));
});
test('navigation or reassignment during generation discards the answer batch',async()=>{
  for(const change of [f=>{f.tabs[1].url='https://jobs.example/roles/2';},f=>f.reassign()]){
    const f=fixture(),message=await screeningMessage(f);
    f.intercept((url,options)=>{if(!url.endsWith('/answer-questions'))return;change(f);return jsonResponse(answerResponse(JSON.parse(options.body)));});
    await assert.rejects(f.service.handle(message,f.sender(1)),/changed|discarded/);
  }
});
test('pending generation is polled only on the configured backend and returns a verified final batch',async()=>{
  const f=fixture(),message=await screeningMessage(f);let payload,polls=0;
  f.intercept((url,options)=>{
    if(url.endsWith('/answer-questions')){payload=JSON.parse(options.body);return jsonResponse(answerResponse(payload,{status:'PENDING',answers:undefined,statusUrl:'/api/sqc/answer-questions/requests/test'}),202);}
    if(url.endsWith('/requests/test')){polls++;return jsonResponse(answerResponse(payload));}
  });
  const result=await f.service.handle(message,f.sender(1));
  assert.equal(result.success,true);assert.equal(polls,1);assert.equal(result.requestId,message.requestId);
  const poll=f.calls.find(call=>call.url.endsWith('/requests/test'));assert.equal(poll.options.credentials,'include');
});
test('foreign answer-status URLs are rejected before sending credentials',async()=>{
  const f=fixture(),message=await screeningMessage(f);
  f.intercept((url,options)=>url.endsWith('/answer-questions')?jsonResponse(answerResponse(JSON.parse(options.body),{status:'PENDING',statusUrl:'https://foreign.example/status'})):undefined);
  await assert.rejects(f.service.handle(message,f.sender(1)),/saved ApplyFlow server/);
  assert.equal(f.calls.some(call=>call.url.startsWith('https://foreign.example')),false);
});
test('sign-out remains responsive and cancels an in-flight generation request',async()=>{
  const f=fixture(),message=await screeningMessage(f);let started;const waiting=new Promise(resolve=>{started=resolve;});
  f.intercept((url,options)=>{
    if(!url.endsWith('/answer-questions'))return;
    started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'})),{once:true}));
  });
  const pending=f.service.handle(message,f.sender(1));const rejected=assert.rejects(pending,/stopped|discarded|changed/);
  await waiting;const logout=await f.service.handle({type:'SQC_LOGOUT'},f.ui);
  assert.equal(logout.integration.state,'SIGNED_OUT');await rejected;
});
test('backend version mismatches are reported as refreshable errors',async()=>{
  const f=fixture(),message=await screeningMessage(f);
  f.intercept(url=>url.endsWith('/answer-questions')?jsonResponse({success:false,error:{code:'VERSION_MISMATCH'}},409):undefined);
  await assert.rejects(f.service.handle(message,f.sender(1)),error=>error.state==='VERSION_MISMATCH');
});

const localText = 'Candidate 1\nSoftware engineer building Python APIs and SQL data systems.\nSkills\nPython, SQL';
test('verified job context retains base-context city from sign-in instead of a bad job profile city',async()=>{
 const f=fixture();f.mutateSession(data=>({...data,profile:{...data.profile,city:'optimized',baseContextText:'Name: Candidate 1\nLocation: Miami, FL 33196'}}));
 f.mutate(c=>({...c,profile:{...c.profile,city:'optimized'}}));
 const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.activeProfile.city,'Miami');assert.equal(cfg.activeProfile.candidateFieldSources.city,'applyflow_base_context');
 const again=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(again.activeProfile.city,'Miami');
});
test('verified config returns saved page answers for refresh restoration',async()=>{
 const f=fixture(),cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
 const captured=await f.service.handle({type:'SQC_CAPTURE_STEP',context:cfg.settings.verifiedContext,label:'Details',fields:[{id:'country',label:'Country',value:'United States',type:'select',required:true}]},f.sender(1));assert.equal(captured.success,true);
 const next=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(next.settings.savedFormAnswers.find(field=>field.question==='Country').answer,'United States');
 const other=await f.service.handle({type:'GET_CONFIG'},f.sender(2));assert.equal(other.settings.savedFormAnswers.length,0);
});
async function uploadLocal(f) {
  const cfg = await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  return f.service.handle({type:'SQC_SET_LOCAL_RESUME',context:cfg.settings.verifiedContext,
    resume:{filename:'Candidate_Tailored.txt',dataUrl:'data:text/plain;base64,'+btoa(localText),text:localText,
      skills:['Python','SQL'],confirmed:true}},f.sender(1));
}
test('a local upload works without a server resume and survives worker restart',async()=>{
  const f=fixture();f.mutate(c=>({...c,resume:null}));
  const uploaded=await uploadLocal(f);
  assert.equal(uploaded.success,true);assert.equal(uploaded.activeProfile.resumeSource,'sqc_upload');
  assert.equal(uploaded.activeProfile.resumeIsTailored,true);assert.equal(uploaded.activeProfile.resumeBaseId,null);
  assert.equal(uploaded.activeProfile.resumeText,localText);assert.match(uploaded.activeProfile.resumeId,/^sqc-upload:/);
  assert.equal(uploaded.activeProfile.id,'profile-1');
  const restored=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(restored.activeProfile.resumeText,localText);
  const otherJob=await f.service.handle({type:'GET_CONFIG'},f.sender(2));
  assert.equal(otherJob.activeProfile.resumeSource,'missing');
});
test('job status version updates retain the original uploaded resume across verification and worker restart',async()=>{
  const f=fixture(),uploaded=await uploadLocal(f);f.advance(31000);
  f.mutate(c=>({...c,status:'IN_PROGRESS',job:{...c.job,version:'status-update-v2'}}));
  const refreshed=await f.service.handle({type:'GET_CONFIG',force:true},f.sender(1));
  assert.equal(refreshed.activeProfile.resumeId,uploaded.activeProfile.resumeId);assert.equal(refreshed.activeProfile.resumeBase64,uploaded.activeProfile.resumeBase64);
  assert.equal(refreshed.settings.verifiedContext.jobVersion,'status-update-v2');
  const restored=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));assert.equal(restored.activeProfile.resumeSource,'sqc_upload');
});

test('screening receives the selected local resume text and base-version provenance, not the binary file',async()=>{
  const f=fixture();await uploadLocal(f);
  const message=await screeningMessage(f);
  const answer=await f.service.handle(message,f.sender(1));
  assert.equal(answer.success,true);
  const sent=JSON.parse(f.calls.findLast(c=>c.url.endsWith('/api/sqc/answer-questions')).options.body);
  assert.equal(sent.resumeContext.text,localText);assert.equal(sent.resumeContext.verified,false);
  assert.equal(sent.resumeContext.baseResumeId,'resume-1');assert.equal(sent.resumeContext.dataUrl,undefined);
});
test('uploads cannot change the assigned candidate and are removed on sign-out or reassignment',async()=>{
  const f=fixture();await uploadLocal(f);f.reassign();
  const reassigned=await f.service.handle({type:'GET_CONFIG',force:true},f.sender(1));
  assert.equal(reassigned.activeProfile.id,'profile-2');assert.notEqual(reassigned.activeProfile.resumeSource,'sqc_upload');
  await f.service.handle({type:'SQC_LOGOUT'},f.ui);
  assert.equal(await f.localResumes.get(1,'anything'),null);
});
test('clearing a local upload restores the server resume and unverified upload messages are rejected',async()=>{
  const f=fixture(),uploaded=await uploadLocal(f);
  const cleared=await f.service.handle({type:'SQC_CLEAR_LOCAL_RESUME',context:uploaded.settings.verifiedContext},f.sender(1));
  assert.equal(cleared.activeProfile.resumeSource,'applyflow');assert.equal(cleared.activeProfile.resumeId,'resume-1');
  const noJob=await f.service.handle({type:'SQC_SET_LOCAL_RESUME'},f.ui);assert.equal(noJob.success,false);
  const stale=await f.service.handle({type:'SQC_SET_LOCAL_RESUME',context:{...uploaded.settings.verifiedContext,profileAssignmentVersion:'old'}},f.sender(1));
  assert.equal(stale.success,false);
});
test('screening waits for the per-application upload even when a server resume exists',async()=>{
  const f=fixture(),cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  await assert.rejects(f.service.handle({type:'ANSWER_QUESTIONS',requestId:'batch_without_upload',url:f.tabs[1].url,
    context:cfg.settings.verifiedContext,questions:[{id:'q1',question:'Why this role?',type:'textarea'}]},f.sender(1)),/Upload the tailored resume/);
  assert.equal(f.calls.some(c=>c.url.endsWith('/api/sqc/answer-questions')),false);
});
test('uploaded context survives a changed ApplyFlow default resume and a new save can replace that default',async()=>{
  const f=fixture(),before=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.mutate(c=>({...c,resume:{...c.resume,id:'new-default',version:'v2'}}));
  const upload=await f.service.handle({type:'SQC_SET_LOCAL_RESUME',context:before.settings.verifiedContext,
    resume:{filename:'Tailored.txt',dataUrl:'data:text/plain;base64,'+btoa(localText),text:localText,skills:['Python'],confirmed:true}},f.sender(1));
  assert.equal(upload.success,true);
  f.mutate(c=>({...c,resume:{...c.resume,id:'another-default',version:'v3'}}));
  const refreshed=await f.restart().handle({type:'GET_CONFIG',force:true},f.sender(1));
  assert.equal(refreshed.activeProfile.resumeId,upload.activeProfile.resumeId);
  assert.equal(refreshed.activeProfile.resumeText,localText);
});
test('matching downloaded ApplyFlow files are persisted with server provenance across worker restarts',async()=>{
  const f=fixture(),dataUrl='data:application/pdf;base64,'+btoa('%PDF-1.7\nApproved job resume');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('%PDF-1.7\nApproved job resume'));
  const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  f.mutate(c=>({...c,resume:{...c.resume,kind:'tailored',jobId:c.job.id,file:{filename:'Approved.pdf',mimeType:'application/pdf',sha256}}}));
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const linked=await f.service.handle({type:'SQC_LINK_APPLYFLOW_RESUME',context:cfg.settings.verifiedContext,dataUrl},f.sender(1));
  assert.equal(linked.success,true);assert.equal(linked.activeProfile.resumeIsTailored,true);
  assert.equal(linked.activeProfile.resumeSource,'applyflow');assert.equal(linked.activeProfile.resumeBase64,dataUrl);
  const restored=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(restored.activeProfile.resumeBase64,dataUrl);
});
test('a missing SQC answer route falls back to the documented submissions alias only on route errors',async()=>{
  const f=fixture(),message=await screeningMessage(f);
  f.intercept((url,options)=>{
    if(url.endsWith('/api/sqc/answer-questions'))return jsonResponse({success:false,error:{code:'NOT_FOUND'}},404);
    if(url.endsWith('/api/submissions/answer-questions'))return jsonResponse(answerResponse(JSON.parse(options.body)));
  });
  const response=await f.service.handle(message,f.sender(1));assert.equal(response.success,true);
  assert.ok(f.calls.some(c=>c.url.endsWith('/api/submissions/answer-questions')));
});
test('provider generation failures show backend reason, route, HTTP status, and do not retry through aliases',async()=>{
  const f=fixture(),message=await screeningMessage(f);
  f.intercept(url=>url.endsWith('/api/sqc/answer-questions')?jsonResponse({success:false,error:{code:'CODEX_GENERATION_FAILED',message:'Code generation failed. Retry or ask an admin.'}},502):undefined);
  await assert.rejects(f.service.handle(message,f.sender(1)),error=>error.status===502&&error.path==='/api/sqc/answer-questions'&&/ask an admin/.test(error.message));
  assert.equal(f.calls.some(c=>c.url.endsWith('/api/submissions/answer-questions')),false);
});
test('failed generation responses do not mask provider errors as envelope mismatches',async()=>{
  const f=fixture(),message=await screeningMessage(f);
  f.intercept(url=>url.endsWith('/api/sqc/answer-questions')?jsonResponse({success:true,status:'FAILED',error:{message:'Configured Codex model is unavailable'}}):undefined);
  await assert.rejects(f.service.handle(message,f.sender(1)),error=>error.state==='GENERATION_FAILED'&&/model is unavailable/.test(error.message));
});
test('AI discovery works with the documented provider status response without a success wrapper',async()=>{
  const f=fixture();f.intercept(url=>url.endsWith('/api/ai/status')?jsonResponse({provider:'CODEX',model:'test-codex-model',connected:true}):undefined);
  const status=await f.service.handle({type:'SQC_AI_STATUS'},f.sender(1));
  assert.equal(status.success,true);assert.equal(status.ready,true);assert.match(status.message,/test-codex-model/);
  assert.equal(f.calls.filter(c=>c.url.includes('/answer-questions')).length,0);
});
test('AI discovery reports an unconfigured backend provider without claiming generation is connected',async()=>{
  const f=fixture();f.intercept(url=>url.endsWith('/api/ai/status')?jsonResponse({provider:'CODEX',configured:false}):undefined);
  const status=await f.service.handle({type:'SQC_AI_STATUS'},f.sender(1));
  assert.equal(status.ready,false);assert.match(status.message,/administrator/);
});
test('browser launch capture survives an immediate redirect before content loads and a worker restart',async()=>{
  const f=fixture();await f.service.rememberLaunch(1,'https://applyflow.example/launch?sqc_job_id=job-1&application_session_id=application-1');
  f.tabs[1].url='https://jobs.example/company/apply';
  f.intercept(url=>url.endsWith('/application-context')?{status:403,ok:false}:undefined);
  let r=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(r.settings.verifiedContext,null);
  assert.equal(f.chrome.storage.session.data.sqcLaunchHints[1].hints.jobId,'job-1');
  f.intercept(null);
  f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:f.tabs[1].url}]}));
  assert.equal((await f.restart().handle({type:'SQC_PORTAL_ELIGIBILITY'},f.sender(1))).eligible,true);
  r=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(r.settings.verifiedContext.jobId,'job-1');
  const body=JSON.parse(f.calls.filter(c=>c.url.endsWith('/application-context')).at(-1).options.body);
  assert.equal(body.jobId,'job-1');assert.equal(body.applicationSessionId,'application-1');
  assert.equal(f.chrome.storage.session.data.sqcLaunchHints[1].hints.jobId,'job-1');
});

test('per-tab recovery survives lost session storage and refills verification IDs across reloads and tab switches',async()=>{
  const f=fixture();
  for(const id of [1,2])await f.service.handle({type:'GET_CONFIG'},f.sender(id));
  await f.chrome.storage.session.remove(Object.keys(f.chrome.storage.session.data));
  f.tabs[1].url='https://jobs.example/roles/1/step2';f.tabs[2].url='https://jobs.example/roles/2/step2';
  const restarted=f.restart();
  for(const id of [2,1,2]){
    const result=await restarted.handle({type:'GET_CONFIG',force:true},f.sender(id));
    assert.equal(result.integration.state,'VERIFIED',result.integration.message);assert.equal(result.settings.verifiedContext.jobId,'job-'+id);
    const body=JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body);
    assert.equal(body.applicationSessionId,'application-'+id);assert.equal(body.jobId,'job-'+id);assert.equal(body.profileId,'profile-1');
  }
  assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[1].hints.jobId,'job-1');
  assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[2].hints.jobId,'job-2');
});

test('expired authorization retains per-tab IDs through a fresh sign-in, but explicit logout clears them',async()=>{
  const f=fixture();for(const id of [1,2])await f.service.handle({type:'GET_CONFIG'},f.sender(id));
  const uploaded=await uploadLocal(f);
  f.signOut();f.advance(31000);
  const expired=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(expired.integration.state,'SIGNED_OUT');assert.equal(expired.settings.verifiedContext,null);
  assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[1].hints.jobId,'job-1');assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[2].hints.jobId,'job-2');assert.equal(f.chrome.storage.session.data.sqcAuth,undefined);
  await f.service.handle({type:'SQC_LOGIN',email:'applier@example.com',password:'temporary-test-password'},f.ui);
  f.tabs[1].url='https://jobs.example/roles/1/step2';const resumed=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(resumed.settings.verifiedContext.jobId,'job-1');assert.equal(resumed.activeProfile.resumeBase64,uploaded.activeProfile.resumeBase64);assert.equal(resumed.activeProfile.resumeSource,'sqc_upload');
  await f.service.handle({type:'SQC_LOGOUT'},f.ui);assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery,undefined);
});

test('browser-restored tabs recover by exact saved pages after tab IDs change',async()=>{
  const f=fixture();for(const id of [1,2])await f.service.handle({type:'GET_CONFIG'},f.sender(id));
  const uploaded=await uploadLocal(f);
  for(const record of Object.values(f.chrome.storage.local.data.sqcApplicationRecovery))record.browserDetached=true;
  await f.chrome.storage.session.remove(Object.keys(f.chrome.storage.session.data));
  f.tabs[3]={id:3,url:'https://jobs.example/roles/2'};f.tabs[4]={id:4,url:'https://jobs.example/roles/1'};
  const restarted=f.restart();for(const [id,job] of [[3,'2'],[4,'1']]){
    const result=await restarted.handle({type:'GET_CONFIG'},f.sender(id));assert.equal(result.settings.verifiedContext.jobId,'job-'+job);
    const body=JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body);assert.equal(body.applicationSessionId,'application-'+job);
    if(job==='1')assert.equal(result.activeProfile.resumeBase64,uploaded.activeProfile.resumeBase64);
  }
});

test('a reused browser tab ID cannot select an ambiguous saved candidate and rejection diagnostics show actual request IDs',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const recovery=f.chrome.storage.local.data.sqcApplicationRecovery;recovery[1].browserDetached=true;recovery[2]={...structuredClone(recovery[1]),hints:{applicationSessionId:'another-app',jobId:'job-1',profileId:'profile-2'}};
  await f.chrome.storage.session.remove(Object.keys(f.chrome.storage.session.data));
  f.tabs[1].url='https://jobs.example/roles/1';
  f.intercept(url=>url.endsWith('/application-context')?jsonResponse({success:false,code:'CONTEXT_MISMATCH',message:'No verified assignment'},409):null);
  let result=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.settings.verifiedContext,null);assert.equal(result.integration.verificationRequest.applicationSessionId,null);
  delete recovery[2];result=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  assert.equal(result.integration.verificationRequest.applicationSessionId,'application-1');assert.equal(result.integration.verificationRequest.jobId,'job-1');assert.equal(result.integration.verificationRequest.profileId,'profile-1');assert.ok(f.chrome.storage.local.data.sqcApplicationRecovery[1]);
});

test('switching restored tabs keeps different assigned candidates attached to their own jobs',async()=>{
  const f=fixture(),profile={id:'profile-2',version:'v2',verified:true,fullName:'Candidate Two'},assignment={id:'assignment-2',version:'1',status:'ACTIVE',applierId:'applier-1',profileId:profile.id,profileVersion:profile.version};
  f.mutateSession(data=>({...data,assignedProfiles:[{assignment,profile}]}));
  f.mutate(c=>c.job.id!=='job-2'?c:{...c,profile,assignment:{...c.assignment,profileId:profile.id,profileAssignmentId:assignment.id},resume:{...c.resume,id:'resume-2',profileId:profile.id}});
  f.tabs[2].url+='&sqc_profile_id=profile-2';
  for(const id of [1,2]){const result=await f.service.handle({type:'GET_CONFIG'},f.sender(id));assert.equal(result.settings.verifiedContext.profileId,'profile-'+id);}
  await f.chrome.storage.session.remove(Object.keys(f.chrome.storage.session.data));
  f.tabs[1].url='https://jobs.example/roles/1/review';f.tabs[2].url='https://jobs.example/roles/2/review';
  const restarted=f.restart();
  for(const id of [2,1,2]){const result=await restarted.handle({type:'GET_CONFIG',force:true},f.sender(id));assert.equal(result.settings.verifiedContext.profileId,'profile-'+id);assert.equal(result.settings.verifiedContext.jobId,'job-'+id);}
});

test('partial tracking retains all IDs but a new tracked ID replaces that tab without changing other tabs',async()=>{
  const f=fixture();for(const id of [1,2])await f.service.handle({type:'GET_CONFIG'},f.sender(id));
  f.tabs[1].url='https://jobs.example/roles/1/step2#sqc_profile_id=profile-1';await f.service.rememberLaunch(1,f.tabs[1].url);
  await f.chrome.storage.session.remove(['sqcContexts','sqcTabBindings']);
  let result=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.integration.state,'VERIFIED');
  let body=JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body);assert.equal(body.jobId,'job-1');assert.equal(body.applicationSessionId,'application-1');
  f.tabs[1].url='https://jobs.example/roles/2#application_session_id=application-2&sqc_job_id=job-2&sqc_profile_id=profile-1';
  await f.service.rememberLaunch(1,f.tabs[1].url);result=await f.service.handle({type:'GET_CONFIG',force:true},f.sender(1));assert.equal(result.settings.verifiedContext.jobId,'job-2');
  assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[1].hints.jobId,'job-2');assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[2].hints.jobId,'job-2');
  await f.service.forgetTab(1);assert.equal(f.chrome.storage.local.data.sqcApplicationRecovery[1],undefined);assert.ok(f.chrome.storage.local.data.sqcApplicationRecovery[2]);
});

test('persistent recovery IDs cannot authorize a backend-denied page or leak to another applier',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  await f.chrome.storage.session.remove(Object.keys(f.chrome.storage.session.data));f.tabs[1].url='https://jobs.example/roles/1/step2';
  f.intercept(url=>url.endsWith('/application-context')?jsonResponse({success:false,code:'CONTEXT_MISMATCH',message:'No verified assignment'},409):null);
  let result=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));assert.equal(result.settings.verifiedContext,null);assert.ok(f.chrome.storage.local.data.sqcApplicationRecovery[1]);
  await f.chrome.storage.session.remove(Object.keys(f.chrome.storage.session.data));f.changeApplier();f.intercept(null);
  result=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  const body=JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body);assert.equal(body.applicationSessionId,undefined);assert.equal(body.jobId,undefined);
});
test('unverified launch claims can follow a child tab without granting a lease or mixing another launch',async()=>{
  const f=fixture();await f.service.rememberLaunch(1,f.tabs[1].url);
  f.tabs[3]={id:3,url:'https://jobs.example/company/application'};
  await f.service.inheritTab(1,3,f.tabs[3].url);await f.service.forgetTab(1);
  assert.equal(f.chrome.storage.session.data.sqcTabBindings?.[3],undefined);
  f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:f.tabs[3].url}]}));
  assert.equal((await f.restart().handle({type:'GET_CONFIG'},f.sender(3))).settings.verifiedContext.jobId,'job-1');
  await f.service.rememberLaunch(3,'https://jobs.example/roles/2#application_session_id=application-2');
  f.tabs[3].url='https://jobs.example/roles/2';
  assert.equal((await f.restart().handle({type:'GET_CONFIG'},f.sender(3))).settings.verifiedContext.jobId,'job-2');
  await f.service.handle({type:'SQC_LOGOUT'},f.ui);
  assert.equal(f.chrome.storage.session.data.sqcLaunchHints,undefined);
});
test('session overview can list assigned profiles before a job is open without changing the locked candidate',async()=>{
  const f=fixture();f.mutateSession(data=>({...data,assignedProfiles:[{assignment:{id:'assignment-2',version:'1',status:'ACTIVE',applierId:'applier-1',profileId:'profile-2',profileVersion:'v2'},profile:{id:'profile-2',version:'v2',verified:true,fullName:'Candidate Two'}}]}));
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.ui);
  assert.equal(cfg.profiles.length,2);assert.equal(cfg.profiles[1].fullName,'Candidate Two');assert.equal(cfg.activeProfile.id,'profile-1');assert.equal(cfg.settings.verifiedContext,null);
  const job=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(job.settings.verifiedContext.profileId,'profile-1');
});
test('an assigned-profile roster cannot expose another applier profile or replace the verified assignment',async()=>{
  const f=fixture();f.mutateSession(data=>({...data,assignedProfiles:[{assignment:{id:'foreign',version:'1',status:'ACTIVE',applierId:'another-applier',profileId:'profile-2',profileVersion:'v2'},profile:{id:'profile-2',version:'v2',verified:true,fullName:'Wrong Candidate'}}]}));
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.ui);assert.equal(cfg.integration.state,'INVALID_CONTEXT');assert.deepEqual(cfg.profiles,[]);
});
test('tab job hints survive a denied continuation and worker restart without granting route access',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.tabs[1].url='https://jobs.example/application/step-two';
  f.intercept(url=>url.endsWith('/application-context')?{status:403,ok:false}:undefined);
  let r=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(r.settings.verifiedContext,null);
  assert.equal(f.chrome.storage.session.data.sqcTabBindings[1].jobId,'job-1');assert.equal(f.chrome.storage.session.data.sqcContexts[1],undefined);
  r=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));assert.equal(r.settings.verifiedContext,null);
  const request=JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body);
  assert.equal(request.jobId,'job-1');assert.equal(request.applicationSessionId,'application-1');
  f.intercept(null);
  f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:'https://jobs.example/application/step-two'}]}));
  r=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));assert.equal(r.settings.verifiedContext.jobId,'job-1');
  await f.service.forgetTab(1);assert.equal(f.chrome.storage.session.data.sqcTabBindings[1],undefined);
});
test('new continuation tabs use opener job hints but cannot change the assigned job silently',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  f.tabs[3]={id:3,openerTabId:1,url:'https://jobs.example/apply/step-three'};
  f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:'https://jobs.example/apply/step-three'}]}));
  const r=await f.service.handle({type:'GET_CONFIG'},f.sender(3));assert.equal(r.settings.verifiedContext.jobId,'job-1');
  assert.equal(JSON.parse(f.calls.filter(call=>call.url.endsWith('/application-context')).at(-1).options.body).jobId,'job-1');
  f.tabs[3].url='https://jobs.example/roles/2';
  assert.equal((await f.service.handle({type:'GET_CONFIG'},f.sender(3))).settings.verifiedContext,null);
});
test('manual confirmations, valid forms and intermediate steps cannot produce a completion record',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const stamp={application_session_id:'application-1',profile_version:'v1',job_version:'v1',resume_id:'resume-1',resume_version:'v1',profile_assignment_id:'assignment-1',profile_assignment_version:'1'};
  const evidence={type:'SUCCESS_NOTICE',message:'Your application has been submitted',url:f.tabs[1].url,observedAt:new Date(f.now()).toISOString(),intermediate:false};
  for(const extra of [
    {job_status:'SUBMITTED',validation_status:'PASSED'},
    {job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'MANUAL_HUD_CONFIRM',portal_evidence:evidence},
    {job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{...evidence,intermediate:true}},
    {job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{...evidence,url:'https://different.example/success'}}
  ])assert.equal((await f.service.handle({type:'LOG_SUBMISSION',payload:{...stamp,...extra}},f.sender(1))).success,false);
  assert.equal(f.calls.some(call=>call.url.endsWith('/api/submissions/webhook')),false);assert.equal(f.chrome.storage.local.data.submissionsHistory,undefined);
});

test('submission uses the live Ashby iframe route when MessageSender retains its pre-SPA URL',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const oldUrl='https://jobs.ashbyhq.com/mimica/job-uuid/application',url='https://jobs.ashbyhq.com/mimica/job-uuid/application?submitted=true';
  f.chrome.webNavigation={getFrame:async details=>{assert.equal(details.tabId,1);assert.equal(details.frameId,4);return {url,documentId:'same-document'};}};
  const sender={...f.sender(1),url:oldUrl,frameId:4,documentId:'same-document'};
  const payload={application_session_id:'application-1',profile_version:'v1',job_version:'v1',resume_id:'resume-1',resume_version:'v1',profile_assignment_id:'assignment-1',profile_assignment_version:'1',
    job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{type:'SUCCESS_NOTICE',message:'Your application was successfully submitted.',url,observedAt:new Date(f.now()).toISOString(),intermediate:false},
    screening_qa:[{question:'Why this role?',answer:'Relevant experience'}]};
  const result=await f.service.handle({type:'LOG_SUBMISSION',payload},sender);assert.equal(result.success,true,result.error);
  const delivered=JSON.parse(f.calls.find(call=>call.url.endsWith('/api/submissions/webhook')).options.body);
  assert.equal(delivered.portal_evidence.url,url);assert.equal(delivered.extracted_data.job_url,url);
  assert.equal(delivered.screening_qa[0].answer,'Relevant experience');
  assert.ok(f.calls.some(call=>call.url.endsWith('/api/sqc/application-context')&&JSON.parse(call.options.body).url===url));
});

test('replaced iframe documents and evidence from another URL cannot report completion',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  const sender={...f.sender(1),frameId:4,documentId:'original-document'},url='https://jobs.ashbyhq.com/mimica/job-uuid/application';
  let documentId='replacement-document';f.chrome.webNavigation={getFrame:async()=>({url,documentId})};
  const payload={application_session_id:'application-1',profile_version:'v1',job_version:'v1',resume_id:'resume-1',resume_version:'v1',profile_assignment_id:'assignment-1',profile_assignment_version:'1',job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{type:'SUCCESS_NOTICE',message:'Application received!',url:sender.url,observedAt:new Date(f.now()).toISOString(),intermediate:false}};
  let result=await f.service.handle({type:'LOG_SUBMISSION',payload},sender);assert.equal(result.success,false);assert.match(result.error,/document changed/);
  documentId=sender.documentId;result=await f.service.handle({type:'LOG_SUBMISSION',payload},sender);
  assert.equal(result.success,false);assert.equal(result.code,'PORTAL_EVIDENCE_MISMATCH');assert.deepEqual(result.fields,['current frame URL']);
  let reads=0;payload.portal_evidence.url=url;
  f.chrome.webNavigation.getFrame=async()=>({url,documentId:++reads===1?sender.documentId:'replacement-during-verification'});
  result=await f.service.handle({type:'LOG_SUBMISSION',payload},sender);assert.equal(result.success,false);assert.match(result.error,/changed during verification/);
  assert.equal(f.calls.some(call=>call.url.endsWith('/api/submissions/webhook')),false);
});
test('a continuation route denial retains tab identity and authentication but never retains an autofill lease',async()=>{
  const f=fixture();await f.service.handle({type:'GET_CONFIG'},f.sender(1));f.tabs[1].url='https://jobs.example/apply/review';
  f.intercept(url=>url.endsWith('/api/sqc/application-context')?{status:403,ok:false}:null);
  const denied=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(denied.integration.state,'FORBIDDEN');assert.equal(denied.settings.verifiedContext,null);
  assert.equal(f.chrome.storage.session.data.sqcTabBindings[1].jobId,'job-1');assert.equal(f.chrome.storage.session.data.sqcAuth.applier.id,'applier-1');
  f.intercept(null);f.mutate(c=>({...c,allowedRoutes:[...c.allowedRoutes,{url:'https://jobs.example/apply/review'}]}));
  assert.equal((await f.restart().handle({type:'GET_CONFIG'},f.sender(1))).settings.verifiedContext.jobId,'job-1');
});
test('fixed mode uses the approved base document without demanding an upload, and policy overrides browser selections',async()=>{
  const policy=structuredClone(require('../config/runtime').defaults);policy.resume.mode='fixed';policy.autofill.enabled=false;
  const f=fixture({load:async()=>policy});f.chrome.storage.local.data.settings.autoAutofillOnPageLoad=true;
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.settings.resumeMode,'fixed');assert.equal(cfg.activeProfile.resumeReady,true);assert.equal(cfg.activeProfile.resumeTailoringRequired,false);assert.equal(cfg.settings.autoAutofillOnPageLoad,false);
  assert.equal((await f.service.handle({type:'SAVE_SETTINGS',settings:{autoAutofillOnPageLoad:true}},f.ui)).success,false);
});
test('an optional fixed resume upload is reused for the assigned candidate across jobs, but a tailored upload stays job-bound',async()=>{
  const policy=structuredClone(require('../config/runtime').defaults);policy.resume.mode='fixed';const f=fixture({load:async()=>policy});
  const uploaded=await uploadLocal(f);assert.equal(uploaded.activeProfile.resumeReady,true);assert.equal(uploaded.activeProfile.resumeIsTailored,false);
  const other=await f.restart().handle({type:'GET_CONFIG'},f.sender(2));assert.equal(other.activeProfile.resumeText,localText);assert.equal(other.settings.verifiedContext.jobId,'job-2');
  f.reassign();const changed=await f.service.handle({type:'GET_CONFIG',force:true},f.sender(2));assert.notEqual(changed.activeProfile.resumeText,localText);
});
test('a backend job that explicitly requires tailoring cannot be downgraded by fixed-mode configuration',async()=>{
  const policy=structuredClone(require('../config/runtime').defaults);policy.resume.mode='fixed';const f=fixture({load:async()=>policy});f.mutate(c=>({...c,job:{...c.job,tailoringRequired:true}}));
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1));assert.equal(cfg.settings.resumeMode,'tailored');assert.equal(cfg.activeProfile.resumeReady,false);
});
test('browser-created child tabs retain the parent application even with no opener metadata',async()=>{
  const f=fixture();await uploadLocal(f);f.tabs[3]={id:3,url:'https://jobs.example/roles/1/experience'};
  await f.service.inheritTab(1,3,f.tabs[3].url);await f.service.forgetTab(1);
  const cfg=await f.restart().handle({type:'GET_CONFIG'},f.sender(3));assert.equal(cfg.settings.verifiedContext.jobId,'job-1');assert.equal(cfg.activeProfile.resumeText,localText);
});
test('submission includes earlier-step answers only from its application and refreshes ApplyFlow status after acknowledgement',async()=>{
  const f=fixture();const first=await f.service.handle({type:'GET_CONFIG'},f.sender(1));
  await f.service.handle({type:'SQC_CAPTURE_STEP',context:first.settings.verifiedContext,label:'Personal information',fields:[{label:'First name',value:'Candidate'},{label:'Password',type:'password',value:'never send this'}]},f.sender(1));
  f.tabs[1].url='https://jobs.example/roles/1/experience';const second=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
  await f.service.handle({type:'SQC_CAPTURE_STEP',context:second.settings.verifiedContext,label:'Experience',fields:[{label:'Employer',value:'Correct Company'}]},f.sender(1));
  const other=await f.service.handle({type:'GET_CONFIG'},f.sender(2));await f.service.handle({type:'SQC_CAPTURE_STEP',context:other.settings.verifiedContext,label:'Other job',fields:[{label:'Employer',value:'Other Job Company'}]},f.sender(2));
  f.tabs[1].url='https://jobs.example/roles/1/success';f.intercept(url=>{if(url.endsWith('/webhook'))f.mutate(c=>({...c,status:'SUBMITTED'}));});
  const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1)),c=cfg.settings.verifiedContext;
  const result=await f.service.handle({type:'LOG_SUBMISSION',payload:{application_session_id:c.applicationSessionId,profile_assignment_id:c.profileAssignmentId,profile_assignment_version:c.profileAssignmentVersion,profile_version:c.profileVersion,job_version:c.jobVersion,resume_id:c.resumeId,resume_version:c.resumeVersion,job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{type:'SUCCESS_NOTICE',message:'Your application has been submitted',url:f.tabs[1].url,observedAt:new Date(f.now()).toISOString(),intermediate:false}}},f.sender(1));
  assert.equal(result.success,true);assert.equal(result.applyFlowStatus,'SUBMITTED');const body=JSON.parse(f.calls.find(call=>call.url.endsWith('/webhook')).options.body);
  assert.equal(body.application_steps.length,2);assert.ok(body.screening_qa.some(q=>q.answer==='Correct Company'));assert.ok(body.screening_qa.some(q=>q.answer==='Candidate'));assert.equal(JSON.stringify(body).includes('never send this'),false);assert.equal(JSON.stringify(body).includes('Other Job Company'),false);
});

test('tracked redirects and child tabs retain their job without any predefined allowedRoutes',async()=>{
  const f=fixture();f.mutate(c=>{const {allowedRoutes,...context}=c;return context;});await uploadLocal(f);
  for(const url of ['https://company.example/careers/lead','https://login.ats.example/signin','https://ats.example/forms/page-two']){
    f.tabs[1].url=url;const cfg=await f.restart().handle({type:'GET_CONFIG'},f.sender(1));
    assert.equal(cfg.settings.verifiedContext.jobId,'job-1');assert.equal(cfg.activeProfile.resumeText,localText);assert.equal(policy.ready(cfg.settings,url,f.now()),true);
  }
  f.tabs[3]={id:3,url:'https://another-ats.example/experience'};await f.service.inheritTab(1,3,f.tabs[3].url);
  const child=await f.restart().handle({type:'GET_CONFIG'},f.sender(3));assert.equal(child.settings.verifiedContext.applicationSessionId,'application-1');assert.equal(child.activeProfile.resumeText,localText);
  const call=JSON.parse(f.calls.filter(c=>c.url.endsWith('/application-context')).at(-1).options.body);assert.equal(call.trackingMode,'application-session');assert.equal(call.duplicatePolicy.includeOtherAppliers,true);
});
test('refreshing status reuses original file bytes until its verified resume version changes',async()=>{
  const f=fixture();f.mutate(c=>({...c,resume:{...c.resume,file:{url:'/files/resume.pdf',filename:'anything.pdf'}}}));
  await f.service.handle({type:'GET_CONFIG'},f.sender(1));await f.service.handle({type:'GET_CONFIG',force:true},f.sender(1));
  assert.equal(f.calls.filter(c=>c.url.endsWith('/files/resume.pdf')).length,1);
  f.mutate(c=>({...c,resume:{...c.resume,version:'v2',file:{url:'/files/resume.pdf',filename:'different.pdf'}}}));await f.service.handle({type:'GET_CONFIG',force:true},f.sender(1));
  assert.equal(f.calls.filter(c=>c.url.endsWith('/files/resume.pdf')).length,2);
});
test('a correlated committed APPLIED acknowledgement completes immediately even while context remains pending',async()=>{
  const f=fixture();const cfg=await f.service.handle({type:'GET_CONFIG'},f.sender(1)),c=cfg.settings.verifiedContext;
  f.intercept((url,options)=>{if(url.endsWith('/webhook')){const payload=JSON.parse(options.body);return jsonResponse({success:true,accepted:true,eventId:payload.event_id,applicationSessionId:c.applicationSessionId,jobId:c.jobId,profileId:c.profileId,recordId:'existing-record',status:'APPLIED'});}});
  const payload={application_session_id:c.applicationSessionId,profile_assignment_id:c.profileAssignmentId,profile_assignment_version:c.profileAssignmentVersion,profile_version:c.profileVersion,job_version:c.jobVersion,resume_id:c.resumeId,resume_version:c.resumeVersion,job_status:'SUBMITTED',is_final_submission:true,submission_confirmed_by:'CONFIRMED_ON_PORTAL_SUCCESS_PAGE',portal_evidence:{type:'SUCCESS_NOTICE',message:'Your application has been submitted',url:f.tabs[1].url,observedAt:new Date(f.now()).toISOString(),intermediate:false}};
  const result=await f.service.handle({type:'LOG_SUBMISSION',payload},f.sender(1));assert.equal(result.success,true);assert.equal(result.applyFlowStatus,'APPLIED');
  assert.equal(f.calls.filter(call=>call.url.endsWith('/api/sqc/application-context')).length,2,'Only initial and final verification should run, without a post-ack refresh');
  assert.equal(f.chrome.storage.session.data.sqcContexts[1].status,'APPLIED');
});
