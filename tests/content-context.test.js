'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../content/context-policy');
test('an assigned AI track is compatible with Python despite secondary .NET keywords',()=>{
  const f=page();assert.equal(f.window.JobFormValidator.getCandidateStackCategory({targetStack:'AI',primaryStackKeywords:['.NET','Python']}),'python');
  assert.equal(f.window.JobFormValidator.getCandidateStackCategory({targetStack:'.NET',primaryStackKeywords:['Python']}),'dotnet');
});

function page() {
  const fields = [];
  const document = { querySelector() { return null; }, querySelectorAll(selector) { return selector === 'input, textarea, select' ? fields : []; } };
  const window = { SQCContextPolicy: policy, location: { href: 'https://jobs.example/role/1' },
    scrollX: 0, scrollY: 0, scrollTo() {},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}) };
  const context = vm.createContext({ window, document, Event: class { constructor(type) { this.type = type; } },
    URL, URLSearchParams, Map, Set, Object, Date, console, CSS: { escape: x => x } });
  for (const name of ['resume-context', 'extractor', 'validator']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../content/' + name + '.js'), 'utf8'), context);
  }
  const settings = { integrationMode: 'applyflow', verifiedContext: { state: 'VERIFIED',
    applicationSessionId: 'application-1', applierId: 'user-1', profileId: 'profile-1', jobId: 'job-1',
    profileAssignmentId: 'assignment-1', profileAssignmentVersion: '1',
    expiresAt: Date.now() + 60000, allowedRoutes: [{ url: window.location.href }] } };
  const field = (label, value = '') => {
    const f = { tagName: 'INPUT', type: 'text', value, events: [], ownerDocument: document,
      form:{id:'application-form'},
      closest() { return null; },getClientRects:()=>[{}], getAttribute(name) { return name === 'aria-label' ? label : null; },
      dispatchEvent(event) { this.events.push(event.type); } };
    fields.push(f); return f;
  };
  return { window, settings, field, context, document };
}
test('a candidate can apply across stacks using the selected job resume despite legacy headline and track preferences',()=>{
  for(const stack of ['python','java','dotnet']){
    const f=page(),profile={id:'profile-1',fullName:'Test Candidate',targetStack:'Software Engineering',activeStackKey:'dotnet',
      stacks:{dotnet:{keywords:['C#','.NET'],preferredBackend:'C#',preferredFrontend:'Angular',preferredDatabase:'SQL Server',skillYears:{Python:10}}},
      languagesFrameworks:{preferredBackend:'C#',preferredFrontend:'Angular',preferredDatabase:'SQL Server'},technicalExperience:{skillYears:{Python:10}},
      resumeIsTailored:true,resumeText:'Test Candidate\nPython, Java and React experience.',primaryStackKeywords:['Python','Java','React'],resumeContext:{skills:['Python','Java','React'],skillYears:{}}};
    const result=f.window.JobFormValidator.validate({logged_in_account:{},total_fields_count:9,resume_uploaded:'Test Candidate '+stack+'.pdf',detected_job_stack:{key:stack,title:stack,matchedTokens:[stack]},
      _elements:{questions:[{label:'Preferred backend',value:'Python',type:'text'},{label:'Preferred frontend',value:'React',type:'text'},{label:'Preferred database',value:'PostgreSQL',type:'text'},{label:'Years of experience in Python',value:'0',type:'text'}]}},profile,f.settings);
    assert.equal(result.isValid,true,JSON.stringify(result.errors));
  }
});

test('removing stack locks preserves candidate identity and wrong-resume validation',()=>{
  const f=page(),profile={id:'profile-1',fullName:'Test Candidate',resumeIsTailored:true};
  const result=f.window.JobFormValidator.validate({logged_in_account:{},total_fields_count:1,resume_uploaded:'Wrong Person.pdf'},profile,f.settings);
  assert.ok(result.errors.some(error=>error.rule==='WRONG_RESUME_NAME'));
  assert.equal(f.window.JobFormValidator.validate({}, {...profile,id:'another-profile'}, f.settings).errors[0].rule,'APPLYFLOW_CONTEXT_UNVERIFIED');
});

test('missing required Country and other location values are reported rather than exempted',()=>{
 const f=page(),profile={id:'profile-1',fullName:'Test Candidate',resumeIsTailored:true};
 const result=f.window.JobFormValidator.validate({logged_in_account:{},_elements:{questions:[{label:'Country',value:'',required:true},{label:'City',value:'Select a city',required:true},{label:'State',value:'Select a state',required:true}]}},profile,f.settings);
 for(const label of ['Country','City','State'])assert.ok(result.errors.some(error=>error.rule==='REQUIRED_FIELD_EMPTY'&&error.message.includes('"'+label+'"')));
 const filled=f.window.JobFormValidator.validate({logged_in_account:{},_elements:{questions:[{label:'Country',value:'United States',required:true}]}},profile,f.settings);assert.equal(filled.errors.some(error=>error.rule==='REQUIRED_FIELD_EMPTY'),false);
});

test('integrated autofill uses verified values, preserves edits, and leaves unknown facts empty', () => {
  const f = page();
  const name = f.field('First name'), email = f.field('Email address', 'manual@example.com');
  const auth = f.field('Are you legally authorized to work in the United States?');
  const salary = f.field('Desired salary');
  const result = f.window.JobFormExtractor.restoreSavedForm({ id: 'profile-1', firstName: 'Verified' }, f.settings);
  assert.equal(result.count, 1); assert.equal(name.value, 'Verified');
  assert.deepEqual(name.events, ['input', 'change']);
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

test('job boards, known ATS pages, and embedded frames need ApplyFlow tracking', () => {
  const f=page();f.window.top=f.window;
  for(const url of ['https://www.levels.fyi/jobs','https://boards.greenhouse.io/example/jobs/123','https://example.myworkdayjobs.com/en-US/jobs/job/123']) {
    f.window.location=new URL(url);
    assert.equal(f.window.JobFormExtractor.isJobApplicationPortal(),false,url);
  }
  f.window.top={};
  assert.equal(f.window.JobFormExtractor.isJobApplicationPortal(),false);
  f.window.location=new URL('https://portal.test/form?job_id=123');
  assert.equal(f.window.JobFormExtractor.isJobApplicationPortal(),false);
  f.window.location=new URL('https://portal.test/form#application_session_id=app1');
  assert.equal(f.window.JobFormExtractor.isJobApplicationPortal(),true);
});

test('an expired lease or a saved eligibility marker for another route cannot activate a job', () => {
  const f=page();f.window.location=new URL(f.window.location.href);f.window.top=f.window;
  f.window.__SQC_CONTEXT_SETTINGS=f.settings;f.settings.verifiedContext.expiresAt=Date.now()-1;
  f.window.__SQC_PORTAL_ELIGIBLE_URL='https://jobs.example/another-role';
  assert.equal(f.window.JobFormExtractor.isJobApplicationPortal(),false);
});

test('untracked Levels.fyi and ATS pages initialize quietly without account requests or polling', async () => {
  for(const url of ['https://www.levels.fyi/jobs','https://boards.greenhouse.io/example/jobs/123']) {
    const f=page(),messages=[];f.window.location=new URL(url);f.window.top=f.window;
    f.window.addEventListener=()=>{};
    Object.assign(f.document,{readyState:'loading',documentElement:{},addEventListener(){}});
    let cleared;
    f.window.__SQC_CONTEXT_REFRESH_TIMER=42;
    const hud={destroy(){},showToast(){assert.fail('Untracked page displayed a toast');}};
    Object.assign(f.context,{history:{pushState(){},replaceState(){}},MutationObserver:class {observe(){}},
      chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){messages.push(message.type);assert.equal(message.type,'SQC_PORTAL_ELIGIBILITY');return {eligible:false};}}},
      SubmissionHUD:hud,clearInterval:id=>{cleared=id;},setInterval:()=>assert.fail('Untracked page started polling')});
    f.window.SubmissionHUD=hud;
    f.window.SQCSubmissionDelivery=require('../content/submission-delivery');
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8'),f.context);
    await f.window.SubmissionCheckerCore.init();
    assert.deepEqual(messages,['SQC_PORTAL_ELIGIBILITY']);assert.equal(cleared,42);
    assert.equal(f.window.__SQC_CONTEXT_REFRESH_TIMER,null);
    f.window.SubmissionCheckerCore.runLiveCheck();
  }
});
test('switching resumes updates SQC-filled skills but preserves manually edited fields',()=>{
  const f=page(),skills=f.field('Skills'),resume=f.field('Resume text');
  f.window.JobFormExtractor.restoreSavedForm({id:'profile-1',resumeText:'Base resume',primaryStackKeywords:['C#']},f.settings);
  resume.value='My manually edited resume text';
  f.window.JobFormExtractor.restoreSavedForm({id:'profile-1',resumeSource:'sqc_upload',resumeIsTailored:true,
    resumeText:'Uploaded tailored resume',primaryStackKeywords:['Python','SQL']},f.settings);
  assert.equal(skills.value,'Python, SQL');assert.equal(resume.value,'My manually edited resume text');
});
test('experience rows use uploaded employment facts while contact fields remain from ApplyFlow',()=>{
  const f=page(),employer=f.field('Company'),title=f.field('Job title'),name=f.field('First name'),email=f.field('Email');
  const group={};
  for (const field of [employer,title]) field.closest=selector=>selector.startsWith('[data-sqc-experience]')?group:null;
  f.window.JobFormExtractor.restoreSavedForm({id:'profile-1',firstName:'Verified',primaryEmail:'verified@example.com',
    resumeSource:'sqc_upload',resumeIsTailored:true,resumeContext:{workHistory:[{company:'Acme',title:'Senior Engineer'}]}},f.settings);
  assert.equal(employer.value,'Acme');assert.equal(title.value,'Senior Engineer');
  assert.equal(name.value,'Verified');assert.equal(email.value,'verified@example.com');
});
test('an employer phone field never receives the candidate phone from the base profile',()=>{
  const f=page(),phone=f.field('Phone'),group={};
  phone.closest=selector=>selector.startsWith('[data-sqc-experience]')?group:null;
  f.window.JobFormExtractor.restoreSavedForm({id:'profile-1',phone:'+15555550123',resumeSource:'sqc_upload',
    resumeContext:{workHistory:[{company:'Acme',title:'Engineer'}]}},f.settings);
  assert.equal(phone.value,'');
});
