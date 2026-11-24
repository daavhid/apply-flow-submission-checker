/* Bind the unified sidebar to SQC's active tab, assignment and resume. */
(function(root){
  'use strict';
  const key=c=>JSON.stringify([c.applicationSessionId,c.applierId,c.profileId,c.profileVersion,c.jobId,c.jobVersion,c.resumeId,c.resumeVersion,c.profileAssignmentId,c.profileAssignmentVersion]);
  function create({chrome,session,policy=root.SQCContextPolicy,availability}){
    const ui={url:chrome.runtime.getURL('sidebar/sidebar.html')};
    const announced=new Map();
    const statusChecks=new Map();
    const preparedPages=new Set();
    function forWindow(windowId){
      let deliveryFrame=null;
      async function context(force=false){
        const [tab]=await chrome.tabs.query({active:true,...(Number.isInteger(windowId)?{windowId}:{lastFocusedWindow:true})});
        if(!tab?.id||!/^https?:/.test(tab.url||''))throw new Error('Open your assigned job application tab.');
        const account=await session.handle({type:'GET_CONFIG'},ui);
        if(!account?.integration?.applier||account.integration.passwordChangeRequired||account.integration.accountVerified===false)throw Object.assign(new Error(account?.integration?.message||'Sign in to sync your assigned profiles.'),{account:account?.integration});
        if(new URL(tab.url).origin===account.integration.apiOrigin)throw new Error('Your account is connected. Open the employer job page to load its application context.');
        const cfg=await session.handle({type:'GET_CONFIG',tabId:tab.id,force},ui);
        const targetId=policy?.launchHints(tab.url)?.profileId||cfg?.integration?.tracking?.profileId||cfg?.integration?.verificationRequest?.profileId,targetProfile=account.profiles?.find(profile=>profile.id===targetId);
        const c=cfg?.settings?.verifiedContext;
        if(!c)throw Object.assign(new Error(cfg?.integration?.message||'Verify this job assignment in ApplyFlow first.'),{account:cfg?.integration,
          diagnostic:{state:cfg?.integration?.state||'UNAVAILABLE',path:cfg?.integration?.path||'/api/sqc/application-context',httpStatus:cfg?.integration?.httpStatus,apiOrigin:cfg?.integration?.apiOrigin,
            backendCode:cfg?.integration?.backendCode,recoveryAttempted:cfg?.integration?.recoveryAttempted===true,nextRecoveryAt:cfg?.integration?.nextRecoveryAt,
            expectedVersions:cfg?.integration?.expectedVersions,currentVersions:cfg?.integration?.currentVersions,tracking:cfg?.integration?.tracking,verificationRequest:cfg?.integration?.verificationRequest,
            jobQuery:Object.fromEntries(['ashby_jid','gh_jid','jobId','job_id','reqId'].filter(name=>new URL(tab.url).searchParams.has(name)).map(name=>[name,new URL(tab.url).searchParams.get(name)])),
            fields:cfg?.integration?.validationFields||[],profile:targetProfile?{id:targetProfile.id,fullName:targetProfile.fullName}:targetId?{id:targetId}:null,page:new URL(tab.url).origin+new URL(tab.url).pathname,checkedAt:new Date().toISOString()}});
        const announcement=tab.url+':'+key(c);
        if(announced.get(tab.id)!==announcement){announced.set(tab.id,announcement);chrome.tabs.sendMessage(tab.id,{type:'SQC_CONTEXT_AVAILABLE'},{frameId:0}).catch(()=>{});}
        return {tab,c,cfg,profile:cfg.activeProfile};
      }
      function resume(value){
        const {c,profile:p}=value;
        const ready=p.resumeReady===undefined?p.resumeIsTailored===true:p.resumeReady;
        return {source:p.resumeSource||'applyflow',text:ready?p.resumeText||'':'',filename:ready?p.resumeFilename||'Assigned resume':'No job resume selected',candidateName:p.fullName,
          profileFacts:Object.fromEntries(['fullName','firstName','lastName','email','phone','location','address','linkedin','workAuth','education','compensation'].filter(name=>p[name]!==undefined).map(name=>[name,p[name]])),
          workHistory:p.resumeContext?.workHistory||[],education:p.resumeContext?.education||[],skills:p.primaryStackKeywords||[],
          version:'sqc:'+key({...c,jobVersion:undefined}),contextRevision:'sqc:'+key(c),ready,
          ...(ready&&p.resumeBase64?{file:{managed:true}}:{})};
      }
      const snapshot=async()=>resume(await context());
      // Verification failure must never masquerade as deletion of a saved file.
      const state=async()=>({resume:await snapshot()});
      async function save(input){
        const current=await context(true);
        if(input?.contextVersion&&input.contextVersion!==resume(current).version)throw new Error('The application changed while reading the resume. Select the file again for this job.');
        if(!input?.file){
          if(input?.text?.trim()!==current.profile.resumeText?.trim())throw new Error('Upload the original tailored file to update this assigned application’s resume.');
          return {resume:resume(current)};
        }
        const extension=input.file.filename?.match(/\.(pdf|docx|txt)$/i)?.[0]?.toLowerCase();
        if(!extension)throw new Error('Upload an original PDF, DOCX or TXT resume.');
        const filename=root.SQCQAResume.normalizedName(current.profile.fullName)+extension;
        const result=await session.handle({type:'SQC_SET_LOCAL_RESUME',context:current.c,
          resume:{filename,text:input.text,dataUrl:input.file.dataUrl,confirmed:true}}, {url:current.tab.url,tab:current.tab});
        if(!result?.success)throw new Error(result?.error||'The tailored resume could not be saved for this application.');
        return {resume:await snapshot()};
      }
      async function clear(){const current=await context(true);const result=await session.handle({type:'SQC_CLEAR_LOCAL_RESUME',context:current.c},{url:current.tab.url,tab:current.tab});if(!result?.success)throw new Error(result?.error||'The local resume could not be removed.');return {resume:await snapshot()};}
      async function assertCurrent(previous){const next=resume(await context(true));if(next.version!==previous.version||previous.contextRevision&&next.contextRevision!==previous.contextRevision)throw new Error('The job, assignment or resume changed. Request fresh answers.');}
      async function attachment(version){
        const current=await context(true),value=resume(current);
        if(value.version!==version)throw new Error('The application context changed. Refresh before attaching.');
        if(!(current.profile.resumeReady===undefined?current.profile.resumeIsTailored:current.profile.resumeReady)||!current.profile.resumeBase64)throw new Error('Sync or upload the original resume for this application first.');
        const extension=current.profile.resumeFilename?.match(/\.(pdf|docx|txt)$/i)?.[0]?.toLowerCase();
        if(!extension)throw new Error('The assigned original resume has an unsupported format.');
        return {dataUrl:current.profile.resumeBase64,mimeType:current.profile.resumeMimeType||current.profile.resumeBase64.slice(5).split(';')[0],
          filename:root.SQCQAResume.normalizedName(current.profile.fullName)+extension,resumeVersion:version,uploadKey:[current.c.applicationSessionId,current.c.profileId,current.c.jobId,current.c.resumeId,current.c.resumeVersion].join(':')};
      }
      async function verifyPage(url,current){
        if(policy?.matchesContext(url,current.c))return true;
        if(!Array.isArray(current.c.verifiedUrls)||!/^https?:\/\//i.test(url||''))return false;
        const cfg=await session.handle({type:'GET_CONFIG'},{url,tab:current.tab});
        return Boolean(cfg.settings?.verifiedContext&&key(cfg.settings.verifiedContext)===key(current.c));
      }
      async function scan(forms){
        const before=await context(),prepareKey=before.tab.id+':'+before.tab.url+':'+key(before.c);
        if(!preparedPages.has(prepareKey)){preparedPages.add(prepareKey);while(preparedPages.size>100)preparedPages.delete(preparedPages.values().next().value);try{await chrome.tabs.sendMessage(before.tab.id,{type:'SQC_SIDEBAR_PREPARE'});}catch(_){}}
        if(before.cfg.applyFlowContext?.duplicate?.confirmed)return {questions:[],pageKey:before.tab.id+':'+before.tab.url};
        const result=await forms.scan(windowId),after=await context();
        if(before.tab.id!==after.tab.id||key(before.c)!==key(after.c))throw new Error('The application changed during detection. Refresh.');
        const pages=new Map();for(const question of [...result.questions,...(result.uploads||[]),...(result.fields||[])]){const url=question.source?.url;if(!pages.has(url))pages.set(url,await verifyPage(url,after));}
        const scoped=items=>items.filter(q=>pages.get(q.source?.url)).map(q=>({...q,source:{...q.source,contextKey:key(after.c)}}));
        result.questions=scoped(result.questions);result.uploads=scoped(result.uploads||[]);result.fields=scoped(result.fields||[]);return result;
      }
      async function verifyItem(item){const current=await context();if((await availability?.check(current.tab.id,current.cfg))?.blocking)throw new Error('This portal is unavailable or needs an access check. Filling and attachment are paused.');if(current.cfg.applyFlowContext?.duplicate?.confirmed)throw new Error('ApplyFlow already has this application. Filling and attachment are paused.');if(item.source?.tabId!==current.tab.id||item.source?.contextKey!==key(current.c)||!await verifyPage(item.source?.url,current))throw new Error('This answer belongs to an earlier job context. Detect the current page again.');return current;}
      const apply=async(forms,item)=>{await verifyItem(item);return forms.apply(item);};
      const attach=async(forms,item,version)=>{
        const current=await context();
        const uploadIdentity=value=>{try{const parts=JSON.parse(value);if(!Array.isArray(parts)||parts.length!==10)return '';parts[5]=null;return JSON.stringify(parts);}catch(_){return '';}};
        if(item.source?.tabId!==current.tab.id||!item.source?.contextKey||uploadIdentity(item.source.contextKey)!==uploadIdentity(key(current.c)))throw new Error('The candidate, job or original resume changed. Detect this application again before attaching.');
        // A status-only jobVersion update must not strand a valid original file.
        // Re-detect the same document/control, then verify its fresh context.
        const fresh=await scan(forms),target=fresh.uploads.find(upload=>upload.id===item.id&&upload.source.documentId===item.source.documentId&&upload.source.url===item.source.url);
        if(!target)throw new Error('The resume upload control changed. Open the current upload step and try again.');
        await verifyItem(target);const file=await attachment(version);await verifyItem(target);
        const result=await forms.attach({...target,manual:item.manual===true},file);
        if(result.success)chrome.tabs.sendMessage(current.tab.id,{type:'SQC_SIDEBAR_RESUME_READY'}).catch(()=>{});return result;
      };
      const readUpload=async(forms,item)=>{await verifyItem(item);return forms.readUpload(item);};
      async function normalizeUpload(forms,item){const result=await scan(forms),target=result.uploads?.find(upload=>upload.id===item.id&&upload.source.documentId===item.source.documentId);if(!target)throw new Error('The attached resume changed. Detect it again.');const current=await verifyItem(target);return forms.normalizeUpload(target,await attachment(resume(current).version));}
      async function panel(force=false){
        const [activeTab]=await chrome.tabs.query({active:true,...(Number.isInteger(windowId)?{windowId}:{lastFocusedWindow:true})});
        const account=await session.handle({type:'GET_CONFIG',force},ui);
        if(!account?.success)throw new Error(account?.error||'Unable to load your ApplyFlow account.');
        const base={success:true,integration:account.integration,profiles:account.profiles||[],accountProfile:account.activeProfile,
          policy:account.settings?.deploymentPolicy||null,context:null,tabId:activeTab?.id,url:activeTab?.url};
        if(!account.integration?.applier||account.integration.passwordChangeRequired)return base;
        if(account.integration.accountVerified===false)return {...base,jobError:'Connection interrupted. Your last synced profiles are shown. Application actions are paused until ApplyFlow responds.'};
        let current;
        try{current=await context(force);}catch(error){return error.account?.state==='SIGNED_OUT'?{...base,integration:error.account,profiles:[],accountProfile:null}:{...base,jobError:error.message,jobDiagnostic:error.diagnostic||{state:error.account?.state||'WAITING',checkedAt:new Date().toISOString()}};}
        let page=null;
        const portalAvailability=await availability?.check(current.tab.id,current.cfg);
        try{page=await chrome.tabs.sendMessage(current.tab.id,{type:'SQC_SIDEBAR_READ'},{frameId:0});}catch(_){}
        // Embedded ATS documents own their success notice and delivery state.
        // Read only frames already verified for this exact application.
        try{
          const frames=await chrome.webNavigation?.getAllFrames({tabId:current.tab.id})||[];
          const results=await Promise.all(frames.filter(frame=>frame.frameId!==0&&policy.matchesContext(frame.url,current.c)).map(async frame=>{
            try{
              const state=await chrome.tabs.sendMessage(current.tab.id,{type:'SQC_SIDEBAR_READ'},{frameId:frame.frameId});
              const binding=state?.context;
              return binding&&binding.applicationSessionId===current.c.applicationSessionId&&binding.jobId===current.c.jobId&&binding.profileId===current.c.profileId?{...state,frameId:frame.frameId}:null;
            }catch(_){return null;}
          }));
          const outcome=results.find(state=>state?.deliveryAcknowledged)||results.find(state=>state?.submissionSync?.phase)||results.find(state=>state?.hasFormData);
          if(outcome){page={...page,...outcome};deliveryFrame={tabId:current.tab.id,frameId:outcome.frameId,binding:key(current.c)};}
          else deliveryFrame=null;
        }catch(_){ /* The main document remains readable if an iframe unloads. */ }
        if(page?.deliveryAcknowledged&&!['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(current.cfg.applyFlowContext?.currentStatus)&&Date.now()-(statusChecks.get(current.c.applicationSessionId)||0)>5000){statusChecks.set(current.c.applicationSessionId,Date.now());try{current=await context(true);}catch(_){}}
        const {sqcDuplicateAcknowledgements={}}=await chrome.storage.session.get('sqcDuplicateAcknowledgements');
        return {...base,tabId:current.tab.id,url:current.tab.url,context:current.c,profile:{fullName:current.profile.fullName},portalAvailability,
          duplicate:current.cfg.applyFlowContext?.duplicate||null,duplicateAcknowledged:sqcDuplicateAcknowledgements[key(current.c)]===true,
          job:current.cfg.applyFlowContext,applier:current.cfg.integration.applier,page,
          policy:current.cfg.settings.deploymentPolicy||null,resumeMode:current.cfg.settings.resumeMode||'tailored',
          contact:Object.fromEntries(['fullName','email','phone','address','city','state','zip','location','linkedin','graduationYear'].filter(name=>current.profile[name]).map(name=>[name,current.profile[name]])),
          contactSources:current.profile.candidateFieldSources||{},
          resume:{ready:current.profile.resumeReady,hasOriginal:current.profile.resumeReady&&Boolean(current.profile.resumeBase64),filename:current.profile.resumeReady?current.profile.resumeFilename:'',mimeType:current.profile.resumeMimeType,
            sha256:current.profile.resumeSha256,source:current.profile.resumeSource,fileError:current.profile.resumeFileError,
            skills:current.profile.primaryStackKeywords||[],workHistory:current.profile.resumeContext?.workHistory||[],education:current.profile.resumeContext?.education||[],needsReview:current.profile.resumeContext?.needsReview||[]}};
      }
      async function action(type,screenshotId){
        const current=await context(true);
        if(!['alreadyApplied','previewScreenshot'].includes(type)&&(await availability?.check(current.tab.id,current.cfg))?.blocking)throw new Error('The portal is unavailable or needs an access check. Application actions are paused.');
        if(type==='alreadyApplied'){
          if(!current.cfg.applyFlowContext?.duplicate?.confirmed)throw new Error('ApplyFlow has not confirmed an existing application for this candidate.');
          const {sqcDuplicateAcknowledgements={}}=await chrome.storage.session.get('sqcDuplicateAcknowledgements');
          sqcDuplicateAcknowledgements[key(current.c)]=true;await chrome.storage.session.set({sqcDuplicateAcknowledgements});
          return {success:true,status:'ALREADY_APPLIED',acknowledged:true};
        }
        let frameId=0;
        if(type==='retrySubmission'&&deliveryFrame?.tabId===current.tab.id&&deliveryFrame.binding===key(current.c)){
          const frames=await chrome.webNavigation?.getAllFrames({tabId:current.tab.id})||[];
          const frame=frames.find(item=>item.frameId===deliveryFrame.frameId&&policy.matchesContext(item.url,current.c));
          if(!frame)throw new Error('The confirmation frame changed. Refresh its status before retrying.');
          frameId=frame.frameId;
        }
        const result=await chrome.tabs.sendMessage(current.tab.id,{type:'SQC_SIDEBAR_ACTION',action:type,...(type==='previewScreenshot'?{screenshotId}:{})},{frameId});if(!result?.success)throw new Error(result?.error||'Refresh the application page and try again.');return result;
      }
      async function answer(questions,{requestId,signal}){
        const current=await context(true),sender={url:current.tab.url,tab:current.tab};
        if((await availability?.check(current.tab.id,current.cfg))?.blocking)throw new Error('This job page is unavailable. No screening request was sent.');
        const cancel=()=>{session.handle({type:'SQC_CANCEL_QUESTIONS',requestId},sender).catch(()=>{});};
        signal?.throwIfAborted();signal?.addEventListener('abort',cancel,{once:true});
        try{
          const result=await session.handle({type:'SQC_ANSWER_QUESTIONS',requestId,url:current.tab.url,context:current.c,
            questions:questions.map(q=>({...q,type:q.type==='yes_no'?'radio':['date','email','url','tel'].includes(q.type)?'text':q.type||'textarea'}))},sender);
          if(!result?.success)throw new Error(result?.error||'ApplyFlow did not return screening answers.');
          signal?.throwIfAborted();return result.answers;
        }finally{signal?.removeEventListener('abort',cancel);}
      }
      async function aiConfig(){const current=await context(true);const {sqcAuth}=await chrome.storage.session.get('sqcAuth');return {endpoint:current.cfg.integration.apiOrigin+'/api/ai/chat',credentials:'include',csrfToken:sqcAuth?.csrfToken};}
      return {context,state,snapshot,save,clear,assertCurrent,attachment,scan,apply,attach,panel,action,aiConfig,answer,readUpload,normalizeUpload};
    }
    return {forWindow};
  }
  root.SQCSidebarContext={create,key};if(typeof module!=='undefined')module.exports={create,key};
})(globalThis);
