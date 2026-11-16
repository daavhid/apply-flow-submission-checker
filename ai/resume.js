(function(root){
  'use strict';
  function inferName(text){
    const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(0,5);
    const line=lines[0]||'';
    return /^[\p{L}][\p{L}\p{M}'’.-]*(?: +[\p{L}][\p{L}\p{M}'’.-]*){1,5}$/u.test(line)&&! /\b(?:resume|curriculum|vitae|engineer|developer|architect|manager|experience|summary|education|university|has|with|years|skills|bachelor|master)\b/i.test(line)?line:'';
  }
  function normalizedName(value){return String(value||'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').replace(/[. ]+$/,'').trim().slice(0,120);}
  function create({store,files,onChange=()=>{},id=()=>root.crypto.randomUUID()}){
    let queue=Promise.resolve();
    const serial=work=>{const result=queue.then(work);queue=result.catch(()=>{});return result;};
    let cleaned=false;
    async function read(){const value=(await store.get('qaResume')).qaResume||null;if(!value&&!cleaned&&files){await files.clear();cleaned=true;}return value;}
    const state=()=>serial(async()=>({resume:await read()}));
    const save=input=>serial(async()=>{
      const text=typeof input?.text==='string'?input.text.trim():'';
      if(text.length<40 || text.length>200000)throw new Error('Review or paste resume text containing 40–200,000 characters.');
      const previous=await read(),candidateName=normalizedName(input.candidateName||inferName(text));
      const resume={source:'upload',filename:String(input.filename||'Pasted resume').slice(0,200),candidateName,text,version:id()};
      if(input.file){
        if(!files)throw new Error('Original-file storage is unavailable. Reload the extension.');
        const extension=String(input.file.filename||'').match(/\.(pdf|docx|txt)$/i)?.[1]?.toLowerCase();
        const match=String(input.file.dataUrl||'').match(/^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/);
        if(!extension||!match||!match[2]||match[2].length%4!==0||match[2].length*3/4-(match[2].endsWith('==')?2:match[2].endsWith('=')?1:0)>10*1024*1024)throw new Error('Choose an original PDF, DOCX or TXT resume up to 10 MB.');
        const fileId=id(),mimeType={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'}[extension];
        await files.put(fileId,{dataUrl:'data:'+mimeType+';base64,'+match[2],mimeType});
        resume.file={id:fileId,extension,mimeType};
      }else if(previous?.text===text&&previous.file)resume.file=previous.file;
      if(resume.file&&candidateName)resume.filename=candidateName+'.'+resume.file.extension;
      await store.set({qaResume:resume});if(files?.retain)await files.retain(resume.file?.id);onChange();return {resume};
    });
    const clear=()=>serial(async()=>{await store.remove('qaResume');if(files)await files.clear();onChange();return {resume:null};});
    const snapshot=()=>serial(async()=>{const resume=await read();if(!resume?.text)throw new Error('Upload or paste your resume, then choose Use this resume first.');return resume;});
    const assertCurrent=snapshot=>serial(async()=>{if((await read())?.version!==snapshot.version)throw new Error('The resume changed. Request fresh answers.');});
    const original=async version=>{const resume=await read();if(!resume||resume.version!==version)throw new Error('The resume changed. Refresh before attaching.');if(!resume.candidateName)throw new Error('Enter the candidate name in Resume context before attaching.');if(!resume.file||!files)throw new Error('Upload the original resume file to the extension first.');const file=await files.get(resume.file.id);if(!file)throw new Error('The original file is unavailable. Upload it again.');return {...file,filename:resume.candidateName+'.'+resume.file.extension,resumeVersion:resume.version};};
    const attachment=version=>serial(()=>original(version));
    const withAttachment=(version,work)=>serial(async()=>work(await original(version)));
    return {state,save,clear,snapshot,assertCurrent,attachment,withAttachment};
  }
  root.SQCQAResume={create,inferName,normalizedName};if(typeof module!=='undefined')module.exports={create,inferName,normalizedName};
})(globalThis);
