'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{from}=require('../ai/diagnostics'),batch=require('../ai/batch');
test('HTTP 200 job failures retain distinct provider quota status and actionable guidance',()=>{
 const report=from({message:'ApplyFlow HTTP 200 at /api/sqc/answer-questions/requests/job_1: 429 You have no credits remaining.',status:200,path:'/api/sqc/answer-questions/requests/job_1',state:'BACKEND_ERROR'},{requestId:'request_1'});
 assert.equal(report.classification,'PROVIDER_QUOTA');assert.equal(report.httpStatus,200);assert.equal(report.providerStatus,429);assert.equal(report.requestId,'request_1');assert.match(report.action,/billing/);
});
test('debug reports omit arbitrary response data, resume text, question/answer content and credential-bearing URLs',()=>{
 const report=from({message:'Unknown failure: private resume and applier@example.com sk-secret',path:'/api/sqc/answer-questions?token=secret#private',headers:{Authorization:'Bearer secret'},resumeText:'private resume',request:{password:'secret'},runId:'sk-secret',debug:{classification:'private resume',response:'secret'}},{requestId:'safe-id',questionCount:4});
 const text=JSON.stringify(report);for(const privateValue of ['private resume','secret','applier@example.com','Authorization','password'])assert.equal(text.includes(privateValue),false);
 assert.equal(report.path,'/api/sqc/answer-questions');assert.equal(report.questionCount,4);
});
test('partial batch errors carry safe diagnostics through progress events rather than losing provider details',async()=>{
 const updates=[],error=Object.assign(new Error('429 no credits remaining'),{status:200,path:'/api/sqc/answer-questions/requests/one',debug:from({message:'429 no credits remaining',providerStatus:429},{requestId:'batch-request'})});
 const answers=await batch.run({questions:[{id:'one',question:'Private question'}],signal:new AbortController().signal,answer:async()=>{throw error;},onProgress:value=>updates.push(value)});
 assert.equal(answers[0].error,true);assert.equal(answers[0].debug.classification,'PROVIDER_QUOTA');assert.equal(updates[0].answers[0].debug.providerStatus,429);
});
