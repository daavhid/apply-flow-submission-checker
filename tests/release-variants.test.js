'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const full=JSON.parse(fs.readFileSync('manifest.json','utf8')),qa=JSON.parse(fs.readFileSync('manifests/qa.json','utf8'));
test('release manifests retain full SQC and an independent standalone Q&A surface',()=>{
  assert.equal(full.action.default_popup,'popup/popup.html');assert.equal(full.options_page,'options/options.html');
  assert.equal(full.background.service_worker,'background/integrated-worker.js');assert.equal(full.side_panel.default_path,'ai/app.html');
  assert.ok(full.content_scripts[0].js.includes('content/hud.js'));assert.ok(full.permissions.includes('sidePanel'));
  assert.equal(qa.background.service_worker,'ai/worker.js');assert.equal(qa.action.default_popup,undefined);assert.equal(qa.content_scripts,undefined);
  const {PROFILES}=require('../build-extension');assert.ok(PROFILES.sqc.files.includes('ai'));assert.deepEqual(PROFILES.qa.files,['ai','icons']);
  assert.notEqual(PROFILES.sqc.folder,PROFILES.qa.folder);assert.notEqual(PROFILES.sqc.zip,PROFILES.qa.zip);
});
test('both worker sources share one global scope without duplicate declarations',()=>{
  assert.doesNotThrow(()=>new vm.Script(fs.readFileSync('background/service-worker.js','utf8')+'\n'+fs.readFileSync('ai/worker.js','utf8')));
});
test('combined worker routes Q&A to its own listener and preserves SQC popup behavior',async()=>{
  const listeners=[],imports=[],behaviors=[];let sqcCalls=0;
  const area={async setAccessLevel(){},async remove(){},async set(){},async get(){return {};}};
  const chrome={runtime:{id:'release',getURL:p=>'chrome-extension://release/'+p,getManifest:()=>full,onInstalled:{addListener(){}},onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:area,session:area},sidePanel:{async setPanelBehavior(value){behaviors.push(value);}},tabs:{onRemoved:{addListener(){}},onUpdated:{addListener(){}},async query(){return [];},async sendMessage(){return {success:true};}}};
  let context;
  context=vm.createContext({chrome,console,structuredClone,AbortController,setTimeout,clearTimeout,
    SQCApplyFlowSession:{create:()=>({handle:async()=>{sqcCalls++;return {success:true};}})},SQCContextPolicy:{},fetch:()=>{throw new Error('No network during release routing');},
    SQCQAForms:require('../ai/form-service'),SQCQAQuestions:require('../ai/questions'),SQCQABatch:require('../ai/batch'),
    SQCQAResume:{create:()=>({snapshot:async()=>({version:'one',text:'Resume context for this release test.'}),assertCurrent:async()=>{}})},
    SQCQADefaults:{create:()=>({snapshot:async()=>null,assertCurrent:async()=>{}})},
    SQCQuestionClient:{answer:async()=>[{id:'q1',answer:'No'}]},SQC_AI_CONFIG:{endpoint:'https://example.test/ai',timeoutMs:1000},
    importScripts(...paths){for(const path of paths){imports.push(path);if(path==='service-worker.js')vm.runInContext(fs.readFileSync('background/service-worker.js','utf8'),context);if(path==='../ai/worker.js')vm.runInContext(fs.readFileSync('ai/worker.js','utf8'),context);}}
  });
  vm.runInContext(fs.readFileSync('background/integrated-worker.js','utf8'),context);
  assert.equal(listeners.length,2);assert.equal(behaviors[0].openPanelOnActionClick,false);
  assert.ok(imports.includes('chrome-extension://release/ai/config.js'));
  const send=(message,url)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No worker response')),2000);for(const listener of listeners)listener(message,{id:'release',url,documentId:'sidebar'},result=>{clearTimeout(timer);resolve(result);});});
  const answer=await send({type:'QA_ANSWER',requestId:'release-test',questions:['Need sponsorship?']},'chrome-extension://release/ai/app.html');
  assert.equal(answer.success,true);assert.equal(answer.answers[0].answer,'No');assert.equal(sqcCalls,0);
  const settings=await send({type:'GET_CONFIG'},'chrome-extension://release/popup/popup.html');assert.equal(settings.success,true);assert.equal(sqcCalls,1);
});
test('the SQC ready workspace opens the sidebar on the current application tab',async()=>{
  const source=fs.readFileSync('ui/workspace.js','utf8'),start=source.indexOf("on('open-qa'"),end=source.indexOf("on('password-settings'",start);
  let click,opened,closed=false;
  vm.runInNewContext(source.slice(start,end),{on:(id,handler)=>click=handler,perform:work=>work(),activeTab:{id:42},surface:'popup',window:{close:()=>closed=true},chrome:{sidePanel:{open:async options=>opened=options}}});
  await click();assert.equal(opened.tabId,42);assert.equal(closed,true);
});
