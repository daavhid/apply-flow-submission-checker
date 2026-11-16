'use strict';
const $=selector=>document.querySelector(selector);
let activeRequest=null, answers=[], selectedResume=null, resumeBusy=false, parsingResume=false, resumeDirty=false, resumeSequence=0;
let queuedQuestions=[], resultRequestId=null, pendingOrder=[];
const editedAnswers=new Map();
let answerFilter='all', pendingSiteAccess=null, siteAccessBusy=false;
const choiceStates=new Map();
let activeDefaults=null, defaultsTemplate='', standardDefaults='', defaultsBusy=false, defaultsSequence=0;
let scanBusy=false, detectionPage=null, detectionWindowId, pointerDown=false;
let pendingOriginal=null,attachmentBusy=false;
const attachmentAttempts=new Set();
const dismissedDetected=new Set(), questionSources=new Map(), appliedChoices=new Set();
const canAsk=()=>!resumeBusy && !parsingResume && !defaultsBusy;
const currentResumeText=()=>$('#resume-text').value.trim();
const validResumeDraft=()=>currentResumeText().length>=40 && currentResumeText().length<=200000;
const needsResumeSave=()=>!selectedResume?.text || resumeDirty || Boolean(pendingOriginal) || $('#candidate-name').value.trim()!==(selectedResume?.candidateName||'') || currentResumeText()!==selectedResume.text.trim();
const resumePayload=()=>({text:currentResumeText(),filename:pendingOriginal?.filename||selectedResume?.filename||'Pasted resume',candidateName:$('#candidate-name').value.trim(),...(pendingOriginal?{file:pendingOriginal}:{})});
function updateGenerateState(value=Boolean(activeRequest)){
  $('#send').disabled=value || !canAsk();
  $('#send').textContent=value?'Fetching answers…':parsingResume?'Reading resume…':resumeBusy?'Updating resume…':!validResumeDraft()?'Add resume to get answers':needsResumeSave()?'Use resume & get answers':'Get answers';
  $('#generate-help').textContent=value?'Your request is running. Use Stop request to cancel.':parsingResume?'Extracting resume text. Generation will become available when this finishes.':resumeBusy?'Updating the resume context…':!validResumeDraft()?'Upload or paste at least 40 characters of resume text. Click above to open the resume section.':needsResumeSave()?'Your resume text will be saved automatically before questions are sent.':'Using '+(selectedResume?.filename||'your resume')+'. Review the batch, then get answers.';
}
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').classList.toggle('error',error);updateInsights();};
function busy(value){
  $('#questions-form').setAttribute('aria-busy',String(value));
  updateGenerateState(value);
  $('#environment').disabled=value || resumeBusy;
  document.querySelectorAll('#resume-section button,#resume-section input,#resume-section textarea').forEach(node=>{node.disabled=value || resumeBusy || parsingResume || defaultsBusy;});
  document.querySelectorAll('#question-list input,#question-list textarea,#question-list select,#question-list button,#add-pasted,#add-question,#clear-questions,#questions').forEach(node=>{node.disabled=value;});
  document.querySelectorAll('#defaults-section input,#defaults-section textarea,#defaults-section button').forEach(node=>{node.disabled=value || defaultsBusy || resumeBusy;});
  $('#detect-questions').disabled=value || scanBusy;
  $('#stop').hidden=!value;$('#loading').hidden=!value;updateInsights();
}
async function copy(text){
  try {if(!text.trim())throw new Error('Enter an answer first.');await navigator.clipboard.writeText(text);status('Copied to clipboard.');}
  catch(error){status(error.message || 'Clipboard access failed. Select and copy the answer manually.',true);}
}
function renderAnswers(){
  const list=$('#answers');
  if(!answers.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Your answers will appear here after you send a batch.';list.replaceChildren(empty);}
  $('#answer-count').textContent='('+answers.length+')';$('#copy-all').disabled=!answers.length;
  for(const [index,item] of answers.entries()){
    const domId='answer-card-'+item.id;
    if(document.getElementById(domId))continue;
    if(list.querySelector('.empty'))list.replaceChildren();
    const node=$('#answer-template').content.cloneNode(true),article=node.querySelector('article');article.id=domId;
    node.querySelector('h3').textContent=item.question;
    let input=node.querySelector('textarea');input.id='answer-'+item.id;input.value=editedAnswers.get(item.id)??item.answer;
    if(item.options && item.type==='checkbox'){
      const group=document.createElement('fieldset');group.id=input.id;group.className='answer-checkboxes';
      const legend=document.createElement('legend');legend.textContent='Select all applicable answers';group.appendChild(legend);
      const selected=new Set(String(input.value).split('\n'));
      for(const option of item.options){
        const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=option;box.checked=selected.has(option);
        label.append(box,document.createTextNode(option));group.appendChild(label);
      }
      group.addEventListener('change',()=>{item.answer=Array.from(group.querySelectorAll('input:checked')).map(box=>box.value).join('\n');editedAnswers.set(item.id,item.answer);choiceStates.delete(item.id);item.reviewed=false;updateInsights();});
      input.replaceWith(group);input=group;
    }else if(item.options){
      const select=document.createElement('select');select.id=input.id;
      const placeholder=new Option('Choose an answer','');select.appendChild(placeholder);
      const selected=new Set(String(input.value).split('\n'));
      for(const option of item.options){const choice=new Option(option,option);choice.selected=selected.has(option);select.appendChild(choice);}
      input.replaceWith(select);input=select;
    }else if(['text','number','date','email','url','tel'].includes(item.type)){
      const field=document.createElement('input');field.id=input.id;field.type=item.type;field.value=input.value;if(item.type==='number')field.step='any';input.replaceWith(field);input=field;
    }
    if(item.maxLength && !item.options)input.maxLength=item.maxLength;
    node.querySelector('label').htmlFor=input.id;
    if(input.tagName!=='FIELDSET')input.addEventListener('input',()=>{item.answer=input.value;editedAnswers.set(item.id,item.answer);updateInsights();});
    if(item.needsInput || item.error){const reason=node.querySelector('.reason');reason.hidden=false;reason.textContent=item.reason || 'This question needs your personal information. Enter your answer below.';}
    else if(item.draft){const reason=node.querySelector('.reason');reason.hidden=false;reason.classList.add('draft-note');reason.textContent='Behavioral draft: the scenario may be inferred. Confirm or edit it to match your actual experience before using it.';}
    node.querySelector('.mark-reviewed').addEventListener('click',()=>{if(!item.answer.trim()&&!(item.type==='checkbox'&&!item.needsInput)){status('Enter an answer before marking it reviewed.',true);return;}item.reviewed=true;updateInsights();if(questionSources.has(item.id)&&$('#apply-text').checked&&!item.options)applyChoice(item,true);});
    node.querySelector('.copy').addEventListener('click',()=>copy(item.answer));
    if(questionSources.has(item.id)){
      const apply=document.createElement('button');apply.type='button';apply.textContent=item.options?'Apply choice to page':'Fill answer on page';apply.addEventListener('click',()=>applyChoice(item,true));
      const feedback=document.createElement('p');feedback.className='choice-status';feedback.id='choice-status-'+item.id;node.querySelector('.answer-actions').appendChild(apply);article.appendChild(feedback);
    }
    const following=Array.from(list.children).find(card=>pendingOrder.indexOf(card.dataset.questionId)>pendingOrder.indexOf(item.id));
    article.dataset.questionId=item.id;list.insertBefore(node,following||null);
  }
  updateInsights();
}
function acceptAnswers(items,requestId){
  if(resultRequestId!==requestId){resultRequestId=requestId;answers=[];editedAnswers.clear();choiceStates.clear();$('#answers').replaceChildren();}
  const saved=new Map(answers.map(item=>[item.id,item]));
  for(const item of items){if(editedAnswers.has(item.id))item.answer=editedAnswers.get(item.id);const existing=saved.get(item.id);if(existing)Object.assign(existing,item);else saved.set(item.id,item);}
  answers=Array.from(saved.values()).sort((a,b)=>pendingOrder.indexOf(a.id)-pendingOrder.indexOf(b.id));renderAnswers();
  for(const item of items)if(!item.needsInput&&!item.error&&(item.options?$('#apply-choices').checked:$('#apply-text').checked&&!item.draft))applyChoice(item);
}
function renderQuestions(){
  const list=$('#question-list');for(const card of Array.from(list.children))if(!queuedQuestions.some(q=>q.id===card.dataset.questionId))card.remove();$('#batch-count').textContent='('+queuedQuestions.length+')';
  for(const [index,item] of queuedQuestions.entries()){
    if(Array.from(list.children).some(card=>card.dataset.questionId===item.id))continue;
    const node=$('#question-template').content.cloneNode(true),detail=node.querySelector('details');detail.dataset.questionId=item.id;
    const summary=node.querySelector('summary');
    const updateSummary=()=>{summary.textContent=(queuedQuestions.indexOf(item)+1)+'. '+(item.question.slice(0,80)||'New question')+' ('+(item.type||'textarea').replace('_',' ')+(item.required?', required':'')+')';};
    updateSummary();detail.open=!item.question.trim();
    if(item.help){const help=document.createElement('p');help.className='help';help.textContent=item.help;detail.appendChild(help);}
    const text=node.querySelector('.question-text'),type=node.querySelector('.question-type'),options=node.querySelector('.question-options textarea'),limit=node.querySelector('.question-limit');
    text.value=item.question;type.value=item.type || 'textarea';options.value=(item.options||[]).join('\n');limit.value=item.maxLength || '';
    const choices=node.querySelector('.question-options');choices.hidden=!SQCQAQuestions.choice(type.value)||type.value==='yes_no';
    text.addEventListener('input',()=>{item.question=text.value;updateSummary();});
    type.addEventListener('change',()=>{item.type=type.value;updateSummary();choices.hidden=!SQCQAQuestions.choice(type.value)||type.value==='yes_no';});
    options.addEventListener('input',()=>{item.options=options.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);});
    limit.addEventListener('input',()=>{item.maxLength=limit.value;});
    node.querySelector('.remove-question').addEventListener('click',()=>{dismissedDetected.add(item.id);queuedQuestions=queuedQuestions.filter(q=>q.id!==item.id);renderQuestions();});
    list.appendChild(node);
  }
  updateInsights();
}
function appendQuestions(items){
  if(!items.length || queuedQuestions.length+items.length>100)throw new Error('Add between 1 and 100 questions.');
  queuedQuestions.push(...items.map(item=>({...item,id:'q_'+crypto.randomUUID()})));renderQuestions();
}
$('#add-pasted').addEventListener('click',()=>{try{appendQuestions(SQCQAQuestions.parse($('#questions').value));$('#questions').value='';status('Review the question types and choices, then get answers.');}catch(error){status(error.message,true);}});
$('#add-question').addEventListener('click',()=>{try{appendQuestions([{question:'',type:'textarea'}]);$('#question-list').lastElementChild.querySelector('textarea').focus();}catch(error){status(error.message,true);}});
$('#clear-questions').addEventListener('click',()=>{queuedQuestions.forEach(q=>dismissedDetected.add(q.id));queuedQuestions=[];renderQuestions();});
$('#questions-form').addEventListener('submit',async event=>{
  event.preventDefault();if(activeRequest || !canAsk())return;
  if(!validResumeDraft()){
    $('#resume-section').open=true;$('#resume-section').scrollIntoView({block:'start'});$('#resume-text').focus({preventScroll:true});
    status('Upload or paste resume text containing 40–200,000 characters, then get answers.',true);return;
  }
  let questions;
  try{questions=SQCQAQuestions.validate([...queuedQuestions,...SQCQAQuestions.parse($('#questions').value).map(item=>({...item,id:'q_'+crypto.randomUUID()}))]);}
  catch(error){status(error.message,true);return;}
  questionSources.clear();appliedChoices.clear();for(const q of queuedQuestions)if(q.source)questionSources.set(q.id,{...q.source});
  pendingOrder=questions.map(q=>q.id);$('#progress-text').textContent='Processing '+questions.length+' questions...';
  const requestId=crypto.randomUUID();activeRequest=requestId;busy(true);
  try {
    if(needsResumeSave()){
      $('#progress-text').textContent='Saving resume context…';
      const saved=await resumeAction('QA_RESUME_SAVE',{resume:resumePayload()});
      if(!saved || activeRequest!==requestId)return;
    }
    $('#progress-text').textContent='Processing '+questions.length+' questions…';status('Your questions have been sent.');
    const result=await chrome.runtime.sendMessage({type:'QA_ANSWER',requestId,questions,environment:$('#environment').value});
    if(activeRequest!==requestId)return;
    if(!result?.success)throw new Error(result?.error || 'The internal API did not return an answer.');
    if(result.requestId!==requestId || !Array.isArray(result.answers))throw new Error('The returned answers did not match this request.');
    acceptAnswers(result.answers,requestId);
    const failed=answers.filter(item=>item.error).length,needsInput=answers.filter(item=>item.needsInput&&!item.error).length;
    status('Processed '+answers.length+' questions. '+(answers.length-failed-needsInput)+' answered; '+needsInput+' need your input; '+failed+' failed. Review and copy below.',failed>0);
    $('.results').scrollIntoView({block:'start'});
  }catch(error){if(activeRequest===requestId)status(error.message,true);}
  finally {if(activeRequest===requestId){activeRequest=null;busy(false);}}
});
$('#stop').addEventListener('click',async()=>{
  const requestId=activeRequest;if(!requestId)return;
  try{await chrome.runtime.sendMessage({type:'QA_CANCEL',requestId});}catch(_){}
  if(activeRequest===requestId){activeRequest=null;busy(false);status('Request stopped.');}
});
$('#copy-all').addEventListener('click',()=>copy(answers.filter(item=>item.answer.trim()).map(item=>item.question+'\n'+item.answer).join('\n\n')));

function clearAnswers(){answers=[];editedAnswers.clear();choiceStates.clear();resultRequestId=null;renderAnswers();}
function renderResume(resume){
  const changed=selectedResume?.version!==resume?.version;
  if(changed){clearAnswers();activeDefaults=null;}
  selectedResume=resume;resumeDirty=false;
  pendingOriginal=null;attachmentAttempts.clear();
  $('#candidate-name').value=resume?.candidateName||'';
  $('#resume-name').textContent=resume?.text?' - '+resume.filename:' - none selected';
  $('#resume-text').value=resume?.text || '';$('#resume-file').value='';
  busy(Boolean(activeRequest));loadDefaults();
}
async function resumeAction(type,fields={}){
  const sequence=++resumeSequence;resumeBusy=true;busy(Boolean(activeRequest));
  try{
    const result=await chrome.runtime.sendMessage({type,...fields});
    if(sequence!==resumeSequence)return;
    if(!result?.success)throw new Error(result?.error || 'Could not save the resume context.');
    renderResume(result.state.resume);
    if(type==='QA_RESUME_SAVE'){$('#resume-status').textContent='Resume selected. It will be sent with each question batch.';status('Resume context ready.');$('#resume-section').open=false;if(Number.isInteger(detectionWindowId))setTimeout(()=>detectQuestions(true),0);}
    if(type==='QA_RESUME_CLEAR'){$('#resume-status').textContent='Resume removed.';status('Upload or paste a resume to get answers.');$('#resume-section').open=true;}
    return true;
  }catch(error){if(sequence===resumeSequence){$('#resume-status').textContent=error.message;status(error.message,true);}return false;}
  finally{if(sequence===resumeSequence){resumeBusy=false;busy(Boolean(activeRequest));}}
}
$('#environment').addEventListener('change',clearAnswers);
$('#resume-text').addEventListener('input',()=>{resumeDirty=currentResumeText()!==(selectedResume?.text||'').trim();busy(Boolean(activeRequest));$('#resume-status').textContent='Review your text. Get answers will save and use it automatically.';});
$('#candidate-name').addEventListener('input',()=>{resumeDirty=true;busy(Boolean(activeRequest));});
$('#resume-file').addEventListener('change',async()=>{
  const file=$('#resume-file').files[0];if(!file)return;
  pendingOriginal=null;
  const sequence=resumeSequence;parsingResume=true;resumeDirty=true;busy(false);$('#resume-status').textContent='Extracting resume text...';
  try{
    if(file.size>10*1024*1024 || !/\.(pdf|docx|txt)$/i.test(file.name))throw new Error('Choose a PDF, DOCX, or TXT file up to 10 MB.');
    const text=await ResumeDocumentParser.extractTextFromFile(file);
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Unable to read the original resume file.'));reader.readAsDataURL(file);});
    if(sequence!==resumeSequence)return;
    pendingOriginal={filename:file.name,dataUrl};$('#candidate-name').value=SQCQAResume.inferName(text);
    $('#resume-text').value=text;$('#resume-status').textContent='Review the extracted text. Choose Use this resume or get answers to save it automatically.';
  }catch(error){if(sequence===resumeSequence)$('#resume-status').textContent=error.message+' You can paste the resume text instead.';}
  finally{parsingResume=false;busy(Boolean(activeRequest));}
});
$('#save-resume').addEventListener('click',()=>resumeAction('QA_RESUME_SAVE',{resume:resumePayload()}));
$('#clear-resume').addEventListener('click',()=>resumeAction('QA_RESUME_CLEAR'));
function handleRuntimeMessage(message){
  if(message.type==='QA_BATCH_PROGRESS' && message.requestId===activeRequest){
    $('#progress-text').textContent='Processed '+message.completed+' of '+message.total+' questions';acceptAnswers(message.answers,message.requestId);
  }
  if(message.type==='QA_DEFAULTS_CHANGED'&&!defaultsBusy){clearAnswers();loadDefaults();}
  if(message.type==='QA_RESUME_CHANGED' && !resumeBusy)resumeAction('QA_RESUME_STATE');
}
globalThis.chrome?.runtime?.onMessage?.addListener(handleRuntimeMessage);
resumeAction('QA_RESUME_STATE');


async function applyChoice(item,manual=false){
  const source=questionSources.get(item.id),key=resultRequestId+':'+item.id;
  if(!source || (!manual && appliedChoices.has(key)))return;
  if(item.needsInput&&!manual || item.error&&!manual)return;
  if(item.draft&&!item.reviewed){const feedback=document.getElementById('choice-status-'+item.id);if(feedback)feedback.textContent='Review this drafted scenario and mark it reviewed before filling.';return;}
  appliedChoices.add(key);
  const feedback=document.getElementById('choice-status-'+item.id);if(feedback)feedback.textContent=item.options?'Applying matched choices...':'Filling answer...';
  try{
    const result=await chrome.runtime.sendMessage({type:'QA_APPLY_ANSWER',item:{id:item.id,question:item.question,answer:item.answer,source}});
    if(!result?.success)throw new Error(result?.error || 'The field is unavailable. Select the answer manually.');
    choiceStates.set(item.id,'applied');if(manual)item.reviewed=true;updateInsights();
    if(feedback)feedback.textContent='Answer applied to the application.';
  }catch(error){choiceStates.set(item.id,'failed');updateInsights();if(feedback)feedback.textContent=error.message;}
}
async function detectQuestions(manual=false){
  if(scanBusy || siteAccessBusy || activeRequest || pointerDown || !manual&&!$('#auto-detect').checked)return;
  if(!manual && document.activeElement?.closest('#question-list'))return;
  scanBusy=true;$('#detect-questions').disabled=true;
  try{
    const result=await chrome.runtime.sendMessage({type:'QA_SCAN_FORM',windowId:detectionWindowId});
    if(siteAccessBusy)return;
    if(!result?.success)throw Object.assign(new Error(result?.error || 'Unable to detect this page.'),{code:result?.code,access:result?.access,details:result?.details});
    pendingSiteAccess=null;$('#connect-page').hidden=true;$('#detection-details').hidden=true;
    if(activeRequest || pointerDown)return;
    if(manual)dismissedDetected.clear();
    if(detectionPage!==result.pageKey){
      if(detectionPage!==null){queuedQuestions=queuedQuestions.filter(q=>!q.source);clearAnswers();}
      dismissedDetected.clear();detectionPage=result.pageKey;
    }
    const live=new Map(result.questions.map(q=>[q.id,q]));queuedQuestions=queuedQuestions.filter(q=>!q.source || live.has(q.id)).map(q=>{
      const latest=live.get(q.id);if(q.source && latest?.source.snapshot!==q.source.snapshot){
        for(const card of Array.from($('#question-list').children))if(card.dataset.questionId===q.id)card.remove();return latest;
      }return q;
    });
    const added=result.questions.filter(q=>!dismissedDetected.has(q.id)&&!queuedQuestions.some(item=>item.id===q.id));
    queuedQuestions.push(...added.slice(0,Math.max(0,100-queuedQuestions.length)));renderQuestions();
    if($('#attach-resume').checked)attachResumeFields(result.questions);
    $('#detection-status').textContent='Connected'+(result.site?' to '+result.site:'')+'. Detected '+result.questions.length+' unanswered application fields and questions.'+(result.limited?' Some embedded forms are inaccessible; paste missing questions manually.':'')+' Review the batch before sending.';
    if(!result.questions.length && result.diagnostics?.controls){
      const d=result.diagnostics;$('#detection-details').hidden=false;
      $('#detection-error-detail').textContent='Page controls: '+d.controls+'. Visible controls: '+(d.visible||0)+'. Unlabeled candidates: '+(d.unlabeled||0)+'. Excluded fields: '+(d.filtered||0)+'. Answered fields skipped: '+(d.answered||0)+'.';
    }
  }catch(error){
    if(detectionPage!==null){queuedQuestions=queuedQuestions.filter(q=>!q.source);clearAnswers();renderQuestions();detectionPage=null;}
    pendingSiteAccess=error.code==='SITE_ACCESS_REQUIRED'?error.access:null;
    $('#connect-page').hidden=!pendingSiteAccess;$('#detection-details').hidden=!error.details;$('#detection-error-detail').textContent=error.details || '';
    $('#detection-status').textContent=error.message;
  }
  finally{scanBusy=false;$('#detect-questions').disabled=Boolean(activeRequest);}
}
async function attachResumeFields(items,manual=false){
  if(attachmentBusy||resumeBusy||parsingResume||activeRequest)return;
  const version=selectedResume?.version;
  if(!selectedResume?.file||needsResumeSave()||!selectedResume.candidateName){
    if(manual||selectedResume?.file&&!selectedResume.candidateName)$('#attachment-status').textContent='Upload the original file, enter the candidate name and save the resume first.';return;
  }
  const uploads=items.filter(item=>item.help?.startsWith('File upload:')&&/\b(?:resume|cv|curriculum vitae)\b/i.test(item.question)&&!/cover letter/i.test(item.question));
  if(!uploads.length){if(manual)$('#attachment-status').textContent='No empty Resume or CV upload field is currently available. Open the application upload step and refresh.';return;}
  attachmentBusy=true;
  try{
    for(const item of uploads){
      if(selectedResume?.version!==version||needsResumeSave())break;
      const key=JSON.stringify([version,item.id,item.source?.documentId,item.snapshot]);
      if(!manual&&attachmentAttempts.has(key))continue;attachmentAttempts.add(key);
      const result=await chrome.runtime.sendMessage({type:'QA_ATTACH_RESUME',resumeVersion:version,item:{id:item.id,question:item.question,source:item.source}});
      if(!result?.success)throw new Error(result?.error||'The portal could not accept this attachment.');
      $('#attachment-status').textContent='Attached '+result.filename+' to '+item.question+'.';
    }
  }catch(error){$('#attachment-status').textContent=error.message;}
  finally{attachmentBusy=false;}
}
$('#attach-resume-now').addEventListener('click',async()=>{
  if(needsResumeSave()&&!await resumeAction('QA_RESUME_SAVE',{resume:resumePayload()}))return;
  await detectQuestions(true);await attachResumeFields(queuedQuestions,true);
});
$('#attach-resume').addEventListener('change',()=>{if($('#attach-resume').checked){attachmentAttempts.clear();detectQuestions(true);}});
$('#download-named-resume').addEventListener('click',async()=>{
  try{
    if(needsResumeSave()&&!await resumeAction('QA_RESUME_SAVE',{resume:resumePayload()}))return;
    const result=await chrome.runtime.sendMessage({type:'QA_RESUME_FILE',resumeVersion:selectedResume?.version});
    if(!result?.success)throw new Error(result?.error||'Upload the original resume first.');
    const file=result.file,bytes=Uint8Array.from(atob(file.dataUrl.split(',')[1]),char=>char.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType})),link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('#attachment-status').textContent='Downloaded '+file.filename+' for manual upload.';
  }catch(error){$('#attachment-status').textContent=error.message;}
});
$('#detect-questions').addEventListener('click',()=>detectQuestions(true));
$('#connect-page').addEventListener('click',()=>{
  const access=pendingSiteAccess;if(!access || siteAccessBusy)return;
  siteAccessBusy=true;$('#connect-page').disabled=true;
  // Invoke the permission request directly from this click, before any await.
  chrome.permissions.request({origins:[access.origin]}).then(granted=>{
    siteAccessBusy=false;
    if(granted){pendingSiteAccess=null;$('#connect-page').hidden=true;return detectQuestions(true);}
    $('#detection-status').textContent='Access was not granted. You can connect '+access.hostname+' later or paste questions manually.';
  }).catch(error=>{
    $('#detection-status').textContent='Chrome could not grant page access. Reload the updated extension and try again.';
    $('#detection-details').hidden=false;$('#detection-error-detail').textContent=error.message;
  }).finally(()=>{siteAccessBusy=false;$('#connect-page').disabled=false;});
});

$('#auto-detect').addEventListener('change',()=>{if($('#auto-detect').checked)detectQuestions();});
document.addEventListener('pointerdown',()=>{pointerDown=true;});document.addEventListener('pointerup',()=>{pointerDown=false;});document.addEventListener('pointercancel',()=>{pointerDown=false;});
if(globalThis.chrome?.windows?.getCurrent){chrome.windows.getCurrent().then(window=>{detectionWindowId=window.id;detectQuestions();});setInterval(()=>detectQuestions(),3000);}
// A sidebar follows its window's active application; permissions persist across tabs.
globalThis.chrome?.tabs?.onActivated?.addListener(info=>{
  if(info.windowId===detectionWindowId)detectQuestions();
});
globalThis.chrome?.tabs?.onUpdated?.addListener((tabId,change,tab)=>{
  if(tab.active && tab.windowId===detectionWindowId && (change.status==='complete' || change.url))detectQuestions();
});

function needsReview(item){return !item.reviewed && Boolean(item.needsInput || item.error || item.draft || choiceStates.get(item.id)==='failed');}
function updateInsights(){
  updateGenerateState();
  $('#insight-queued').textContent=queuedQuestions.length;
  $('#insight-answered').textContent=answers.filter(item=>item.answer?.trim() || item.type==='checkbox'&&!item.needsInput).length;
  $('#insight-review').textContent=answers.filter(needsReview).length;
  $('#insight-applied').textContent=Array.from(choiceStates.values()).filter(value=>value==='applied').length;
  const ready=validResumeDraft();
  $('#resume-readiness').textContent=ready?(needsResumeSave()?'Ready to use':'Resume ready'):'Add resume';$('#resume-readiness').classList.toggle('ready',Boolean(ready));
  $('#insight-message').textContent=activeRequest?(answers.length && resultRequestId!==activeRequest?'Generating a new batch. Previous answers stay visible.':'Your batch is processing. Completed answers are ready to review.'):!ready?'Select a resume to ground your answers.':answers.some(needsReview)?'Some answers need your input or confirmation before use.':answers.length?'Your answers are ready. Copy text or use matched choices.':queuedQuestions.length?'Review your detected questions, then generate answers.':'Resume ready. Detect questions or add your own.';
  let visible=0;
  for(const item of answers){
    const card=document.getElementById('answer-card-'+item.id);if(!card)continue;
    const applied=choiceStates.get(item.id)==='applied',review=needsReview(item);
    const state=card.querySelector('.answer-state');state.textContent=applied?'Applied':item.reviewed?'Reviewed':item.error?'Request failed':item.needsInput?'Needs your input':item.draft?'Draft - review':'Ready to copy';state.className='answer-state '+(applied||item.reviewed?'is-ready':review?'is-review':'');
    card.querySelector('.answer-type').textContent=({textarea:'Written answer',text:'Short answer',yes_no:'Yes / No',radio:'Single choice',select:'Dropdown',checkbox:'Multiple choices',number:'Number',date:'Date',email:'Email',url:'Website',tel:'Phone'})[item.type] || 'Written answer';
    card.classList.toggle('requires-review',review);
    if(item.reviewed)card.querySelector('.reason').hidden=true;
    const reviewed=card.querySelector('.mark-reviewed');reviewed.textContent=item.reviewed?'Reviewed':'Mark reviewed';reviewed.disabled=Boolean(item.reviewed);
    const show=answerFilter==='all'||answerFilter==='review'&&review||answerFilter==='draft'&&item.draft||answerFilter==='applied'&&applied;card.hidden=!show;if(show)visible++;
  }
  $('#filtered-empty').hidden=!answers.length || visible>0;
}
function selectAnswerFilter(value){answerFilter=value;document.querySelectorAll('[data-answer-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.answerFilter===value)));updateInsights();}
document.querySelectorAll('[data-answer-filter]').forEach(button=>button.addEventListener('click',()=>selectAnswerFilter(button.dataset.answerFilter)));
document.querySelectorAll('[data-jump]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.jump).scrollIntoView({block:'start'})));
$('#jump-review').addEventListener('click',()=>{selectAnswerFilter('review');$('.results').scrollIntoView({block:'start'});});
$('#jump-applied').addEventListener('click',()=>{selectAnswerFilter('applied');$('.results').scrollIntoView({block:'start'});});
updateInsights();

async function loadDefaults(){
  const sequence=++defaultsSequence;
  try{
    const result=await chrome.runtime.sendMessage({type:'QA_DEFAULTS_STATE'});if(sequence!==defaultsSequence)return;
    if(!result?.success)throw new Error(result?.error||'Could not load answer defaults.');
    activeDefaults=result.value.active;defaultsTemplate=result.value.template || '';standardDefaults=result.value.starter || defaultsTemplate;
    $('#default-facts').value=activeDefaults?.text || defaultsTemplate;
    $('#defaults-state').textContent=activeDefaults?.source==='extension_defaults'?'Extension defaults active':activeDefaults?'Resume overrides active':'Loading defaults';
  }catch(error){if(sequence===defaultsSequence)$('#defaults-status').textContent=error.message;}
}
async function changeDefaults(type,fields={}){
  if(defaultsBusy || activeRequest)return;
  const text=$('#default-facts').value;
  defaultsBusy=true;busy(false);
  try{
    if(type==='QA_DEFAULTS_SAVE'){
      if(!validResumeDraft())throw new Error('Upload or paste the candidate resume first.');
      if(needsResumeSave()&&!await resumeAction('QA_RESUME_SAVE',{resume:resumePayload()}))return;
      fields={defaults:{text,resumeVersion:selectedResume.version}};
    }
    const result=await chrome.runtime.sendMessage({type,...fields});if(!result?.success)throw new Error(result?.error || 'Could not update defaults.');
    if(type!=='QA_DEFAULTS_TEMPLATE')clearAnswers();
    await loadDefaults();
    $('#defaults-status').textContent=type==='QA_DEFAULTS_SAVE'?'Resume overrides saved and active.':type==='QA_DEFAULTS_TEMPLATE'?(fields.text?'Reusable template saved. Extension defaults remain active until you save resume overrides.':'Saved template deleted.'):'Extension defaults restored automatically.';
  }catch(error){$('#default-facts').value=text;$('#defaults-status').textContent=error.message;}
  finally{defaultsBusy=false;busy(Boolean(activeRequest));}
}
$('#use-defaults').addEventListener('click',()=>changeDefaults('QA_DEFAULTS_SAVE'));
$('#clear-defaults').addEventListener('click',()=>changeDefaults('QA_DEFAULTS_CLEAR'));
$('#save-default-template').addEventListener('click',()=>changeDefaults('QA_DEFAULTS_TEMPLATE',{text:$('#default-facts').value}));
$('#delete-default-template').addEventListener('click',()=>changeDefaults('QA_DEFAULTS_TEMPLATE',{text:''}));
$('#load-default-template').addEventListener('click',()=>{$('#default-facts').value=defaultsTemplate;$('#defaults-status').textContent='Template loaded for editing. Save resume overrides to use these edits.';});
$('#load-standard-defaults').addEventListener('click',()=>{$('#default-facts').value=standardDefaults;$('#defaults-status').textContent='Extension defaults loaded for editing. They are already active unless this resume has saved overrides.';});
$('#default-facts').addEventListener('input',()=>{$('#defaults-status').textContent='Save resume overrides to apply your edits. Existing defaults remain active.';});
$('#defaults-file').addEventListener('change',async()=>{
  const file=$('#defaults-file').files[0];if(!file)return;
  try{if(file.size>400000 || !/\.txt$/i.test(file.name))throw new Error('Choose a TXT file up to 400 KB.');const text=await file.text();if(text.length>100000)throw new Error('Keep answer notes under 100,000 characters.');$('#default-facts').value=text;$('#defaults-section').open=true;$('#defaults-status').textContent='Notes imported for editing. Save resume overrides to use them.';}catch(error){$('#defaults-status').textContent=error.message;}
});
