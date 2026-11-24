'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),detector=require('../content/portal-availability'),{create}=require('../background/portal-availability');
test('real HTTP 404/410 and visible job-closed or soft-404 notices are unavailable',()=>{
  for(const snapshot of [{headings:['404 (Not found)']},{headings:['This job is no longer accepting applications']},{messages:['The requested position has been filled.']}])assert.equal(detector.classify(snapshot).unavailable,true);
  for(const statusCode of [404,410])assert.equal(detector.classify({}, {statusCode}).unavailable,true);
});
test('login, CAPTCHA, temporary errors and conflicting application forms are not declared closed',()=>{
  for(const [snapshot,net] of [[{url:'https://ats.test/login'}, {statusCode:404}],[{passwordFields:1},{statusCode:404}],[{accessChallenge:true},{}],[{}, {statusCode:503}],[{}, {error:'network failure'}],[{headings:['404 (Not found)'],applicationForm:true},{}],[{expiredPosting:true},{}]])assert.equal(detector.classify(snapshot,net).unavailable,false);
  assert.equal(detector.classify({headings:['Senior Engineer REQ-404'],messages:['Experience with HTTP 404 handling required.']}).unavailable,false);
});
function fixture(){
  let clock=10000;const data={},calls=[],tab={id:1,url:'https://careers.test/job/123'};let read=()=>({url:tab.url,headings:['404 (Not found)'],ready:true});
  const area={async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(data[k])]));},async set(value){Object.assign(data,structuredClone(value));}};
  const cfg={settings:{verifiedContext:{applicationSessionId:'app',profileId:'candidate',jobId:'job',profileAssignmentId:'assignment',profileAssignmentVersion:'1',profileVersion:'1',jobVersion:'1',resumeId:'none',resumeVersion:'none'}},applyFlowContext:{currentStatus:'PENDING'}};
  const service=create({chrome:{storage:{session:area},tabs:{get:async()=>({...tab})}},session:{handle:async message=>{calls.push(message);return {success:true,recordId:'record',applyFlowStatus:'LINK_NOT_FOUND'};}},detector,now:()=>clock,wait:async ms=>{clock+=ms;},inspectPage:async()=>read()});
  return {service,cfg,calls,data,tab,setRead:fn=>read=fn};
}
test('unavailable reporting requires stable evidence and sends a non-submission event once',async()=>{
  const f=fixture();const result=await f.service.check(1,f.cfg);assert.equal(result.confirmed,true);assert.equal(result.syncStatus,'ACKNOWLEDGED');assert.equal(f.calls.length,1);
  const payload=f.calls[0].payload;assert.equal(payload.job_status,'PORTAL_ACCESS_FAILED');assert.equal(payload.is_final_submission,false);assert.equal(payload.portal_evidence.type,'JOB_UNAVAILABLE_NOTICE');
  await f.service.check(1,f.cfg);assert.equal(f.calls.length,1);
});
test('an applied record is protected and a temporary unavailable notice never sends a terminal report',async()=>{
  const f=fixture();f.cfg.applyFlowContext.currentStatus='APPLIED';assert.equal((await f.service.check(1,f.cfg)).syncStatus,'PROTECTED_APPLIED');assert.equal(f.calls.length,0);
  const g=fixture();let count=0;g.setRead(()=>({url:g.tab.url,headings:++count===1?['404 (Not found)']:['Apply now'],ready:true}));
  assert.equal((await g.service.check(1,g.cfg)).confirmed,false);assert.equal(g.calls.length,0);
});
