'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {create}=require('../background/application-journal');
function fixture(){const data={},store={get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value))};return {service:create({store}),auth:{sessionId:'auth',applier:{id:'applier'}},c:{applicationSessionId:'app',profileAssignmentId:'assignment',profileAssignmentVersion:'1',profileId:'candidate',profileVersion:'v1',jobId:'job',resumeId:'resume',resumeVersion:'r1'},url:'https://portal.test/apply?token=123#application_session_id=app'};}
test('captured answers survive reload for the same page, candidate, job and resume',async()=>{
 const f=fixture();await f.service.capture(f.auth,f.c,{url:f.url,fields:[{id:'country',label:'Country',value:'United States',type:'select'}]});
 let result=await f.service.restore(f.auth,f.c,'https://portal.test/apply?token=123');assert.equal(result[0].answer,'United States');assert.equal(result[0].fieldId,'country');
 for(const c of [{...f.c,jobId:'other'},{...f.c,profileId:'other'},{...f.c,resumeVersion:'r2'},{...f.c,profileVersion:'v2'}])assert.equal((await f.service.restore(f.auth,c,f.url)).length,0);
 assert.equal((await f.service.restore(f.auth,f.c,'https://portal.test/step2?token=123')).length,0);
});
test('ApplyFlow savedApplication values need matching identity and explicit current resume versions',async()=>{
 const f=fixture(),remote={...f.c,steps:[{url:f.url,fields:[{question:'Why this role?',answer:'Relevant experience.',type:'textarea'}]}]};
 assert.equal((await f.service.restore(f.auth,f.c,f.url,remote))[0].source,'applyflow');
 assert.equal((await f.service.restore(f.auth,f.c,f.url,{...remote,profileId:'wrong'})).length,0);
 assert.equal((await f.service.restore(f.auth,f.c,f.url,{...remote,resumeVersion:'old'})).length,0);
});
test('intentional clearing, credential fields, files and consent are not replayed',async()=>{
 const f=fixture(),remote={...f.c,steps:[{url:f.url,fields:[{question:'Country',answer:'United States'}]}]};
 await f.service.capture(f.auth,f.c,{url:f.url,fields:[{label:'Country',value:''},{label:'Password',value:'secret',type:'password'},{label:'I agree to terms',value:'Checked (Yes)',type:'checkbox'},{label:'Resume',value:'candidate.pdf',type:'file'}]});
 assert.equal((await f.service.restore(f.auth,f.c,f.url,remote)).length,0);
});
