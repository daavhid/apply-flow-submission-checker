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
  let password = 'temporary-test-password', passwordChangeRequired = false, assigned = true, generation = 0;
  let lockedProfileId = 'profile-1', assignmentVersion = '1', logoutUnavailable = false, challengeExpired = false;
  let mutateSession = data => data;
  const sessionId = () => 'auth-' + applier + (generation ? '-' + generation : '');
  const assignedProfile = () => ({ id: lockedProfileId, version: 'v1', verified: true, fullName: 'Candidate ' + lockedProfileId.slice(-1) });
  const assignment = () => ({ id: 'assignment-1', version: assignmentVersion, status: 'ACTIVE', applierId: applier, profileId: lockedProfileId, profileVersion: 'v1' });
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/sqc/auth')) return { status: 200, ok: true, async json() {
      return { success: true, contractVersion: 2, csrfToken: 'login-challenge', expiresAt: challengeExpired ? '2020-01-01T00:00:00Z' : future() };
    } };
    if (url.endsWith('/api/sqc/login')) {
      const b = JSON.parse(options.body);
      if (b.email !== 'applier@example.com' || b.password !== password) return { status: 401 };
      signedIn = true; generation++;
      return { status: 200, ok: true, async json() { return { success: true, contractVersion: 2 }; } };
    }
    if (!signedIn) return { status: 401 };
    let data;
    if (url.endsWith('/api/sqc/session')) data = { success: true, contractVersion: 2,
      session: { id: sessionId(), expiresAt: future(), passwordChangeRequired },
      applier: { id: applier, name: applier, email: 'applier@example.com' }, csrfToken: 'server-csrf',
      profileAssignment: assigned ? assignment() : null, profile: assigned ? assignedProfile() : null };
    else if (url.endsWith('/api/sqc/logout')) {
      if (logoutUnavailable) throw new Error('Server offline');
      signedIn = false; data = { success: true };
    }
    else if (url.endsWith('/api/sqc/password')) {
      const b = JSON.parse(options.body);
      if (b.currentPassword !== password) return { status: 400, ok: false, async json() { return { success: false }; } };
      password = b.newPassword; passwordChangeRequired = false; generation++; data = { success: true };
    }
    else if (url.endsWith('/api/sqc/application-context')) {
      const b = JSON.parse(options.body);
      const n = b.url.includes('/roles/2') ? '2' : '1';
      data = { success: true, contractVersion: 2, context: mutate({ applicationSessionId: 'application-' + n,
        authSessionId: sessionId(), expiresAt: future(), applier: { id: applier },
        assignment: { status: 'ACTIVE', applierId: applier, profileId: lockedProfileId, jobId: 'job-' + n,
          profileAssignmentId: 'assignment-1', profileAssignmentVersion: assignmentVersion },
        profile: assignedProfile(),
        job: { id: 'job-' + n, version: 'v1', title: 'Engineer', company: 'Example' },
        resume: { id: 'resume-1', profileId: lockedProfileId, version: 'v1', verified: true, text: 'Verified resume' },
        allowedRoutes: [{ url: 'https://jobs.example/roles/' + n, includeSubpaths: true }], status: 'PENDING' }) };
      onContext();
    } else {
      const b = JSON.parse(options.body);
      data = { success: true, accepted: ack, eventId: b.event_id, applicationSessionId: b.application_session_id, recordId: 'record-1' };
    }
    if (url.endsWith('/api/sqc/session')) data = mutateSession(data);
    return { status: 200, ok: true, async json() { return data; } };
  };
  const service = create({ chrome, fetch, policy, now: () => clock });
  const sender = id => ({ url: tabs[id].url, tab: structuredClone(tabs[id]) });
  const ui = { url: 'chrome-extension://sqc/popup/popup.html' };
  return { service, chrome, calls, tabs, sender, ui, now: () => clock,
    advance(ms) { clock += ms; }, signOut() { signedIn = false; }, changeApplier() { applier = 'applier-2'; },
    requirePasswordChange() { passwordChangeRequired = true; }, unassign() { assigned = false; },
    reassign() { lockedProfileId = 'profile-2'; assignmentVersion = '2'; },
    failLogout() { logoutUnavailable = true; }, expireChallenge() { challengeExpired = true; },
    mutateSession(fn) { mutateSession = fn; },
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
test('two job tabs retain isolated job contexts under the applier locked profile across worker restart', async () => {
  const f = fixture();
  await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const b = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(2));
  assert.equal(b.activeProfile.id, 'profile-1');
  assert.equal(b.settings.verifiedContext.jobId, 'job-2');
  const restarted = create({ chrome: f.chrome, fetch: async () => { throw new Error('Unexpected fetch'); }, policy, now: f.now });
  const a = await restarted.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(a.activeProfile.id, 'profile-1');
  assert.equal(a.settings.verifiedContext.jobId, 'job-1');
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
  assert.equal(r.integration.state, 'CONTEXT_MISMATCH'); assert.equal(r.settings.verifiedContext, null);
});
test('URL profile hints cannot override the backend assignment', async () => {
  const f = fixture(); f.tabs[1].url += '&profile_id=forged-profile';
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.settings.verifiedContext, null);
});
test('a stale network response cannot attach a candidate after navigation', async () => {
  const f = fixture(); f.duringContext(() => { f.tabs[1].url = 'https://jobs.example/roles/2'; });
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'STALE_CONTEXT'); assert.equal(r.settings.verifiedContext, null);
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
  for (const type of ['SAVE_PROFILE', 'ADMIN_UNLOCK_PROFILE', 'SET_ACTIVE_PROFILE', 'SQC_CONNECT', 'SQC_DISCONNECT', 'SAVE_SETTINGS', 'SQC_LOGIN', 'SQC_LOGOUT', 'SQC_CHANGE_PASSWORD']) {
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
      profile_assignment_id: 'assignment-1', profile_assignment_version: '1',
      resume_id: 'resume-1', resume_version: 'v1', applier_id: 'forged', profile_id: 'forged', serverUrl: 'https://evil.example', job_status: 'SUBMITTED' } };
  const r = await f.service.handle(msg, f.sender(1)); assert.equal(r.success, true);
  const call = f.calls.at(-1), payload = JSON.parse(call.options.body);
  assert.equal(call.url, 'https://applyflow.example/api/submissions/webhook');
  assert.equal(payload.applier_id, 'applier-1'); assert.equal(payload.profile_id, 'profile-1');
  assert.equal(payload.applier_email, 'applier@example.com');
  assert.equal(payload.serverUrl, undefined); assert.equal(payload.application_session_id, 'application-1');
  f.noAck(); assert.equal((await f.service.handle(msg, f.sender(1))).success, false);
  assert.equal(f.chrome.storage.local.data.submissionsHistory.length, 1);
});

test('profile changes while an audit event is in flight require fresh evidence', async () => {
  const f = fixture();
  await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.mutate(c => ({ ...c, profile: { ...c.profile, version: 'v2' } }));
  const r = await f.service.handle({ type: 'LOG_SUBMISSION', payload: {
    application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1', resume_id: 'resume-1', resume_version: 'v1',
    profile_assignment_id: 'assignment-1', profile_assignment_version: '1'
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
  assert.equal(r.integration.state, 'AUTHENTICATED'); assert.equal(r.activeProfile.id, 'profile-1');
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

test('email/password sign-in bootstraps CSRF, locks the server-assigned profile, and never stores credentials', async () => {
  const f = fixture(); f.signOut();
  const message = { type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password', apiOrigin: 'https://evil.example' };
  const r = await f.service.handle(message, f.ui);
  assert.equal(r.integration.state, 'AUTHENTICATED');
  assert.equal(r.activeProfile.id, 'profile-1');
  assert.equal(r.settings.isProfileLocked, true);
  assert.equal(r.integration.profileAssignment.id, 'assignment-1');
  assert.equal(message.password, '');
  assert.equal(f.calls[0].url, 'https://applyflow.example/api/sqc/auth');
  const login = f.calls.find(c => c.url.endsWith('/api/sqc/login'));
  assert.equal(login.options.headers['X-SQC-CSRF'], 'login-challenge');
  assert.equal(JSON.parse(login.options.body).email, 'applier@example.com');
  assert.ok(!JSON.stringify(f.chrome.storage).includes('temporary-test-password'));
  assert.ok(!JSON.stringify(r).includes('login-challenge'));
});

test('invalid credentials clear previous identity and keep the extension signed out', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const message = { type: 'SQC_LOGIN', email: 'applier@example.com', password: 'wrong-password' };
  await assert.rejects(f.service.handle(message, f.ui), /Email or password is incorrect/);
  assert.equal(message.password, '');
  const result = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(result.integration.state, 'SIGNED_OUT'); assert.equal(result.activeProfile, null);
});

test('temporary password must be changed before a job context can be used', async () => {
  const f = fixture(); f.requirePasswordChange();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal(r.settings.verifiedContext, null);
  assert.equal(f.calls.filter(call => call.url.endsWith('application-context')).length, 0);
  const message = { type: 'SQC_CHANGE_PASSWORD', currentPassword: 'temporary-test-password', newPassword: 'new-test-password', tabId: 1 };
  const changed = await f.service.handle(message, f.ui);
  assert.equal(changed.integration.state, 'VERIFIED');
  assert.equal(changed.activeProfile.id, 'profile-1');
  assert.equal(changed.integration.passwordChangeRequired, false);
  assert.equal(message.currentPassword, ''); assert.equal(message.newPassword, '');
  assert.ok(!JSON.stringify(f.chrome.storage).includes('new-test-password'));
});

test('changing the password invalidates the old credentials', async () => {
  const f = fixture();
  await f.service.handle({ type: 'SQC_CHANGE_PASSWORD', currentPassword: 'temporary-test-password', newPassword: 'new-test-password' }, f.ui);
  await f.service.handle({ type: 'SQC_LOGOUT' }, f.ui);
  await assert.rejects(f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' }, f.ui), /incorrect/);
  const r = await f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'new-test-password' }, f.ui);
  assert.equal(r.integration.state, 'AUTHENTICATED');
});

test('sign-out revokes the backend session and persists the local lock across reconnect', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  const r = await f.service.handle({ type: 'SQC_LOGOUT' }, f.ui);
  assert.equal(r.remoteSignedOut, true); assert.equal(r.integration.state, 'SIGNED_OUT');
  const reconnect = await f.service.handle({ type: 'SQC_CONNECT', apiOrigin: 'https://applyflow.example' }, f.ui);
  assert.equal(reconnect.integration.state, 'SIGNED_OUT');
  assert.equal(reconnect.activeProfile, null);
});

test('an authenticated applier without an assigned profile cannot open a job context', async () => {
  const f = fixture(); f.unassign();
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'UNASSIGNED'); assert.equal(r.activeProfile, null);
  assert.equal(r.settings.verifiedContext, null);
});

test('a job assignment cannot switch the candidate locked to the signed-in applier', async () => {
  const f = fixture();
  f.mutate(c => ({ ...c, profile: { ...c.profile, id: 'profile-2' },
    assignment: { ...c.assignment, profileId: 'profile-2' }, resume: { ...c.resume, profileId: 'profile-2' } }));
  const r = await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  assert.equal(r.integration.state, 'CONTEXT_MISMATCH');
  assert.equal(r.activeProfile.id, 'profile-1'); assert.equal(r.settings.verifiedContext, null);
});

test('an expired login challenge prevents sending credentials to the login endpoint', async () => {
  const f = fixture(); f.expireChallenge();
  const msg = { type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' };
  await assert.rejects(f.service.handle(msg, f.ui), /challenge is invalid or expired/);
  assert.equal(msg.password, '');
  assert.equal(f.calls.filter(c => c.url.endsWith('/api/sqc/login')).length, 0);
});

test('login rejects a backend session belonging to a different email', async () => {
  const f = fixture(); f.mutateSession(data => ({ ...data, applier: { ...data.applier, email: 'other@example.com' } }));
  await assert.rejects(f.service.handle({ type: 'SQC_LOGIN', email: 'applier@example.com', password: 'temporary-test-password' }, f.ui), /different signed-in email/);
  const result = await f.service.handle({ type: 'GET_CONFIG' }, f.ui);
  assert.equal(result.integration.state, 'SIGNED_OUT'); assert.equal(result.activeProfile, null);
});

test('local sign-out remains locked if backend logout fails and its cookie is still valid', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1)); f.failLogout();
  const r = await f.service.handle({ type: 'SQC_LOGOUT' }, f.ui);
  assert.equal(r.remoteSignedOut, false); assert.equal(r.integration.state, 'SIGNED_OUT');
  const calls = f.calls.length;
  const cfg = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(cfg.activeProfile, null); assert.equal(f.calls.length, calls);
});

test('server reassignment replaces the applier profile lock and invalidates old evidence versions', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.reassign();
  const r = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(r.activeProfile.id, 'profile-2');
  assert.equal(r.settings.verifiedContext.profileAssignmentVersion, '2');
  const stale = await f.service.handle({ type: 'LOG_SUBMISSION', payload: {
    application_session_id: 'application-1', profile_version: 'v1', job_version: 'v1',
    resume_id: 'resume-1', resume_version: 'v1', profile_assignment_id: 'assignment-1', profile_assignment_version: '1'
  } }, f.sender(1));
  assert.equal(stale.success, false);
});

test('a wizard route without launch parameters preserves its verified application session ID', async () => {
  const f = fixture(); await f.service.handle({ type: 'GET_CONFIG' }, f.sender(1));
  f.tabs[1].url = 'https://jobs.example/roles/1/step2';
  const r = await f.service.handle({ type: 'GET_CONFIG', force: true }, f.sender(1));
  assert.equal(r.integration.state, 'VERIFIED');
  const body = JSON.parse(f.calls.filter(c => c.url.endsWith('/api/sqc/application-context')).at(-1).options.body);
  assert.equal(body.applicationSessionId, 'application-1');
});
