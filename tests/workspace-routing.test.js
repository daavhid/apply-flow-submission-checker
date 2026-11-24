'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(tabs = [],configuration) {
  const events = {}, created = [], updated = [], focused = [], actions = [], notifications = [];
  const area = {async setAccessLevel() {}, async remove() {}, async set() {}, async get() {return {};}};
  const chrome = {storage: {local: area, session: area},
    runtime: {getURL: p => 'chrome-extension://sqc/' + p,
      onInstalled: {addListener: fn => {events.install = fn;}},onConnect:{addListener:fn=>{events.connect=fn;}},
      onMessage: {addListener: fn => {events.message = fn;}}},
    tabs: {query: async () => tabs, create: async options => {created.push(options);},
      update: async (id, options) => {updated.push({id, ...options});}, onRemoved: {addListener() {}}, onUpdated:{addListener:fn=>{events.tabUpdated=fn;}}, onActivated:{addListener:fn=>{events.tabActivated=fn;}},
      sendMessage:async(id,message)=>{notifications.push({id,...message});}},
    windows: {update: async (id, options) => {focused.push({id, ...options});}}};
  const context = vm.createContext({chrome, console, structuredClone, importScripts() {},
    SQCApplyFlowSession: {create: () => ({handle: async message => {actions.push(message.type);if(message.type==='GET_CONFIG'&&configuration)return configuration;}})},
    SQCContextPolicy: {}, SQCLiveProgress:require('../content/live-progress'),fetch() {throw new Error('Setup routing must not make network requests');}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'), context);
  const send = (message, sender) => new Promise(resolve => events.message(message, sender, resolve));
  return {events, created, updated, focused, actions, notifications, send, bindEvidence:vm.runInContext('bindEvidenceContext',context)};
}
test('installation opens the dedicated setup page rather than the toolbar popup or website login', async () => {
  const w = worker(); await w.events.install({reason: 'install'});
  assert.equal(w.created[0].url, 'chrome-extension://sqc/onboarding/onboarding.html');
});
test('sidebar visibility uses visible reports and disconnects, not merely a connected port',async()=>{
 const w=worker();let report,disconnect;const port={name:'sqc-workspace',sender:{url:'chrome-extension://sqc/sidebar/sidebar.html'},onMessage:{addListener:fn=>{report=fn;}},onDisconnect:{addListener:fn=>{disconnect=fn;}}};w.events.connect(port);
 const status=()=>w.send({type:'SQC_LAUNCH_STATUS'},{tab:{id:7,windowId:1}});
 report({windowId:1,visible:true});assert.equal((await status()).sidebarVisible,true);
 report({windowId:1,visible:false});assert.equal((await status()).sidebarVisible,false);
 report({windowId:1,visible:true});disconnect();assert.equal((await status()).sidebarVisible,false);
});
test('screenshot worker deduplicates images across triggers and unchanged form states',async()=>{
  const w=worker([],{settings:{verifiedContext:{applicationSessionId:'app',profileVersion:'1',resumeVersion:'1'}}}),sender={tab:{id:7,url:'https://jobs.example/apply'}};
  const meta={application_session_id:'app',profile_version:'1',resume_version:'1',page_url:sender.tab.url,step_label:'Questions',trigger:'QUESTIONS_ANSWERED',form_fingerprint:'state-one',preCapturedDataUrl:'data:image/jpeg;base64,one'};
  const first=await w.send({type:'CAPTURE_PAGE_SCREENSHOT',meta},sender);assert.equal(first.success,true);assert.equal(first.screenshots.length,1);
  const final=await w.send({type:'CAPTURE_PAGE_SCREENSHOT',meta:{...meta,trigger:'FINAL_SUBMIT',step_label:'Final'}},sender);assert.equal(final.duplicate,true);assert.equal(final.screenshot.id,first.screenshot.id);
  const unchanged=await w.send({type:'CAPTURE_PAGE_SCREENSHOT',meta:{...meta,preCapturedDataUrl:'unused'}},sender);assert.equal(unchanged.duplicate,true);assert.equal(unchanged.screenshots.length,1);
  const changed=await w.send({type:'CAPTURE_PAGE_SCREENSHOT',meta:{...meta,form_fingerprint:'state-two',preCapturedDataUrl:'data:image/jpeg;base64,two'}},sender);assert.equal(changed.screenshots.length,1);assert.notEqual(changed.screenshot.id,first.screenshot.id);
});
test('an unauthenticated portal can open setup and carries its own tab for returning after sign-in', async () => {
  const w = worker();
  const result = await w.send({type: 'OPEN_SETUP', tabId: 999, url: 'https://untrusted.example'},
    {url: 'https://jobs.example/apply', tab: {id: 7}});
  assert.equal(result.success, true);
  assert.equal(w.created[0].url, 'chrome-extension://sqc/onboarding/onboarding.html?tabId=7');
  assert.deepEqual(w.actions, ['OPEN_SETUP']);
});
test('reopening setup focuses the existing tab and preserves its source application', async () => {
  const url = 'chrome-extension://sqc/onboarding/onboarding.html?tabId=7';
  const w = worker([{id: 20, windowId: 3, url}]);
  await w.send({type: 'OPEN_SETUP'}, {url: 'chrome-extension://sqc/popup/popup.html'});
  assert.equal(w.created.length, 0);
  assert.equal(w.updated[0].id, 20); assert.equal(w.updated[0].active, true);
  assert.equal(w.updated[0].url, undefined);
  assert.equal(w.focused[0].id, 3); assert.equal(w.focused[0].focused, true);
});

test('the portal HUD can open settings without a verified assignment or an external URL', async () => {
  const w = worker();
  const result = await w.send({type: 'OPEN_OPTIONS', section: 'history', url: 'https://untrusted.example'},
    {url: 'https://jobs.example/apply', tab: {id: 7}});
  assert.equal(result.success, true);
  assert.equal(w.created[0].url, 'chrome-extension://sqc/options/options.html#history');
  assert.deepEqual(w.actions, ['OPEN_OPTIONS']);
});

test('settings links reuse the existing settings tab and select the requested section', async () => {
  const w = worker([{id: 21, windowId: 3, url: 'chrome-extension://sqc/options/options.html#preferences'}]);
  await w.send({type: 'OPEN_OPTIONS', section: 'history'}, {url: 'chrome-extension://sqc/popup/popup.html'});
  assert.equal(w.created.length, 0);
  assert.equal(w.updated[0].url, 'chrome-extension://sqc/options/options.html#history');
  assert.equal(w.updated[0].active, true);
});


test('browser URL changes notify content scripts even when main-world SPA history bypasses their hooks', () => {
  const w=worker();
  w.events.tabUpdated(7,{status:'loading'});
  assert.equal(w.notifications.length,0);
  w.events.tabUpdated(7,{url:'https://jobs.example/roles/1/experience'});
  assert.equal(w.notifications.length,1);
  assert.equal(w.notifications[0].id,7);
  assert.equal(w.notifications[0].type,'SQC_ROUTE_CHANGED');
});

test('switching to an arbitrary tab never announces a verified job context', () => {
  const w=worker();w.events.tabActivated({tabId:7});
  assert.equal(w.notifications.length,0);
});


test('an approved continuation tab inherits audit screenshots only for the same verified context', () => {
  const w=worker(),first={settings:{verifiedContext:{applicationSessionId:'app-1',profileId:'candidate',resumeVersion:'v1'}}};
  w.bindEvidence(first,1);first.sessionScreenshots.push({id:'page-1',step_label:'Experience'});
  const next={settings:first.settings};w.bindEvidence(next,2);
  assert.equal(next.sessionScreenshots[0].id,'page-1');
  assert.notEqual(next.sessionScreenshots,first.sessionScreenshots);
  const updated={settings:{verifiedContext:{...first.settings.verifiedContext,jobVersion:'status-2',resumeVersion:'replacement-2'}}};w.bindEvidence(updated,1);assert.equal(updated.sessionScreenshots[0].id,'page-1');
  const other={settings:{verifiedContext:{...first.settings.verifiedContext,applicationSessionId:'app-2'}}};
  w.bindEvidence(other,3);assert.equal(other.sessionScreenshots.length,0);
});
