'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(tabs = []) {
  const events = {}, created = [], updated = [], focused = [], actions = [];
  const area = {async setAccessLevel() {}, async remove() {}, async set() {}, async get() {return {};}};
  const chrome = {storage: {local: area, session: area},
    runtime: {getURL: p => 'chrome-extension://sqc/' + p,
      onInstalled: {addListener: fn => {events.install = fn;}},
      onMessage: {addListener: fn => {events.message = fn;}}},
    tabs: {query: async () => tabs, create: async options => {created.push(options);},
      update: async (id, options) => {updated.push({id, ...options});}, onRemoved: {addListener() {}}},
    windows: {update: async (id, options) => {focused.push({id, ...options});}}};
  const context = vm.createContext({chrome, console, importScripts() {},
    SQCApplyFlowSession: {create: () => ({handle: async message => {actions.push(message.type);}})},
    SQCContextPolicy: {}, fetch() {throw new Error('Setup routing must not make network requests');}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'), context);
  const send = (message, sender) => new Promise(resolve => events.message(message, sender, resolve));
  return {events, created, updated, focused, actions, send};
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
