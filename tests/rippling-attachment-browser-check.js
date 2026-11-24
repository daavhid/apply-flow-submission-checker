async function runRipplingAttachmentSmoke(){
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const frame=document.createElement('iframe');frame.src='/tests/fixtures/rippling-attachment.html';document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);
 const w=frame.contentWindow,d=w.document,profile={id:'candidate',fullName:'Candidate One'},settings={integrationMode:'applyflow',verifiedContext:{state:'VERIFIED',applicationSessionId:'app',applierId:'applier',profileId:'candidate',jobId:'job',profileAssignmentId:'assignment',profileAssignmentVersion:'1',expiresAt:Date.now()+60000,verifiedUrls:[w.location.href]}};
 let data=w.JobFormExtractor.extractAllFields(),validation=w.JobFormValidator.validate(data,profile,settings);
 check(data.resume_uploaded==='Candidate O...pdf','Rippling clickable chip with a literal truncated filename was missed');
 check(!validation.errors.some(error=>error.rule==='MISSING_RESUME'||error.rule==='WRONG_RESUME_NAME'),'A visible attached CV was reported missing or wrong');
 d.querySelector('#cv-block .chip').setAttribute('title','Candidate One.pdf');data=w.JobFormExtractor.extractAllFields();check(data.resume_uploaded==='Candidate One.pdf','Full chip filename metadata was not preferred');
 check(data.all_entries.some(entry=>entry.type==='file'&&/\bcv\b/i.test(entry.label)&&entry.value==='Candidate One.pdf'),'The file audit entry still reported no file while the visible CV chip was attached');
 check(!validation.errors.some(error=>error.rule==='REQUIRED_FIELD_EMPTY'&&/Search|Pronouns|Country/i.test(error.message)),'Internal search, optional Pronouns or answered Country produced a required-field error');
 check(validation.errors.some(error=>error.rule==='REQUIRED_FIELD_EMPTY'&&/Work authorization/i.test(error.message)),'A genuinely required empty custom dropdown was ignored');
 const selected=d.createElement('span');selected.className='selected-value';selected.textContent='Yes';d.getElementById('required-choice').append(selected);
 data=w.JobFormExtractor.extractAllFields();validation=w.JobFormValidator.validate(data,profile,settings);
 check(!validation.errors.some(error=>error.rule==='REQUIRED_FIELD_EMPTY'),'Selecting an offered custom value did not clear its required-field warning');
 d.querySelector('#cv-block .chip').remove();data=w.JobFormExtractor.extractAllFields();
 check(!data.resume_uploaded,'A removed CV inherited stale attachment state or the Cover Letter filename');
 check(data._elements.resume?.type==='file','Rippling multi-ID ARIA label did not identify the native Resume input');
 const drop=d.createElement('button');drop.type='button';drop.textContent='Drop or select (.doc / .docx / .pdf)';d.querySelector('label[data-testid=resume]').append(drop);
 await new Promise((resolve,reject)=>{const script=d.createElement('script');script.src='/ai/form-bridge.js';script.onload=resolve;script.onerror=reject;d.head.append(script);});
 const upload=w.SQCQAFormBridge.scan().uploads.find(item=>/\bcv\b/i.test(item.question));check(Boolean(upload),'The visible Rippling drop area did not expose its hidden native Resume input for attachment');
 frame.remove();return 'Passed: Rippling CV chip detection, full filename metadata, removed-file isolation and committed dropdown validation.';
}
