async function runSidebarLauncherSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  let state={state:'VERIFIED',profileName:'Test candidate',sidebarVisible:false},messages=0,notify;
  const win={document,location:{href:'https://portal.test/job#application_session_id=test'},MutationObserver,addEventListener(){}};
  const chrome={runtime:{sendMessage:async()=>{messages++;return state;},onMessage:{addListener:handler=>{notify=handler;}}}};
  const launcher=SQCSidebarLaunch.create({window:win,chrome,policy:{launchHints:url=>({applicationSessionId:url.includes('application_session_id=')?'test':null})}});
  await new Promise(resolve=>setTimeout(resolve,20));
  let opener=document.getElementById('sqc-job-status');check(opener?.isConnected,'The opener was missing while the sidebar was closed');
  notify({type:'SQC_SIDEBAR_VISIBILITY',visible:true});await new Promise(resolve=>setTimeout(resolve,20));check(!document.getElementById('sqc-job-status'),'The opener remained visible while the sidebar was open');
  notify({type:'SQC_SIDEBAR_VISIBILITY',visible:false});opener=document.getElementById('sqc-job-status');check(opener?.isConnected,'The opener did not return when the sidebar closed');
  state={state:'UNAVAILABLE',error:'Temporary verification outage',sidebarVisible:false};await launcher.check(true);
  check(document.getElementById('sqc-job-status')===opener,'A temporary verification error removed the opener');
  opener.remove();await new Promise(resolve=>setTimeout(resolve,20));
  opener=document.getElementById('sqc-job-status');check(opener?.isConnected,'A portal DOM replacement permanently removed the opener');
  const pageStyle=document.createElement('style');pageStyle.textContent='#sqc-job-status{display:none!important;visibility:hidden!important;opacity:0!important;transform:translateX(-99999px)!important}';document.head.append(pageStyle);
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;background:white;z-index:2147483647';document.body.append(overlay);
  await new Promise(resolve=>setTimeout(resolve,30));
  const button=opener.shadowRoot.querySelector('button'),rect=button.getBoundingClientRect();
  check(rect.width>0&&rect.height>0,'Host-page CSS hid the sidebar opener');
  check(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===opener,'A host-page overlay covered the sidebar opener');
  opener.hidden=true;opener.setAttribute('aria-hidden','true');await new Promise(resolve=>setTimeout(resolve,30));
  check(!opener.hidden&&!opener.hasAttribute('aria-hidden'),'A page visibility attribute permanently hid the opener');
  pageStyle.remove();overlay.remove();
  win.location.href='https://portal.test/unrelated';launcher.render();check(!document.getElementById('sqc-job-status'),'The opener persisted onto an unrelated route');
  check(messages>=2,'Status verification did not run');
  return 'Passed: persistent opener, stale visibility, temporary outage and DOM replacement recovery.';
}
