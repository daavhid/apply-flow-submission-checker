'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../content/context-policy');
const { create } = require('../background/applyflow-session');

function fixture() {
  let clock = Date.parse('2026-11-11T12:00:00Z');
  const future = () => new Date(clock + 3600000).toISOString();
  function area(seed = {}) {
    const data = structuredClone(seed);
    return { data, async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, structuredClone(data[k])]));
    }, async set(value) { Object.assign(data, structuredClone(value)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; } };
  }
  const tabs = { 1: { id: 1, url: 'https://jobs.example/roles/1#application_session_id=application-1' },
    2: { id: 2, url: 'https://jobs.example/roles/2#application_session_id=application-2' } };
  const chrome = { runtime: { id: 'sqc', getURL: p => 'chrome-extension://sqc/' + p },
    storage: { local: area({ sqcConnection: { apiOrigin: 'https://applyflow.example' }, settings: {} }), session: area() },
    tabs: { async get(id) { return structuredClone(tabs[id]); } } };
  let signedIn = true, applier = 'applier-1', mutate = c => c, onContext = () => {}, ack = true;
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (!signedIn) return { status: 401 };
    let data;
    if (url.endsWith('/api/sqc/session')) data = { success: true, contractVersion: 1,
      session: { id: 'auth-' + applier, expiresAt: future() }, applier: { id: applier, name: applier }, csrfToken: 'server-csrf' };
    else if (url.endsWith('/api/sqc/application-context')) {
      const b = JSON.parse(options.body);
      const n = b.url.includes('/roles/2') ? '2' : '1';
      data = { success: true, contractVersion: 1, context: mutate({ applicationSessionId: 'application-' + n,
        authSessionId: 'auth-' + applier, expiresAt: future(), applier: { id: applier },
        assignment: { status: 'ACTIVE', applierId: applier, profileId: 'profile-' + n, jobId: 'job-' + n },
        profile: { id: 'profile-' + n, version: 'v1', verified: true, fullName: 'Candidate ' + n },
        job: { id: 'job-' + n, version: 'v1', title: 'Engineer', company: 'Example' },
        resume: { id: 'resume-' + n, profileId: 'profile-' + n, version: 'v1', verified: true, text: 'Verified resume' },
        allowedRoutes: [{ url: 'https://jobs.example/roles/' + n, includeSubpaths: true }], status: 'PENDING' }) };
      onContext();
    } else {
      const b = JSON.parse(options.body);
      data = { success: true, accepted: ack, eventId: b.event_id, applicationSessionId: b.application_session_id, recordId: 'record-1' };
    }
    return { status: 200, ok: true, async json() { return data; } };
  };
  const service = create({ chrome, fetch, policy, now: () => clock });
  const sender = id => ({ url: tabs[id].url, tab: structuredClone(tabs[id]) });
  const ui = { url: 'chrome-extension://sqc/popup/popup.html' };
  return { service, chrome, calls, tabs, sender, ui, now: () => clock,
    advance(ms) { clock += ms; }, signOut() { signedIn = false; }, changeApplier() { applier = 'applier-2'; },
    mutate(fn) { mutate = fn; }, duringContext(fn) { onContext = fn; }, noAck() { ack = false; } };
}

test('connections accept HTTPS origins and localhost only; reject credentials and paths', () => {
  assert.equal(policy.origin('https://applyflow.example'), 'https://applyflow.example');
  assert.equal(policy.origin('http://localhost:5000'), 'http://localhost:5000');
  for (const url of ['http://remote.example', 'https://user:pass@applyflow.example', 'https://applyflow.example/api', 'file:///']) {
    assert.throws(() => policy.origin(url));
  }
});
test('job route matching respects origin, path boundaries, and job-identifying query parameters', () => {
  const r = [{ url: 'https://jobs.example/apply?job=1', includeSubpaths: true }];
  assert.equal(policy.matchesUrl('https://jobs.example/apply/step2?job=1&utm=x', r), true);
  for (const url of ['https://jobs.example/apply?job=2', 'https://other.example/apply?job=1', 'https://jobs.example/apply-other?job=1']) {
    assert.equal(policy.matchesUrl(url, r), false);
  }
});
test('unconnected extension has no candidate fallback', async () => {
  const f = fixture(); await f.chrome.storage.local.remove('sqcConnection');
  const result = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(result.integration.state, 'DISCONNECTED');
  assert.equal(result.activeProfile, null); assert.deepEqual(result.profiles, []); assert.equal(f.calls.length, 0);
});
test('verified context locks identity, loads approved resume, and never exposes CSRF to content', async () => {
  const f = fixture();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'VERIFIED'); assert.equal(r.settings.isProfileLocked, true);
  assert.equal(r.activeProfile.resumeText, 'Verified resume'); assert.equal(r.settings.applierId, 'applier-1');
  assert.ok(!JSON.stringify(r).includes('server-csrf'));
  assert.equal(f.calls[1].options.headers['X-SQC-CSRF'], 'server-csrf');
  assert.equal(f.calls[1].options.credentials, 'include');
  assert.equal(f.calls[0].options.headers['X-SQC-Extension-Id'], 'sqc');
});
test('two job tabs retain distinct candidate assignments across worker restart', async () => {
  const f = fixture();
  await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const b = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(2));
  assert.equal(b.activeProfile.id, 'profile-2');
  const restarted = create({ chrome: f.chrome, fetch: async () => { throw new Error('Unexpected fetch'); }, policy, now: f.now });
  const a = await restarted.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(a.activeProfile.id, 'profile-1');
});
for (const [name, mutation] of [
  ['wrong applier', c => ({ ...c, applier: { id: 'attacker' } })],
  ['wrong assignment owner', c => ({ ...c, assignment: { ...c.assignment, applierId: 'other' } })],
  ['unverified profile', c => ({ ...c, profile: { ...c.profile, verified: false } })],
  ['missing profile version', c => ({ ...c, profile: { ...c.profile, version: null } })],
  ['unverified resume', c => ({ ...c, resume: { ...c.resume, verified: false } })],
  ['resume owned by another candidate', c => ({ ...c, resume: { ...c.resume, profileId: 'other' } })],
  ['unapproved portal', c => ({ ...c, allowedRoutes: [{ url: 'https://other.example' }] })],
  ['revoked assignment', c => ({ ...c, assignment: { ...c.assignment, status: 'REVOKED' } })],
  ['expired context', c => ({ ...c, expiresAt: '2020-01-01T00:00:00Z' })]
]) test('rejects ' + name, async () => {
  const f = fixture(); f.mutate(mutation);
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'CONTEXT_MISMATCH'); assert.equal(r.activeProfile, null);
});
test('URL profile hints cannot override the backend assignment', async () => {
  const f = fixture(); f.tabs[1].url += '&profile_id=forged-profile';
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.activeProfile, null);
});
test('a stale network response cannot attach a candidate after navigation', async () => {
  const f = fixture(); f.duringContext(() => { f.tabs[1].url = 'https://jobs.example/roles/2'; });
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'STALE_CONTEXT'); assert.equal(r.activeProfile, null);
});
test('sign-out removes cached assignments; force refresh never uses stale candidate', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1)); f.signOut();
  const r = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(r.integration.state, 'SIGNED_OUT'); assert.equal(r.activeProfile, null);
  assert.equal(f.chrome.storage.session.data.sqcContexts, undefined);
});
test('expired lease stops content actions, even if portal looks submitted', async () => {
  const f = fixture(); const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(policy.ready(r.settings, f.tabs[1].url, f.now()), true);
  f.advance(61000);
  assert.equal(policy.ready(r.settings, f.tabs[1].url, f.now()), false);
});
test('a changed assignment hint invalidates a still-live content lease', async () => {
  const f = fixture(); const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(policy.ready(r.settings, f.tabs[1].url.replace('application-1', 'application-2'), f.now()), false);
});
test('ATS-owned job_id query parameters cannot replace ApplyFlow identifiers', async () => {
  const f = fixture();
  f.tabs[1].url = 'https://jobs.example/roles/1?job_id=portal-uuid#application_session_id=application-1';
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'VERIFIED');
  assert.equal(policy.ready(r.settings, f.tabs[1].url, f.now()), true);
});
test('local profile management and portal-driven connection changes are rejected', async () => {
  const f = fixture();
  for (const type of ['SAVE_PROFILE', 'ADMIN_UNLOCK_PROFILE', 'SET_ACTIVE_PROFILE', 'SQC_CONNECT', 'SQC_DISCONNECT', 'SAVE_SETTINGS']) {
    assert.equal((await f.service.handle({ type, apiOrigin: 'https://evil.example' }, f.sender(1))).success, false);
  }
});
test('UI preferences cannot unlock or override authenticated identity', async () => {
  const f = fixture();
  await f.service.handle({ type: 'SAVE_SETTINGS', settings: { applierId: 'forged', integrationMode: 'local', isProfileLocked: false, autoAutofillOnPageLoad: false } }, f.ui);
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.settings.applierId, 'applier-1'); assert.equal(r.settings.isProfileLocked, true);
  assert.equal(r.settings.integrationMode, 'applyflow'); assert.equal(r.settings.autoAutofillOnPageLoad, false);
});
test('events use verified identities and configured origin; server acknowledgement is required', async () => {
  const f = fixture();
  const msg = { type: 'LOG_SUBMISSION', action: 'APPLYFLOW_WEBHOOK', serverUrl: 'https://evil.example',
    payload: { application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1',
      resume_id: 'resume-1', resume_version: 'v1', applier_id: 'forged', profile_id: 'forged', serverUrl: 'https://evil.example', job_status: 'SUBMITTED' } };
  const r = await f.service.handle(msg, f.sender(1)); assert.equal(r.success, true);
  const call = f.calls.at(-1), payload = JSON.parse(call.options.body);
  assert.equal(call.url, 'https://applyflow.example/api/submissions/webhook');
  assert.equal(payload.applier_id, 'applier-1'); assert.equal(payload.profile_id, 'profile-1');
  assert.equal(payload.serverUrl, undefined); assert.equal(payload.application_session_id, 'application-1');
  f.noAck(); assert.equal((await f.service.handle(msg, f.sender(1))).success, false);
  assert.equal(f.chrome.storage.local.data.submissionsHistory.length, 1);
});

test('profile changes while an audit event is in flight require fresh evidence', async () => {
  const f = fixture();
  await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.mutate(c => ({ ...c, profile: { ...c.profile, version: 'v2' } }));
  const r = await f.service.handle({ type: 'LOG_SUBMISSION', payload: {
    application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1', resume_id: 'resume-1', resume_version: 'v1'
  } }, f.sender(1));
  assert.equal(r.success, false);
  assert.ok(!f.calls.some(call => call.url.endsWith('/api/submissions/webhook')));
});
test('authentication refresh binds new applier context and invalidates old tab assignments', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.changeApplier(); f.advance(31000);
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(2));
  assert.equal(r.settings.applierId, 'applier-2');
  assert.equal(f.chrome.storage.session.data.sqcContexts[1], undefined);
});
test('an extension options tab is privileged without becoming an application tab', async () => {
  const f = fixture();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, { ...f.ui, tab: { id: 99, url: f.ui.url } });
  assert.equal(r.integration.state, 'AUTHENTICATED'); assert.equal(r.activeProfile, null);
});

test('first connection needs only the endpoint and discovers the authenticated applier', async () => {
  const f = fixture(); await f.chrome.storage.local.remove('sqcConnection');
  const r = await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://applyflow.example' }, f.ui);
  assert.equal(r.integration.state, 'AUTHENTICATED');
  assert.equal(r.settings.applierId, 'applier-1');
  assert.deepEqual(f.chrome.storage.local.data.sqcConnection, { apiOrigin: 'https://applyflow.example' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://applyflow.example/api/sqc/session');
});

test('the runtime extension ID is sent automatically for Store and local installations', async () => {
  for (const id of ['unpacked-development-id', 'published-store-id']) {
    const f = fixture(); f.chrome.runtime.id = id;
    await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
    assert.ok(f.calls.every(call => call.options.headers['X-SQC-Extension-Id'] === id));
  }
});
