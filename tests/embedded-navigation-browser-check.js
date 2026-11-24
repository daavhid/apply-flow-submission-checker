async function runEmbeddedNavigationSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async predicate=>{for(let i=0;i<120;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Embedded navigation fixture did not become ready.');};
  const frame=document.createElement('iframe');frame.src='/tests/fixtures/embedded-careers.html?ashby_jid=selected-posting#application_session_id=app-embed';document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);
  const w=frame.contentWindow,d=w.document,profile={id:'candidate',fullName:'Candidate One',firstName:'Candidate',lastName:'One',email:'candidate@example.com',city:'Miami',resumeReady:true};
  const settings=url=>({integrationMode:'applyflow',verifiedContext:{state:'VERIFIED',applicationSessionId:'app-embed',applierId:'applier',profileAssignmentId:'assignment',profileAssignmentVersion:'1',profileId:'candidate',jobId:'selected-job',expiresAt:Date.now()+60000,verifiedUrls:[url]}});
  const source=await (await fetch('/content/content.js')).text(),start=source.indexOf('  function bindOutboundRedirectTracking()'),end=source.indexOf('  function triggerNativeSubmit(',start);
  let captures=0;
  const bind=w.Function('JobFormExtractor','activeProfile','currentSettings','currentExtractedData','capturePreTransitionSnapshot','capturePageScreenshot','detectCurrentStepLabel',source.slice(start,end)+';return bindOutboundRedirectTracking;')({extractApplyFlowParams:()=>({jobId:'selected-job',profileId:'candidate'})},profile,settings(w.location.href),{},()=>captures++,()=>{},()=> 'Application');bind();
  const original=w.location.href,link=d.getElementById('application-tab'),href=link.getAttribute('href');
  w.JobFormExtractor.restoreSavedForm(profile,settings(w.location.href));check(!d.getElementById('filter-city').value&&!d.getElementById('newsletter-email').value,'Autofill changed the career filter or newsletter');check(w.location.href===original&&w.fixtureResets===0,'Passive activation changed the selected posting URL');
  link.click();check(link.getAttribute('href')===href,'SQC rewrote the employer router fragment');await wait(()=>Boolean(d.getElementById('application-frame')?.contentWindow?.JobFormExtractor));
  const app=d.getElementById('application-frame').contentWindow,ad=app.document;
  for(let pass=0;pass<4;pass++)app.JobFormExtractor.restoreSavedForm(profile,settings(app.location.href));
  check(ad.getElementById('first-name').value==='Candidate'&&ad.getElementById('email').value==='candidate@example.com','Application fields were not filled after delayed iframe load');
  check(!ad.getElementById('application-form').hidden&&app.fakeBlurCount===0&&app.unsafeClicks===0,'Autofill emitted a synthetic dismissal or navigation event');
  check(ad.getElementById('widget-record').value==='portal-owned-id','Autofill overwrote a framework-owned hidden record ID');
  await new Promise(resolve=>setTimeout(resolve,250));check(w.fixtureResets===0&&w.location.href===original&&d.getElementById('application-frame'),'Repeated passes dismissed the selected embedded application');check(captures>0,'Navigation snapshot continuity was removed with link rewriting');
  await new Promise((resolve,reject)=>{const script=ad.createElement('script');script.src='/content/submit-intent.js';script.onload=resolve;script.onerror=reject;ad.head.append(script);});
  const form=ad.getElementById('application-form'),next=ad.createElement('button');next.type='submit';next.textContent='Next →';form.append(next);
  let verified=true,transitions=0,blocked=0,reports=0,snapshots=0;
  const gate={submitInterceptionBound:false,isSubmittingProgrammatically:false,
    submissionIntent:(target,owner,submitEvent)=>app.SQCSubmitIntent.inspect(target,{form:owner,submitEvent}),isQuickApplyTrigger:()=>false,
    hasVerifiedContext:()=>verified,requireVerifiedContext:()=>blocked++,capturePreTransitionSnapshot:()=>snapshots++,capturePageScreenshot:()=>{},detectCurrentStepLabel:()=> 'Experience',
    runExtractionAndValidation:()=>{},currentSettings:{interceptionMode:'active'},currentValidation:{isValid:false,errors:[{rule:'MISSING_RESUME',message:'A later step needs a resume'}]},
    currentExtractedData:{total_fields_count:4},SubmissionHUD:{showBlockingModal:()=>blocked++,showToast:()=>{},setQuickApplyStatus:()=>{}},
    logPayloadToBackend:()=>reports++,startQuickApplyVerificationWatcher:()=>reports++};
  const bindStart=source.indexOf('  function bindSubmitInterception()'),bindEnd=source.indexOf('  // Active Quick Apply Verification Watcher',bindStart);
  app.Function('scope','with(scope){'+source.slice(bindStart,bindEnd)+';return bindSubmitInterception;}')(gate)();
  form.addEventListener('submit',event=>{event.preventDefault();transitions++;});
  for(const lease of [true,false]){verified=lease;next.click();}
  check(transitions===2&&blocked===0,'SQC blocked native Next with a later-step validation error or expired lease');
  next.textContent='→';next.setAttribute('aria-label','Next step');next.click();
  check(transitions===3&&blocked===0,'An accessible icon-only Next button was blocked');
  next.type='button';next.textContent='Continue to review';next.addEventListener('click',()=>form.requestSubmit());next.click();
  check(transitions===4&&blocked===0,'A Next widget using requestSubmit without a submitter was blocked');
  verified=true;const final=ad.createElement('button');final.type='submit';final.textContent='Submit application';form.append(final);final.click();
  check(blocked===1&&transitions===4,'Final submission validation was bypassed while allowing intermediate navigation');
  check(reports===0&&snapshots>0,'A Next transition reported final completion or lost tracking snapshots');
  frame.remove();return 'Passed: delayed embed remains intact, intermediate click/submit navigation stays native with invalid or expired context, and final submission stays protected.';
}
