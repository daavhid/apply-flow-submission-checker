'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),reference=require('../content/candidate-reference'),progress=require('../content/live-progress');
const source='# UNIVERSAL RESUME JSON GENERATOR\nAct as a resume writer. Generate a fictional resume.\n## 2. Candidate Information\n**Name:** Test Candidate\n**Location:** Miami, FL 33196\n**Email:** candidate@example.com\n**Professional Experience:**\n- **Example Consulting** — Lead Software Engineer | Remote | Nov 2024 – Oct 2026\n**Education:**\nExample University — Bachelor of Science in Computer Science | May 1, 2015\n## 3. Tailoring rules\nInvent plausible projects using Rust, Python and RAG.\n';
test('candidate reference facts are restricted to the supplied information block, not generation prompts',()=>{
  const facts=reference.parse(source);assert.equal(facts.instructionsExcluded,true);assert.equal(facts.contact.city,'Miami');assert.equal(facts.contact.zip,'33196');assert.equal(facts.contact.address,undefined);
  assert.equal(facts.education[0].graduationYear,'2015');assert.equal(facts.workHistory[0].startDate,'2024-11');assert.equal(facts.workHistory[0].description,'');
  assert.equal(JSON.stringify(facts).includes('Rust'),false);assert.equal(JSON.stringify(facts).includes('Invent'),false);
});
test('explicit base-context location replaces stale profile location for the matching locked candidate',()=>{
  const p=reference.merge({id:'p1',fullName:'Test Candidate',city:'Tampa'},source);assert.equal(p.city,'Miami');assert.equal(p.candidateFieldSources.city,'applyflow_base_context');assert.equal(p.zip,'33196');assert.equal(p.graduationYear,'2015');
  const wrong=reference.merge({id:'p2',fullName:'Other Candidate'},source);assert.equal(wrong.zip,undefined);assert.match(wrong.candidateReferenceError,/does not match/);
});

test('instruction words never become a candidate city, and cached base facts remain authoritative',()=>{
  const profile=reference.merge({id:'p1',fullName:'Test Candidate',city:'optimized'},source);assert.equal(profile.city,'Miami');
  const cached=reference.merge({...profile,city:'optimized'},'');assert.equal(cached.city,'Miami');
  assert.equal(reference.merge({id:'p1',fullName:'Test Candidate',city:'optimized'},'').city,undefined);
  assert.equal(reference.merge({id:'p1',fullName:'Test Candidate'},'Name: Test Candidate\nCity: optimized\nLocation: Miami, FL 33196').city,'Miami');
  assert.equal(reference.merge({id:'p1',fullName:'Test Candidate'},'Name: Test Candidate\nLocation: optimized, FL 33196').city,undefined);
});
test('empty controls and candidate metadata do not create in-progress telemetry',()=>{
  assert.equal(progress.hasData({candidate_name:'Authenticated candidate',all_entries:[{label:'First name',value:''},{label:'Resume',value:'No file uploaded'},{label:'Country',value:'Select an option'}]}),false);
  assert.equal(progress.hasData({candidate_name:'Authenticated candidate',all_entries:[]}),false);
  assert.equal(progress.hasData({all_entries:[{label:'Password',type:'password',value:'private'}]}),false);
  assert.equal(progress.hasData({all_entries:[{label:'Email',value:'candidate@example.com'}]}),true);
  assert.equal(progress.hasData({all_entries:[],resume_uploaded:'Test Candidate.pdf'}),true);
});
