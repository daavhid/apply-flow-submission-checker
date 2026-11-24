window.__requests=[];window.__portalActions=[];
window.__visibilityReports=[];
window.__context={applicationSessionId:'application-1',profileId:'profile-1',profileVersion:'1',jobId:'job-1',jobVersion:'1',resumeId:'resume-1',resumeVersion:'1',status:'PENDING'};
window.__page={success:true,context:__context,lifecycle:'IN_PROGRESS',hasFormData:true,validation:{isValid:true,errors:[],warnings:[]},totalFields:8};
window.__resume={source:'applyflow',text:'Candidate One\nSenior engineer building reliable Python and PostgreSQL systems.',filename:'Candidate One.pdf',candidateName:'Candidate One',version:'scope-one',ready:true,education:[{school:'Test University',degree:'Bachelor of Science',major:'Computer Science',graduationYear:'2017'}]};
window.__events={activated:[],updated:[]};
window.__policyPromise=fetch('/config/settings.json').then(response=>response.json());
window.__accountStage='disconnected';window.__jobVisible=false;window.__snapshotGate=null;window.__snapshotWaiting=false;window.__offline=false;window.__duplicate=null;window.__duplicateAcknowledged=false;window.__jobFailure=null;window.__portalAvailability=null;
window.__integration=()=>({state:__accountStage==='disconnected'?'DISCONNECTED':__accountStage==='signin'?'SIGNED_OUT':'AUTHENTICATED',apiOrigin:__accountStage==='disconnected'?'':'https://applyflow.test',...(__accountStage==='connected'?{applier:{name:'Test applier',email:'applier@example.com'}}:{})});
window.chrome={runtime:{id:'sidebar',getURL:p=>'/'+p,getManifest:()=>({side_panel:{default_path:'sidebar/sidebar.html'}}),onMessage:{addListener(){}},async sendMessage(message){
  __requests.push(message);
  if(message.type==='SQC_SIDEBAR_POLICY')return {success:true,policy:await __policyPromise};
  if(message.type==='SQC_CONNECT'){__accountStage='signin';return {success:true,integration:__integration()};}
  if(message.type==='SQC_LOGIN'){if(message.password!=='test-password')return {success:true,integration:{state:'INVALID_CREDENTIALS',message:'Email or password is incorrect.'}};__accountStage='connected';return {success:true,integration:__integration()};}
  if(message.type==='SQC_LOGOUT'){__accountStage='signin';return {success:true};}
  if(message.type==='SQC_SIDEBAR_SNAPSHOT'){
    const integration=__offline?{...__integration(),accountVerified:false,state:'UNAVAILABLE',message:'Network temporarily unavailable'}:__integration();
    if(__snapshotGate){const gate=__snapshotGate;__snapshotGate=null;__snapshotWaiting=true;await gate;__snapshotWaiting=false;}
    return {success:true,integration,profiles:__accountStage==='connected'?[{id:'profile-1',fullName:'Candidate One'}]:[],accountProfile:__accountStage==='connected'?{fullName:'Candidate One'}:null,tabId:7,url:'https://portal.test/jobs/1/apply',context:__jobVisible&&!__offline&&!__jobFailure?__context:null,jobError:__jobFailure||undefined,jobDiagnostic:__jobFailure?{state:'CONTEXT_MISMATCH',path:'/api/sqc/application-context',fields:['context.profile.version']}:undefined,profile:{fullName:'Candidate One'},applier:{name:'Test applier'},job:{jobTitle:'Senior Backend Engineer',company:'Example Technologies'},portalAvailability:__portalAvailability,contact:{fullName:'Candidate One',email:'candidate@example.com'},duplicate:__duplicate,duplicateAcknowledged:__duplicateAcknowledged,page:__page,policy:await __policyPromise,resumeMode:'tailored',resume:{ready:__resume.ready,hasOriginal:__resume.ready,filename:__resume.filename,source:__resume.source,skills:['Python'],education:__resume.education,workHistory:[{title:'Senior Engineer',company:'Example',startDate:'2022',current:true,description:'Built reliable services.'}]}};
  }
  if(message.type==='QA_RESUME_SAVE'){if(window.__resumeSaveError)return {success:false,error:window.__resumeSaveError};__resume={...__resume,text:message.resume.text,version:'scope-two',filename:'Candidate One.txt',source:'sqc_upload',ready:true};__context.resumeVersion='2';return {success:true,state:{resume:__resume}};}
  if(message.type==='QA_RESUME_STATE'){if(window.__resumeStateGate)await window.__resumeStateGate;if(window.__resumeReadError)return {success:false,error:'Temporary verification failure'};return {success:true,state:{resume:__resume}};}
  if(message.type==='QA_DEFAULTS_STATE')return {success:true,value:{active:{source:'extension_defaults',text:'Visa sponsorship now or in future: No.'},starter:'Visa sponsorship now or in future: No.'}};
  if(message.type==='QA_SCAN_FORM'){if(window.__scanError)return {success:false,error:window.__scanError};if(window.__scanResult)return window.__scanResult;return {success:true,pageKey:'document-one',questions:[{id:'sponsorship',question:'Will you require sponsorship now or in the future?',type:'text',source:{tabId:7,documentId:'document-one',url:'https://portal.test/jobs/1/apply',snapshot:'one',contextKey:'one'}}]};}
  if(message.type==='QA_ANSWER')return {success:true,requestId:message.requestId,answers:message.questions.map(q=>({...q,answer:'No'}))};
  if(message.type==='SQC_SIDEBAR_ACTION'){__portalActions.push(message.action);if(message.action==='alreadyApplied')__duplicateAcknowledged=true;return {success:true};}
  if(message.type==='QA_APPLY_ANSWER')return {success:true};
  return {success:true};
}},windows:{getCurrent:async()=>({id:1})},tabs:{onActivated:{addListener:fn=>__events.activated.push(fn)},onUpdated:{addListener:fn=>__events.updated.push(fn)}}};
window.chrome.runtime.connect=()=>({postMessage:message=>__visibilityReports.push(message),onDisconnect:{addListener(){}}});
