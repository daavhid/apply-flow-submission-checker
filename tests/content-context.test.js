'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../content/context-policy');

function page() {
  const fields = [];
  const document = { querySelectorAll(selector) { return selector === 'input, textarea, select' ? fields : []; } };
  const window = { SQCContextPolicy: policy, location: { href: 'https://jobs.example/role/1' },
    scrollX: 0, scrollY: 0, scrollTo() {} };
  const context = vm.createContext({ window, document, Event: class { constructor(type) { this.type = type; } },
    URL, URLSearchParams, Map, Set, Object, Date, console, CSS: { escape: x => x } });
  for (const name of ['extractor', 'validator']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../content/' + name + '.js'), 'utf8'), context);
  }
  const settings = { integrationMode: 'applyflow', verifiedContext: { state: 'VERIFIED',
    applicationSessionId: 'application-1', applierId: 'user-1', profileId: 'profile-1', jobId: 'job-1',
    profileAssignmentId: 'assignment-1', profileAssignmentVersion: '1',
    expiresAt: Date.now() + 60000, allowedRoutes: [{ url: window.location.href }] } };
  const field = (label, value = '') => {
    const f = { tagName: 'INPUT', type: 'text', value, events: [], ownerDocument: document,
      closest() { return null; }, getAttribute(name) { return name === 'aria-label' ? label : null; },
      dispatchEvent(event) { this.events.push(event.type); } };
    fields.push(f); return f;
  };
  return { window, settings, field };
}
test('integrated autofill uses verified values, preserves edits, and leaves unknown facts empty', () => {
  const f = page();
  const name = f.field('First name'), email = f.field('Email address', 'manual@example.com');
  const auth = f.field('Are you legally authorized to work in the United States?');
  const salary = f.field('Desired salary');
  const result = f.window.JobFormExtractor.restoreSavedForm({ id: 'profile-1', firstName: 'Verified' }, f.settings);
  assert.equal(result.count, 1); assert.equal(name.value, 'Verified');
  assert.deepEqual(name.events, ['input', 'change', 'blur', 'focusout']);
  assert.equal(email.value, 'manual@example.com'); assert.equal(auth.value, ''); assert.equal(salary.value, '');
});
test('expired context blocks all autofill and cannot be bypassed by portal success in audit mode', () => {
  const f = page(); const name = f.field('First name');
  f.settings.verifiedContext.expiresAt = Date.now() - 1;
  f.settings.interceptionMode = 'audit';
  assert.equal(f.window.JobFormExtractor.restoreSavedForm({ id: 'profile-1', firstName: 'Verified' }, f.settings).count, 0);
  const result = f.window.JobFormValidator.validate({ is_submission_success: true }, { id: 'profile-1' }, f.settings);
  assert.equal(result.isValid, false); assert.equal(result.errors[0].rule, 'APPLYFLOW_CONTEXT_UNVERIFIED');
  assert.equal(name.value, '');
});
test('a different candidate cannot use the current assignment autofill lease', () => {
  const f = page(); const name = f.field('First name');
  assert.equal(f.window.JobFormExtractor.restoreSavedForm({ id: 'other', firstName: 'Wrong' }, f.settings).count, 0);
  assert.equal(name.value, '');
});

test('verified resume text and skills fill supported fields without replacing user edits', () => {
  const f=page();const skills=f.field('Technical skills'),resume=f.field('Resume text');
  const edited=f.field('Skills','My edited skills');
  const profile={id:'profile-1',resumeIsTailored:true,resumeTailoringRequired:true,
    resumeText:'Verified job-specific resume',primaryStackKeywords:['TypeScript','SQL']};
  f.window.JobFormExtractor.restoreSavedForm(profile,f.settings);
  assert.equal(skills.value,'TypeScript, SQL');assert.equal(resume.value,'Verified job-specific resume');
  assert.equal(edited.value,'My edited skills');
});

test('candidate details remain fillable while a required tailored resume is unavailable', () => {
  const f=page();const name=f.field('First name'),skills=f.field('Skills'),resume=f.field('Resume text');
  f.window.JobFormExtractor.restoreSavedForm({id:'profile-1',firstName:'Verified',resumeTailoringRequired:true,
    resumeIsTailored:false,resumeText:'Base resume',primaryStackKeywords:['Base skills']},f.settings);
  assert.equal(name.value,'Verified');assert.equal(skills.value,'');assert.equal(resume.value,'');
});

test('a verified job route stays eligible when launch parameters and visible application fields disappear', () => {
  const f=page();f.window.top=f.window;
  f.window.location={href:'https://jobs.example/role/1/step2',hostname:'jobs.example',pathname:'/role/1/step2'};
  f.settings.verifiedContext.allowedRoutes=[{url:'https://jobs.example/role/1',includeSubpaths:true}];
  f.window.__SQC_CONTEXT_SETTINGS=f.settings;
  assert.equal(f.window.JobFormExtractor.isJobApplicationPortal(),true);
});
