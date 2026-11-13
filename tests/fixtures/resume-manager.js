'use strict';
async function runResumeSmoke() {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const text='Ramon Ramirez\nSenior Engineer building Python services and SQL systems.\nPROFESSIONAL EXPERIENCE\nExample Corp\nSenior Engineer | January 2020 - Present\nBuilt services.\nEDUCATION\nExample University';
  const area=seed=>({data:seed,async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in this.data).map(k=>[k,structuredClone(this.data[k])]));},
    async set(data){Object.assign(this.data,structuredClone(data));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete this.data[k];}});
  const profile={id:'candidate',version:'1',verified:true,fullName:'Ramon Ramirez',primaryEmail:'ramon@example.test'};
  const assignment={id:'assignment',version:'1',status:'ACTIVE',applierId:'applier',profileId:profile.id,profileVersion:profile.version};
  const future=()=>new Date(Date.now()+3600000).toISOString();
  let serverResume={id:'base',version:'1',verified:true,profileId:profile.id,text:'Base candidate resume',kind:'base'};
  const tab={id:1,url:location.href},sender={tab,url:location.href,frameId:0};
  window.chrome={runtime:{id:'browser-test',getURL:p=>'chrome-extension://browser-test/'+p},
    storage:{session:area({}),local:area({sqcConnection:{apiOrigin:location.origin},settings:{}})},
    tabs:{async get(){return {...tab};}}};
  let answerFailure=false,copied='',answerRequests=0;
  Object.defineProperty(navigator,'clipboard',{value:{async writeText(value){copied=value;}}});
  const fakeFetch=async (url,options)=>({ok:true,status:200,async json(){
    if(url.endsWith('/api/ai/status')) return {provider:'CODEX',model:'test-model',connected:true};
    if(url.endsWith('/answer-questions')) {
      answerRequests++;
      if(answerFailure)return {success:false,error:{message:'ApplyFlow answering is unavailable. Please retry.'}};
      const body=JSON.parse(options.body);return {success:true,contractVersion:2,...SQCScreeningPolicy.stamp(body),requestId:body.requestId,
        answers:body.questions.map(q=>({id:q.id,status:'ANSWERED',answer:'Answer for '+q.question}))};
    }
    if(url.endsWith('/session'))return {success:true,contractVersion:2,session:{id:'auth',expiresAt:future()},applier:{id:'applier',name:'Applier',email:'applier@example.test'},profileAssignment:assignment,profile,csrfToken:'test'};
    return {success:true,contractVersion:2,context:{applicationSessionId:'application',authSessionId:'auth',expiresAt:future(),applier:{id:'applier'},
      assignment:{...assignment,profileAssignmentId:assignment.id,profileAssignmentVersion:assignment.version,jobId:'job'},profile,
      job:{id:'job',version:'1',title:'Engineer',company:'Example'},resume:serverResume,allowedRoutes:[{url:location.href}],status:'PENDING'}};
  }});
  let service=SQCApplyFlowSession.create({chrome,fetch:fakeFetch,policy:SQCContextPolicy,screening:SQCScreeningPolicy});
  let config;
  chrome.runtime.sendMessage=message=>service.handle(message,sender);
  window.JobFormExtractor={isJobApplicationPortal:()=>true,extractApplyFlowParams:()=>({jobId:'job',profileId:'candidate'}),extractAllFields:()=>({
    all_entries:[{label:'Why do you want this role?',element:document.getElementById('portal-question'),type:'textarea',required:true}],total_fields_count:1})};
  async function reload(){config=await service.handle({type:'GET_CONFIG',force:true},sender);check(config.settings.verifiedContext,config.integration.message);window.__SQC_CONTEXT_SETTINGS=config.settings;
    window.__SQC_ACTIVE_PROFILE=config.activeProfile;SubmissionHUD.init(config.profiles,config.activeProfile,config.settings);}
  window.SubmissionCheckerCore={reloadConfig:reload,restoreForm(){return SubmissionHUD.attachResumeToPortal(config.activeProfile.resumeText,config.activeProfile);},runLiveCheck(){}};
  const active=selector=>document.querySelector('.sqc-dialog-overlay:not(.is-leaving) '+selector);
  async function select(contents,name){const input=active('#sqc-local-resume-file');active('#sqc-local-upload-panel').hidden=false;
    const transfer=new DataTransfer();transfer.items.add(new File([contents],name,{type:'text/plain'}));input.files=transfer.files;
    await input.onchange({target:input});}
  try {
    await reload();SubmissionHUD.openResumeModal();
    await select('Different Person\nSoftware engineer developing production applications and maintaining reliable APIs.','Wrong.txt');
    check(!active('#sqc-use-local-resume').disabled,'Save stayed disabled after parsing');
    check(!document.getElementById('sqc-local-resume-confirm'),'Hidden confirmation checkbox still required');
    await active('#sqc-use-local-resume').onclick({currentTarget:active('#sqc-use-local-resume')});
    check(active('#sqc-local-save-status').dataset.error==='true','Validation error was not shown by the save action');
    check(active('#sqc-local-save-status').getBoundingClientRect().height>0,'Save error is invisible');
    await select(text,'Ramon_Tailored.txt');await active('#sqc-use-local-resume').onclick({currentTarget:active('#sqc-use-local-resume')});
    check(config.activeProfile.resumeSource==='sqc_upload','Upload did not activate');
    check(!active('#sqc-attach-verified').disabled,'Attach stayed disabled after save');
    check(document.getElementById('portal-resume').files[0]?.name==='Ramon_Tailored.txt','Original file was not attached to the portal');
    service=SQCApplyFlowSession.create({chrome,fetch:fakeFetch,policy:SQCContextPolicy,screening:SQCScreeningPolicy});await reload();
    check(config.activeProfile.resumeText===text,'Actual IndexedDB record did not survive worker recreation');
    serverResume={...serverResume,id:'different-base',version:'2'};await reload();check(config.activeProfile.resumeSource==='sqc_upload','Changing the server default discarded the upload');
    await service.handle({type:'SQC_CLEAR_LOCAL_RESUME',context:config.settings.verifiedContext},sender);
    const dataUrl='data:text/plain;base64,'+btoa(text);
    serverResume={...serverResume,kind:'tailored',jobId:'job',text,file:{dataUrl,filename:'ApplyFlow_Tailored.txt',mimeType:'text/plain'}};
    await reload();SubmissionHUD.openResumeModal();
    check(config.activeProfile.resumeIsTailored,'Approved ApplyFlow tailored resume is marked not ready');
    check(!active('#sqc-attach-verified').disabled,'Approved ApplyFlow file cannot be attached');
    active('#sqc-attach-verified').onclick();
    check(document.getElementById('portal-resume').files[0]?.name==='ApplyFlow_Tailored.txt','ApplyFlow file was not attached');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
    serverResume={...serverResume,file:{filename:'ApplyFlow_Tailored.txt',mimeType:'text/plain',sha256:hash}};
    await reload();SubmissionHUD.openResumeModal();
    check(active('#sqc-choose-verified'),'Matching downloaded file control is missing');
    const downloaded=active('#sqc-verified-local-file'),transfer=new DataTransfer();
    transfer.items.add(new File([text],'Downloaded.txt',{type:'text/plain'}));downloaded.files=transfer.files;
    await downloaded.onchange({target:downloaded});
    check(config.activeProfile.resumeBase64,'Downloaded ApplyFlow file did not save');
    service=SQCApplyFlowSession.create({chrome,fetch:fakeFetch,policy:SQCContextPolicy,screening:SQCScreeningPolicy});await reload();
    check(config.activeProfile.resumeBase64,'Linked ApplyFlow bytes did not survive worker recreation');
    check(config.activeProfile.resumeSource==='applyflow','Linked ApplyFlow file lost provenance');
    active('[data-sqc-close]').click();
    SubmissionHUD.toggleDrawer(true);document.getElementById('sqc-btn-open-questions').click();
    const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Question UI did not reach the expected state.');};
    check(document.getElementById('sqc-tab-questions').classList.contains('active'),'Questions tab did not open');
    check(document.querySelector('.sqc-build-label')?.textContent.includes('v1.0.1'),'The manual-Q&A build marker is missing');
    check(!document.getElementById('sqc-qa-send-detected'),'Automatic form question collection is still exposed');
    check(!document.getElementById('sqc-qa-autofill'),'Question autofill is still enabled');
    await new Promise(r=>setTimeout(r,1200));check(answerRequests===0,'Questions were sent without clicking Send');
    document.getElementById('sqc-qa-check-connection').click();await wait(()=>document.getElementById('sqc-tab-questions').textContent.includes('test-model'));
    const pasted=document.getElementById('sqc-qa-pasted');pasted.value='Describe your Python experience.\nWhy this company?';pasted.dispatchEvent(new Event('input'));
    document.getElementById('sqc-qa-send-pasted').click();await wait(()=>document.querySelectorAll('[data-qa-edit]').length===2);
    check(document.getElementById('portal-question').value==='','Manual Q&A modified the application form');
    check(document.querySelector('[data-qa-edit]').value==='Answer for Describe your Python experience.','Returned manual answer was not displayed');
    check(!document.querySelector('[data-qa-fill]'),'Manual Q&A is offering automatic field filling');
    const answer=document.querySelector('[data-qa-edit]');answer.value='Reviewed answer';answer.dispatchEvent(new Event('input'));
    document.querySelector('[data-qa-copy]').click();await wait(()=>copied==='Reviewed answer');
    answerFailure=true;const retry=document.getElementById('sqc-qa-pasted');retry.value='Another question?';retry.dispatchEvent(new Event('input'));
    document.getElementById('sqc-qa-send-pasted').click();await wait(()=>document.getElementById('sqc-tab-questions').textContent.includes('answering is unavailable'));
    document.body.dataset.resumeSmoke='passed';document.getElementById('smoke-result').textContent='Passed: resume saving/attachment and manual-only Q&A, no automatic requests, AI status, answer retrieval, copy, and API errors';
  }catch(error){document.body.dataset.resumeSmoke='failed';document.getElementById('smoke-result').textContent=error.stack;}
}
