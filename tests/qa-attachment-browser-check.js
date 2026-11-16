async function runAttachmentSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Attachment workflow did not complete.');};
  await import('/ai/resume-files.js');
  const data={},store={async get(key){return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));},async remove(key){delete data[key];}};
  const files=SQCQAResumeFiles.create(),service=SQCQAResume.create({store,files});
  const fixture=document.createElement('section');fixture.innerHTML='<label>Resume / CV<input type="file" accept=".txt"></label>';document.body.appendChild(fixture);
  let attachments=0;
  window.chrome.runtime.sendMessage=async message=>{
    try{
      if(message.type==='QA_RESUME_STATE')return {success:true,state:await service.state()};
      if(message.type==='QA_RESUME_SAVE')return {success:true,state:await service.save(message.resume)};
      if(message.type==='QA_DEFAULTS_STATE')return {success:true,value:{active:{source:'extension_defaults',text:SQCQADefaults.starter},starter:SQCQADefaults.starter}};
      if(message.type==='QA_SCAN_FORM')return {success:true,pageKey:'attachment-fixture',questions:SQCQAFormBridge.scan(fixture).questions.map(q=>({...q,source:{tabId:7,documentId:'attachment-document',url:location.href,snapshot:q.snapshot}}))};
      if(message.type==='QA_ATTACH_RESUME')return await service.withAttachment(message.resumeVersion,file=>{attachments++;return SQCQAFormBridge.attach({...message.item,url:message.item.source.url,snapshot:message.item.source.snapshot,file});});
      return {success:false,error:'Unexpected message '+message.type};
    }catch(error){return {success:false,error:error.message};}
  };
  await resumeAction('QA_RESUME_STATE');
  const original='Nicholas Ruiz\nSenior software engineer building distributed Python services with PostgreSQL.';
  const transfer=new DataTransfer();transfer.items.add(new File([original],'cv-final-for-client (7).txt',{type:'text/plain'}));
  document.getElementById('resume-file').files=transfer.files;document.getElementById('resume-file').dispatchEvent(new Event('change'));
  await wait(()=>document.getElementById('candidate-name').value==='Nicholas Ruiz'&&!parsingResume);
  document.getElementById('attach-resume-now').click();
  await wait(()=>fixture.querySelector('input').files.length===1&&!attachmentBusy);
  const file=fixture.querySelector('input').files[0];check(file.name==='Nicholas Ruiz.txt'&&await file.text()===original,'UI upload did not attach the renamed original');
  check(attachments===1,'The upload workflow duplicated attachments');
  const restored=SQCQAResume.create({store,files});const snapshot=await restored.snapshot();check(!JSON.stringify(snapshot).includes('base64'),'Original bytes leaked into resume context');
  check((await restored.attachment(snapshot.version)).filename==='Nicholas Ruiz.txt','Original attachment was lost across worker restart');
  const fileId=snapshot.file.id;await restored.clear();check(!await files.get(fileId),'Removing resume left its original file behind');
  fixture.remove();return 'Passed: sidebar upload, parsed candidate name, normalized original-file attachment, IndexedDB restart and removal.';
}
