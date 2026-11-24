'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),policy=require('../content/context-policy');
test('observed application pages do not require an allowedRoutes response or authorize unvisited pages',()=>{
  const c={verifiedUrls:['https://ats.example/login','https://another-ats.example/form/step2']};
  assert.equal(policy.matchesContext('https://another-ats.example/form/step2',c),true);
  assert.equal(policy.matchesContext('https://another-ats.example/form/step3',c),false);
  assert.equal(policy.matchesContext('https://unrelated.example/',c),false);
});
const context=()=>({status:'PENDING',profile:{id:'candidate'},job:{id:'new-listing',title:'Lead Engineer',company:'Acme',requisitionId:'REQ-123',location:'Miami'},
  duplicateCheck:{status:'ALREADY_APPLIED',profileId:'candidate',matchedJob:{id:'older-listing',title:'Lead Engineer',company:'Acme',requisitionId:'REQ-123',location:'Miami'},submission:{id:'existing-record',status:'APPLIED',applierName:'Another applier'}}});
test('candidate-wide duplicate records include other appliers and matching reposted job titles and companies',()=>{
  const match=policy.duplicate(context());assert.equal(match.confirmed,true);assert.equal(match.applierName,'Another applier');assert.equal(match.recordId,'existing-record');
});
test('duplicate matching does not conflate a different profile, company, role, requisition or location',()=>{
  for(const edit of [c=>c.duplicateCheck.profileId='other',c=>c.duplicateCheck.matchedJob.company='Different company',c=>c.duplicateCheck.matchedJob.title='Junior Engineer',c=>c.duplicateCheck.matchedJob.requisitionId='REQ-999',c=>c.duplicateCheck.matchedJob.location='Boston',c=>c.duplicateCheck.submission.status='PENDING']){
    const c=context();edit(c);assert.equal(policy.duplicate(c),null);
  }
});
test('the current ApplyFlow candidate-job status is authoritative even without a history response',()=>{
  const c=context();delete c.duplicateCheck;c.status='APPLIED';assert.equal(policy.duplicate(c).source,'current-record');
  c.status='PENDING';assert.equal(policy.duplicate(c),null);
});
