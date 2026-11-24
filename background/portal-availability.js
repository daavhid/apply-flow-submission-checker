(function(root){
  'use strict';
  function create({chrome,session,detector=root.SQCPortalAvailability,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),inspectPage}){
    const running=new Map();
    const pageKey=url=>{try{const u=new URL(url);u.hash='';return u.href;}catch(_){return url;}};
    const snapshot=inspectPage||async function(tabId){
      const target={tabId,frameIds:[0]};
      let result=await chrome.scripting.executeScript({target,func:()=>globalThis.SQCPortalAvailability?.inspect(document)||null});
      if(!result[0]?.result){await chrome.scripting.executeScript({target,files:['content/portal-availability.js']});result=await chrome.scripting.executeScript({target,func:()=>SQCPortalAvailability.inspect(document)});}
      return result[0]?.result;
    };
    async function save(tabId,value){const {sqcPortalAvailability={}}=await chrome.storage.session.get('sqcPortalAvailability');const changed=Boolean(sqcPortalAvailability[tabId]?.blocking)!==Boolean(value.blocking);await chrome.storage.session.set({sqcPortalAvailability:{...sqcPortalAvailability,[tabId]:value}});if(changed)chrome.tabs.sendMessage?.(tabId,{type:'SQC_CONTEXT_AVAILABLE'})?.catch(()=>{});return value;}
    async function read(tabId){const {sqcPortalAvailability={}}=await chrome.storage.session.get('sqcPortalAvailability');const tab=await chrome.tabs.get(tabId);return sqcPortalAvailability[tabId]?.url===tab.url?sqcPortalAvailability[tabId]:null;}
    async function clear(tabId){const {sqcPortalAvailability={},sqcPortalNetwork={}}=await chrome.storage.session.get(['sqcPortalAvailability','sqcPortalNetwork']);delete sqcPortalAvailability[tabId];delete sqcPortalNetwork[tabId];await chrome.storage.session.set({sqcPortalAvailability,sqcPortalNetwork});}
    async function network(details){if(details.tabId<0||details.type!=='main_frame')return;const {sqcPortalNetwork={}}=await chrome.storage.session.get('sqcPortalNetwork');await chrome.storage.session.set({sqcPortalNetwork:{...sqcPortalNetwork,[details.tabId]:{url:details.url,statusCode:details.statusCode,error:details.error,observedAt:now()}}});}
    async function run(tabId,cfg){
      const tab=await chrome.tabs.get(tabId),c=cfg?.settings?.verifiedContext;
      if(!c)return null;
      const old=await read(tabId);if(old?.checkedAt+5000>now()&&old.applicationSessionId===c.applicationSessionId&&old.profileId===c.profileId&&old.jobId===c.jobId)return old;
      const {sqcPortalNetwork={}}=await chrome.storage.session.get('sqcPortalNetwork');
      const net=sqcPortalNetwork[tabId];const signal=net&&pageKey(net.url)===pageKey(tab.url)?net:{};
      let first;try{first=await snapshot(tabId);}catch(_){first={url:tab.url};}
      if(!first||first.url!==tab.url)return null;
      let classification=detector.classify(first,signal,now());
      const base={url:tab.url,applicationSessionId:c.applicationSessionId,jobId:c.jobId,profileId:c.profileId,checkedAt:now(),...classification,confirmed:false,syncStatus:'NOT_REQUIRED'};
      if(!classification.unavailable)return save(tabId,base);
      await save(tabId,{...base,state:'CHECKING_UNAVAILABLE',message:'Checking that this job-unavailable notice is stable...',blocking:true});
      await wait(1200);
      const current=await chrome.tabs.get(tabId);if(current.url!==tab.url)return null;
      let second;try{second=await snapshot(tabId);}catch(_){second={url:tab.url};}
      classification=detector.classify(second,signal,now());
      if(!classification.unavailable||classification.evidence!==base.evidence||(!second.ready&&!signal.statusCode))return save(tabId,{...base,...classification,confirmed:false,syncStatus:'NOT_REQUIRED',checkedAt:now()});
      const record={...base,...classification,confirmed:true,checkedAt:now(),observedAt:new Date(now()).toISOString(),httpStatus:signal.statusCode||null,syncStatus:'PENDING'};
      const protectedApplied=cfg.applyFlowContext?.duplicate?.confirmed||['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(cfg.applyFlowContext?.currentStatus);
      if(protectedApplied)return save(tabId,{...record,syncStatus:'PROTECTED_APPLIED',message:record.message+' The existing applied record is unchanged.'});
      if(old?.confirmed&&old.reason===record.reason&&old.syncStatus==='ACKNOWLEDGED')return save(tabId,{...record,syncStatus:old.syncStatus,remoteStatus:old.remoteStatus,recordId:old.recordId});
      await save(tabId,record);
      const stamp={application_session_id:c.applicationSessionId,profile_assignment_id:c.profileAssignmentId,profile_assignment_version:c.profileAssignmentVersion,profile_version:c.profileVersion,job_version:c.jobVersion,resume_id:c.resumeId,resume_version:c.resumeVersion};
      try{
        const result=await session.handle({type:'LOG_SUBMISSION',payload:{...stamp,job_status:'PORTAL_ACCESS_FAILED',validation_status:'PORTAL_ACCESS_FAILED',is_final_submission:false,submission_confirmed_by:'AUTO_DETECTED_JOB_UNAVAILABLE',block_reason:record.reason,submission_notes:record.message,
          portal_evidence:{type:'JOB_UNAVAILABLE_NOTICE',url:tab.url,message:record.evidence,observedAt:record.observedAt,intermediate:false,httpStatus:record.httpStatus}}},{url:tab.url,tab});
        return save(tabId,{...record,syncStatus:result.success?(result.skipped||['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(result.applyFlowStatus)?'PROTECTED_APPLIED':'ACKNOWLEDGED'):'FAILED',remoteStatus:result.applyFlowStatus||null,recordId:result.recordId,error:result.success?'':result.error});
      }catch(error){return save(tabId,{...record,syncStatus:'FAILED',error:error.message});}
    }
    function check(tabId,cfg){if(running.has(tabId))return running.get(tabId);const task=run(tabId,cfg).finally(()=>running.delete(tabId));running.set(tabId,task);return task;}
    return {check,read,clear,network};
  }
  root.SQCPortalAvailabilityService={create};if(typeof module!=='undefined')module.exports={create};
})(globalThis);
