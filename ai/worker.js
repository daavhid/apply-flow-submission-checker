'use strict';
importScripts(...['config.js','questions.js','client.js','resume-files.js','resume.js','defaults.js','batch.js','form-service.js'].map(file=>chrome.runtime.getURL('ai/'+file)));
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
const pageUrl=chrome.runtime.getURL('ai/app.html');
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:!Boolean(chrome.runtime.getManifest?.().action?.default_popup)}).catch(error=>console.error('Unable to configure the Q&A sidebar:',error));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || sender.url!==pageUrl) return;
  if(message.type==='QA_RESUME_FILE'){
    resumes.attachment(message.resumeVersion).then(file=>reply({success:true,file})).catch(error=>reply({success:false,error:error.message}));return true;
  }
  if(message.type==='QA_ATTACH_RESUME'){
    resumes.withAttachment(message.resumeVersion,file=>forms.attach(message.item||{},file)).then(reply).catch(error=>reply({success:false,error:error.message}));return true;
  }
  if(['QA_SCAN_FORM','QA_APPLY_CHOICE','QA_APPLY_ANSWER'].includes(message.type)){
    const operation=message.type==='QA_SCAN_FORM'?forms.scan(message.windowId):forms.apply(message.item||{});
    operation.then(result=>reply({success:true,...result})).catch(error=>reply({success:false,error:error.message,code:error.code,access:error.access,details:error.details}));return true;
  }
  const key=sender.documentId || sender.tab?.id || sender.url;
  const environment=message.environment || 'deployed';
  if(!['deployed','local'].includes(environment)){reply({success:false,error:'Choose the deployed or local server.'});return;}
  const resumeActions={QA_RESUME_STATE:()=>resumes.state(),QA_RESUME_SAVE:()=>resumes.save(message.resume),QA_RESUME_CLEAR:async()=>{const state=await resumes.clear();await defaults.clear();return state;}};
  const defaultActions={QA_DEFAULTS_STATE:async()=>defaults.state((await resumes.state()).resume?.version),QA_DEFAULTS_SAVE:async()=>defaults.save(message.defaults,(await resumes.snapshot()).version),QA_DEFAULTS_CLEAR:()=>defaults.clear(),QA_DEFAULTS_TEMPLATE:()=>defaults.saveTemplate(message.text)};
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
    const endpoint=message.environment==='local'?SQC_AI_CONFIG.localEndpoint:SQC_AI_CONFIG.endpoint;
    const request={id:message.requestId,environment,controller:new AbortController()};
    requests.set(key,request);
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;request.controller.abort();},SQC_AI_CONFIG.timeoutMs*Math.max(1,Math.ceil(questions.length/20)));
    try {
      await migration;
      const snapshot=await resumes.snapshot();
      const answerDefaults=await defaults.snapshot(snapshot.version);
      request.controller.signal.throwIfAborted();
      const answers=await SQCQABatch.run({questions,signal:request.controller.signal,answer:items=>SQCQuestionClient.answer({config:{...SQC_AI_CONFIG,endpoint},items,signal:request.controller.signal,resume:snapshot,defaults:answerDefaults?{source:answerDefaults.source,text:answerDefaults.text}:undefined}),onProgress:progress=>{
        if(!request.controller.signal.aborted)chrome.runtime.sendMessage?.({type:'QA_BATCH_PROGRESS',requestId:message.requestId,...progress})?.catch(()=>{});
      }});
      await resumes.assertCurrent(snapshot);
      await defaults.assertCurrent(answerDefaults,snapshot.version);
      request.controller.signal.throwIfAborted();
      return {success:true,requestId:message.requestId,answers};
    } catch(error) {
      return {success:false,requestId:message.requestId,error:request.invalidated?'The resume or answer defaults changed. Request fresh answers.':request.controller.signal.aborted ? timedOut?'Answer generation timed out. Try again.':'Request stopped.':error.message || 'Could not reach the internal AI API.'};
    } finally {clearTimeout(timer);if(requests.get(key)===request)requests.delete(key);}
  };
  work().then(reply).catch(error=>reply({success:false,error:error.message || 'Answer generation failed.'}));
  return true;
});
