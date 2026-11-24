/* Conservative job availability signals shared by the worker and content script. */
(function(root){
  'use strict';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const loginUrl=value=>/\/(?:log[ -]?in|sign[ -]?in|auth(?:enticate)?|register|account\/login)(?:[/?#]|$)/i.test(value||'');
  const missing=/^(?:(?:error\s*[:#-]?\s*)?(?:404|410)(?:\s*\(?(?:not found|gone)\)?)?|(?:page|job|position|posting|vacancy|requisition)(?:\s+(?:was|is))?\s+(?:not found|unavailable|removed|closed)|page (?:does not|doesn't) exist)[.!\s]*$/i;
  const closed=/(?:\b(?:this|the requested|the advertised|the) (?:job|position|posting|vacancy|requisition|role)\b.{0,95}\b(?:no longer (?:available|accepting (?:applications|applicants))|has (?:been )?(?:closed|filled|removed|expired)|is (?:closed|no longer open)|is not available)|\b(?:job|position) (?:you (?:are|were) (?:looking|searching) for|is no longer available).{0,75}\b(?:no longer available|closed|removed|filled)|\b(?:we are|we're|we’re) no longer accepting applications (?:for (?:this|the) (?:job|role|position))?\b|\bapplications for this (?:job|position|role) (?:are (?:now )?closed|have closed)|\b(?:this job|this position|this vacancy) (?:is not|isn't|isn’t) available\b)/i;
  function classify(snapshot={},network={},now=Date.now()){
    const headings=(snapshot.headings||[]).map(clean).filter(Boolean),messages=(snapshot.messages||[]).map(clean).filter(Boolean);
    const result=(state,reason,message,evidence='')=>({state,reason,message,evidence,blocking:state!=='UNKNOWN'&&state!=='AVAILABLE',unavailable:state==='UNAVAILABLE'});
    if(snapshot.accessChallenge)return result('ACCESS_REQUIRED','ACCESS_CHALLENGE','The portal requires a security check or CAPTCHA. This does not mean the job is closed.');
    if(snapshot.passwordFields&&!snapshot.applicationForm||loginUrl(snapshot.url))return result('ACCESS_REQUIRED','PORTAL_LOGIN','Sign in to the employer portal to continue. The job has not been marked unavailable.');
    const status=Number(network.statusCode);
    if([401,403,429].includes(status))return result('ACCESS_REQUIRED','HTTP_ACCESS_DENIED','The portal denied or limited access (HTTP '+status+'). Retry or complete its access checks.');
    if(network.error||status>=500||snapshot.temporaryError)return result('TEMPORARY_ERROR','TEMPORARY_PORTAL_ERROR','The employer portal could not be reached reliably. Retry before deciding that the job is unavailable.');
    const notice=headings.find(value=>missing.test(value)||closed.test(value))||messages.find(value=>value.length<=500&&closed.test(value));
    const httpMissing=[404,410].includes(status);
    if(notice||httpMissing){
      if(snapshot.applicationForm)return result('REVIEW_REQUIRED','CONFLICTING_PAGE_SIGNALS','This page shows an unavailable notice but also an application form. Recheck it before reporting the job closed.',notice||'HTTP '+status);
      return result('UNAVAILABLE',httpMissing?'HTTP_'+status:missing.test(notice)?'SOFT_404':'JOB_CLOSED',httpMissing?'The employer returned HTTP '+status+' for this job page.':notice,notice||'HTTP '+status);
    }
    if(snapshot.expiredPosting)return result('REVIEW_REQUIRED','EXPIRED_POSTING_METADATA','The posting metadata has expired. Recheck the page; metadata alone does not prove the job is closed.');
    return result(snapshot.applicationForm?'AVAILABLE':'UNKNOWN','NO_TERMINAL_EVIDENCE',snapshot.applicationForm?'Application form detected.':'No confirmed job-unavailable notice detected.');
  }
  function inspect(doc=root.document,now=Date.now()){
    const view=doc.defaultView;
    const excluded='script,style,noscript,nav,header,footer,[role="navigation"],[role="contentinfo"],#sqc-hud-container,#sqc-modal-overlay';
    const visible=node=>{
      if(!node||node.closest(excluded)||node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
      for(let current=node;current&&current!==doc.documentElement;current=current.parentElement){const style=view.getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;}
      return node.getClientRects().length>0;
    };
    const scope=doc.querySelector('main,[role="main"]')||doc.body;
    const headings=Array.from(scope?.querySelectorAll('h1,h2,h3,[role="heading"]')||[]).filter(visible).map(node=>clean(node.innerText||node.textContent)).filter(text=>text.length<500).slice(0,60);
    const messages=Array.from(scope?.querySelectorAll('p,[role="alert"],.error-message,.job-closed,.job-not-found,[data-testid*="error"]')||[]).filter(visible).map(node=>clean(node.innerText||node.textContent)).filter(text=>text.length<500).slice(0,100);
    const controls=Array.from(scope?.querySelectorAll('input,textarea,select')||[]).filter(node=>visible(node)&&node.type!=='hidden'&&!node.disabled);
    const passwordFields=controls.filter(node=>node.type==='password').length;
    const names=controls.map(node=>[node.name,node.id,node.getAttribute('aria-label'),...(Array.from(node.labels||[]).map(label=>label.textContent))].join(' '));
    const applicationForm=controls.some((node,index)=>node.type==='file'&&/resume|curriculum|\bcv\b/i.test(names[index]))||
      controls.length>=3&&names.filter(value=>/first.?name|last.?name|full.?name|email|phone|employment|resume/i.test(value)).length>=2;
    const accessChallenge=headings.some(value=>/verify (?:you are|you're|that you are) human|checking your browser|security verification|access denied|captcha/i.test(value))||
      messages.some(value=>/^please (?:complete|solve) (?:the )?(?:captcha|security check)/i.test(value));
    const temporaryError=headings.some(value=>/^service unavailable|^temporarily unavailable|^internal server error|^bad gateway|^gateway timeout|^we(?:'re| are) having (?:technical )?(?:trouble|difficulties)/i.test(value));
    let expiredPosting=false;
    for(const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0,10)){
      try{const data=JSON.parse(script.textContent),items=Array.isArray(data)?data:[data,...(data?.['@graph']||[])];
        for(const item of items)if((Array.isArray(item?.['@type'])?item['@type']:[item?.['@type']]).includes('JobPosting')&&Number.isFinite(Date.parse(item.validThrough))&&Date.parse(item.validThrough)<now)expiredPosting=true;
      }catch(_){}
    }
    return {url:doc.location.href,headings,messages,passwordFields,applicationForm,accessChallenge,temporaryError,expiredPosting,ready:doc.readyState!=='loading'};
  }
  const api={classify,inspect};root.SQCPortalAvailability=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
