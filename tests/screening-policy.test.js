'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../content/screening-policy');
const expected={applicationSessionId:'app',jobId:'job',jobVersion:'1',profileId:'profile',profileVersion:'2',resumeId:'resume',resumeVersion:'3',requestId:'batch_uuid'};
const questions=[{id:'years',question:'Years of Node.js experience?',type:'select',options:['1-2 years','3-5 years','5+ years'],required:true},
 {id:'why',question:'Why this role?',type:'textarea',maxLength:20}];
const response=answers=>({success:true,contractVersion:2,...expected,answers});

test('screening requests require distinct IDs, explicit choices and supported field types',()=>{
 assert.equal(policy.questions(questions).length,2);
 assert.throws(()=>policy.questions([questions[0],questions[0]]),/unique/);
 assert.throws(()=>policy.questions([{...questions[0],options:undefined}]),/literal options/);
 assert.throws(()=>policy.questions([{...questions[0],type:'password'}]),/invalid/);
});
test('wrong request IDs, job versions, or unknown answer IDs reject the batch',()=>{
 for(const [key,value] of [['requestId','other'],['jobVersion','2'],['resumeVersion','4']]) assert.throws(()=>policy.answers({...response([]),[key]:value},expected,questions),/does not match/);
 assert.throws(()=>policy.answers(response([{id:'foreign',status:'ANSWERED',answer:'yes'}]),expected,questions),/unknown/);
 assert.throws(()=>policy.answers(response([{id:'why',status:'ANSWERED',answer:'Good fit'},{id:'why',status:'ANSWERED',answer:'Good fit'}]),expected,questions),/duplicate/);
});
test('nonliteral options and answers over the field limit require input rather than fuzzy matching or truncation',()=>{
 const answers=policy.answers(response([{id:'years',status:'ANSWERED',answer:'5 years',matchedOption:'5+ years'},
  {id:'why',status:'ANSWERED',answer:'This answer exceeds the short character limit'}]),expected,questions);
 assert.equal(answers.every(answer=>answer.status==='NEEDS_INPUT'&&answer.answer===''),true);
});
test('unknown and omitted facts stay empty while exact literal options are preserved',()=>{
 const answers=policy.answers(response([{id:'years',status:'ANSWERED',answer:'5+ years',matchedOption:'5+ years'}]),expected,questions);
 assert.equal(answers[0].answer,'5+ years');assert.equal(answers[1].status,'NEEDS_INPUT');
 const unknown=policy.answers(response([{id:'why',status:'NEEDS_INPUT',answer:'fabricated text',reasoning:'Unknown fact'}]),expected,questions);
 assert.equal(unknown[0].answer,'');
});
