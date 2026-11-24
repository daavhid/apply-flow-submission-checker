'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../ai/defaults'),client=require('../ai/client');
const {starter}=require('../ai/defaults');
test('screenshot defaults use exact options and only explicitly activated facts',async()=>{
  const cases=[
    {question:'Will you now or in the future require sponsorship for employment?',options:['Yes','No'],expected:'No'},
    {question:'Gender',options:['Female','Male','Prefer not to say'],expected:'Male'},
    {question:'Are you Hispanic/Latino?',options:['Yes','No'],expected:'No'},
    {question:'Veteran Status',options:['I am a protected veteran','I am not a protected veteran'],expected:'I am not a protected veteran'},
    {question:'Do you consent to receiving text messages?',options:['Yes – I consent to receiving text messages','No – I do not consent to receiving text messages'],expected:'No – I do not consent to receiving text messages'}
  ];
  for(const item of cases){
    const [answer]=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{id:'default',type:'select',...item}],defaults:{source:'user_confirmed',text:starter},fetch:()=>{throw new Error('Confirmed defaults must not depend on model guessing');}});
    assert.equal(answer.answer,item.expected);assert.equal(answer.needsInput,false);
  }
});
test('sponsorship defaults answer a blank text field without flipping combined eligibility questions',async()=>{
  const defaults={source:'extension_defaults',text:starter};
  const [answer]=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{question:'Will you now or in the future require sponsorship for employment?',type:'text'}],defaults,fetch:()=>{throw new Error('Sponsorship default should answer locally');}});
  assert.equal(answer.answer,'No');assert.equal(answer.needsInput,false);
  let called=false;
  await client.answer({config:{endpoint:'https://internal.example/ai'},items:['Are you authorized to work without sponsorship?'],defaults,fetch:async()=>{called=true;return {ok:true,json:async()=>({answers:[{id:'q1',status:'NEEDS_INPUT',answer:''}]})};}});
  assert.equal(called,true);
});
test('file requests remain explicit upload tasks, not fabricated resume text',async()=>{
  const [answer]=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{id:'cv',question:'CV',type:'text',help:'File upload: attach the original requested document manually.'}],fetch:()=>{throw new Error('Uploads do not need a generated answer');}});
  assert.equal(answer.needsInput,true);assert.match(answer.reason,/original requested file/);
});
test('confirmed race preference picks the literal multiracial option, then nondisclosure, without a model guess',async()=>{
  for(const [options,expected] of [
    [['White','Two or more races','Prefer not to say'],'Two or more races'],
    [['Two or More Races (Not Hispanic or Latino)','Prefer not to say'],'Two or More Races (Not Hispanic or Latino)'],
    [['White','Prefer not to say'],'Prefer not to say'],
    [['Asian','I do not wish to disclose'],'I do not wish to disclose'],
    [['White','Asian'], '']
  ]){
    const [answer]=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{id:'race',question:'What is your ethnic/racial identity?',type:'select',options}],defaults:{source:'user_confirmed',text:starter},fetch:()=>{throw new Error('Race preference must not depend on model generation');}});
    assert.equal(answer.answer,expected);assert.equal(answer.needsInput,!expected);assert.equal(answer.draft,false);
  }
});
test('race preference does not activate drafts, overwrite edited preferences, or answer other identity questions',async()=>{
  for(const [question,defaults] of [
    ['Race',{source:'draft',text:starter}],
    ['Race',{source:'user_confirmed',text:starter.replace('Two or more races; if unavailable, Prefer not to say.','Prefer not to say.')}],
    ['Do you identify by your legal gender?',{source:'user_confirmed',text:starter}],
    ['What are your pronouns?',{source:'user_confirmed',text:starter}],
    ['What is your sexual orientation?',{source:'user_confirmed',text:starter}],
    ['Do you wish to opt out of SMS updates?',{source:'user_confirmed',text:starter}],
    ['What is your citizenship?',{source:'user_confirmed',text:starter}]
  ]){
    let calls=0;
    const [answer]=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{id:'identity',question,type:'text'}],defaults,fetch:async()=>{calls++;return {ok:true,json:async()=>({answers:[{id:'identity',status:'NEEDS_INPUT',answer:''}]})};}});
    assert.equal(calls,1);assert.equal(answer.needsInput,true);
  }
});
test('mixed batches preserve order while only unanswered preferences go to the model',async()=>{
  let sent;
  const answers=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[
    {id:'race',question:'Race',type:'radio',options:['Asian','Prefer not to say']},
    {id:'role',question:'Why this role?',type:'textarea'}
  ],defaults:{source:'user_confirmed',text:starter},fetch:async(url,options)=>{
    sent=JSON.parse(JSON.parse(options.body).messages[1].content).questions;
    return {ok:true,json:async()=>({answers:[{id:'role',status:'ANSWERED',answer:'I enjoy backend engineering.'}]})};
  }});
  assert.deepEqual(sent.map(q=>q.id),['role']);assert.deepEqual(answers.map(q=>q.id),['race','role']);
  assert.equal(answers[0].answer,'Prefer not to say');assert.equal(answers[1].answer,'I enjoy backend engineering.');
});
function area(){const data={};return {data,async get(key){return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));},async remove(key){delete data[key];}};}
function fixture(){const session=area(),local=area();let version=0,changed=0;const options={session,local,id:()=>String(++version),onChange:()=>changed++};return {service:create(options),session,local,restart:()=>create(options),changes:()=>changed};}
test('extension defaults are immediately active and saving overrides needs no confirmation checkbox',async()=>{
  const f=fixture();assert.equal((await f.service.snapshot('r1')).source,'extension_defaults');
  assert.equal((await f.restart().snapshot('r2')).text,starter);
  const [answer]=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{id:'gender',question:'Gender',type:'select',options:['Male','Female']}],defaults:await f.service.snapshot('r2'),fetch:()=>{throw new Error('Automatic defaults unexpectedly required model generation');}});
  assert.equal(answer.answer,'Male');assert.equal(answer.needsInput,false);
  await f.service.save({text:'Authorized to work in the US: Yes.',resumeVersion:'r1'},'r1');
  await assert.rejects(f.service.save({text:'Facts',resumeVersion:'old',confirmed:true},'r1'),/resume changed/);
  assert.equal((await f.service.snapshot('r1')).text,'Authorized to work in the US: Yes.');
});
test('activated facts are bound to one resume version, not every candidate',async()=>{
  const f=fixture();await f.service.save({text:'Sponsorship needed: No.',resumeVersion:'r1',confirmed:true},'r1');
  assert.equal((await f.restart().snapshot('r1')).source,'user_confirmed');assert.equal((await f.service.snapshot('r2')).source,'extension_defaults');
  assert.equal(f.changes(),1);
});
test('saving a reusable template never activates personal facts automatically',async()=>{
  const f=fixture();await f.service.saveTemplate('Review authorization and desired salary for this candidate.');
  const state=await f.restart().state('r2');assert.equal(state.active.source,'extension_defaults');assert.equal(state.template,f.local.data.qaDefaultTemplate);
});
test('editing or clearing defaults invalidates pending answers',async()=>{
  const f=fixture();await f.service.save({text:'Salary: USD 140000 per year.',resumeVersion:'r1',confirmed:true},'r1');
  const before=await f.service.snapshot('r1');await f.service.save({text:'Salary: USD 150000 per year.',resumeVersion:'r1',confirmed:true},'r1');
  await assert.rejects(f.service.assertCurrent(before,'r1'),/defaults changed/);
  const next=await f.service.snapshot('r1');await f.service.clear();await assert.rejects(f.service.assertCurrent(next,'r1'),/defaults changed/);
});
test('confirmed defaults reach the AI as data; unconfirmed drafts are omitted',async()=>{
  for(const source of ['user_confirmed','extension_defaults','draft']){
    let sent;
    await client.answer({config:{endpoint:'https://internal.example/api/ai/chat'},items:['Do I require sponsorship?'],resume:{text:'Test Applicant, software engineer.'},defaults:{source,text:'Requires sponsorship: No.'},fetch:async(url,options)=>{
      sent=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({answers:[{id:'q1',answer:'No'}]})};
    }});
    const data=JSON.parse(sent.messages[1].content);assert.equal(Boolean(data.answerDefaults),source!=='draft');
    assert.match(sent.messages[0].content,/defaults contradict each other/);
  }
});
test('managed defaults come from JSON automatically and configured changes resolve exact choices locally',async()=>{
  const policy=structuredClone(require('../config/runtime').defaults);policy.answers.sponsorship='Yes';policy.answers.gender='Female';
  const f=fixture();const managed=create({session:f.session,local:f.local,deployment:{load:async()=>policy}}),defaults=await managed.snapshot('resume');
  await assert.rejects(managed.save({text:'Other facts',resumeVersion:'resume'},'resume'),/settings.json/);
  const answers=await client.answer({config:{endpoint:'https://internal.example/ai'},items:[{id:'sponsor',question:'Will you require sponsorship?',type:'select',options:['Yes','No']},{id:'gender',question:'Gender',type:'select',options:['Male','Female']}],defaults,fetch:()=>{throw new Error('Configured facts should not need a model guess');}});
  assert.deepEqual(answers.map(answer=>answer.answer),['Yes','Female']);
});
