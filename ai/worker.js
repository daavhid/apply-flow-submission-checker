'use strict';
importScripts(...['config.js','diagnostics.js','questions.js','client.js','resume-files.js','resume.js','defaults.js','batch.js','form-service.js'].map(file=>chrome.runtime.getURL('ai/'+file)));
const requests=new Map();
const forms=SQCQAForms.create(chrome);
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const migration=chrome.storage.session.remove(['qaSession:local','qaSession:deployed']);
const resumes=SQCQAResume.create({store:chrome.storage.session,files:globalThis.SQCQAResumeFiles?.create(),onChange:()=>{
  for(const request of requests.values()){request.invalidated=true;request.controller.abort();}
  chrome.runtime.sendMessage?.({type:'QA_RESUME_CHANGED'})?.catch(()=>{});
}});
const defaults=SQCQADefaults.create({session:chrome.storage.session,local:chrome.storage.local,onChange:()=>{
  for(const request of requests.values()){request.invalidated=true;request.controller.abort();}
  chrome.runtime.sendMessage?.({type:'QA_DEFAULTS_CHANGED'})?.catch(()=>{});
}});
const pageUrl=chrome.runtime.getURL(chrome.runtime.getManifest?.().side_panel?.default_path||'ai/app.html');
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!Boolean(chrome.runtime.getManifest?.().action?.default_popup)}).catch(error=>console.error('Unable to configure the Q&A sidebar:',error));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || sender.url!==pageUrl) return;
  const scope=globalThis.SQCIntegrated?.forWindow(message.windowId);
  const resumeService=scope||resumes;
  if(scope&&['QA_READ_PORTAL_RESUME','QA_NORMALIZE_PORTAL_RESUME'].includes(message.type)){
    (message.type==='QA_READ_PORTAL_RESUME'?scope.readUpload(forms,message.item):scope.normalizeUpload(forms,message.item)).then(reply).catch(error=>reply({success:false,error:error.message}));return true;
  }
  if(scope&&message.type==='SQC_SIDEBAR_POLICY'){globalThis.SQCDeployment.load().then(policy=>reply({success:true,policy})).catch(error=>reply({success:false,error:error.message}));return true;}
  if(scope && ['SQC_SIDEBAR_SNAPSHOT','SQC_SIDEBAR_ACTION'].includes(message.type)){
    (message.type==='SQC_SIDEBAR_SNAPSHOT'?scope.panel(message.force===true):scope.action(message.action,message.screenshotId)).then(reply).catch(error=>reply({success:false,error:error.message}));return true;
  }
  if(message.type==='QA_RESUME_FILE'){
    resumeService.attachment(message.resumeVersion).then(file=>reply({success:true,file})).catch(error=>reply({success:false,error:error.message}));return true;
  }
  if(message.type==='QA_ATTACH_RESUME'){
    (scope?scope.attach(forms,message.item||{},message.resumeVersion):resumes.withAttachment(message.resumeVersion,file=>forms.attach(message.item||{},file))).then(reply).catch(error=>reply({success:false,error:error.message}));return true;
  }
  if(['QA_SCAN_FORM','QA_APPLY_CHOICE','QA_APPLY_ANSWER'].includes(message.type)){
    const operation=message.type==='QA_SCAN_FORM'?(scope?scope.scan(forms):forms.scan(message.windowId)):(scope?scope.apply(forms,message.item||{}):forms.apply(message.item||{}));
    operation.then(result=>reply({success:true,...result})).catch(error=>reply({success:false,error:error.message,code:error.code,access:error.access,details:error.details}));return true;
  }
  const key=sender.documentId || sender.tab?.id || sender.url;
  const environment=message.environment || 'deployed';
  if(!['deployed','local'].includes(environment)){reply({success:false,error:'Choose the deployed or local server.'});return;}
  const resumeActions={QA_RESUME_STATE:()=>resumeService.state(),QA_RESUME_SAVE:()=>resumeService.save(message.resume),QA_RESUME_CLEAR:async()=>{const state=await resumeService.clear();await defaults.clear();return state;}};
  const defaultActions={QA_DEFAULTS_STATE:async()=>defaults.state((await resumeService.state()).resume?.version),QA_DEFAULTS_SAVE:async()=>defaults.save(message.defaults,(await resumeService.snapshot()).version),QA_DEFAULTS_CLEAR:()=>defaults.clear(),QA_DEFAULTS_TEMPLATE:()=>defaults.saveTemplate(message.text)};
  if(defaultActions[message.type]){defaultActions[message.type]().then(value=>reply({success:true,value})).catch(error=>reply({success:false,error:error.message}));return true;}
  if(resumeActions[message.type]){
    migration.then(()=>resumeActions[message.type]()).then(state=>reply({success:true,state})).catch(error=>reply({success:false,error:error.message}));
    return true;
  }
  if(message.type==='QA_CANCEL') {
    const request=requests.get(key);
    if(request?.id===message.requestId) request.controller.abort();
    reply({success:true});return;
  }
  if(message.type!=='QA_ANSWER') return;
  const work=async()=>{
    if(requests.has(key)) return {success:false,error:'A request is already running. Stop it before sending again.'};
    if(typeof message.requestId!=='string' || !message.requestId || message.requestId.length>128) return {success:false,error:'Invalid request ID.'};
    if(message.environment!==undefined && !['deployed','local'].includes(message.environment)) return {success:false,error:'Choose the deployed or local server.'};
    const questions=SQCQAQuestions.validate(message.questions);

    const request={id:message.requestId,environment,controller:new AbortController()};
    requests.set(key,request);
    let timedOut=false,generationStage='resume_context';
    const timer=setTimeout(()=>{timedOut=true;request.controller.abort();},SQC_AI_CONFIG.timeoutMs*Math.max(1,Math.ceil(questions.length/(scope?10:20))));
    try {
      await migration;
      const requestConfig=scope?null:{endpoint:message.environment==='local'?SQC_AI_CONFIG.localEndpoint:SQC_AI_CONFIG.endpoint};
      const snapshot=await resumeService.snapshot();
      if(scope && !snapshot.ready)throw new Error('Upload the job-tailored resume in this workspace before generating answers.');
      const answerDefaults=await defaults.snapshot(snapshot.version);
      request.controller.signal.throwIfAborted();
      let batchIndex=0;
      const answerBatch=async items=>{
        if(!scope)return SQCQuestionClient.answer({config:{...SQC_AI_CONFIG,...requestConfig},items,signal:request.controller.signal,resume:snapshot,defaults:answerDefaults?{source:answerDefaults.source,text:answerDefaults.text}:undefined});
        const local=new Map(items.map(q=>[q.id,SQCQuestionClient.defaultAnswer(q,answerDefaults)]).filter(([,answer])=>answer));
        const pending=items.filter(q=>!local.has(q.id));
        const generated=pending.length?await scope.answer(pending,{requestId:message.requestId+'_'+(++batchIndex),signal:request.controller.signal}):[];
        return SQCQuestionClient.normalize({answers:[...local.values(),...generated]},items);
      };
      generationStage='request';const answers=await SQCQABatch.run({questions,concurrency:scope?1:2,signal:request.controller.signal,answer:answerBatch,onProgress:progress=>{
        if(!request.controller.signal.aborted)chrome.runtime.sendMessage?.({type:'QA_BATCH_PROGRESS',requestId:message.requestId,...progress})?.catch(()=>{});
      }});
      generationStage='context_validation';await resumeService.assertCurrent(snapshot);
      await defaults.assertCurrent(answerDefaults,snapshot.version);
      request.controller.signal.throwIfAborted();
      return {success:true,requestId:message.requestId,answers};
    } catch(error) {
      error.state=timedOut?'TIMEOUT':request.invalidated?'VERSION_MISMATCH':request.controller.signal.aborted?'CANCELLED':error.state;
      return {success:false,requestId:message.requestId,debug:SQCQADiagnostics.from(error,{requestId:message.requestId,stage:generationStage,extensionVersion:chrome.runtime.getManifest?.().version,questionCount:questions.length}),error:request.invalidated?'The resume or answer defaults changed. Request fresh answers.':request.controller.signal.aborted ? timedOut?'Answer generation timed out. Try again.':'Request stopped.':error.message || 'Could not reach the internal AI API.'};
    } finally {clearTimeout(timer);if(requests.get(key)===request)requests.delete(key);}
  };
  work().then(reply).catch(error=>reply({success:false,error:error.message || 'Answer generation failed.'}));
  return true;
});
