'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {attention}=require('../ai/form-bridge'),{create}=require('../ai/form-service');
test('switching job tabs or finishing navigation refreshes the sidebar only in its own window',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync('ai/app.js','utf8');
  const handlers={};let scans=0;
  const scope={chrome:{tabs:{onActivated:{addListener:fn=>handlers.activate=fn},onUpdated:{addListener:fn=>handlers.update=fn}}},detectionWindowId:8,detectQuestions:()=>scans++};
  vm.runInNewContext(source.slice(source.indexOf('// A sidebar follows'),source.indexOf('function needsReview')),scope);
  handlers.activate({windowId:9});assert.equal(scans,0);
  handlers.activate({windowId:8});assert.equal(scans,1);
  handlers.update(7,{status:'complete'},{active:false,windowId:8});assert.equal(scans,1);
  handlers.update(7,{status:'complete'},{active:true,windowId:9});assert.equal(scans,1);
  handlers.update(7,{status:'complete'},{active:true,windowId:8});assert.equal(scans,2);
  handlers.update(7,{url:'https://new-ats.example/apply'},{active:true,windowId:8});assert.equal(scans,3);
  handlers.update(7,{title:'Updated title'},{active:true,windowId:8});assert.equal(scans,3);
});
test('all application identity fields are detectable while secrets and legal agreements stay excluded',()=>{
  for(const label of ['Race','Ethnicity','What is your ethnic/racial identity?'])assert.equal(attention(label,'select'),true,label);
  for(const label of ['I agree to the privacy policy','Passport number','Password','Social security number'])assert.equal(attention(label,'text'),false,label);
  assert.equal(attention('Your details','text','given-name'),true);
  for(const label of ['First name','Last name','Email address','Phone number','Location','LinkedIn Link','Gender','Veteran Status','Disability status','Are you Hispanic/Latino?'])assert.equal(attention(label,'text'),true,label);
  for(const label of ['Why are you interested in this role?','How many years of Python experience?','Which technologies have you used?','Do you require visa sponsorship?','Expected pay','Business domains','Preferred working arrangement'])assert.equal(attention(label,'text'),true,label);
});
test('detected questions retain frame/document identity for exact field mapping',async()=>{
  const calls=[];
  const chrome={tabs:{query:async options=>{assert.equal(options.windowId,8);return [{id:7,url:'https://jobs.example/apply'}];},sendMessage:async(id,message,options)=>{calls.push({id,message,options});return {success:true};}},scripting:{executeScript:async options=>{
    if(options.files)return [{frameId:0}];
    return [{frameId:0,documentId:'document',result:{url:'https://jobs.example/apply',questions:[{id:'field',question:'Which skill?',type:'radio',options:['Python'],snapshot:'shape'}]}}];
  }}};
  const service=create(chrome),result=await service.scan(8),q=result.questions[0];
  assert.equal(q.source.documentId,'document');assert.equal(q.source.tabId,7);
  await service.apply({...q,answer:'Python'});assert.equal(calls[0].options.documentId,'document');assert.equal(calls[0].message.snapshot,'shape');
});
test('unavailable embedded frames fall back to the main page and report the limitation',async()=>{
  const chrome={tabs:{query:async()=>[{id:7,url:'https://jobs.example/apply'}]},scripting:{executeScript:async options=>{
    if(options.target.allFrames)throw new Error('Cross-origin access unavailable');
    return options.files?[{frameId:0}]:[{frameId:0,documentId:'document',result:{url:'https://jobs.example/',questions:[]}}];
  }}};
  assert.equal((await create(chrome).scan()).limited,true);
  chrome.scripting.executeScript=async()=>{throw new Error('Not permitted');};
  await assert.rejects(create(chrome).scan(),error=>error.code==='SITE_ACCESS_REQUIRED' && error.access.origin==='https://jobs.example/*');
});
test('fields without an original document binding cannot be filled',async()=>{
  await assert.rejects(create({}).apply({source:{tabId:7}}),/Detect this question/);
});

test('permission failures expose only the current site as a connection target',async()=>{
  const chrome={tabs:{query:async()=>[{id:7,url:'https://jobs.example/apply?private_token=secret'}]},scripting:{executeScript:async()=>{throw new Error('Cannot access contents of url https://jobs.example/apply?private_token=secret. Missing host permission.');}}};
  await assert.rejects(create(chrome).scan(),error=>error.code==='SITE_ACCESS_REQUIRED' && error.access.origin==='https://jobs.example/*' && !error.details.includes('private_token'));
});
test('detector execution errors are not mislabeled as missing site permission',async()=>{
  const chrome={tabs:{query:async()=>[{id:7,url:'https://jobs.example/apply'}]},scripting:{executeScript:async()=>{throw new Error('SyntaxError: Unexpected token');}}};
  await assert.rejects(create(chrome).scan(),error=>error.code==='DETECTION_FAILED' && error.details.includes('SyntaxError') && !error.access);
});
test('restricted pages and missing installation permissions give distinct recovery messages',async()=>{
  await assert.rejects(create({}).scan(),error=>error.code==='EXTENSION_RELOAD_REQUIRED');
  const chrome={tabs:{query:async()=>[{id:7,url:'chrome://extensions/'}]},scripting:{executeScript:async()=>assert.fail('Restricted page must not be injected')}};
  await assert.rejects(create(chrome).scan(),error=>error.code==='RESTRICTED_PAGE');
});
