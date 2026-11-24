/* Deliver visible portal success once; retain one event ID across bounded retries. */
(function(root){
  'use strict';
  function create({now=Date.now,id=()=>crypto.randomUUID(),schedule=setTimeout,store,maxAttempts=6}={}){
    const records=new Map();
    const read=key=>{const r=records.get(key);return r?{phase:r.phase,attempts:r.attempts,error:r.error||'',eventId:r.eventId,confirmedAt:r.confirmedAt,nextRetryAt:r.nextRetryAt||null}:null;};
    async function check(input){
      const {key,proof,send}=input;
      const confirmed=()=>{try{return proof()===true;}catch(_){return false;}};
      if(!key||!confirmed())return {success:false,reason:'PORTAL_CONFIRMATION_REQUIRED'};
      let record=records.get(key);
      if(!record){
        const storageKey='sqc_submission_event:'+key;let eventId;try{eventId=store?.getItem(storageKey);}catch(_){}
        if(!eventId){eventId=id();try{store?.setItem(storageKey,eventId);}catch(_){}}
        record={eventId,phase:'DETECTED',attempts:0,confirmedAt:new Date(now()).toISOString()};records.set(key,record);
      }
      record.input=input;
      if(record.phase==='ACKNOWLEDGED')return record.result;
      if(record.pending)return record.pending;
      if(record.attempts>=maxAttempts||record.nextRetryAt>now())return {success:false,reason:'RETRY_PENDING'};
      record.attempts++;record.phase='SYNCING';record.nextRetryAt=0;
      record.pending=Promise.resolve().then(()=>{if(!confirmed())throw new Error('The portal confirmation is no longer visible.');return send(record.eventId);}).then(result=>{
        if(result?.success!==true||typeof result.recordId!=='string'||!result.recordId)throw new Error(result?.error||result?.reason||'ApplyFlow did not acknowledge this submission.');
        record.phase='ACKNOWLEDGED';record.error='';record.result=result;return result;
      }).catch(error=>{
        record.phase='FAILED';record.error=error.message;
        if(record.attempts<maxAttempts){const delay=Math.min(30000,1000*2**(record.attempts-1));record.nextRetryAt=now()+delay;
          schedule(()=>{if(record.phase==='FAILED'){record.nextRetryAt=0;if(confirmed())check(record.input);}},delay);}
        return {success:false,error:record.error};
      }).finally(()=>{record.pending=null;});
      return record.pending;
    }
    function retry(key){const record=records.get(key);if(!record||record.pending||record.phase==='ACKNOWLEDGED')return Promise.resolve(record?.result);record.attempts=0;record.nextRetryAt=0;return check(record.input);}
    return {check,read,retry};
  }
  root.SQCSubmissionDelivery={create};if(typeof module!=='undefined')module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
