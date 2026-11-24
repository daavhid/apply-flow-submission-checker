/* Latest observed answers per verified application; navigation never selects identity. */
(function(root){
  'use strict';
  const key=(auth,c)=>JSON.stringify([auth.sessionId,c.applicationSessionId,c.profileAssignmentId,c.profileAssignmentVersion,c.profileId,c.jobId]);
  const privateField=/password|passcode|one.time.code|verification.code|captcha|social.security|passport|secret|access.token/i;
  function create({store,now=Date.now}){
    async function capture(auth,c,page,limits={maxApplications:30,maxStepsPerApplication:40}){
      const {sqcApplicationAnswers={}}=await store.get('sqcApplicationAnswers'),id=key(auth,c);
      if(!sqcApplicationAnswers[id]&&Object.keys(sqcApplicationAnswers).length>=limits.maxApplications)throw new Error('Application capture is full. Finish or close older applications before starting more.');
      const record=sqcApplicationAnswers[id]||{applicationSessionId:c.applicationSessionId,jobId:c.jobId,profileId:c.profileId,steps:[]};
      const stepKey=page.url+'|'+String(page.label||'Application').slice(0,200);
      let step=record.steps.find(value=>value.key===stepKey);
      if(!step){if(record.steps.length>=limits.maxStepsPerApplication)throw new Error('This application exceeds the configured step capture limit.');step={key:stepKey,url:page.url,label:String(page.label||'Application').slice(0,200),fields:[]};record.steps.push(step);}
      const previous=new Map(step.fields.map(field=>[field.id,field]));
      for(const [index,field] of (page.fields||[]).slice(0,300).entries()){
        const question=String(field.label||field.question||'').trim();if(!question||question.length>4000||privateField.test(question)||['password','hidden'].includes(field.type))continue;
        const answer=Array.isArray(field.value)?field.value.join(', '):String(field.value??field.answer??'');
        if(answer.length>100000)throw new Error('A captured answer exceeds the supported size.');
        const fieldId=String(field.id||index)+'|'+question;
        previous.set(fieldId,{id:fieldId,fieldId:String(field.id||''),question,answer,type:String(field.type||'text'),required:field.required===true,profileVersion:c.profileVersion,resumeId:c.resumeId,resumeVersion:c.resumeVersion,observedAt:new Date(now()).toISOString()});
      }
      step.fields=[...previous.values()];step.updatedAt=new Date(now()).toISOString();sqcApplicationAnswers[id]=record;
      await store.set({sqcApplicationAnswers});return {stepCount:record.steps.length,answerCount:record.steps.reduce((sum,value)=>sum+value.fields.filter(f=>f.answer.trim()).length,0)};
    }
    async function read(auth,c){const {sqcApplicationAnswers={}}=await store.get('sqcApplicationAnswers');return sqcApplicationAnswers[key(auth,c)]||{steps:[]};}
    async function restore(auth,c,url,remote){
      const local=await read(auth,c),route=value=>{try{const u=new URL(value);u.hash='';for(const name of [...u.searchParams.keys()])if(name.startsWith('sqc_')||name==='application_session_id')u.searchParams.delete(name);u.searchParams.sort();return u.href;}catch(_){return '';}};
      const sameRemote=remote&&remote.applicationSessionId===c.applicationSessionId&&remote.jobId===c.jobId&&remote.profileId===c.profileId&&remote.resumeId===c.resumeId&&remote.resumeVersion===c.resumeVersion&&(!remote.profileVersion||remote.profileVersion===c.profileVersion);
      const items=[],cleared=new Set(),normalize=value=>String(value||'').toLowerCase().replace(/\s+/g,' ').trim();
      for(const [record,source] of [[sameRemote?remote:null,'applyflow'],[local,'local']]){
        for(const step of (Array.isArray(record?.steps)?record.steps:[]).slice(0,40)){
          if(!route(url)||route(step.url)!==route(url))continue;
          for(const field of (Array.isArray(step.fields)?step.fields:[]).slice(0,300)){
            const question=String(field.question||field.label||''),answer=String(field.answer??field.value??''),resumeId=field.resumeId||record.resumeId,resumeVersion=field.resumeVersion||record.resumeVersion;
            if(!question||question.length>4000||answer.length>100000||privateField.test(question)||/consent|agree|privacy|terms|signature|subscribe|sms|text messages/i.test(question)||['password','hidden','file'].includes(field.type)||resumeId!==c.resumeId||resumeVersion!==c.resumeVersion||field.profileVersion&&field.profileVersion!==c.profileVersion)continue;
            if(source==='local'&&!answer.trim())cleared.add(normalize(question));
            items.push({question,answer,type:field.type||'text',fieldId:field.fieldId||'',source});
          }
        }
      }
      return items.filter(field=>field.answer.trim()&&!/^(?:unanswered|no file chosen)$/i.test(field.answer)&&!cleared.has(normalize(field.question)));
    }
    async function remove(auth,c){const {sqcApplicationAnswers={}}=await store.get('sqcApplicationAnswers');delete sqcApplicationAnswers[key(auth,c)];await store.set({sqcApplicationAnswers});}
    return {capture,read,restore,remove};
  }
  root.SQCApplicationJournal={create,key};if(typeof module!=='undefined')module.exports=root.SQCApplicationJournal;
})(globalThis);
