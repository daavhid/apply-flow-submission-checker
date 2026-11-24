'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('sidebar reads revalidate a visible CV chip instead of retaining a cached missing-resume error',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8'),start=source.indexOf('  function sidebarState()'),end=source.indexOf('  chrome.runtime.onMessage.addListener',start);
 let filename='Candidate One.pdf';
 const scope={document:{},window:{SQCFormState:{attachments:()=>[{question:'CV',filename}]},SQCLiveProgress:{hasData:()=>true}},
 currentSettings:{verifiedContext:{applicationSessionId:'app',jobId:'job',profileId:'candidate'}},hasVerifiedContext:()=>true,currentExtractedData:{resume_uploaded:''},activeProfile:{id:'candidate'},
 currentValidation:{isValid:false,errors:[{rule:'MISSING_RESUME'}]},JobFormValidator:{validate:data=>({isValid:Boolean(data.resume_uploaded),errors:data.resume_uploaded?[]:[{rule:'MISSING_RESUME'}],warnings:[]})},
 currentDuplicateRecord:null,liveSyncState:null,submissionDelivery:{read:()=>null},submissionKey:()=> 'app',sessionScreenshots:[]};
 vm.createContext(scope);vm.runInContext(source.slice(start,end)+';this.read=sidebarState;',scope);
 let state=scope.read();assert.equal(state.portalResume.filename,filename);assert.equal(state.validation.errors.length,0);assert.equal(scope.currentExtractedData.resume_uploaded,filename);
 filename='';state=scope.read();assert.equal(state.validation.errors[0].rule,'MISSING_RESUME');assert.equal(scope.currentExtractedData.resume_uploaded,'');
});
