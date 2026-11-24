'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../content/sidebar-launch'),policy=require('../content/context-policy');
function setup(url){const messages=[],listeners={};let status=()=>({state:'UNAVAILABLE'});const window={location:{href:url},addEventListener:(name,fn)=>listeners[name]=fn};const chrome={runtime:{onMessage:{addListener:fn=>listeners.message=fn},sendMessage:message=>{messages.push(message);return Promise.resolve(message.type==='SQC_LAUNCH_STATUS'?status():{success:true});}}};return {...create({window,chrome,policy}),window,messages,listeners,status:value=>{status=typeof value==='function'?value:()=>value;},opens:()=>messages.filter(message=>message.type==='OPEN_SQC_SIDEBAR')};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('clicking a tracked job link requests the native sidebar before navigation, only once',async()=>{
 const f=setup('https://applyflow.test/jobs'),target={closest:()=>({href:'https://portal.test/job#sqc_application_session_id=app1'})};
 f.gesture({isTrusted:true,type:'click',target});assert.equal(f.opens().length,1);await settle();f.gesture({isTrusted:true,type:'click',target});assert.equal(f.opens().length,1);
});
test('pasted tracked jobs open on the first real portal interaction, never on timers or synthetic events',()=>{
 const f=setup('https://portal.test/job#application_session_id=app1');assert.equal(f.opens().length,0);
 f.gesture({isTrusted:false,type:'click'});assert.equal(f.opens().length,0);f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,1);
});
test('unrelated pages stay quiet and verified continuations can open on a user gesture',async()=>{
 const f=setup('https://portal.test/second-step');f.gesture({isTrusted:true,type:'click'});assert.equal(f.messages.length,0);
 f.status({state:'VERIFIED'});f.listeners.message({type:'SQC_CONTEXT_AVAILABLE'});await settle();
 assert.equal(f.opens().length,0);f.gesture({isTrusted:true,type:'keydown',key:'Enter'});assert.equal(f.opens().length,1);
});

test('context notifications and tab switches do not authorize unrelated pages',async()=>{
 const f=setup('https://unrelated.test/');f.listeners.message({type:'SQC_CONTEXT_AVAILABLE'});
 f.gesture({isTrusted:true,type:'click'});await settle();f.gesture({isTrusted:true,type:'keydown',key:'Enter'});
 assert.equal(f.opens().length,0);
});

test('ordinary job-board SPA navigation does not request ApplyFlow account or job status',()=>{
 const f=setup('https://www.levels.fyi/jobs');
 f.window.location.href='https://www.levels.fyi/jobs?jobId=123';f.listeners.message({type:'SQC_ROUTE_CHANGED'});
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.messages.length,0);
});

test('a verified SPA page loses launch permission on navigation and failed verification',async()=>{
 const f=setup('https://portal.test/step');f.status({state:'VERIFIED'});
 f.listeners.message({type:'SQC_CONTEXT_AVAILABLE'});await settle();
 f.window.location.href='https://portal.test/unrelated';
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,0);
 f.status({state:'CONTEXT_MISMATCH'});f.listeners.message({type:'SQC_ROUTE_CHANGED'});await settle();
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,0);
});

test('a context that becomes unavailable cannot keep its prior launch permission',async()=>{
 const f=setup('https://portal.test/step');f.status({state:'VERIFIED'});
 f.listeners.message({type:'SQC_CONTEXT_AVAILABLE'});await settle();
 f.status({state:'UNAVAILABLE'});f.listeners.message({type:'SQC_CONTEXT_AVAILABLE'});await settle();
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,0);
});

test('verification completing after navigation cannot authorize the new page',async()=>{
 const f=setup('https://portal.test/step');let release;
 f.status(()=>new Promise(resolve=>{release=resolve;}));f.listeners.message({type:'SQC_CONTEXT_AVAILABLE'});
 f.window.location.href='https://portal.test/unrelated';f.status({state:'UNAVAILABLE'});
 f.listeners.message({type:'SQC_ROUTE_CHANGED'});release({state:'VERIFIED'});await settle();
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,0);
 assert.equal(f.messages.filter(message=>message.type==='SQC_LAUNCH_STATUS').length,2);
});
test('explicit opener can reopen a panel whose visibility report still says open',async()=>{
 const f=setup('https://portal.test/job#application_session_id=app1');await settle();f.status({state:'VERIFIED',sidebarVisible:true});await f.check(true);
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,0);
 f.gesture({isTrusted:true,type:'click'},true);assert.equal(f.opens().length,1);
});
test('explicit opener survives a temporary outage on the same page without authorizing ordinary page clicks',async()=>{
 const f=setup('https://portal.test/step');f.status({state:'VERIFIED'});await f.check(true);f.status({state:'UNAVAILABLE'});await f.check(true);
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,0);
 f.gesture({isTrusted:true,type:'click'},true);assert.equal(f.opens().length,1);await settle();
 f.window.location.href='https://portal.test/different-job';f.listeners.message({type:'SQC_SIDEBAR_VISIBILITY',visible:false});
 f.gesture({isTrusted:true,type:'click'},true);assert.equal(f.opens().length,1);
});
test('stripping a launch metadata fragment preserves the opener only for that same page',async()=>{
 const f=setup('https://portal.test/job#application_session_id=app1');await settle();f.window.location.href='https://portal.test/job';
 f.listeners.message({type:'SQC_ROUTE_CHANGED'});await settle();f.gesture({isTrusted:true,type:'click'},true);assert.equal(f.opens().length,1);
});
test('removing ApplyFlow query tracking preserves the opener without matching a different job query',async()=>{
 const f=setup('https://portal.test/apply?jobId=one&sqc_application_session_id=app1');await settle();
 f.window.location.href='https://portal.test/apply?jobId=one';f.listeners.message({type:'SQC_ROUTE_CHANGED'});await settle();
 f.gesture({isTrusted:true,type:'click'},true);assert.equal(f.opens().length,1);await settle();
 f.window.location.href='https://portal.test/apply?jobId=two';f.gesture({isTrusted:true,type:'click'},true);assert.equal(f.opens().length,1);
});
test('a delayed status response cannot override a newer sidebar close notification',async()=>{
 const f=setup('https://portal.test/step');let release;
 f.status(()=>new Promise(resolve=>{release=resolve;}));const pending=f.check(true);
 f.listeners.message({type:'SQC_SIDEBAR_VISIBILITY',visible:false});release({state:'VERIFIED',sidebarVisible:true});await pending;
 f.gesture({isTrusted:true,type:'click'});assert.equal(f.opens().length,1);
});
