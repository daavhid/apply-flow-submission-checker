/* Verify tracked tabs from browser events, independently of portal DOM detection. */
(function(root){
  'use strict';
  function create({chrome,session,policy,onVerified}){
    const running=new Map();
    const ui={url:chrome.runtime.getURL('sidebar/sidebar.html')};
    async function verify(tabId){
      const tab=await chrome.tabs.get(tabId);
      if(!/^https?:\/\//i.test(tab?.url||''))return {skipped:true};
      const [{sqcConnection},{sqcTabBindings={},sqcLaunchHints={},sqcAuth}]=await Promise.all([
        chrome.storage.local.get('sqcConnection'),chrome.storage.session.get(['sqcTabBindings','sqcLaunchHints','sqcAuth'])]);
      if(!sqcConnection?.apiOrigin||sqcConnection.signedOut||new URL(tab.url).origin===sqcConnection.apiOrigin)return {skipped:true};
      const launch=policy.launchHints(tab.url);
      if(!Object.values(launch).some(Boolean)&&!sqcTabBindings[tabId]&&!sqcLaunchHints[tabId]&&!sqcTabBindings[tab.openerTabId])return {skipped:true};
      const profileId=launch.profileId||sqcTabBindings[tabId]?.profileId||sqcLaunchHints[tabId]?.hints?.profileId;
      const profile=profileId&&profileId===sqcAuth?.profile?.id?sqcAuth.profile:sqcAuth?.assignedProfiles?.find(value=>value.id===profileId);
      chrome.runtime.sendMessage?.({type:'SQC_JOB_ACTIVATION',windowId:tab.windowId,tabId,state:'VERIFYING',profile:profile?{id:profile.id,fullName:profile.fullName}:profileId?{id:profileId}:null})?.catch(()=>{});
      const result=await session.handle({type:'GET_CONFIG',tabId},ui);
      if(result.settings?.verifiedContext&&onVerified)await onVerified(tabId,result);
      const current=await chrome.tabs.get(tabId);if(current.url!==tab.url)return {stale:true};
      const state=result.integration?.state||'UNAVAILABLE';
      chrome.runtime.sendMessage?.({type:'SQC_JOB_ACTIVATION',windowId:tab.windowId,tabId,state})?.catch(()=>{});
      if(result.settings?.verifiedContext)chrome.tabs.sendMessage(tabId,{type:'SQC_CONTEXT_AVAILABLE'}).catch(()=>{});
      return result;
    }
    function activate(tabId){
      if(!Number.isInteger(tabId)||tabId<0)return Promise.resolve({skipped:true});
      const existing=running.get(tabId);if(existing){existing.again=true;return existing.promise;}
      const job={again:false};
      job.promise=(async()=>{let result;do{job.again=false;result=await verify(tabId);}while(job.again);return result;})()
        .catch(error=>({success:false,error:error.message})).finally(()=>{if(running.get(tabId)===job)running.delete(tabId);});
      running.set(tabId,job);return job.promise;
    }
    async function activateOpenTabs(){const tabs=await chrome.tabs.query({active:true});return Promise.all(tabs.map(tab=>activate(tab.id)));}
    return {activate,activateOpenTabs};
  }
  root.SQCJobActivation={create};if(typeof module!=='undefined')module.exports={create};
})(globalThis);
