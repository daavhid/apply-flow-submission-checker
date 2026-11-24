async function runPlatformCoverageSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const fixture=document.createElement('section');fixture.innerHTML=`<form>
    <div class="field"><label id="auth-label" for="gh-auth">Are you legally authorized to work in the United States?</label><div class="select__control"><div class="select__single-value">Yes</div><input id="gh-auth" role="combobox" aria-labelledby="auth-label" required></div></div>
    <div class="field"><label id="salary-label">Does the salary range meet your expectations?</label><div class="select__control"><div class="select__placeholder">Select...</div><input role="combobox" aria-labelledby="salary-label" required></div></div>
    <div class="file-upload"><label for="gh-resume">Resume/CV *</label><input id="gh-resume" name="resume" type="file" style="display:none"><span class="file-upload__file-name">Candidate One.pdf</span><button type="button">Remove</button></div>
    <div data-automation-id="formField-experience"><div data-automation-id="formLabel">Relevant experience</div><button type="button" data-automation-id="selectWidget" aria-haspopup="listbox">Select One</button></div>
    <div class="application-question"><div class="application-label">Why this company?</div><textarea></textarea></div>
    <div class="ashby-application-form-field"><label>Work samples<input type="file"></label></div>
    <label>Motivation<textarea>Existing answer from the applier.</textarea></label>
  </form>`;document.body.append(fixture);
  try{
    const scan=SQCQAFormBridge.scan(fixture),byLabel=text=>scan.fields.find(field=>field.question.includes(text));
    check(scan.fields.length===7,'Platform fixture did not account for every field: '+JSON.stringify(scan.fields));
    check(byLabel('legally authorized').filled&&byLabel('legally authorized').answer==='Yes','Greenhouse committed selection was missed');
    check(!byLabel('salary range').filled,'Greenhouse placeholder was counted as an answer');
    check(byLabel('Resume/CV').filled&&scan.uploads.some(upload=>upload.filename==='Candidate One.pdf'),'Uploaded Greenhouse resume chip was missed');
    fixture.querySelector('#gh-resume').remove();fixture.querySelector('.file-upload__file-name').className='file-upload__filename';
    const withoutInput=SQCQAFormBridge.scan(fixture);
    check(withoutInput.fields.some(field=>field.type==='file'&&field.filled&&field.answer==='Candidate One.pdf'),'Resume was lost when the portal removed its native file input');
    check(byLabel('Relevant experience')&&!byLabel('Relevant experience').filled,'Workday dropdown/label was missed');
    check(byLabel('Why this company')&&byLabel('Work samples'),'Lever/Ashby question or upload was missed');
    const stats=SQCQuestionStatus.summarize(scan.questions,[],{fields:scan.fields});check(stats.filled===3&&stats.answered===3&&stats.unsent===4,'Live-page fields did not update the answered/applied counts');
    const main=document.querySelector('main');main.classList.add('sqc-root');let data;
    try{data=JobFormExtractor.extractAllFields();}finally{main.classList.remove('sqc-root');}
    check(data.all_entries.some(entry=>entry.label.includes('legally authorized')&&entry.value==='Yes'),'Validation extractor missed the committed Greenhouse choice');
    check(data.resume_uploaded==='Candidate One.pdf','Validation extractor reported the visible resume missing: '+data.resume_uploaded);
    const validation=JobFormValidator.validate(data,{fullName:'Candidate One'},{});check(!validation.errors.some(error=>error.rule==='MISSING_RESUME'),'Attached resume still triggered the missing-resume gate');
    fixture.querySelector('.select__single-value').remove();fixture.querySelector('#gh-auth').value='Yes';
    const next=SQCQAFormBridge.scan(fixture);check(!next.fields.find(field=>field.question.includes('legally authorized')).filled,'Uncommitted dropdown search text was counted as an answer');
    const originalSend=chrome.runtime.sendMessage;
    chrome.runtime.sendMessage=async message=>{
      if(message.type==='QA_SCAN_FORM'){const result=SQCQAFormBridge.scan(fixture);return {success:true,pageKey:'assignment-fixture',...result,questions:result.questions.map(question=>({...question,source:{url:location.href,snapshot:question.snapshot}}))};}
      if(message.type==='QA_APPLY_ANSWER'){try{return SQCQAFormBridge.fill({...message.item,url:message.item.source.url,snapshot:message.item.source.snapshot});}catch(error){return {success:false,error:error.message};}}
      return originalSend(message);
    };
    try{
      await assignAnswerToField('Assigned candidate answer','Candidate detail');const dialog=document.querySelector('.field-assignment'),select=dialog.querySelector('select');
      const option=Array.from(select.options).find(option=>option.textContent.includes('Why this company'));check(option,'Assignment did not offer the detected text field');select.value=option.value;select.dispatchEvent(new Event('change'));
      dialog.querySelector('button').click();for(let i=0;i<60&&dialog.isConnected;i++)await new Promise(resolve=>setTimeout(resolve,10));
      check(!dialog.isConnected&&fixture.querySelector('.application-question textarea').value==='Assigned candidate answer','Explicit field assignment did not fill the chosen page field');
      const upload=fixture.querySelector('.file-upload');upload.querySelector('.file-upload__filename').remove();
      const main=document.querySelector('main');main.classList.add('sqc-root');try{const removed=JobFormExtractor.extractAllFields();check(!removed.resume_uploaded,'A removed resume remained attached through stale saved state');}finally{main.classList.remove('sqc-root');}
    }finally{chrome.runtime.sendMessage=originalSend;}
    const many=document.createElement('div');for(let i=0;i<105;i++){const label=document.createElement('label');label.textContent='Additional question '+i;label.append(document.createElement('textarea'));many.append(label);}fixture.append(many);
    check(SQCQAFormBridge.scan(fixture).fields.length===111,'Field inventory stopped at the AI batch limit');
  }finally{fixture.remove();}
  return 'Passed: Greenhouse selected values and resume chips, Workday/Lever/Ashby semantics, live counts, cleared selections and full field inventory.';
}
