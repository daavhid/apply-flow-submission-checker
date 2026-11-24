'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{create}=require('../background/job-activation'),policy=require('../content/context-policy');
function fixture(){
  const tabs={7:{id:7,windowId:1,url:'https://job-boards.greenhouse.io/versaterm/jobs/5461979008#application_session_id=app_example&sqc_application_session_id=app_example'}};
  const local={sqcConnection:{apiOrigin:'https://applyflow.example'}},stored={},calls=[],messages=[];
  const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,sendMessage:async message=>messages.push(message)},storage:{local:{get:async()=>local},session:{get:async()=>stored}},
    tabs:{get:async id=>structuredClone(tabs[id]),query:async()=>Object.values(tabs),sendMessage:async()=>{throw new Error('No content script yet');}}};
  let handler=async()=>({success:true,integration:{state:'VERIFIED'},settings:{verifiedContext:{applicationSessionId:'app_example'}}});
  const session={handle:async(message,sender)=>{calls.push({message,sender,url:tabs[message.tabId]?.url});return handler(message);}};
  const service=create({chrome,session,policy});return {tabs,local,stored,calls,messages,service,handler:fn=>handler=fn};
}
test('a pasted tracked Greenhouse job verifies before any DOM detector or content script is available',async()=>{
  const f=fixture(),result=await f.service.activate(7);assert.equal(result.integration.state,'VERIFIED');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].message.type,'GET_CONFIG');assert.equal(f.calls[0].message.tabId,7);
  assert.equal(f.messages[0].type,'SQC_JOB_ACTIVATION');assert.equal(f.messages[0].state,'VERIFYING');assert.equal(f.messages.at(-1).state,'VERIFIED');
});
test('retained bindings and child tab openers activate after redirects without launch parameters',async()=>{
  const f=fixture();f.stored.sqcTabBindings={7:{applicationSessionId:'app_example'}};f.tabs[7].url='https://ats.example/login';
  f.tabs[8]={id:8,windowId:1,openerTabId:7,url:'https://other-ats.example/form'};
  await f.service.activateOpenTabs();assert.deepEqual(f.calls.map(c=>c.message.tabId).sort(),[7,8]);
});
test('verification identifies the target candidate from the assigned roster rather than the default profile',async()=>{
  const f=fixture();f.tabs[7].url+='&sqc_profile_id=profile-2';f.stored.sqcAuth={profile:{id:'profile-1',fullName:'Default Candidate'},assignedProfiles:[{id:'profile-2',fullName:'Target Candidate'}]};
  await f.service.activate(7);assert.equal(f.messages[0].profile.fullName,'Target Candidate');assert.equal(f.messages[0].profile.id,'profile-2');
});
test('activation skips unrelated pages, signed-out accounts and the ApplyFlow workspace',async()=>{
  const f=fixture();f.tabs[7].url='https://unrelated.example/';assert.equal((await f.service.activate(7)).skipped,true);
  f.tabs[7].url='https://applyflow.example/login#application_session_id=app_example';assert.equal((await f.service.activate(7)).skipped,true);
  f.tabs[7].url='https://ats.example/job#application_session_id=app_example';f.local.sqcConnection.signedOut=true;
  assert.equal((await f.service.activate(7)).skipped,true);assert.equal(f.calls.length,0);
});
test('a navigation arriving during verification is rechecked using the new page, without parallel requests',async()=>{
  const f=fixture();f.stored.sqcTabBindings={7:{applicationSessionId:'app_example'}};
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),start=new Promise(resolve=>{started=resolve;});let count=0;
  f.handler(async()=>{if(++count===1){started();await gate;}return {success:true,integration:{state:'VERIFIED'},settings:{verifiedContext:{}}};});
  const first=f.service.activate(7);await start;f.tabs[7].url='https://ats.example/step-two';const second=f.service.activate(7);release();await Promise.all([first,second]);
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].url,'https://ats.example/step-two');assert.equal(f.messages.filter(m=>m.state==='VERIFIED').length,1);
});
