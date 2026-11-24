/* Open the persistent native workspace from an actual tracked-job gesture.
   Chrome requires user activation; navigation/timer events cannot open a panel. */
(function(root){
  'use strict';
  function create({window:win,chrome,policy}){
    let opened=false,panelVisible=false,visibilityRevision=0,opening=false,verifiedUrl=null,offeredPage=null,host,view,checking=false,recheck=false,status={state:'VERIFYING'};
    const tracked=url=>{try{return Boolean(policy.launchHints(url).applicationSessionId);}catch(_){return false;}};
    const pageKey=value=>{try{const url=new URL(value),hash=new URLSearchParams(url.hash.slice(1));if(hash.has('application_session_id')||hash.has('sqc_application_session_id'))url.hash='';for(const key of [...url.searchParams.keys()])if(key==='application_session_id'||key.startsWith('sqc_'))url.searchParams.delete(key);return url.href;}catch(_){return value;}};
    const verified=()=>verifiedUrl===win.location.href;
    const offered=()=>offeredPage===pageKey(win.location.href);
    function protectHost(){
      if(!host||!win.document)return;
      if(panelVisible||!verified()&&!tracked(win.location.href)&&!offered()){render();return;}
      // Keep the launcher outside page containers that can be replaced, clipped,
      // transformed or made inert by an ATS modal.
      const parent=win.document.documentElement;if(host.parentElement!==parent)parent.append(host);
      if(host.hidden)host.hidden=false;
      for(const name of ['inert','aria-hidden'])if(host.hasAttribute(name))host.removeAttribute(name);
      if(typeof host.showPopover==='function'){
        if(host.getAttribute('popover')!=='manual')host.setAttribute('popover','manual');
        try{if(!host.matches(':popover-open'))host.showPopover();}catch(_){}
      }
    }
    function render(value=status){
      status=value;if(!win.document)return;
      if(panelVisible||!verified()&&!tracked(win.location.href)&&!offered()){const previous=host;host=null;view=null;previous?.remove();return;}
      if(host?.isConnected===false)host=null;
      if(!host){
        host=win.document.createElement('div');host.id='sqc-job-status';host.className='sqc-root';view=host.attachShadow({mode:'open'});
        view.innerHTML='<style>:host{all:initial!important;position:fixed!important;inset:auto!important;bottom:16px!important;left:16px!important;margin:0!important;padding:0!important;border:0!important;width:max-content!important;height:auto!important;max-width:calc(100vw - 32px)!important;max-height:calc(100vh - 32px)!important;display:block!important;visibility:visible!important;opacity:1!important;transform:none!important;overflow:visible!important;z-index:2147483647!important;background:transparent!important;font:13px system-ui!important;color:#f4f2ff!important;pointer-events:none!important;isolation:isolate!important}.bar{display:flex;gap:14px;align-items:center;background:#171b29;border:1px solid #7162a0;border-radius:14px;padding:12px 14px;box-shadow:0 8px 28px #0004;max-width:min(410px,calc(100vw - 62px));pointer-events:auto}strong{display:block;font-size:12px}p{margin:5px 0 0;font-size:11px;color:#c1c9dc;max-width:250px;overflow-wrap:anywhere}button{border:0;border-radius:9px;background:#7858df;color:white;padding:10px;white-space:nowrap;cursor:pointer;font:600 11px system-ui}button:focus-visible{outline:2px solid white;outline-offset:3px}button:disabled{opacity:.7}</style><section class="bar" aria-label="SQC job status"><div><strong>SQC · Checking this job</strong><p role="status" aria-live="polite">Verifying with ApplyFlow...</p></div><button type="button">Open sidebar</button></section>';
        view.querySelector('button').addEventListener('click',event=>gesture(event,true));win.document.documentElement.append(host);
        host.addEventListener('toggle',event=>{if(event.newState==='closed')protectHost();});
      }
      view.querySelector('strong').textContent=value.portal?.blocking?'SQC · '+(value.portal.unavailable?'Job unavailable':'Access check needed'):value.state==='VERIFIED'?'SQC active'+(value.profileName?' · '+value.profileName:''):'SQC · '+(value.state==='VERIFYING'?'Verifying job':'Action needed');
      view.querySelector('p').textContent=value.error||value.portal?.blocking&&value.portal.message|| (value.state==='VERIFIED'?['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(value.jobStatus)?'Already applied · review status in ApplyFlow':value.resumeReady?'Resume ready · continue your application':'Job verified · upload its resume to continue':value.message||'Verifying this job with ApplyFlow...');
      const button=view.querySelector('button');button.disabled=opening;button.textContent=opening?'Opening...':'Open sidebar';
      button.title='Open sidebar · SQC '+(chrome.runtime.getManifest?.().version||'development');
      protectHost();
    }
    async function check(force=false){
      if(!force&&!verified()&&!tracked(win.location.href)&&!offered())return;
      if(checking){recheck=true;return;}
      const url=win.location.href,revision=visibilityRevision;if(tracked(url))offeredPage=pageKey(url);checking=true;render();
      try{const result=await chrome.runtime.sendMessage({type:'SQC_LAUNCH_STATUS'});if(win.location.href!==url){recheck=true;return;}verifiedUrl=result?.state==='VERIFIED'?url:null;if(verifiedUrl)offeredPage=pageKey(url);if(result){if(revision===visibilityRevision){panelVisible=result.sidebarVisible===true;opened=panelVisible;}render(result);}else render();}
      catch(_){verifiedUrl=null;render({...status,state:'UNAVAILABLE',error:'Status unavailable. Open the sidebar to reconnect.'});}finally{checking=false;if(recheck){recheck=false;check(true);}}
    }
    function gesture(event,explicit=false){
      if(!event.isTrusted||opening||opened&&!explicit||event.defaultPrevented)return;
      if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
      const anchor=event.target?.closest?.('a[href]'),launch=anchor&&tracked(anchor.href);
      if(!launch&&!verified()&&!tracked(win.location.href)&&!(explicit&&offered()))return;
      opening=true;
      render();
      // Do not await storage/config work before this message: preserve Chrome's
      // user activation. Verification proceeds independently in the worker.
      try{Promise.resolve(chrome.runtime.sendMessage({type:'OPEN_SQC_SIDEBAR'})).then(result=>{opened=result?.success===true;if(!opened)status={...status,error:result?.error||'Could not open the sidebar. Try again.'};}).catch(()=>{status={...status,error:'Could not open the sidebar. Try again.'};}).finally(()=>{opening=false;render();});}
      catch(_){opening=false;render({...status,error:'Could not open the sidebar. Try again.'});}
    }
    win.addEventListener('click',gesture,true);win.addEventListener('keydown',gesture,true);
    win.addEventListener('focus',()=>check());
    if(win.MutationObserver&&win.document?.documentElement)new win.MutationObserver(()=>{if(host?.isConnected===false)render();else if(host)protectHost();}).observe(win.document.documentElement,{childList:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','popover'],subtree:true});
    chrome.runtime.onMessage.addListener(message=>{
      // Notifications request a fresh check; they are not proof of a tracked job.
      if(message.type==='SQC_CONTEXT_AVAILABLE'){verifiedUrl=null;check(true);}
      if(message.type==='SQC_SIDEBAR_VISIBILITY'){visibilityRevision++;panelVisible=message.visible===true;opened=panelVisible;render();}
      if(message.type==='SQC_ROUTE_CHANGED'){const hadContext=verifiedUrl!==null;verifiedUrl=null;render();if(hadContext||tracked(win.location.href)||offered())check(true);}
    });
    check();return {gesture,render,check};
  }
  root.SQCSidebarLaunch={create};if(typeof module!=='undefined')module.exports={create};
  if(root.window===root&&root===root.top&&root.chrome?.runtime)create({window:root,chrome:root.chrome,policy:root.SQCContextPolicy});
})(typeof globalThis!=='undefined'?globalThis:this);
