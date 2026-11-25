'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const client=require('../ai/client');
const questionPolicy=require('../ai/questions'),batch=require('../ai/batch');
const config={endpoint:'https://internal.example/api/ai/chat'};
const response=data=>({ok:true,status:200,json:async()=>data});
test('one batched request uses the embedded API with no job, profile, resume, credentials or page data',async()=>{
  let seen;
  const answers=await client.answer({config,items:['First?','Second?'],fetch:async(url,options)=>{
    seen={url,...options};return response({success:true,content:JSON.stringify({answers:[{id:'q2',answer:'Second answer'},{id:'q1',answer:'First answer'}]})});
  }});
  assert.equal(seen.url,config.endpoint);assert.equal(seen.credentials,'omit');
  const body=JSON.parse(seen.body);
  assert.deepEqual(Object.keys(body).sort(),['messages','temperature']);
  assert.deepEqual(JSON.parse(body.messages[1].content).questions,[{id:'q1',question:'First?'},{id:'q2',question:'Second?'}]);
  assert.deepEqual(answers.map(a=>a.answer),['First answer','Second answer']);
});
test('invalid questions and unconfigured endpoints never call the API',async()=>{
  for(const items of [[],[''],['a'.repeat(4001)],Array(101).fill('Question?')]){
    await assert.rejects(client.answer({config,items,fetch:()=>assert.fail('Unexpected API call')}));
  }
  await assert.rejects(client.answer({config:{endpoint:''},items:['Question?'],fetch:()=>assert.fail('Unexpected API call')}),/not been embedded/);
  for(const url of ['http://remote.example/chat','https://user:pass@example.test/chat','https://example.test/chat#key']) assert.throws(()=>client.endpoint(url));
});
test('plain single answers and JSON code fences are supported',()=>{
  const requested=client.questions(['Question?']);
  assert.equal(client.normalize({message:{content:'A plain answer'}},requested)[0].answer,'A plain answer');
  assert.equal(client.normalize({content:'```json\n{"answers":[{"id":"q1","answer":"An answer"}]}\n```'},requested)[0].answer,'An answer');
});
test('missing personal facts and omitted answers stay available for manual input',()=>{
  const answers=client.normalize({answers:[{id:'q1',status:'NEEDS_INPUT',reason:'Supply your experience.'}]},client.questions(['Experience?','Authorization?']));
  assert.ok(answers.every(a=>a.needsInput && a.answer===''));assert.match(answers[0].reason,/experience/);
});
test('unknown IDs, duplicate IDs, empty answers and unstructured batches are rejected',()=>{
  const requested=client.questions(['First?','Second?']);
  for(const data of [{answers:[{id:'q3',answer:'bad'}]},{answers:[{id:'q1',answer:'a'},{id:'q1',answer:'b'}]},{answers:[{id:'q1',answer:''}]},{content:'Some answers with no IDs'}]) assert.throws(()=>client.normalize(data,requested));
});
test('backend and non-JSON failures retain useful error information',async()=>{
  await assert.rejects(client.answer({config,items:['Question?'],fetch:async()=>({ok:false,status:503,json:async()=>({error:{message:'Provider unavailable'}})})}),/503.*Provider unavailable/);
  await assert.rejects(client.answer({config,items:['Question?'],fetch:async()=>({ok:false,status:502,json:async()=>{throw new Error('HTML');}})}),/502.*without a JSON/);
});
test('cancellation reaches the fetch request',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(client.answer({config,items:['Question?'],signal:controller.signal,fetch:async(url,options)=>{options.signal.throwIfAborted();}}),{name:'AbortError'});
});
test('the Q&A package uses temporary detection access without persistent all-sites scripts or old workspace',()=>{
  const manifest=JSON.parse(fs.readFileSync('manifests/qa.json','utf8'));
  assert.equal(manifest.background.service_worker,'ai/worker.js');assert.equal(manifest.content_scripts,undefined);
  assert.equal(manifest.options_page,undefined);assert.equal(manifest.action.default_popup,undefined);
  assert.deepEqual(manifest.permissions,['sidePanel','storage','activeTab','scripting','tabs']);
  assert.equal(manifest.side_panel.default_path,'ai/app.html');
  const build=fs.readFileSync('build-extension.js','utf8');assert.match(build,/qa:\{manifest:'manifests\/qa.json',files:\['ai','icons'\]/);
});
function worker(){
  const listeners={},panelBehaviors=[];
  const chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listeners.message=fn}},
    storage:{local:{setAccessLevel(){}},session:{setAccessLevel(){},async remove(){}}},
    sidePanel:{async setPanelBehavior(options){panelBehaviors.push(options);}},
    tabs:{create(){assert.fail('Q&A must not open a browser tab');},update(){assert.fail('Q&A must not change the active tab');}}};
  const context=vm.createContext({chrome,AbortController,SQCQADiagnostics:require('../ai/diagnostics'),SQCQADefaults:{create:()=>({snapshot:async()=>null,assertCurrent:async()=>{}})},SQCQAQuestions:questionPolicy,SQCQABatch:batch,SQCQAForms:require('../ai/form-service'),SQCQAResume:{create:()=>({snapshot:async()=>({text:'A sufficiently detailed test resume for answering questions.',version:'1'}),assertCurrent:async()=>{}})},setTimeout,clearTimeout,Map,importScripts(){},SQC_AI_CONFIG:{...config,localEndpoint:'http://localhost:5000/api/ai/chat',timeoutMs:1000},SQCQuestionClient:client});
  vm.runInContext(fs.readFileSync('ai/worker.js','utf8'),context);
  return {listeners,context,chrome,panelBehaviors,resumes:vm.runInContext('resumes',context)};
}
test('only the extension Q&A page can send requests or cancel them',()=>{
  const w=worker();let replied=false;
  w.listeners.message({type:'QA_ANSWER',questions:['Question?']},{id:'test',url:'https://job.example/'},()=>{replied=true;});
  assert.equal(replied,false);
  for(const type of ['QA_RESUME_FILE','QA_ATTACH_RESUME'])w.listeners.message({type},{id:'test',url:'https://job.example/'},()=>{replied=true;});
  assert.equal(replied,false,'Portal pages must not retrieve the original resume file');
});

const trusted={id:'test',url:'chrome-extension://test/ai/app.html',documentId:'document-1',tab:{id:7}};
const send=(w,message,sender=trusted)=>new Promise(resolve=>w.listeners.message(message,sender,resolve));
test('the worker isolates requests, supports Stop, and ignores cancellation with the wrong ID',async()=>{
  const w=worker();let signal,started;
  const ready=new Promise(resolve=>started=resolve);
  w.context.SQCQuestionClient={answer:async options=>{signal=options.signal;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}};
  const pending=send(w,{type:'QA_ANSWER',requestId:'r1',questions:['Question?']});await ready;
  const duplicate=await send(w,{type:'QA_ANSWER',requestId:'r2',questions:['Question?']});
  assert.equal(duplicate.success,false);assert.match(duplicate.error,/already running/);
  await send(w,{type:'QA_CANCEL',requestId:'wrong'});assert.equal(signal.aborted,false);
  await send(w,{type:'QA_CANCEL',requestId:'r1'});
  const result=await pending;assert.equal(result.success,false);assert.match(result.error,/stopped/);
});
test('the sidebar opens from the toolbar without creating or activating any tab',()=>{
  const w=worker();assert.equal(w.panelBehaviors.length,1);
  assert.equal(w.panelBehaviors[0].openPanelOnActionClick,true);
});
test('sidebar generation works without an application tab in the message sender',async()=>{
  const w=worker();w.context.SQCQuestionClient={answer:async()=>[{id:'q1',answer:'Sidebar answer'}]};
  const {tab,...sidebarSender}=trusted;
  const result=await send(w,{type:'QA_ANSWER',requestId:'sidebar-1',questions:['Question?']},sidebarSender);
  assert.equal(result.success,true);assert.equal(result.answers[0].answer,'Sidebar answer');
});
test('the worker reports a timeout and releases its request slot',async()=>{
  const w=worker();w.context.SQC_AI_CONFIG.timeoutMs=10;
  w.context.SQCQuestionClient={answer:async({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))};
  const result=await send(w,{type:'QA_ANSWER',requestId:'r1',questions:['Question?']});assert.match(result.error,/timed out/);
  w.context.SQCQuestionClient={answer:async()=>[{id:'q1',question:'Question?',answer:'Answer'}]};
  const retry=await send(w,{type:'QA_ANSWER',requestId:'r2',questions:['Question?']});assert.equal(retry.success,true);assert.equal(retry.requestId,'r2');
});

test('the worker defaults to deployed and permits only the embedded local alternative',async()=>{
  const w=worker(),seen=[];
  w.context.SQCQuestionClient={answer:async options=>{seen.push(options.config.endpoint);return [];}};
  await send(w,{type:'QA_ANSWER',requestId:'r1',questions:['Question?'],endpoint:'https://untrusted.example/'});
  await send(w,{type:'QA_ANSWER',requestId:'r2',questions:['Question?'],environment:'local'});
  const denied=await send(w,{type:'QA_ANSWER',requestId:'r3',questions:['Question?'],environment:'https://untrusted.example/'});
  assert.deepEqual(seen,[config.endpoint,'http://localhost:5000/api/ai/chat']);assert.equal(denied.success,false);
});

test('the embedded API endpoints stay fixed while persistent page access supports new job tabs',()=>{
  const scope={};vm.runInNewContext(fs.readFileSync('ai/config.js','utf8'),scope);
  assert.equal(scope.SQC_AI_CONFIG.endpoint,'https://applyflow-api.jhproit.com/api/ai/chat');
  assert.equal(scope.SQC_AI_CONFIG.localEndpoint,'http://localhost:5000/api/ai/chat');
  assert.deepEqual(JSON.parse(fs.readFileSync('manifests/qa.json','utf8')).host_permissions,['https://*/*','http://*/*']);
});

test('Cloudflare denial is distinguished from AI generation failure',async()=>{
  await assert.rejects(client.answer({config,items:['Question?'],fetch:async()=>({ok:false,status:403,json:async()=>({cloudflare_error:true,error_code:1010,detail:'Browser signature blocked.'})})}),/403.*Cloudflare.*administrator/);
});

test('resume-only requests send the selected text without login, cookies, profile or job metadata',async()=>{
  let sent;
  const resume={source:'upload',filename:'Resume.pdf',text:'Ramon Ramirez has five years of Python experience.',version:'1'};
  await client.answer({config,items:['Describe your experience.'],resume,fetch:async(url,options)=>{
    sent=options;return response({answers:[{id:'q1',answer:'I have five years of Python experience.'}]});
  }});
  const body=JSON.parse(sent.body),context=JSON.parse(body.messages[1].content);
  assert.equal(sent.credentials,'omit');assert.equal(sent.headers['X-SQC-CSRF'],undefined);
  assert.deepEqual(body.resumeContext,resume);assert.deepEqual(context.resumeContext,resume);
  assert.equal(body.profileId,undefined);assert.equal(context.candidateProfile,undefined);assert.equal(body.jobId,undefined);
});

test('generation requires a selected resume before calling the AI API',async()=>{
  const w=worker();w.resumes.snapshot=async()=>{throw new Error('Upload or paste your resume first.');};
  w.context.SQCQuestionClient={answer:()=>assert.fail('The AI must not be called without a resume')};
  const result=await send(w,{type:'QA_ANSWER',requestId:'no-resume',questions:['Experience?']});
  assert.equal(result.success,false);assert.match(result.error,/resume first/);
});

test('the worker rejects answers if the selected resume changed during generation',async()=>{
  const w=worker();w.context.SQCQuestionClient={answer:async()=>[{id:'q1',answer:'Old answer'}]};
  w.resumes.assertCurrent=async()=>{throw new Error('The resume changed.');};
  const result=await send(w,{type:'QA_ANSWER',requestId:'old-resume',questions:['Experience?']});
  assert.equal(result.success,false);assert.match(result.error,/resume changed/);
});

test('behavioral refusals are retried as concise drafts while factual answers are retained',async()=>{
  let calls=0;
  const question='Tell us about a time you disagreed with a technical approach taken by your team. How did you raise it, and what was the outcome?';
  const answers=await client.answer({config,items:['Which language do I use?',question],resume:{text:'I build Python APIs with PostgreSQL and Redis.'},fetch:async(url,options)=>{
    const body=JSON.parse(options.body),batch=JSON.parse(body.messages[1].content).questions;
    calls++;
    assert.match(body.messages[0].content,/2–3 concise sentences/);
    assert.match(body.messages[0].content,/Do not invent percentages/);
    if(calls===1)return response({answers:[{id:'q1',answer:'Python.'},{id:'q2',status:'NEEDS_INPUT',reason:'The resume does not provide a specific disagreement.'}]});
    assert.deepEqual(batch.map(q=>q.id),['q2']);
    return response({answers:[{id:'q2',answer:'I questioned a proposal to scale Python API instances before examining PostgreSQL queries. I raised the concern through a Redis caching proof of concept and shared the comparison with the team. We agreed on a more focused approach to improving response times.',draft:true}]});
  }});
  assert.equal(calls,2);assert.equal(answers[0].answer,'Python.');assert.equal(answers[1].draft,true);assert.equal(answers[1].needsInput,false);
});

test('a refusal returned as answer text is retried, but legal missing facts are not',async()=>{
  let calls=0;
  const answers=await client.answer({config,items:['Describe a time you disagreed with your team.','Are you bound by a non-compete?'],fetch:async(url,options)=>{
    calls++;
    if(calls===1)return response({answers:[{id:'q1',answer:'The resume describes architecture reviews but does not provide a specific instance of disagreement.'},{id:'q2',status:'NEEDS_INPUT',reason:'Confirm your agreement status.'}]});
    assert.equal(JSON.parse(JSON.parse(options.body).messages[1].content).questions.length,1);
    return response({answers:[{id:'q1',answer:'I raised an architecture trade-off during review. I proposed a small comparison and used the findings to help the team agree on an approach.'}]});
  }});
  assert.equal(calls,2);assert.equal(answers[0].draft,true);assert.equal(answers[1].needsInput,true);
});
