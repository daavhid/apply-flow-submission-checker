'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(tabs = []) {
  const events = {}, created = [], updated = [], focused = [], actions = [], notifications = [];
  const area = {async setAccessLevel() {}, async remove() {}, async set() {}, async get() {return {};}};
  const chrome = {storage: {local: area, session: area},
    runtime: {getURL: p => 'chrome-extension://sqc/' + p,
      onInstalled: {addListener: fn => {events.install = fn;}},
      onMessage: {addListener: fn => {events.message = fn;}}},
    tabs: {query: async () => tabs, create: async options => {created.push(options);},
      update: async (id, options) => {updated.push({id, ...options});}, onRemoved: {addListener() {}}, onUpdated:{addListener:fn=>{events.tabUpdated=fn;}},
      sendMessage:async(id,message)=>{notifications.push({id,...message});}},
    windows: {update: async (id, options) => {focused.push({id, ...options});}}};
  const context = vm.createContext({chrome, console, structuredClone, importScripts() {},
    SQCApplyFlowSession: {create: () => ({handle: async message => {actions.push(message.type);}})},
    SQCContextPolicy: {}, fetch() {throw new Error('Setup routing must not make network requests');}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'), context);
  const send = (message, sender) => new Promise(resolve => events.message(message, sender, resolve));
  return {events, created, updated, focused, actions, notifications, send, bindEvidence:vm.runInContext('bindEvidenceContext',context)};
}
test('installation opens the dedicated setup page rather than the toolbar popup or website login', async () => {
  const w = worker(); await w.events.install({reason: 'install'});
  assert.equal(w.created[0].url, 'chrome-extension://sqc/onboarding/onboarding.html');
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


test('an approved continuation tab inherits audit screenshots only for the same verified context', () => {
  const w=worker(),first={settings:{verifiedContext:{applicationSessionId:'app-1',profileId:'candidate',resumeVersion:'v1'}}};
  w.bindEvidence(first,1);first.sessionScreenshots.push({id:'page-1',step_label:'Experience'});
  const next={settings:first.settings};w.bindEvidence(next,2);
  assert.equal(next.sessionScreenshots[0].id,'page-1');
  assert.notEqual(next.sessionScreenshots,first.sessionScreenshots);
  const other={settings:{verifiedContext:{...first.settings.verifiedContext,applicationSessionId:'app-2'}}};
  w.bindEvidence(other,3);assert.equal(other.sessionScreenshots.length,0);
});
