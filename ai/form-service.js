(function(root){
  'use strict';
  function create(chrome){
    function failure(code,message,extra={}){return Object.assign(new Error(message),{code,...extra});}
    const detail=error=>String(error?.message||error).replace(/https?:\/\/[^\s"'<>]+/g,value=>{try{const url=new URL(value);return url.origin+url.pathname;}catch(_){return value;}});
    async function scan(windowId){
      if(!chrome.scripting?.executeScript)throw failure('EXTENSION_RELOAD_REQUIRED','Page detection is unavailable in this installation. Reload the updated extension from dist/extension, then reopen the sidebar.');
      const tabs=await chrome.tabs.query({active:true,...(Number.isInteger(windowId)?{windowId}:{lastFocusedWindow:true})});
      const tab=tabs[0];if(!tab?.id)throw new Error('Open an application page first.');
      let url;try{url=new URL(tab.url);}catch(_){throw failure('EXTENSION_RELOAD_REQUIRED','Chrome did not expose the active application tab. Reload the updated extension and reopen the sidebar.');}
      if(!['https:','http:'].includes(url.protocol)||url.hostname==='chromewebstore.google.com'||url.hostname==='chrome.google.com'&&url.pathname.startsWith('/webstore'))throw failure('RESTRICTED_PAGE','Switch to the actual job application tab. Chrome internal pages, the Web Store and extension pages cannot be scanned.');
      const access={origin:url.origin+'/*',hostname:url.hostname};
      let injected,limited=false;
      try{injected=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['ai/form-bridge.js']});}
      catch(first){limited=true;try{injected=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['ai/form-bridge.js']});}catch(error){
        const diagnostic=detail(error);
        if(/permission|cannot access|not permitted|not allowed.*access/i.test(diagnostic))throw failure('SITE_ACCESS_REQUIRED','Allow access to '+url.hostname+' to detect its application questions.',{access,details:diagnostic});
        throw failure('DETECTION_FAILED','The question detector could not start on this page.',{details:diagnostic});
      }}
      if(!injected?.length)throw failure('DETECTION_FAILED','Chrome did not attach the question detector. Refresh the application page and try again.');
      const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:injected.map(frame=>frame.frameId)},func:()=>globalThis.SQCQAFormBridge.scan()});
      const top=frames.find(frame=>frame.frameId===0)||frames[0];
      const questions=frames.flatMap(frame=>(frame.result?.questions||[]).map(q=>({...q,source:{tabId:tab.id,frameId:frame.frameId,documentId:frame.documentId,url:frame.result.url,snapshot:q.snapshot}}))).slice(0,100);
      const diagnostics={};for(const frame of frames)for(const [key,value] of Object.entries(frame.result?.diagnostics||{}))diagnostics[key]=(diagnostics[key]||0)+value;
      return {questions,limited,site:url.hostname,diagnostics,pageKey:JSON.stringify([tab.id,top?.documentId,top?.result?.url])};
    }
    async function apply(item){
      const source=item.source;if(!Number.isInteger(source?.tabId)||!source.documentId||!source.url||!source.snapshot)throw new Error('Detect this question on the application page again.');
      const result=await chrome.tabs.sendMessage(source.tabId,{type:'QA_FORM_FILL',id:item.id,question:item.question,answer:item.answer,url:source.url,snapshot:source.snapshot},{documentId:source.documentId});
      if(!result?.success)throw new Error(result?.error||'The original field is unavailable.');return result;
    }
    async function attach(item,file){
      const source=item.source;if(!Number.isInteger(source?.tabId)||!source.documentId||!source.url||!source.snapshot)throw new Error('Detect the resume upload field again.');
      const result=await chrome.tabs.sendMessage(source.tabId,{type:'QA_FORM_ATTACH_RESUME',id:item.id,question:item.question,url:source.url,snapshot:source.snapshot,file},{documentId:source.documentId});
      if(!result?.success)throw new Error(result?.error||'The resume upload field is unavailable.');return result;
    }
    return {scan,apply,attach};
  }
  root.SQCQAForms={create};if(typeof module!=='undefined')module.exports={create};
})(globalThis);
