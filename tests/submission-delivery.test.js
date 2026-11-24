'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{create}=require('../content/submission-delivery');
test('a visible confirmation delivers once despite repeated extraction and retains one event ID',async()=>{
 let release,calls=0;const service=create({id:()=> 'one-event'}),input={key:'job:candidate',proof:()=>true,send:async eventId=>{calls++;assert.equal(eventId,'one-event');await new Promise(resolve=>release=resolve);return {success:true,recordId:'record'};}};
 const first=service.check(input),second=service.check(input);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(service.read(input.key).phase,'SYNCING');release();await Promise.all([first,second]);
 assert.equal(service.read(input.key).phase,'ACKNOWLEDGED');await service.check(input);assert.equal(calls,1);
});
test('failed sync retries with the same event ID and acknowledges only a committed response',async()=>{
 let clock=100,calls=0;const timers=[],ids=[],service=create({now:()=>clock,id:()=> 'retry-event',schedule:(fn,delay)=>timers.push({fn,delay})});
 const input={key:'one',proof:()=>true,send:async eventId=>{ids.push(eventId);return ++calls===1?{success:false,error:'Offline'}:{success:true,recordId:'saved'};}};
 await service.check(input);assert.equal(service.read('one').phase,'FAILED');assert.equal(service.read('one').error,'Offline');await service.check(input);assert.equal(calls,1);
 clock+=timers[0].delay;timers[0].fn();await new Promise(resolve=>setImmediate(resolve));assert.equal(service.read('one').phase,'ACKNOWLEDGED');assert.deepEqual(ids,['retry-event','retry-event']);
});
test('a changed page, missing proof or uncommitted response cannot complete an application',async()=>{
 let proof=false,calls=0;const timers=[],service=create({schedule:fn=>timers.push(fn),maxAttempts:1,id:()=> 'one'}),input={key:'one',proof:()=>proof,send:async()=>{calls++;return {success:true};}};
 await service.check(input);assert.equal(calls,0);proof=true;await service.check(input);assert.equal(service.read('one').phase,'FAILED');assert.equal(timers.length,0);proof=false;await service.retry('one');assert.equal(calls,1);
});
test('the same confirmation reuses its event ID after reload and another job receives its own ID',async()=>{
 const data=new Map(),store={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};let serial=0;const options={store,id:()=> 'event-'+ ++serial,schedule:()=>{},maxAttempts:1};
 const delivered=[];const input=key=>({key,proof:()=>true,send:async id=>{delivered.push(id);return {success:false};}});
 await create(options).check(input('first'));await create(options).check(input('first'));await create(options).check(input('second'));assert.deepEqual(delivered,['event-1','event-1','event-2']);
});
test('the actual confirmation handler reports a success page with nine historical fields',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8');
 const start=source.indexOf('  async function handleSubmissionSuccessNotice('),end=source.indexOf('  async function handleAlreadyAppliedNotice(',start);let reports=0;
 const scope={window:{location:{href:'https://job-boards.greenhouse.io/embed/job_app/confirmation?for=pipe&token=123',hostname:'job-boards.greenhouse.io'}},hasVerifiedContext:()=>true,submissionKey:()=> 'verified-job-and-candidate',JobFormExtractor:{detectSubmissionSuccess:()=>({is_success:true})},
 submissionDelivery:create({id:()=> 'event'}),loggedSuccessJobKey:null,fetchConfig:async()=>{throw new Error('A verified confirmation must not wait for a redundant config refresh');},logPayloadToBackend:async()=>{reports++;return {success:true,recordId:'saved'};},SubmissionHUD:{updateState(){},showToast(){}},allProfiles:[],activeProfile:{},currentSettings:{},console};
 vm.createContext(scope);vm.runInContext(source.slice(start,end)+'\nthis.handle=handleSubmissionSuccessNotice;',scope);
 await scope.handle({is_submission_success:true,submission_success_message:'Your application has been received.',total_fields_count:9},{});assert.equal(reports,1);assert.equal(scope.loggedSuccessJobKey,'verified-job-and-candidate');
});

test('an expired assignment on a confirmation page refreshes immediately once rather than waiting for the lease timer',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8');
 const start=source.indexOf('  let confirmationRecovery='),end=source.indexOf('  // Synchronous extraction and validation',start);
 let calls=0,release,extractions=0,visible=true;
 const scope={currentSettings:{verifiedContext:{profileId:'candidate',jobId:'job'}},JobFormExtractor:{detectSubmissionSuccess:()=>({is_success:visible})},
 fetchConfig:()=>{calls++;return new Promise(resolve=>release=resolve);},hasVerifiedContext:()=>true,runExtractionAndValidation:()=>extractions++};
 vm.createContext(scope);vm.runInContext(source.slice(start,end)+';this.recover=recoverConfirmationContext;',scope);
 visible=false;scope.recover();assert.equal(calls,0);
 visible=true;scope.recover();scope.recover();assert.equal(calls,1);
 release();await new Promise(resolve=>setImmediate(resolve));assert.equal(extractions,1);
 scope.recover();assert.equal(calls,1,'Repeated extraction must not create a verification loop');
});
