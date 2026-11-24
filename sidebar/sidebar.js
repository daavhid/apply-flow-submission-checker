'use strict';
(() => {
  const node=id=>document.getElementById(id);
  let windowId,refreshing=false,refreshTask=null,refreshRevision=0,lastContext='',lastPage='',currentTab='overview',authStage='',working=false,contextReady=false,promptedJob='',returnTab='overview',canAutofill=false,accountRevision=0,lastFacts='',resumeReady=false,currentSkills=[];
  const send=message=>chrome.runtime.sendMessage({...message,windowId});
  let feedbackTimer;
  let jobDiagnostic='';
  let attachedPortalResume=null;
  let lastEvidence='',sidebarPort;
  let lastIssues='';
  function renderIssues(errors){
    const signature=JSON.stringify(errors.map(error=>[error.rule,error.message]));if(signature===lastIssues)return;lastIssues=signature;
    const groups=[],required=errors.filter(error=>error.rule==='REQUIRED_FIELD_EMPTY');
    for(const error of errors.filter(error=>error.rule!=='REQUIRED_FIELD_EMPTY'))groups.push({title:({JOB_STACK_MISMATCH:'Check the candidate’s technical track',MISSING_RESUME:'Attach a resume',RESUME_REQUIRED:'Attach a resume'})[error.rule]||String(error.rule||'Application issue').toLowerCase().replace(/_/g,' '),message:error.message});
    if(required.length)groups.push({title:required.length+' required fields need answers',fields:required.map(error=>error.message.match(/"([^"]+)"/)?.[1]||error.message)});
    node('sqc-issues').replaceChildren(...groups.map(group=>{
      const item=document.createElement('li'),title=document.createElement('strong');title.textContent=group.title;item.append(title);
      if(group.fields){const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');details.open=group.fields.length<=5;summary.textContent='Show fields';for(const label of group.fields){const row=document.createElement('li');row.textContent=label;list.append(row);}details.append(summary,list);item.append(details);}
      else {const message=document.createElement('p');message.textContent=group.message;item.append(message);}
      return item;
    }));
  }
  function renderEvidence(page){
    const shots=page?.screenshots||[],signature=JSON.stringify([shots,page?.deliveryAcknowledged]);if(signature===lastEvidence)return;lastEvidence=signature;
    put('evidence-count',String(shots.length));put('evidence-status',shots.length?'Captured steps stay with this application across page changes. Open an image to inspect it.':'Screenshots are captured as you fill and move through application steps.');
    node('evidence-list').replaceChildren(...shots.map(shot=>{
      const row=document.createElement('div'),button=document.createElement('button'),status=document.createElement('small');button.type='button';button.className='quiet';button.textContent=shot.label||'Application step';status.textContent=shot.syncedAt||page.deliveryAcknowledged?'Acknowledged by ApplyFlow':'Captured · awaiting sync confirmation';
      button.addEventListener('click',()=>perform(button,'Opening...',async()=>{
        const result=await request({type:'SQC_SIDEBAR_ACTION',action:'previewScreenshot',screenshotId:shot.id});const image=result.screenshot?.dataUrl;
        if(!/^data:image\/(?:png|jpeg|webp);base64,/i.test(image||''))throw new Error('The screenshot image is not available. Capture the step again.');
        const dialog=document.createElement('dialog'),img=document.createElement('img'),close=document.createElement('button');img.src=image;img.alt=shot.label||'Captured application step';img.style.width='100%';close.type='button';close.textContent='Close preview';close.onclick=()=>dialog.close();dialog.append(close,img);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
      }));row.append(button,status);return row;
    }));
  }
  let nextRefreshAt=0,refreshFailures=0,lastAccountRender='';
  const put=(id,value)=>{node(id).textContent=value||'';};
  function verificationMessage(state,fallback){
    const message=state.jobError||state.integration?.message||fallback,request=state.jobDiagnostic?.verificationRequest;
    if(!request||state.jobDiagnostic?.backendCode!=='CONTEXT_MISMATCH')return message;
    return message+(['applicationSessionId','jobId','profileId'].every(key=>request[key])?' SQC sent the retained application, job and candidate IDs. ApplyFlow rejected those IDs for this page; they have not been discarded.':' SQC has no complete saved ID set for this tab. Open its tracked ApplyFlow link once to establish it.');
  }
  function feedback(message,error=false){clearTimeout(feedbackTimer);put('workspace-feedback',message);node('workspace-feedback').hidden=false;node('workspace-feedback').dataset.tone=error?'error':'success';if(!error)feedbackTimer=setTimeout(()=>{node('workspace-feedback').hidden=true;},8000);}
  function selectTab(name,focus=false){
    if(name==='resume'&&currentTab!=='resume')returnTab=currentTab;
    currentTab=name;
    document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();});
    for(const id of ['overview','resume','qa'])node('panel-'+id).hidden=id!==name;
    if(name==='resume')node('resume-section').open=contextReady&&!resumeReady;
    window.scrollTo(0,0);
  }
  async function copyValue(value,label){
    try{if(!String(value||'').trim())throw new Error('No '+label.toLowerCase()+' is available yet.');await navigator.clipboard.writeText(String(value));feedback(label+' copied.');}
    catch(error){feedback(error.message||'Clipboard access failed. Select the text and copy it manually.',true);}
  }
  function renderFacts(state){
    const c=state.context,signature=JSON.stringify([c?.applicationSessionId,c?.profileId,c?.jobId,c?.resumeId,c?.resumeVersion,state.resume,state.contact]);if(signature===lastFacts)return;lastFacts=signature;
    currentSkills=state.resume?.skills||[];
    const copyButton=(text,label)=>{const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent='Copy';button.title='Copy '+label.toLowerCase();button.setAttribute('aria-label',button.title);button.onclick=()=>copyValue(text,label);return button;};
    node('sqc-education-history').replaceChildren(...(state.resume?.education||[]).map(entry=>{
      const item=document.createElement('li'),value=[entry.school,entry.degree,entry.major,entry.graduationYear].filter(Boolean).join(' | ');
      item.textContent=value;item.append(copyButton(value,'Education'));return item;
    }));
    const assignButton=(text,label)=>{const button=document.createElement('button');button.type='button';button.className='quiet assign-field';button.textContent='Assign to field';button.onclick=()=>assignAnswerToField(text,label);return button;};
    node('sqc-work-history').replaceChildren(...(state.resume?.workHistory||[]).map(entry=>{
      const item=document.createElement('li'),details=document.createElement('details'),summary=document.createElement('summary'),title=document.createElement('strong'),meta=document.createElement('span'),body=document.createElement('p');
      const dates=entry.startDate+' - '+(entry.current?'Present':entry.endDate||'');title.textContent=entry.title||'Employment';meta.textContent=entry.company+' | '+dates;summary.append(title,meta);body.textContent=entry.description||'No description parsed for this entry.';details.append(summary,body,copyButton([entry.title,entry.company,dates,entry.description].filter(Boolean).join('\n'),'Experience'));item.append(details);return item;
    }));
    put('sqc-resume-skills',currentSkills.length?currentSkills.length+' skills from this resume':'No explicit skills section parsed. The full resume text still grounds answers.');
    node('skill-chips').replaceChildren(...currentSkills.slice(0,80).map(value=>{const chip=document.createElement('span');chip.textContent=value;return chip;}));
    const labels={fullName:'Name',email:'Email',phone:'Phone',address:'Street',city:'City',state:'State',zip:'ZIP',location:'Location',linkedin:'LinkedIn',graduationYear:'Graduation year'};
    node('contact-copy-list').replaceChildren(...Object.entries(state.contact||{}).map(([name,value])=>{
      const text=typeof value==='object'?Object.values(value).filter(v=>typeof v==='string').join(', '):String(value);
      const row=document.createElement('div'),label=document.createElement('span'),content=document.createElement('strong');label.textContent=labels[name]||name;content.textContent=text;row.append(label,content,copyButton(text,labels[name]||name),assignButton(text,labels[name]||name));return row;
    }));
  }
  document.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>selectTab(button.dataset.tab));
    button.addEventListener('keydown',event=>{const tabs=['overview','resume','qa'],i=tabs.indexOf(button.dataset.tab);let next;if(event.key==='ArrowRight')next=tabs[(i+1)%3];if(event.key==='ArrowLeft')next=tabs[(i+2)%3];if(event.key==='Home')next=tabs[0];if(event.key==='End')next=tabs[2];if(next){event.preventDefault();selectTab(next,true);}});
  });
  function applyPolicy(policy){
    if(!policy)return;window.SQCDeploymentPolicy=policy;
    const toggles={'auto-detect':policy.questions.autoDetect,'apply-choices':policy.questions.applyChoices,'apply-text':policy.questions.applyText,'attach-resume':policy.resume.autoAttach};
    for(const [id,value] of Object.entries(toggles)){node(id).checked=value;node(id).disabled=true;node(id).dataset.deploymentLocked='true';}
    for(const id of ['resume-file','save-resume']){node(id).disabled=!policy.resume.allowUpload;if(!policy.resume.allowUpload)node(id).dataset.deploymentLocked='true';else delete node(id).dataset.deploymentLocked;}
    node('defaults-section').hidden=true;
  }
  function stopPending(){if(activeRequest){const id=activeRequest;activeRequest=null;send({type:'QA_CANCEL',requestId:id}).catch(()=>{});busy(false);}}
  async function resetContext(){
    put('portal-resume-summary','');
    contextReady=false;canAutofill=false;window.SQCJobReady=false;node('sqc-context').hidden=true;node('job-waiting').hidden=false;
    node('qa-tools').hidden=true;node('qa-unavailable').hidden=false;node('sqc-resume-facts').hidden=true;
    node('duplicate-notice').hidden=true;node('original-filename').textContent='No job resume loaded';put('original-file-status','Open a tracked job to load its original resume.');
    node('original-file-panel').hidden=true;
    node('portal-state').hidden=true;
    node('attach-resume-now').disabled=true;node('download-named-resume').disabled=true;
    node('resume-edit').disabled=true;node('resume-section').hidden=true;node('send').disabled=true;node('detect-questions').disabled=true;
    node('resume-tab-dot').hidden=true;put('resume-overview','Open a verified job to load its resume and application context.');
    if(lastContext){stopPending();lastContext='';lastPage='';liveFields=[];queuedQuestions=[];renderQuestions();clearAnswers();questionSources.clear();renderResume(null);}
  }
  function renderAccount(state){
    const integration=state.integration||{},connected=Boolean(integration.applier)&&!integration.passwordChangeRequired;
    node('account-gate').hidden=connected;node('connected-workspace').hidden=!connected;
    if(!connected){
      const stage=integration.passwordChangeRequired?'password':!integration.apiOrigin?'endpoint':'signin';
      if(authStage!==stage){authStage=stage;for(const name of ['endpoint','signin','password'])node(name+'-form').hidden=name!==stage;
        put('auth-title',stage==='endpoint'?'Connect your workspace':stage==='password'?'Set your new password':'Welcome back');
        put('auth-description',stage==='endpoint'?'Enter your team\'s ApplyFlow API URL once.':stage==='password'?'Update your temporary password to continue.':'Sign in with your ApplyFlow account to sync your assigned profiles.');
        if(stage==='endpoint')node('api-origin').value=integration.apiOrigin||'https://applyflow-api.jhproit.com';
        put('account-feedback',integration.message||'');
      }
      return false;
    }
    authStage='';put('account-name',integration.applier.name);put('account-email',integration.applier.email);
    const profiles=state.profiles?.length?state.profiles:state.accountProfile?[state.accountProfile]:[];
    const signature=JSON.stringify(profiles.map(profile=>[profile.id,profile.fullName]));
    if(signature!==lastAccountRender){lastAccountRender=signature;node('assigned-profiles').replaceChildren(...profiles.map(profile=>{const card=document.createElement('article');card.className='profile-card';const avatar=document.createElement('span');avatar.className='profile-avatar';avatar.textContent=String(profile.fullName||'?').split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();const body=document.createElement('div'),name=document.createElement('strong'),caption=document.createElement('p');name.textContent=profile.fullName||'Assigned candidate';caption.textContent='Synced from ApplyFlow';body.append(name,caption);card.append(avatar,body);return card;}));}
    put('profiles-feedback',integration.accountVerified===false?'Connection interrupted. Showing your last synced profiles; application actions are paused.':profiles.length?'':'ApplyFlow returned no active profile assignment. Refresh assignments or ask your administrator to check this account.');
    return true;
  }
  function refresh(force=false){
    if(refreshTask)return force||refreshRevision!==accountRevision?refreshTask.then(()=>refresh(force)):refreshTask;
    refreshRevision=accountRevision;const task=readWorkspace(force);refreshTask=task;
    const release=()=>{if(refreshTask===task)refreshTask=null;};task.then(release,release);
    return task;
  }
  async function readWorkspace(force=false){
    if(refreshing)return;refreshing=true;
    const revision=accountRevision;
    if(force||!lastContext){put('sync-indicator',force?'Syncing':'Checking');node('sync-indicator').dataset.state='loading';}
    if(!contextReady&&!node('connected-workspace').hidden){node('job-verification').hidden=false;node('job-verification').setAttribute('aria-busy','true');put('job-verification-title','Verifying your job');put('job-verification-message','Checking the active tab with ApplyFlow...');}
    try{
      const state=await send({type:'SQC_SIDEBAR_SNAPSHOT',force});
      if(revision!==accountRevision)return null;
      if(!state?.success)throw new Error(state?.error||'Could not load your workspace. Try again.');
      applyPolicy(state.policy);
      const signedIn=renderAccount(state);
      if(signedIn&&!state.context&&lastContext&&lastPage===state.tabId+':'+state.url){
        window.SQCJobReady=false;canAutofill=false;node('sqc-autofill').disabled=true;node('fill-resume-history').disabled=true;node('send').disabled=true;node('attach-resume-now').disabled=true;
        node('job-verification').hidden=false;put('job-verification-title','Application verification paused');
        put('job-verification-message',verificationMessage(state,'Waiting for ApplyFlow verification.')+(state.jobDiagnostic?.tracking?.retained?' Job and candidate tracking is retained.':'')+(state.jobDiagnostic?.recoveryAttempted?' The automatic session refresh has already been attempted.':''));
        jobDiagnostic=JSON.stringify({extensionVersion:chrome.runtime.getManifest?.().version||'development',message:state.jobError||state.integration.message,...state.jobDiagnostic},null,2);put('job-verification-diagnostic',jobDiagnostic);
        put('sync-indicator',state.integration.accountVerified===false?'Connection interrupted':'Verification paused');node('sync-indicator').dataset.state='error';node('sync-indicator').title=state.jobError||state.integration.message||'Waiting for ApplyFlow verification. Your selected resume and answers are retained.';
        nextRefreshAt=Date.now()+Math.min(60000,5000*2**Math.min(++refreshFailures,4));return state;
      }
      refreshFailures=0;nextRefreshAt=0;
      if(!signedIn||!state.context){
        await resetContext();const message=state.jobError?verificationMessage(state,'Waiting for ApplyFlow verification.'):'Open a job from ApplyFlow. We\'ll check its status and load its resume automatically.';
        put('job-waiting-message',message);put('resume-overview',message);put('qa-unavailable',message);
        node('resume-edit').textContent='Waiting for job verification';node('job-verification').hidden=!signedIn;
        put('job-verification-title',state.jobError?'Job verification paused':'Waiting for a job');put('job-verification-message',message);
        jobDiagnostic=JSON.stringify({extensionVersion:chrome.runtime.getManifest?.().version||'development',message,...state.jobDiagnostic},null,2);
        put('target-candidate-summary',state.jobDiagnostic?.profile?.fullName?'Verifying for '+state.jobDiagnostic.profile.fullName:'Candidate not yet verified for this job');
        put('job-verification-diagnostic',jobDiagnostic);
        put('sync-indicator',!signedIn?'Sign in':state.integration.accountVerified===false?'Reconnecting':state.jobError?'Job not verified':'Account synced');
        node('sync-indicator').dataset.state=state.jobError||state.integration.accountVerified===false?'error':'idle';node('sync-indicator').title=message;return state;
      }
      node('job-verification').hidden=true;node('original-file-panel').hidden=false;
      contextReady=true;window.SQCJobReady=true;node('sqc-context').hidden=false;node('job-waiting').hidden=true;node('resume-edit').disabled=false;node('resume-section').hidden=false;
      node('qa-tools').hidden=false;node('qa-unavailable').hidden=true;node('sqc-resume-facts').hidden=false;
      put('sqc-resume-policy',state.resumeMode==='fixed'?'Your approved candidate resume is used automatically. A replacement is optional.':'This job uses its own approved or uploaded tailored resume.');
      renderFacts(state);resumeReady=Boolean(state.resume?.ready);
      put('candidate-location-source',state.contact?.city?'Candidate city: '+state.contact.city+' · '+(state.contactSources?.city==='applyflow_base_context'?'ApplyFlow base context':'ApplyFlow profile'):'No usable candidate city was supplied by ApplyFlow. An entered city cannot be compared with missing profile data.');
      const originalName=state.resume?.filename||'',extension=originalName.match(/\.(pdf|docx|txt)$/i)?.[0]||'';
      put('original-filename',state.resume?.hasOriginal?SQCQAResume.normalizedName(state.profile.fullName)+extension:'Original file needed');
      put('original-file-status',state.resume?.fileError||state.resume?.hasOriginal?(state.resume?.fileError||((state.resume.source==='sqc_upload'?'Your upload':'From ApplyFlow')+' | Original '+extension.replace('.','').toUpperCase()+' | Filename normalized; file bytes unchanged.')):'Resume text may be available, but no original attachment has been loaded.');
      node('attach-resume-now').disabled=!state.resume?.hasOriginal;node('download-named-resume').disabled=!state.resume?.hasOriginal;
      const c=state.context,binding=JSON.stringify([c.applicationSessionId,c.profileId,c.profileVersion,c.jobId,c.resumeId,c.resumeVersion]);
      if(binding!==lastContext){
        if(lastContext){stopPending();put('portal-resume-summary','');attachedPortalResume=null;liveFields=[];queuedQuestions=[];renderQuestions();clearAnswers();}
        lastContext=binding;await resumeAction('QA_RESUME_STATE');
      }
      node('candidate-name').readOnly=true;node('candidate-name').value=state.profile.fullName;
      put('target-candidate-summary','Applying for '+state.profile.fullName);
      put('resume-candidate','FOR '+state.profile.fullName.toUpperCase());
      put('sqc-job-title',state.job?.jobTitle||state.job?.title||'Assigned application');put('sqc-company',state.job?.company);
      put('sqc-candidate',state.profile.fullName);put('sqc-applier',state.applier?.name);put('sqc-job-id',c.jobId);
      const page=state.page?.context?.applicationSessionId===c.applicationSessionId&&state.page.context.jobId===c.jobId&&state.page.context.profileId===c.profileId?state.page:null;
      renderEvidence(page);
      if(page?.portalResume){
        const attached=page.portalResume.filename;
        put('portal-resume-summary',attached?'Resume attached on job site: '+attached:'Resume is not attached on this job page.');
        put('portal-upload-state',attached?'On the job site: '+attached+'.':'No attached resume is visible in the portal Resume / CV section.');
      }
      const completed=[page?.remoteStatus,c.status,state.job?.currentStatus].some(value=>['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(String(value||'').toUpperCase()));
      const duplicate=state.duplicate?.confirmed===true&&!page?.deliveryAcknowledged;
      const portal=state.portalAvailability,portalPaused=portal?.blocking===true;
      node('portal-state').hidden=!portalPaused;
      put('portal-state-title',portal?.unavailable?'This job is no longer available':portal?.state==='ACCESS_REQUIRED'?'Portal access needed':'Portal needs a recheck');
      put('portal-state-message',portal?.message);
      put('portal-state-sync',portal?.syncStatus==='ACKNOWLEDGED'?'Unavailable status acknowledged by ApplyFlow.':portal?.syncStatus==='PROTECTED_APPLIED'?'Existing applied record protected; no downgrade sent.':portal?.syncStatus==='FAILED'?'Could not sync the unavailable status: '+portal.error:portal?.unavailable?'Syncing the confirmed unavailable status to ApplyFlow...':'Not marked closed in ApplyFlow.');
      const delivery=page?.submissionSync,portalSubmitted=Boolean(delivery),syncFailed=delivery?.phase==='FAILED';
      const submitted=completed||duplicate||page?.deliveryAcknowledged===true||portalSubmitted,errors=submitted?[]:page?.validation?.errors||[];
      node('submission-sync-status').hidden=!delivery||completed;node('retry-submission-sync').hidden=!syncFailed||completed;
      put('submission-sync-status',syncFailed?'The employer confirmed receipt, but ApplyFlow sync failed: '+delivery.error+(delivery.nextRetryAt?' Retrying automatically.':' Use Retry submission sync.'):'The employer confirmed receipt. Sending the confirmation, screenshots and application answers to ApplyFlow...');
      put('sqc-lifecycle',duplicate?'Already applied':completed?'Completed and synced':submitted?syncFailed?'Submitted - sync failed':'Submitted - ApplyFlow syncing':portalPaused?portal.unavailable?'Job unavailable':'Portal paused':!resumeReady?'Resume needed':errors.length?'Needs attention':page?.hasFormData||state.job?.currentStatus==='IN_PROGRESS'?'In progress':'Ready to apply');
      put('live-sync-note',page?.liveSync?.status==='IN_PROGRESS'?'Form progress synced to ApplyFlow at '+new Date(page.liveSync.at).toLocaleTimeString():page?.liveSync?.status==='SYNCING'?'Syncing entered form data to ApplyFlow...':page?.liveSync?.status==='FAILED'?'Live sync needs a retry: '+page.liveSync.message:page?.hasFormData?'Form data detected. Waiting for the live sync acknowledgement.':'No form data entered yet. ApplyFlow remains pending.');
      node('duplicate-notice').hidden=!duplicate;node('already-applied').hidden=!duplicate||state.duplicateAcknowledged===true;node('duplicate-acknowledged').hidden=!state.duplicateAcknowledged;
      put('duplicate-message',duplicate?(state.profile.fullName+' already has an application for '+state.duplicate.title+' at '+state.duplicate.company+(state.duplicate.applierName?' (submitted by '+state.duplicate.applierName+')':'')+'. ApplyFlow confirmed this record.'): '');
      for(const id of ['account','job','resume','form'])node('step-'+id).dataset.ready=String(id==='account'||id==='job'||id==='resume'&&resumeReady||id==='form'&&Boolean(page));
      node('sqc-lifecycle').dataset.state=completed?'completed':errors.length?'blocked':'active';
      put('sqc-fields',page?page.totalFields+(submitted?' fields captured':' application fields'):'Connecting to the portal');
      put('sqc-context-message',completed?'ApplyFlow reports this application as submitted.':submitted?'The employer confirmed your application was received. '+(syncFailed?'ApplyFlow sync needs a retry.':'Waiting for ApplyFlow acknowledgement.') :!state.resume?.ready?'Add this job\'s resume in the Resume tab to prepare autofill and answers.':!page?'Connecting protection checks to this application...':errors.length?'Resolve these issues before submitting on the employer portal.':'Your application is being tracked as you move through the steps.');
      renderIssues(errors);
      canAutofill=!submitted&&!portalPaused&&Boolean(page);node('sqc-autofill').disabled=!canAutofill;node('detect-questions').disabled=submitted||portalPaused;
      node('resume-tab-dot').hidden=Boolean(state.resume?.ready);
      node('resume-edit').disabled=portalPaused||resumeBusy||parsingResume||Boolean(activeRequest)||state.policy?.resume.allowUpload===false;node('resume-edit').hidden=portalPaused;node('resume-edit').textContent=parsingResume?'Reading resume...':resumeBusy?'Saving resume...':resumeReady?'Replace resume':'Upload job resume';
      node('clear-resume').hidden=state.resume?.source!=='sqc_upload';
      node('fill-ready-answers').disabled=submitted||Boolean(activeRequest)||!answers.some(item=>questionSources.has(item.id)&&!item.needsInput&&!item.error&&(!item.draft||item.reviewed)&&choiceStates.get(item.id)!=='applied');
      if(submitted||portalPaused){node('attach-resume-now').disabled=true;node('fill-ready-answers').disabled=true;}
      put('resume-overview',state.resume?.ready?'Resume ready for '+state.profile.fullName+'. '+(state.resume.workHistory?.length||0)+' employment entries, '+(state.resume.education?.length||0)+' education entries and '+(state.resume.skills?.length||0)+' skills loaded.':'No approved resume is ready for this job. Upload it here; we\'ll save its text, skills and experience for this application.');
      node('fill-resume-history').disabled=!state.resume?.ready||submitted||portalPaused;
      if(portalPaused){put('resume-overview',portal.message);node('resume-section').hidden=true;node('resume-section').open=false;}
      if(!portalPaused&&!state.resume?.ready&&promptedJob!==c.applicationSessionId&&!submitted){promptedJob=c.applicationSessionId;returnTab=currentTab;selectTab('resume');feedback('Job verified. Add its resume to continue.');}
      const pageKey=state.tabId+':'+state.url;
      if(pageKey!==lastPage){node('account-panel').open=false;if(lastPage){stopPending();queuedQuestions=queuedQuestions.filter(q=>!q.source);renderQuestions();clearAnswers();questionSources.clear();}lastPage=pageKey;if(!submitted)detectQuestions();}
      window.SQCJobReady=!submitted&&!portalPaused;put('sync-indicator',syncFailed&&!completed?'Submission sync failed':portalPaused?portal.unavailable?'Job unavailable':'Portal paused':submitted&&!completed&&!duplicate?'Syncing status':'Synced');node('sync-indicator').dataset.state=portalPaused||syncFailed&&!completed?'error':'ready';node('sync-indicator').title='Last checked with ApplyFlow at '+new Date().toLocaleTimeString();
      updateGenerateState();return state;
    }catch(error){if(force||!refreshFailures)feedback(error.message,true);refreshFailures++;nextRefreshAt=Date.now()+Math.min(60000,5000*2**Math.min(refreshFailures,4));window.SQCJobReady=false;put('account-feedback',error.message);put('sync-indicator','Retry sync');node('sync-indicator').dataset.state='error';node('send').disabled=true;node('sqc-autofill').disabled=true;return null;}
    finally{refreshing=false;node('job-verification').removeAttribute('aria-busy');}
  }
  async function perform(button,label,work){
    if(working)return;working=true;const original=button.textContent;button.disabled=true;button.textContent=label;button.setAttribute('aria-busy','true');
    try{await work();}catch(error){feedback(error.message||'The request failed. Please try again.',true);put('account-feedback',error.message);}
    finally{working=false;button.textContent=original;button.disabled=button.id==='sqc-autofill'?!canAutofill:false;button.removeAttribute('aria-busy');}
  }
  async function request(message){const result=await send(message);if(!result?.success)throw new Error(result?.error||result?.integration?.message||'ApplyFlow could not complete this request.');return result;}
  function authForm(id,type,fields,label){node(id).addEventListener('submit',event=>{event.preventDefault();perform(event.submitter||node(id).querySelector('[type=submit]'),label,async()=>{
    accountRevision++;
    put('account-feedback',label);const result=await request({type,...fields()});
    const state=result.integration?.state;if(['INVALID_CREDENTIALS','UNAVAILABLE','FORBIDDEN','CONTEXT_MISMATCH','INVALID_RESPONSE','HTTP_ROUTE_MISSING'].includes(state))throw new Error(result.integration.message);
    if(type==='SQC_LOGIN'&&(!result.integration?.applier||result.integration.accountVerified===false))throw new Error(result.integration?.message||'ApplyFlow did not confirm your account session.');
    for(const input of node(id).querySelectorAll('input[type=password]'))input.value='';authStage='';const next=await refresh();
    if(type==='SQC_LOGIN'&&(!next?.integration?.applier||next.integration.accountVerified===false))throw new Error(next?.integration?.message||'ApplyFlow did not retain the sign-in session. Check its extension session-cookie configuration.');
    feedback(type==='SQC_LOGIN'?'Signed in. Your profile assignments are synced.':type==='SQC_CONNECT'?'Workspace connected. Sign in to continue.':'Password updated.');
  });});}
  authForm('endpoint-form','SQC_CONNECT',()=>({apiOrigin:node('api-origin').value.trim(),requireLogin:true}),'Connecting...');
  authForm('signin-form','SQC_LOGIN',()=>({email:node('login-email').value.trim(),password:node('login-password').value}),'Signing in...');
  authForm('password-form','SQC_CHANGE_PASSWORD',()=>({currentPassword:node('current-password').value,newPassword:node('new-password').value}),'Updating...');
  node('reveal-password').addEventListener('click',()=>{const visible=node('login-password').type==='password';node('login-password').type=visible?'text':'password';node('reveal-password').textContent=visible?'Hide':'Show';node('reveal-password').setAttribute('aria-pressed',String(visible));});
  node('change-endpoint').addEventListener('click',()=>{authStage='endpoint';node('signin-form').hidden=true;node('endpoint-form').hidden=false;put('auth-title','Connect your workspace');node('api-origin').focus();});
  node('account-retry').addEventListener('click',event=>perform(event.currentTarget,'Checking...',async()=>{authStage='';const state=await refresh(true);if(state)feedback(state.integration?.applier?'Account synced from ApplyFlow.':state.integration?.message||'Connection checked. Sign in to continue.');}));
  node('refresh-profiles').addEventListener('click',event=>perform(event.currentTarget,'Syncing...',async()=>{const state=await refresh(true);if(state?.integration?.applier)feedback(state.profiles?.length?'Profile assignments synced from ApplyFlow.':'ApplyFlow returned no active profile assignments.');}));
  node('sign-out').addEventListener('click',event=>perform(event.currentTarget,'Signing out...',async()=>{accountRevision++;await request({type:'SQC_LOGOUT'});authStage='';await refresh();feedback('Signed out.');}));
  node('sqc-refresh').addEventListener('click',event=>perform(event.currentTarget,'Checking...',async()=>{const state=await refresh(true);if(state?.context)feedback('Application status and resume checked.');else if(state)throw new Error(state.jobError||state.integration?.message||'This page is not a verified application.');}));
  node('sqc-autofill').addEventListener('click',event=>perform(event.currentTarget,'Filling...',async()=>{const result=await request({type:'SQC_SIDEBAR_ACTION',action:'autofill'});feedback(result.filledCount===0?'No empty supported fields were filled. Existing entries are preserved; copy details for unsupported controls.':Number.isInteger(result.filledCount)?result.filledCount+' fields filled. Review the page before continuing.':'Form checked. Review the populated fields before continuing.');await refresh();}));
  node('capture-step').addEventListener('click',event=>perform(event.currentTarget,'Capturing...',async()=>{const result=await request({type:'SQC_SIDEBAR_ACTION',action:'screenshot'});renderEvidence(result);feedback('Application screenshot captured. Sync status appears beside each step.');}));
  node('retry-submission-sync').addEventListener('click',event=>perform(event.currentTarget,'Retrying...',async()=>{await request({type:'SQC_SIDEBAR_ACTION',action:'retrySubmission'});await refresh();}));
  node('resume-edit').addEventListener('click',()=>{node('resume-section').open=true;node('resume-file').click();});
  node('fill-resume-history').addEventListener('click',event=>perform(event.currentTarget,'Filling history...',async()=>{
    put('history-feedback','Matching parsed resume entries to this application...');
    try{const result=await request({type:'SQC_SIDEBAR_ACTION',action:'history'}),history=result.historyResult||{};
      put('history-feedback',(result.filledCount||0)+' fields filled. '+(history.review?.length?history.review.join(' '):'Review the populated dates and required portal fields before continuing.'));await refresh();
    }catch(error){put('history-feedback',error.message);throw error;}
  }));
  node('copy-resume-text').addEventListener('click',()=>copyValue(node('resume-text').value,'Resume text'));
  node('copy-skills').addEventListener('click',()=>copyValue(currentSkills.join(', '),'Skills'));
  node('copy-job-diagnostic').addEventListener('click',()=>copyValue(jobDiagnostic,'Verification details'));
  node('retry-job-verification').addEventListener('click',event=>perform(event.currentTarget,'Verifying...',async()=>{const state=await refresh(true);if(state?.context)feedback('Job verified. Application context is ready.');else if(state)throw new Error(state.jobError||'ApplyFlow has not verified the current job.');}));
  node('fill-ready-answers').addEventListener('click',event=>perform(event.currentTarget,'Filling...',async()=>{
    const ready=answers.filter(item=>questionSources.has(item.id)&&!item.needsInput&&!item.error&&(!item.draft||item.reviewed)&&choiceStates.get(item.id)!=='applied');
    if(!window.SQCJobReady)throw new Error('Open an active verified application first.');
    if(!ready.length)throw new Error('No ready answers to fill. Generate answers or review the remaining drafts.');
    for(const item of ready)await applyChoice(item,true);const count=ready.filter(item=>choiceStates.get(item.id)==='applied').length;feedback(count+' of '+ready.length+' ready answers filled. Review the page before continuing.');
  }));
  node('already-applied').addEventListener('click',event=>perform(event.currentTarget,'Checking record...',async()=>{await request({type:'SQC_SIDEBAR_ACTION',action:'alreadyApplied'});feedback('Existing application acknowledged. No new submission was created.');await refresh();}));
  node('sqc-setup').addEventListener('click',()=>{selectTab('overview');node('account-name').scrollIntoView({block:'center'});feedback('Your connected account and assigned profiles are shown above.');});
  for(const id of ['sqc-settings','account-settings'])node(id).addEventListener('click',event=>perform(event.currentTarget,'Opening...',async()=>{await request({type:'OPEN_OPTIONS'});feedback('Settings opened in a browser tab.');}));
  window.addEventListener('sqc-resume-saved',()=>{node('resume-section').open=false;feedback('Resume saved. Skills and experience are ready for this job.');selectTab(returnTab==='resume'?'overview':returnTab);refresh();});
  window.addEventListener('sqc-portal-uploads',event=>{
    const uploads=event.detail||[],attached=uploads.find(item=>item.filename);
    put('portal-resume-summary',attached?'Resume attached on job site: '+attached.filename:uploads.length?'Resume is not attached on this job page.':'No resume upload control on this step.');
    attachedPortalResume=attached||null;node('use-portal-resume').hidden=!attached;
    put('portal-upload-state',attached?'On the job site: '+attached.filename+'.':uploads.length?'The job site has an empty Resume / CV control ready for attachment.':'No accessible Resume / CV control detected yet. Open the portal Attach step, or use Download original for manual upload.');
  });
  node('use-portal-resume').addEventListener('click',event=>perform(event.currentTarget,'Reading original...',async()=>{
    if(!attachedPortalResume)throw new Error('Detect the attached resume again.');
    const item=attachedPortalResume,version=selectedResume?.version,name=node('candidate-name').value;
    const result=await request({type:'QA_READ_PORTAL_RESUME',item}),file=result.file;
    const bytes=Uint8Array.from(atob(file.dataUrl.split(',')[1]),char=>char.charCodeAt(0));
    const original=new File([bytes],file.filename,{type:file.mimeType}),text=await ResumeDocumentParser.extractTextFromFile(original);
    if(selectedResume?.version!==version)throw new Error('The job changed while reading the attachment. Try again for the current candidate.');
    if(!await resumeAction('QA_RESUME_SAVE',{resume:{text,candidateName:name,contextVersion:version,filename:file.filename,file}}))throw new Error(node('resume-status').textContent);
    const normalized=await send({type:'QA_NORMALIZE_PORTAL_RESUME',item});
    if(!normalized?.success){feedback('Resume context saved. The portal filename was not changed: '+(normalized?.error||'use Download original and re-attach manually.'),true);return;}
    feedback('Original portal resume loaded. Filename normalized; document bytes unchanged.');await detectQuestions(true);refresh();
  }));
  document.querySelectorAll('[data-jump],#jump-review,#jump-applied').forEach(button=>button.addEventListener('click',()=>selectTab('qa')));
  function pageChanged(){accountRevision++;window.SQCJobReady=false;canAutofill=false;node('sqc-autofill').disabled=true;node('attach-resume-now').disabled=true;refresh(true);}
  chrome.tabs.onActivated.addListener(info=>{if(info.windowId===windowId&&!working)pageChanged();});
  chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(tab.active&&tab.windowId===windowId&&(change.url||change.status==='complete')&&!working)pageChanged();});
  chrome.runtime.onMessage.addListener(message=>{
    if(message.type==='SQC_SUBMISSION_CHANGED'&&message.windowId===windowId){
      chrome.tabs.query({active:true,windowId}).then(tabs=>{
        if(tabs[0]?.id!==message.tabId)return;
        nextRefreshAt=0;
        if(refreshTask)refreshTask.finally(()=>refresh());else refresh();
      }).catch(()=>{});return;
    }
    if(message.type!=='SQC_JOB_ACTIVATION'||message.windowId!==windowId||working)return;
    if(message.state==='VERIFYING'){
      if(lastContext)return; // Background lease checks must not flash a setup screen.
      put('target-candidate-summary',message.profile?.fullName?'Verifying for '+message.profile.fullName:'Resolving the candidate for this job...');
      node('job-verification').hidden=false;put('job-verification-title',message.profile?.fullName?'Verifying for '+message.profile.fullName:'Resolving the candidate for this job');
      put('job-verification-message',message.profile?.fullName?'Checking this job, assignment and resume with ApplyFlow.':message.profile?.id?'Checking assigned profile '+message.profile.id+' with ApplyFlow.':'Waiting for ApplyFlow to identify the candidate assigned to this tracked job.');
      put('sync-indicator','Verifying job');node('sync-indicator').dataset.state='loading';return;
    }
    refresh();
  });
  let sidebarClosing=false;
  function reportVisibility(){try{sidebarPort?.postMessage({windowId,visible:!sidebarClosing&&document.visibilityState!=='hidden'});}catch(_){}}
  function connectVisibility(){
    if(sidebarClosing||sidebarPort||!Number.isInteger(windowId)||!chrome.runtime.connect)return;
    try{const port=chrome.runtime.connect({name:'sqc-workspace'});sidebarPort=port;port.onDisconnect.addListener(()=>{if(sidebarPort===port)sidebarPort=null;if(!sidebarClosing)setTimeout(connectVisibility,500);});reportVisibility();}catch(_){}
  }
  document.addEventListener('visibilitychange',reportVisibility);
  window.addEventListener('pagehide',()=>{sidebarClosing=true;reportVisibility();});
  window.addEventListener('pageshow',()=>{sidebarClosing=false;connectVisibility();reportVisibility();});
  chrome.windows.getCurrent().then(async browserWindow=>{windowId=browserWindow.id;connectVisibility();try{const result=await send({type:'SQC_SIDEBAR_POLICY'});applyPolicy(result.policy);}catch(error){feedback(error.message,true);}refresh();});
  setInterval(()=>{if(!working&&!resumeBusy&&!parsingResume&&Date.now()>=nextRefreshAt)refresh();},5000);
})();
