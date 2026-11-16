async function runQASmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async predicate=>{for(let i=0;i<80;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Q&A did not reach the expected state.');};
  let release,copied='',requests=0,lastMessage,saves=0,failSave=false;
  const state={resume:null};let revision=0;
  window.chrome={runtime:{sendMessage(message){
    if(message.type==='QA_DEFAULTS_STATE')return Promise.resolve({success:true,value:{active:null,template:''}});
    if(message.type==='QA_RESUME_STATE')return Promise.resolve({success:true,state});
    if(message.type==='QA_RESUME_CLEAR'){state.resume=null;return Promise.resolve({success:true,state});}
    if(message.type==='QA_RESUME_SAVE'){if(failSave)return Promise.resolve({success:false,error:'Storage unavailable - retry saving.'});saves++;state.resume={source:'upload',filename:message.resume.filename,text:message.resume.text,version:String(++revision)};return Promise.resolve({success:true,state});}
    if(message.type==='QA_CANCEL')return Promise.resolve({success:true});
    requests++;lastMessage=message;return new Promise(resolve=>release=resolve);
  }}};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(value){copied=value;}}});
  const input=document.getElementById('questions'),send=document.getElementById('send');
  check(document.getElementById('environment').value==='deployed','The deployed server is not the default');
  document.getElementById('environment').value='local';
  await resumeAction('QA_RESUME_STATE');
  check(!document.getElementById('login-form') && !send.disabled && send.textContent.includes('Add resume'),'Missing resume left an unexplained disabled button');
  send.click();check(requests===0 && document.getElementById('resume-section').open,'Missing resume did not open its context section without calling the API');
  const fileInput=document.getElementById('resume-file'),transfer=new DataTransfer();transfer.items.add(new File(['Ramon Ramirez has tailored Python experience in distributed systems.'],'Resume.txt',{type:'text/plain'}));fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change'));
  await wait(()=>document.getElementById('resume-text').value.includes('tailored Python'));
  const docx=new JSZip();docx.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ramon Ramirez has tailored Python DOCX experience.</w:t></w:r></w:p></w:body></w:document>');
  const wordTransfer=new DataTransfer();wordTransfer.items.add(new File([await docx.generateAsync({type:'uint8array'})],'Resume.docx'));fileInput.files=wordTransfer.files;fileInput.dispatchEvent(new Event('change'));
  await wait(()=>document.getElementById('resume-text').value.includes('DOCX experience'));
  const line='Ramon Ramirez has tailored Python PDF experience.';
  const stream='BT /F1 12 Tf 50 750 Td ('+line+') Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
  let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  const pdfTransfer=new DataTransfer();pdfTransfer.items.add(new File([pdf],'Resume.pdf',{type:'application/pdf'}));fileInput.files=pdfTransfer.files;fileInput.dispatchEvent(new Event('change'));
  await wait(()=>document.getElementById('resume-text').value.includes('PDF experience'));
  check(window.pdfjsLib?.getDocument,'PDF context did not use the packaged PDF parser');
  check(!send.disabled && send.textContent.includes('Use resume'),'A valid extracted resume still blocked generation');
  check(requests===0,'The extension sent a question automatically');
  input.value='Explain asynchronous JavaScript.\nHow does a Promise work?';send.click();
  await wait(()=>requests===1);
  check(saves===1 && state.resume.filename==='Resume.pdf' && state.resume.text.includes('PDF experience'),'Generation did not save the current resume first');
  check(lastMessage.environment==='local' && document.getElementById('environment').disabled,'The selected server was not fixed for the pending request');
  check(!document.getElementById('loading').hidden && send.disabled,'Fetching state is missing');
  check(document.getElementById('questions-form').getAttribute('aria-busy')==='true','Accessible loading state is missing');
  const result={success:true,requestId:lastMessage.requestId,answers:[
    {id:'q1',question:'Explain asynchronous JavaScript.',answer:'A long answer.\n'.repeat(80),draft:true},
    {id:'q2',question:'<script>alert(1)</script>',answer:'A Promise represents a future result.'}
  ]};release(result);
  await wait(()=>document.querySelectorAll('.answer').length===2);
  check(document.getElementById('loading').hidden && !send.disabled,'Loading state did not stop');
  check(document.querySelectorAll('.answer script').length===0,'The question was interpreted as HTML');
  check(document.querySelector('.draft-note')?.textContent.includes('scenario may be inferred'),'Behavioral drafts are not labeled for review');
  check(document.getElementById('insight-answered').textContent==='2' && document.getElementById('insight-review').textContent==='1','Answer overview counts are incorrect');
  document.querySelector('[data-answer-filter="review"]').click();
  check(document.querySelectorAll('.answer:not([hidden])').length===1,'Review filter did not isolate the draft');
  document.querySelector('[data-answer-filter="all"]').click();

  const answer=document.querySelector('.answer textarea');answer.value='My reviewed answer';answer.dispatchEvent(new Event('input'));
    document.querySelector('.mark-reviewed').click();
  check(document.getElementById('insight-review').textContent==='0' && document.querySelector('.answer-state').textContent==='Reviewed','Mark reviewed did not update the overview');
document.querySelector('.answer .copy').click();await wait(()=>copied==='My reviewed answer');
  document.getElementById('copy-all').click();await wait(()=>copied.includes('My reviewed answer')&&copied.includes('future result'));
  input.value='Another question?';send.click();await wait(()=>requests===2);
  answer.focus({preventScroll:true});answer.setSelectionRange(3,7);const oldTop=window.scrollY;
  release({success:false,error:'HTTP 503: AI unavailable'});
  await wait(()=>document.getElementById('status').textContent.includes('503'));
  check(document.querySelector('.answer textarea')===answer && answer.value==='My reviewed answer','An error replaced the answer editor');
  check(answer.selectionStart===3 && answer.selectionEnd===7 && document.activeElement===answer,'An error interrupted editing');
  check(window.scrollY===oldTop,'An error reset scrolling');
  send.click();await wait(()=>requests===3);document.getElementById('stop').click();
  await wait(()=>document.getElementById('status').textContent==='Request stopped.');
  release({...result,requestId:lastMessage.requestId});await new Promise(resolve=>setTimeout(resolve,30));
  check(document.querySelector('.answer textarea')===answer,'A stopped request replaced the previous answers');
  check(document.documentElement.scrollWidth<=window.innerWidth,'Sidebar layout overflows horizontally');
  const rect=document.querySelector('.answer .copy').getBoundingClientRect();
  check(rect.width>0 && document.documentElement.scrollHeight>window.innerHeight,'Answers or scrolling are unavailable');
  input.value='1. Do you use Python?\n- Yes\n- No\n2. Which languages do you use?\n- Python\n- SQL';
  document.getElementById('add-pasted').click();
  check(document.querySelectorAll('.question-editor').length===2,'Pasted choices became extra questions');
  const type=document.querySelectorAll('.question-type')[1];type.value='checkbox';type.dispatchEvent(new Event('change'));
  document.getElementById('add-question').click();
  const editors=document.querySelectorAll('.question-editor'),questionText=editors[2].querySelector('.question-text'),numberType=editors[2].querySelector('.question-type');
  questionText.value='How many years of Python experience?';questionText.dispatchEvent(new Event('input'));numberType.value='number';numberType.dispatchEvent(new Event('change'));
  send.click();await wait(()=>requests===4);
  check(lastMessage.questions.length===3 && lastMessage.questions[0].type==='yes_no' && lastMessage.questions[1].type==='checkbox' && lastMessage.questions[2].type==='number','Typed batch metadata was lost');
  const typed=lastMessage.questions.map((q,i)=>({...q,options:i===0?['Yes','No']:q.options,answer:i===0?'Yes':i===1?'Python\nSQL':'5'}));
  handleRuntimeMessage({type:'QA_BATCH_PROGRESS',requestId:lastMessage.requestId,completed:2,total:3,answers:typed.slice(0,2)});
  check(document.getElementById('progress-text').textContent.includes('2 of 3'),'Batch progress is missing');
  const yesNo=document.querySelector('.answer select');yesNo.value='No';yesNo.dispatchEvent(new Event('input'));yesNo.focus({preventScroll:true});
  release({success:true,requestId:lastMessage.requestId,answers:typed});await wait(()=>document.querySelectorAll('.answer').length===3 && !send.disabled);
  check(document.querySelector('.answer select')===yesNo && yesNo.value==='No','Partial result updates reset the edited choice');
  check(document.querySelectorAll('.answer .answer-checkboxes input:checked').length===2,'Checkbox answers were not shown as multiple choices');
  const number=document.querySelector('.answer input[type=number]');check(number?.value==='5','Numeric answer was not displayed');
  number.value='6';number.dispatchEvent(new Event('input'));document.querySelectorAll('.answer .copy')[2].click();await wait(()=>copied==='6');
  document.getElementById('copy-all').click();await wait(()=>copied.includes('No') && copied.includes('Python\nSQL') && copied.includes('6'));
  document.getElementById('clear-resume').click();await wait(()=>document.getElementById('resume-name').textContent.includes('none selected'));
  check(document.querySelectorAll('.answer').length===0 && !send.disabled && send.textContent.includes('Add resume'),'Removing the resume left stale answers or an unexplained disabled action');
  const pastedResume=document.getElementById('resume-text');pastedResume.value='Synthetic Test Applicant has seven years of Python engineering experience.';pastedResume.dispatchEvent(new Event('input'));
  failSave=true;send.click();await wait(()=>document.getElementById('status').textContent.includes('Storage unavailable') && !send.disabled);
  check(requests===4,'AI generation proceeded after resume saving failed');
  failSave=false;send.click();await wait(()=>requests===5);check(state.resume.text===pastedResume.value,'Pasted resume was not saved automatically');
  document.getElementById('stop').click();await wait(()=>!send.disabled);release({success:false,error:'Stopped'});
  return 'Passed: manual requests, loader, safe rendering, editable answers, top Copy, Copy all, stable errors and scrolling, Stop, stale-response rejection.';
}
