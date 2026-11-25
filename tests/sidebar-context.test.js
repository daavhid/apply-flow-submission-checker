'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,key}=require('../background/sidebar-context'),policy=require('../content/context-policy');require('../ai/resume');
function fixture(){
  let active={id:7,url:'https://portal.test/jobs/1/apply'},verified=true;
  const c={applicationSessionId:'app1',applierId:'a1',profileId:'p1',profileVersion:'pv1',jobId:'j1',jobVersion:'jv1',resumeId:'r1',resumeVersion:'rv1',profileAssignmentId:'pa1',profileAssignmentVersion:'1',allowedRoutes:[{url:'https://portal.test/jobs/1',includeSubpaths:true}]};
  const cfg={settings:{verifiedContext:c},integration:{apiOrigin:'https://applyflow.test',applier:{name:'Applier'}},activeProfile:{fullName:'Test Applicant',resumeText:'Test Applicant\nExperienced software engineer building reliable application services.',resumeIsTailored:true,resumeFilename:'draft-final (3).txt',resumeBase64:'data:text/plain;base64,SGVsbG8=',resumeMimeType:'text/plain'},applyFlowContext:{jobTitle:'Engineer'}};
  const calls=[];
  const stored={};
  const chrome={runtime:{getURL:path=>'chrome-extension://test/'+path},tabs:{query:async options=>{assert.equal(options.windowId,2);return [structuredClone(active)];},sendMessage:async()=>({success:true})},storage:{session:{get:async()=>({sqcAuth:{csrfToken:'test-token'},...stored}),set:async value=>Object.assign(stored,value)}}};
  const session={async handle(message,sender){calls.push({message,sender});if(message.type==='SQC_ANSWER_QUESTIONS')return {success:true,answers:message.questions.map(q=>({id:q.id,answer:'Grounded answer',status:'ANSWERED'}))};return {...structuredClone(cfg),success:true,settings:{verifiedContext:verified?structuredClone(c):null}};}};
  const scope=create({chrome,session,policy}).forWindow(2);
  return {scope,c,cfg,calls,stored,chrome,unverify:()=>verified=false,tab:value=>active=value};
}

test('sidebar reads delivery state from the verified embedded application, excluding other jobs',async()=>{
  const f=fixture();f.c.verifiedUrls=['https://portal.test/jobs/1/apply','https://jobs.ashbyhq.com/company/job1'];
  f.chrome.webNavigation={getAllFrames:async()=>[{frameId:0,url:f.c.verifiedUrls[0]},{frameId:2,url:f.c.verifiedUrls[1]},{frameId:3,url:'https://jobs.ashbyhq.com/company/job2'}]};
  const reads=[];
  f.chrome.tabs.sendMessage=async(tab,message,options)=>{if(message.type==='SQC_SIDEBAR_READ')reads.push(options.frameId);return options.frameId===2?{success:true,context:{applicationSessionId:'app1',jobId:'j1',profileId:'p1'},submissionSync:{phase:'FAILED',error:'Offline'},hasFormData:true}: {success:true};};
  let panel=await f.scope.panel();assert.equal(panel.page.submissionSync.error,'Offline');assert.deepEqual(reads,[0,2]);
  let retryFrame;
  const originalSend=f.chrome.tabs.sendMessage;
  f.chrome.tabs.sendMessage=async(tab,message,options)=>{if(message.type==='SQC_SIDEBAR_ACTION')retryFrame=options.frameId;return originalSend(tab,message,options);};
  await f.scope.action('retrySubmission');assert.equal(retryFrame,2);
  // The main document is independently trusted; an iframe with another binding cannot replace it.
  f.chrome.tabs.sendMessage=async(tab,message,options)=>options.frameId===0?{success:true}:{success:true,context:{applicationSessionId:'another',jobId:'j2',profileId:'p1'},submissionSync:{phase:'ACKNOWLEDGED'}};
  panel=await f.scope.panel();assert.equal(panel.page.submissionSync,undefined);
});
test('unified Q&A uses the assigned profile and resume, without exposing the original file to the model',async()=>{
  const f=fixture(),snapshot=await f.scope.snapshot();assert.equal(snapshot.candidateName,'Test Applicant');assert.equal(snapshot.text,f.cfg.activeProfile.resumeText);assert.equal(snapshot.ready,true);assert.equal(JSON.stringify(snapshot).includes('base64'),false);
  const file=await f.scope.attachment(snapshot.version);assert.equal(file.filename,'Test Applicant.txt');
  assert.equal(file.dataUrl,f.cfg.activeProfile.resumeBase64);
  assert.equal(snapshot.profileFacts.fullName,'Test Applicant');assert.equal(snapshot.profileFacts.resumeBase64,undefined);
  const config=await f.scope.aiConfig();assert.equal(config.endpoint,'https://applyflow.test/api/ai/chat');assert.equal(config.credentials,'include');assert.equal(config.csrfToken,'test-token');
});

test('completed answer batches survive progress-only job version changes but reject changed material context',async()=>{
 const f=fixture(),snapshot=await f.scope.snapshot();f.c.jobVersion='progress-update';await f.scope.assertCurrent(snapshot);
 f.cfg.applyFlowContext.jobTitle='A different role';await assert.rejects(f.scope.assertCurrent(snapshot),/changed/);
 f.cfg.applyFlowContext.jobTitle='Engineer';f.c.resumeVersion='new-document';await assert.rejects(f.scope.assertCurrent(snapshot),/changed/);
});

test('attachment re-detects the same original file control across status-only job versions',async()=>{
 const f=fixture(),source={tabId:7,documentId:'doc',url:'https://portal.test/jobs/1/apply',snapshot:'shape',contextKey:key(f.c)};
 const item={id:'resume-field',question:'Resume',source,manual:true};
 const version=(await f.scope.snapshot()).version;f.c.jobVersion='status-update';let attached;
 const forms={scan:async()=>({questions:[],uploads:[{...item,source:{...source}}],fields:[]}),attach:async(target,file)=>{attached={target,file};return {success:true};}};
 const result=await f.scope.attach(forms,item,version);assert.equal(result.success,true);assert.equal(attached.file.filename,'Test Applicant.txt');assert.equal(attached.file.dataUrl,f.cfg.activeProfile.resumeBase64);assert.equal(attached.target.manual,true);
 const other={...item,source:{...source,contextKey:source.contextKey.replace('j1','different-job')}};
 await assert.rejects(f.scope.attach(forms,other,version),/candidate, job or original resume changed/);
});

test('overview retains the signed-in account and assigned candidate without a job or after route verification fails',async()=>{
  const f=fixture();f.cfg.profiles=[{id:'p1',fullName:'Test Applicant'}];
  f.tab({id:7,url:'chrome://newtab/'});
  let result=await f.scope.panel();assert.equal(result.success,true);assert.equal(result.context,null);
  assert.equal(result.integration.applier.name,'Applier');assert.equal(result.profiles[0].fullName,'Test Applicant');
  f.tab({id:7,url:'https://portal.test/unapproved'});f.unverify();
  result=await f.scope.panel(true);assert.equal(result.accountProfile.fullName,'Test Applicant');assert.equal(result.context,null);assert.match(result.jobError,/Verify/);
  assert.ok(f.calls.some(call=>call.message.type==='GET_CONFIG'&&!call.message.tabId&&call.message.force===true));
});

test('a resume parsed for a previous job cannot be saved after the active application changes',async()=>{
  const f=fixture(),snapshot=await f.scope.snapshot();f.c.jobId='j2';
  await assert.rejects(f.scope.save({contextVersion:snapshot.version,file:{filename:'draft.txt'},text:'Old job resume'}),/application changed/);
  assert.equal(f.calls.some(call=>call.message.type==='SQC_SET_LOCAL_RESUME'),false);
});

test('sidebar opened on the ApplyFlow login page reads only account context',async()=>{
  const f=fixture();f.tab({id:7,url:'https://applyflow.test/login'});
  const panel=await f.scope.panel();assert.equal(panel.context,null);assert.equal(panel.integration.applier.name,'Applier');
  assert.equal(f.calls.some(call=>call.message.tabId),false);assert.match(panel.jobError,/employer job page/);
  await assert.rejects(f.scope.snapshot(),/employer job page/);
  assert.equal(f.calls.some(call=>call.message.tabId),false);
});
test('a reconnecting account displays its profiles but does not start job or resume requests',async()=>{
  const f=fixture();f.cfg.integration.accountVerified=false;f.cfg.integration.message='Temporary network failure';
  const panel=await f.scope.panel();assert.equal(panel.context,null);assert.equal(panel.accountProfile.fullName,'Test Applicant');assert.match(panel.jobError,/paused/);
  assert.equal(f.calls.some(call=>call.message.tabId),false);
});
test('unified scan filters unauthorized frames and rejects stale answers after the job changes',async()=>{
  const f=fixture(),forms={scan:async()=>({questions:[{id:'ok',source:{tabId:7,url:'https://portal.test/jobs/1/apply'}},{id:'bad',source:{tabId:7,url:'https://third-party.test/frame'}}]}),apply:async()=>({success:true})};
  const scanned=await f.scope.scan(forms);assert.equal(scanned.questions.length,1);assert.equal(scanned.questions[0].source.contextKey,key({...f.c,jobVersion:undefined}));
  const coverage=await f.scope.scan({scan:async()=>({questions:[],fields:[{id:'ok',filled:true,source:{tabId:7,url:'https://portal.test/jobs/1/apply'}},{id:'bad',filled:true,source:{tabId:7,url:'https://third-party.test/frame'}}]})});
  assert.equal(coverage.fields.length,1);assert.equal(coverage.fields[0].id,'ok');
  assert.equal((await f.scope.apply(forms,scanned.questions[0])).success,true);
  f.c.jobVersion='progress-update';assert.equal((await f.scope.apply(forms,scanned.questions[0])).success,true);
  f.cfg.applyFlowContext.jobTitle='Changed title';await assert.rejects(f.scope.apply(forms,scanned.questions[0]),/earlier job context/);f.cfg.applyFlowContext.jobTitle='Engineer';
  f.c.jobId='j2';await assert.rejects(f.scope.apply(forms,scanned.questions[0]),/earlier job context/);
});
test('a sidebar upload is bound to the assigned candidate and job rather than a typed identity',async()=>{
  const f=fixture();await f.scope.save({candidateName:'Different Person',text:f.cfg.activeProfile.resumeText,file:{filename:'any-name.txt',dataUrl:'data:text/plain;base64,SGVsbG8='}});
  const saved=f.calls.find(call=>call.message.type==='SQC_SET_LOCAL_RESUME');assert.equal(saved.message.resume.filename,'Test Applicant.txt');assert.equal(saved.message.context.jobId,'j1');assert.equal(saved.sender.tab.id,7);
  await assert.rejects(f.scope.save({text:'Unrelated pasted context without its original file'}),/original tailored file/);
  f.unverify();await assert.rejects(f.scope.state(),/Verify/);await assert.rejects(f.scope.snapshot(),/Verify/);
});

test('main Q&A dispatches the versioned screening service with the active job and original question IDs',async()=>{
  const f=fixture(),controller=new AbortController();
  const answers=await f.scope.answer([{id:'first',question:'Why this job?',type:'textarea'},{id:'date',question:'Start date',type:'date'}],{requestId:'screening_uuid_1',signal:controller.signal});
  assert.equal(answers[0].id,'first');const call=f.calls.find(c=>c.message.type==='SQC_ANSWER_QUESTIONS');
  assert.equal(call.message.context.jobId,'j1');assert.equal(call.message.url,'https://portal.test/jobs/1/apply');assert.equal(call.message.questions[1].type,'text');
  assert.equal(f.calls.some(c=>c.message.endpoint?.includes('/api/ai/chat')),false);
});
test('the already-applied action exists only for a backend-confirmed duplicate and never creates a submission',async()=>{
  const f=fixture();await assert.rejects(f.scope.action('alreadyApplied'),/not confirmed/);
  f.cfg.applyFlowContext.duplicate={confirmed:true,profileId:'p1',jobId:'j1'};
  const ack=await f.scope.action('alreadyApplied');assert.equal(ack.acknowledged,true);
  assert.equal((await f.scope.panel()).duplicateAcknowledged,true);
  assert.equal(f.calls.some(c=>['LOG_SUBMISSION','APPLYFLOW_WEBHOOK'].includes(c.message.type)),false);
});
