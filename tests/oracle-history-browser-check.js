async function runOracleHistorySmoke(){
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const frame=document.createElement('iframe');frame.src='/tests/fixtures/oracle-history.html';document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);
 const w=frame.contentWindow,d=w.document,text='Candidate One\nEXPERIENCE\nNew Corp\nSenior Engineer | April 2023 - Present\nCurrent responsibilities.\nOld Corp\nDeveloper | January 2018 - December 2022\nEarlier responsibilities.\nEDUCATION\nTest University\nBachelor of Science in Computer Science | 2017\nSKILLS\nPython, SQL';
 const settings={integrationMode:'applyflow',verifiedContext:{state:'VERIFIED',applicationSessionId:'app',applierId:'user',profileId:'candidate',jobId:'job',profileAssignmentId:'assignment',profileAssignmentVersion:'1',expiresAt:Date.now()+60000,verifiedUrls:[w.location.href]}};
 const profile={id:'candidate',city:'Miami',resumeReady:true,resumeId:'resume',resumeVersion:'1',resumeContext:w.SQCResumeContext.parse(text)};w.__SQC_CONTEXT_SETTINGS=settings;w.__SQC_ACTIVE_PROFILE=profile;
 let result=await w.JobFormExtractor.fillResumeHistory(profile,settings);const rows=d.querySelectorAll('.oracle-row');
 check(rows.length===2,'Missing work rows were not added');
 check(rows[0].querySelector('.company').value==='New Corp'&&rows[1].querySelector('.company').value==='Old Corp','Oracle work records were mixed or left empty');
 check(rows[0].querySelector('.month').value==='April'&&rows[0].querySelector('.year').value==='2023','Oracle split start date was not mapped');
 check(d.getElementById('school').value==='Test University'&&d.getElementById('degree').value.includes('Bachelor')&&d.getElementById('major').value==='Computer Science'&&d.getElementById('graduation').value==='2017','Parsed resume education was not filled');
 check(d.getElementById('custom-degree').textContent==='Bachelor of Science','Exact custom degree option was not selected');
 check(!d.getElementById('school-city').value&&!d.getElementById('gpa').value&&!rows[0].querySelector('.employer-city').value,'Candidate city or invented GPA leaked into history records');
 rows[0].querySelector('textarea').value='Manual responsibilities';result=await w.JobFormExtractor.fillResumeHistory(profile,settings);
 check(d.querySelectorAll('.oracle-row').length===2&&rows[0].querySelector('textarea').value==='Manual responsibilities','Repeated history filling duplicated records or overwrote edits');
 await new Promise((resolve,reject)=>{const script=d.createElement('script');script.src='/ai/form-bridge.js';script.onload=resolve;script.onerror=reject;d.head.append(script);});
 const bridge=w.SQCQAFormBridge,upload=bridge.scan().uploads.find(item=>/resume/i.test(item.question)),bytes='%PDF-1.7\nOriginal resume bytes';
 check(Boolean(upload),'Oracle-style Resume input was not detected');
 const attached=bridge.attach({id:upload.id,question:upload.question,url:w.location.href,snapshot:upload.snapshot,manual:true,file:{filename:'Candidate One.pdf',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,'+w.btoa(bytes)}});
 check(attached.success&&d.getElementById('resume').files[0].name==='Candidate One.pdf'&&await d.getElementById('resume').files[0].text()===bytes,'Attachment changed original resume bytes or filename');
 check(!d.getElementById('cover').files.length,'Resume was attached to Cover Letter');
 profile.resumeId='replacement';profile.resumeContext={...profile.resumeContext,education:[]};
 result=await w.JobFormExtractor.fillResumeHistory(profile,settings);
 check(!d.getElementById('school').value&&!d.getElementById('degree').value&&!d.getElementById('major').value&&!d.getElementById('graduation').value,'Removed education from a replacement resume left old SQC-filled values');
 check(result.review.some(message=>message.includes('previous resume')),'An old custom education selection was not flagged for review');
 frame.remove();return 'Passed: Oracle-style education and repeated work rows, split dates, exact custom options, original-file attachment and manual edits.';
}
